import i18n from "@/i18n"
import { useCallback, useMemo, useRef, useState } from "react"
import type { Folder, WorkspaceDataTree } from "@/types/types"
import type { DBItemType } from "@/db/queries/shared_queries"
import { getDBWorkspaceData } from "@/db/queries/workspace"
import { getDBTags } from "@/db/queries/tag"
import { getDBTemplateDrafts, type TemplateDraft } from "@/db/queries/template-draft"
import { draftToNote } from "@/lib/template-draft"
import { reportError } from "@/lib/report-error"
import { buildWorkspaceTree } from "../tree-builders"
import { flattenTree } from "../workspace-tree-ops"
import { usePendingCounter } from "../use-pending-counter"
import { TabsProvider } from "../tabs-context"
import { ActiveNoteProvider } from "../active-note-context"
import { TemplateDraftsProvider } from "../template-drafts-context"
import { WorkspaceActionsContext, WorkspaceLoadingContext, WorkspaceStateContext } from "./context"
import { bumpVersions, createVersionsStore, WorkspaceVersionsContext } from "./versions"
import { useTreeActions } from "./tree"
import { useNoteContentActions } from "./note-content"
import { useTaskActions } from "./tasks"
import { useTrashActions } from "./trash"
import { useArchiveActions } from "./archive"
import { useTemplateActions } from "./templates"
import { createReloadTags, createTagsStore, useTagActions, WorkspaceTagsContext } from "./tags"
import type { Runtime, TabsBridge, WorkspaceActionsType, WorkspaceStateType } from "./types"

/** Refetches of a reload whose response was overtaken by an optimistic update. */
const MAX_RELOAD_RETRIES = 3

/** The items whose deletion, restore or purge can change the visible audio and media files. */
const AUDIO_TYPES: readonly DBItemType[] = ["folder", "note", "section_group", "audio_file", "media_file"]

export function WorkspaceDataProvider({ children }: { children: React.ReactNode }) {

    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [workspaceDataTree, setTreeState] = useState<WorkspaceDataTree | null>(null)
    const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<number | null>(null)
    // The working copies of the templates being edited (see TemplateDraftsProvider): they have a tab but are no part of the tree
    const [drafts, setDrafts] = useState<TemplateDraft[]>([])

    const [currentFolder, setCurrentFolder] = useState<Folder | null>(null)

    // The version counters are apart from the state: bumping one re-renders only the components that read it
    const [versions] = useState(createVersionsStore)
    // The tags of the loaded workspace: a store of their own, so a tag that changes does not re-render the tree or the notes
    const [tags] = useState(createTagsStore)
    const reloadTags = useMemo(() => createReloadTags(tags), [tags])

    // The flat lists follow the tree: they change identity only when the tree does
    const { folders, notes } = useMemo(
        () => workspaceDataTree ? flattenTree(workspaceDataTree) : { folders: [], notes: [] },
        [workspaceDataTree])
    const bumpAudioVersion = useCallback(() => bumpVersions(versions, "audio"), [versions])
    const bumpTemplates = useCallback(() => bumpVersions(versions, "templates"), [versions])
    const afterItemChange = useCallback<Runtime["afterItemChange"]>((itemType, forceAudio = false) => {
        if (itemType === "note_template") bumpTemplates()
        if (forceAudio || AUDIO_TYPES.includes(itemType)) bumpAudioVersion()
    }, [bumpTemplates, bumpAudioVersion])
    const notifyArchiveChanged = useCallback(() => bumpVersions(versions, "archive", "audio"), [versions])

    // The tree is also kept in a ref, so consecutive optimistic updates chain on the latest one even before a render
    const treeRef = useRef<WorkspaceDataTree | null>(null)
    const loadedWorkspaceRef = useRef<number | null>(null)
    // Bumped by every optimistic update: a reload that started before it is stale and must not overwrite it
    const optimisticSeq = useRef(0)
    // Bumped by every reload request: only the latest one applies its response
    const reloadSeq = useRef(0)
    const idleWaiters = useRef<(() => void)[]>([])
    const tabsBridge = useRef<TabsBridge | null>(null)

    const { track: withLoading, getPending } = usePendingCounter(useCallback((pending: number) => {
        setIsLoading(pending > 0)
        if (pending === 0) idleWaiters.current.splice(0).forEach(resolve => resolve())
    }, []))

    /**
     * Resolves when no operation is in flight (a save of a template draft must not read a half written note).
     * @category WorkspaceData Context
     */
    const whenIdle = useCallback(() => getPending() === 0
        ? Promise.resolve()
        : new Promise<void>(resolve => { idleWaiters.current.push(resolve) }), [getPending])

    /**
     * Runs an operation that can change the trash content and bumps the trash version once it succeeds.
     * The archive version moves with it: an archived item that goes to the trash (or comes back from it) changes the archive too.
     * @param operation The operation to run.
     * @returns The result of the operation.
     * @category WorkspaceData Context
     */
    const withTrashChange = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => withLoading(async () => {
        const result = await operation()
        bumpVersions(versions, "trash", "archive")
        return result
    }), [withLoading, versions])

    /**
     * Runs an operation that can change the archive content and bumps the archive version once it succeeds.
     * @param operation The operation to run.
     * @returns The result of the operation.
     * @category WorkspaceData Context
     */
    const withArchiveChange = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => withLoading(async () => {
        const result = await operation()
        bumpVersions(versions, "archive")
        return result
    }), [withLoading, versions])

    /**
     * Sets the tree (the flat folders/notes are derived from it).
     * @category WorkspaceData Context
     */
    const setWorkspaceDataTree = useCallback((tree: WorkspaceDataTree) => {
        treeRef.current = tree
        setTreeState(tree)
    }, [])

    /* ------------------------------------------------------------------------------------ */

    /**
     * Retrieves the workspace data for a given workspace ID.
     * @param workspaceID The ID of the workspace to get data for.
     * @throws Will throw an error if the workspace data cannot be retrieved.
     * @category Workspace Data Context
     */
    const getWorkspaceData = useCallback((workspaceID: number) => withLoading(async () => {
        // Only the latest request applies: an older response that arrives late must not overwrite a newer one
        const requestSeq = ++reloadSeq.current
        try {
            for (let attempt = 0; ; attempt++) {
                const seq = optimisticSeq.current
                // The drafts come with the tree, so the tabs saved for the workspace can be restored to them
                const [data, workspaceDrafts, workspaceTags] = await Promise.all([getDBWorkspaceData(workspaceID), getDBTemplateDrafts(workspaceID, true), getDBTags(workspaceID)])
                if (requestSeq !== reloadSeq.current) return
                // An optimistic update of the same workspace arrived meanwhile: this response predates it, so fetch again
                // (a bounded number of times: the last response is applied anyway, it is the freshest one)
                if (optimisticSeq.current !== seq && loadedWorkspaceRef.current === workspaceID && attempt < MAX_RELOAD_RETRIES) continue
                const tree = buildWorkspaceTree(data?.folders || [], data?.notes || [])
                treeRef.current = tree
                loadedWorkspaceRef.current = workspaceID
                setTreeState(tree)
                setDrafts(workspaceDrafts)
                tags.set({ workspaceId: workspaceID, tags: workspaceTags })
                setLoadedWorkspaceId(workspaceID)
                setError(null)
                return
            }
        } catch (error) {
            if (requestSeq === reloadSeq.current) setError(i18n.t("errors.loadWorkspaceData"))
            throw error
        }
    }), [withLoading, tags])

    /** A failed refresh is reported, not thrown: the caller does not wait for it. */
    const reloadTreeInBackground = useCallback((workspaceID: number) => {
        getWorkspaceData(workspaceID).catch(error => reportError(error, i18n.t("errors.refreshTree")))
    }, [getWorkspaceData])

    const getTree = useCallback(() => treeRef.current, [])

    const applyTree = useCallback<Runtime["applyTree"]>((forward, inverse) => {
        const previous = treeRef.current
        if (!previous) return null
        const next = forward(previous)
        if (next === previous) return null
        optimisticSeq.current += 1
        setWorkspaceDataTree(next)

        return () => {
            const current = treeRef.current
            optimisticSeq.current += 1
            if (current === next) setWorkspaceDataTree(previous)
            else if (current && inverse) setWorkspaceDataTree(inverse(current))
            else if (loadedWorkspaceRef.current !== null) reloadTreeInBackground(loadedWorkspaceRef.current)
        }
    }, [setWorkspaceDataTree, reloadTreeInBackground])

    /**
     * Clears the workspace state (this also closes every tab, since the tabs follow the loaded workspace).
     * @category Workspace Data Context
     */
    const resetData = useCallback(() => {
        setCurrentFolder(null)
        loadedWorkspaceRef.current = null
        setLoadedWorkspaceId(null)
        setDrafts([])
        tags.set({ workspaceId: null, tags: [] })
    }, [tags])

    /* ------------------------------------------------------------------------------------ */

    // Every member is stable, so the runtime is too (the actions built on it keep their identity)
    const runtime = useMemo<Runtime>(() => ({
        tabsBridge, withLoading, withTrashChange, withArchiveChange, bumpAudioVersion, bumpTemplates, afterItemChange, reloadTreeInBackground,
        tags, reloadTags, setCurrentFolder, getWorkspaceData, getTree, applyTree,
    }), [tags, reloadTags, withLoading, withTrashChange, withArchiveChange, bumpAudioVersion, bumpTemplates, afterItemChange, reloadTreeInBackground, getWorkspaceData, getTree, applyTree])
    const treeActions = useTreeActions(runtime)
    const noteContentActions = useNoteContentActions(runtime)
    const taskActions = useTaskActions(runtime)
    const trashActions = useTrashActions(runtime)
    const archiveActions = useArchiveActions(runtime)
    const templateActions = useTemplateActions(runtime)
    const tagActions = useTagActions(runtime)

    // The tabs are derived from the notes of the tree and from the drafts of the templates that are not in the trash
    const tabNotes = useMemo(() => [...notes, ...drafts.filter(draft => !draft.trashed).map(draftToNote)], [notes, drafts])

    const state = useMemo<WorkspaceStateType>(() => ({
        folders, notes, workspaceDataTree, currentFolder, error, loadedWorkspaceId
    }), [folders, notes, workspaceDataTree, currentFolder, error, loadedWorkspaceId])

    // Every group of actions is memoized on stable callbacks, so this object is created once
    const actions = useMemo<WorkspaceActionsType>(() => ({
        setCurrentFolder,
        getWorkspaceData,
        setWorkspaceDataTree,
        notifyArchiveChanged,
        ...treeActions,
        ...noteContentActions,
        ...taskActions,
        ...trashActions,
        ...archiveActions,
        ...templateActions,
        ...tagActions,
        resetData,
    }), [getWorkspaceData, setWorkspaceDataTree, notifyArchiveChanged, resetData, treeActions, noteContentActions, taskActions, trashActions, archiveActions, templateActions, tagActions])

    return (
        <WorkspaceLoadingContext.Provider value={isLoading}>
            <WorkspaceVersionsContext.Provider value={versions}>
            <WorkspaceTagsContext.Provider value={tags}>
            <WorkspaceStateContext.Provider value={state}>
                <WorkspaceActionsContext.Provider value={actions}>
                    <TabsProvider notes={tabNotes} workspaceId={loadedWorkspaceId} bridgeRef={tabsBridge}>
                        <ActiveNoteProvider>
                            <TemplateDraftsProvider workspaceId={loadedWorkspaceId} drafts={drafts} setDrafts={setDrafts} whenIdle={whenIdle} onTagsChanged={reloadTags}>
                                {children}
                            </TemplateDraftsProvider>
                        </ActiveNoteProvider>
                    </TabsProvider>
                </WorkspaceActionsContext.Provider>
            </WorkspaceStateContext.Provider>
            </WorkspaceTagsContext.Provider>
            </WorkspaceVersionsContext.Provider>
        </WorkspaceLoadingContext.Provider>
    )
}
