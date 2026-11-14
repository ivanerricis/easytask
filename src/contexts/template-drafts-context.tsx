import i18n from "@/i18n"
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { toast } from "sonner"
import {
    createDBTemplateDraft, deleteDBTemplateDraft, getDBTemplateDraft, getDBTemplateDrafts, saveDBTemplateDraft, type TemplateDraft,
} from "@/db/queries/template-draft"
import { registerBeforeClose } from "@/lib/before-close"
import { reportError } from "@/lib/report-error"
import { createDraftAutosaver } from "@/lib/template-draft"
import { TemplateDraftsActionsContext, TemplateDraftsContext, type TemplateDraftsActionsType } from "./template-drafts-context-object"
import { useActiveNoteActions } from "./use-active-note"
import { useTabs, useTabsActions } from "./use-tabs"
import { useWorkspaceVersion } from "./workspace-data/versions"

type TemplateDraftsProviderProps = {
    /** The ID of the loaded workspace (null when none). */
    workspaceId: number | null
    /** Every draft of the workspace, those of a template in the trash included (they are recovered at startup). */
    drafts: TemplateDraft[]
    setDrafts: Dispatch<SetStateAction<TemplateDraft[]>>
    /** Resolves when the writes in flight to the workspace have finished (its identity must not change). */
    whenIdle: () => Promise<void>
    /** Called after a draft is created: the template brings its tags, the workspace may have got the ones it lacked. */
    onTagsChanged?: () => Promise<void>
    children: React.ReactNode
}

const sameDrafts = (a: TemplateDraft[], b: TemplateDraft[]) =>
    a.length === b.length && a.every((draft, i) =>
        draft.noteId === b[i].noteId && draft.templateId === b[i].templateId && draft.templateName === b[i].templateName
        && draft.color === b[i].color && draft.trashed === b[i].trashed)

/**
 * The editor of the templates. A template is edited in a draft: a note with no workspace, opened in a tab, that is a copy
 * of the template. Every change of the draft is saved into the template after a short quiet time; when its tab closes
 * the draft is saved and deleted; a draft left behind (crash, or the tab was not restored) is saved into its template
 * at startup. The operations on the drafts run one after the other, so an opening never overlaps a closing.
 * @category Template drafts
 */
export function TemplateDraftsProvider({ workspaceId, drafts, setDrafts, whenIdle, onTagsChanged, children }: TemplateDraftsProviderProps) {
    const { openIds, restored } = useTabs()
    const { openNote } = useTabsActions()
    const { subscribeNoteChanges } = useActiveNoteActions()
    const templatesVersion = useWorkspaceVersion("templates")

    const draftsRef = useRef(drafts)
    const openIdsRef = useRef(openIds)
    const previousOpen = useRef<number[]>([])
    const recoveredFor = useRef<number | null>(null)
    // The drafts seen open (note id -> template id): they outlive their entry in the list, for the closing of a tab
    const tracked = useRef(new Map<number, number>())
    const queue = useRef<Promise<unknown>>(Promise.resolve())

    useEffect(() => {
        draftsRef.current = drafts
        openIdsRef.current = openIds
    }, [drafts, openIds])

    const [saver] = useState(() => createDraftAutosaver({
        save: async noteId => {
            try {
                return await saveDBTemplateDraft(noteId) === "written"
            } catch (error) {
                reportError(error, i18n.t("templateEditor.saveError"))
                throw error
            }
        },
        whenIdle,
    }))

    const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
        const run = queue.current.then(task, task)
        queue.current = run.catch(() => {})
        return run
    }, [])

    const removeDraft = useCallback((noteId: number) => setDrafts(list => list.filter(draft => draft.noteId !== noteId)), [setDrafts])

    // Saves the draft and, only if that worked, deletes it. A draft that could not be saved stays in the database
    const finishDraft = useCallback((noteId: number) => enqueue(async () => {
        saver.notify(noteId)
        if (!await saver.flush(noteId)) return
        await deleteDBTemplateDraft(noteId)
        saver.forget(noteId)
        tracked.current.delete(noteId)
        removeDraft(noteId)
    }).catch(error => reportError(error, i18n.t("templateEditor.saveError"))), [enqueue, saver, removeDraft])

    // The changes of an open draft are saved after a quiet time (loading it from the database is not a change)
    useEffect(() => subscribeNoteChanges((noteId, source) => {
        if (source === "edit" && tracked.current.has(noteId)) saver.notify(noteId)
    }), [subscribeNoteChanges, saver])

    // Pending saves must not outlive the provider
    useEffect(() => () => saver.dispose(), [saver])

    // The closing of a tab of a draft (any way: its button, Ctrl+W, close all, template deleted, another workspace)
    useEffect(() => {
        for (const id of openIds) {
            const draft = drafts.find(candidate => candidate.noteId === id)
            if (draft) tracked.current.set(id, draft.templateId)
        }
        for (const id of previousOpen.current) {
            if (!openIds.includes(id) && tracked.current.has(id)) void finishDraft(id)
        }
        previousOpen.current = openIds
    }, [openIds, drafts, finishDraft])

    // Drafts left behind by a closed app: saved into their template (a notice if that changed it) and deleted
    useEffect(() => {
        if (!restored || workspaceId === null || recoveredFor.current === workspaceId) return
        recoveredFor.current = workspaceId
        for (const draft of draftsRef.current) {
            if (openIdsRef.current.includes(draft.noteId)) continue
            void enqueue(async () => {
                if (await saveDBTemplateDraft(draft.noteId) === "written")
                    toast.info(i18n.t("templateEditor.recovered", { name: draft.templateName }))
                await deleteDBTemplateDraft(draft.noteId)
                removeDraft(draft.noteId)
            }).catch(error => reportError(error, i18n.t("templateEditor.saveError")))
        }
    }, [restored, workspaceId, enqueue, removeDraft])

    const refreshDrafts = useCallback(() => enqueue(async () => {
        if (workspaceId === null) return
        const list = await getDBTemplateDrafts(workspaceId, true)
        setDrafts(previous => sameDrafts(previous, list) ? previous : list)
    }).catch(error => reportError(error)), [enqueue, workspaceId, setDrafts])

    // A template renamed, deleted, restored or purged changes its draft (those trash operations bump the templates version too;
    // a plain task or section move changes neither, so it costs no read)
    useEffect(() => {
        void refreshDrafts()
    }, [refreshDrafts, templatesVersion])

    // Before the window closes the changes are saved; the drafts stay, their tabs come back at the next start
    useEffect(() => registerBeforeClose(async () => {
        for (const id of tracked.current.keys()) if (openIdsRef.current.includes(id)) saver.notify(id)
        await saver.flushAll()
    }), [saver])

    const actions = useMemo<TemplateDraftsActionsType>(() => {
        const flushIds = async (ids: number[]) => {
            for (const id of ids) saver.notify(id)
            const results = await Promise.all(ids.map(id => saver.flush(id)))
            return results.every(Boolean)
        }
        const openDraftIds = () => [...tracked.current.keys()].filter(id => openIdsRef.current.includes(id))
        return {
            openTemplateEditor: template => enqueue(async () => {
                const noteId = await createDBTemplateDraft(template.id)
                const draft = await getDBTemplateDraft(noteId)
                tracked.current.set(noteId, template.id)
                if (draft) setDrafts(list => list.some(candidate => candidate.noteId === noteId) ? list : [...list, draft])
                openNote(noteId)
                await onTagsChanged?.()
            }),
            flushTemplate: templateId => flushIds(openDraftIds().filter(id => tracked.current.get(id) === templateId)),
            flushAll: () => flushIds(openDraftIds()),
            retrySave: noteId => saver.retry(noteId),
            refreshDrafts,
            statusStore: { subscribe: saver.subscribe, getStatus: saver.getStatus },
        }
    }, [saver, enqueue, setDrafts, openNote, refreshDrafts, onTagsChanged])

    const visible = useMemo(() => drafts.filter(draft => !draft.trashed), [drafts])
    const value = useMemo(() => ({ drafts: visible }), [visible])

    return (
        <TemplateDraftsActionsContext.Provider value={actions}>
            <TemplateDraftsContext.Provider value={value}>
                {children}
            </TemplateDraftsContext.Provider>
        </TemplateDraftsActionsContext.Provider>
    )
}
