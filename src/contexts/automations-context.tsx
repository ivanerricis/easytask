import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react"
import { toast } from "sonner"
import { ACTION_TOAST_DURATION } from "@/lib/toast-trashed"
import i18n from "@/i18n"
import type { NoteDataTree, Task } from "@/types/types"
import { useActiveNote, useActiveNoteActions } from "@/contexts/use-active-note"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useOptionalUndo, useUndoRecorder } from "@/contexts/undo/use-undo"
import type { UndoCommand } from "@/contexts/undo/stack"
import { findSection } from "@/contexts/note-tree-ops"
import { isDefaultSection, taskSections } from "@/lib/group-sections"
import { fetchNoteTree } from "@/contexts/tree-builders"
import { applyDBAutomationChanges, getDBAutomations } from "@/db/queries/automation"
import { runAutomations, syncStateRules } from "@/lib/automations/engine"
import {
    diffGroupStatements, diffSectionStatements, diffTaskStatements, groupChanges, restoreGroups, restoreTasks, taskChanges, withGroups,
    type GroupChange, type TaskChange,
} from "@/lib/automations/diff"
import { automationName, type SectionName } from "@/lib/automations/describe"
import { isStateTrigger, type Automation, type AutomationEvent } from "@/lib/automations/types"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { getGroupLabel } from "@/pages/workspacePage/components/groups/group-label"
import { AutomationsContext } from "./automations-context-object"

/**
 * One version of the note an automation produced: the tree the user sees and the same tree plus the groups the
 * automation archived (so that the changes to their tasks are not lost).
 */
type Side = { tree: NoteDataTree, full: NoteDataTree }

/** The label of a group as the note shows it: the first tree that has the group wins (an archived group is only in the older one). */
function groupLabelIn(...trees: NoteDataTree[]) {
    return (id: number) => {
        for (const tree of trees) {
            const groups = [...tree.groups].sort((a, b) => a.position - b.position)
            const index = groups.findIndex(group => group.id === id)
            if (index >= 0) return getGroupLabel(groups[index], index)
        }
        return undefined
    }
}

/** Adds the id and completed flag of a task and of its subtasks to `out`. */
function taskSignature(task: Task, out: string[]) {
    out.push(task.completed ? `${task.id}+` : `${task.id}-`)
    for (const sub of task.subtasks) taskSignature(sub, out)
}

/**
 * What decides the state rules: the ids and order of groups and sections, the ids and completed flag of every task.
 * Never colors, names or descriptions, so recoloring a note cannot trigger another sync. One pass, no JSON.
 */
function structureSignature(tree: NoteDataTree): string {
    const parts: string[] = []
    for (const group of tree.groups) {
        parts.push(`g${group.id}`)
        for (const section of taskSections(group)) {
            parts.push(`s${section.id}`)
            for (const task of section.tasks) taskSignature(task, parts)
        }
    }
    return parts.join(",")
}

/**
 * Runs the automations of the open note after a user action on a task.
 * `dispatch` is called once the action has been applied (cached note updated and written): the rules run on the
 * cached note, their changes are applied to it at once and written in ONE transaction (the note is reloaded if the
 * write fails). The automation is a separate step of the undo history, so the first undo reverts the automation and
 * the next one the user action. Undo/redo never dispatch, so they do not run the rules again.
 * Mounted once (inside the undo history), so the many task rows only read a stable `dispatch`.
 * @category Automations
 */
export function AutomationsProvider({ children }: { children: ReactNode }) {
    const activeId = useActiveNoteId()
    const activeIdRef = useRef(activeId)
    // The rules of the open note, read once and shared by `run` and `sync` (both fire on every task action). Dropped when
    // the open note changes or when `sync` is called from outside, which is what the automations dialog does after a write.
    const rulesCache = useRef(new Map<number, Promise<Automation[]>>())
    const getRules = useCallback((noteId: number) => {
        const cached = rulesCache.current.get(noteId)
        if (cached) return cached
        const rules = getDBAutomations(noteId)
        rulesCache.current.set(noteId, rules)
        // A failed read must not stay cached
        rules.catch(() => { if (rulesCache.current.get(noteId) === rules) rulesCache.current.delete(noteId) })
        return rules
    }, [])
    useEffect(() => {
        activeIdRef.current = activeId
        rulesCache.current.clear()
    }, [activeId])

    const { noteDataTree } = useActiveNote()
    const { getCachedNoteTree, getNoteData, setNoteDataTree } = useActiveNoteActions()
    const { notifyArchiveChanged } = useWorkspaceActions()
    // The cached notes are read and written by id (a note open in a pane without the focus has its own entry), so no
    // path depends on which note has the focus. An automation is applied to the cached note first: when the write fails
    // the note is reloaded and the error goes on
    const applyOrRefresh = useCallback(async (noteId: number, write: () => Promise<void>) => {
        try {
            await write()
        } catch (error) {
            await getNoteData(noteId).catch(reloadError => reportError(reloadError))
            throw error
        }
    }, [getNoteData])
    const recorder = useUndoRecorder()
    const undoContext = useOptionalUndo()
    const undoRef = useRef(undoContext?.undo)
    useEffect(() => { undoRef.current = undoContext?.undo }, [undoContext?.undo])
    const isLatestRef = useRef(undoContext?.isLatest)
    useEffect(() => { isLatestRef.current = undoContext?.isLatest }, [undoContext?.isLatest])

    /**
     * Gives the tasks and groups of a note what an automation changed on them, as it is in `source`, on the latest data of
     * the note. The groups come first (a restored group brings its tasks back), then the tasks.
     */
    const restore = useCallback(async (
        noteId: number, source: Side, other: Side, tasks: TaskChange[], groups: GroupChange[],
    ) => {
        const cached = getCachedNoteTree(noteId)
        const base = cached ?? await fetchNoteTree(noteId)
        const next = restoreTasks(restoreGroups(base, source.tree, groups), source.full, tasks)
        if (cached) setNoteDataTree(next, noteId)
        // The tasks of an archived group are compared with what the database holds: `other.full` has the groups as they
        // were before this restore, `source.full` as they are after it
        const write = () => applyDBAutomationChanges([
            ...diffGroupStatements(base, next),
            ...diffTaskStatements(withGroups(base, other.full.groups), withGroups(next, source.full.groups)),
        ])
        await applyOrRefresh(noteId, write)
        if (groups.some(change => change.archived)) notifyArchiveChanged()
    }, [getCachedNoteTree, setNoteDataTree, applyOrRefresh, notifyArchiveChanged])

    const run = useCallback(async (event: AutomationEvent, target?: number | null) => {
        const noteId = target ?? activeIdRef.current
        if (noteId === null) return
        const rules = await getRules(noteId)
        if (!rules.some(rule => rule.enabled)) return
        // Read after the await: the note may have changed (or been closed) while the rules were loading
        const before = getCachedNoteTree(noteId)
        if (!before) return

        const { tree: after, applied, touched, touchedGroups, archivedGroups } = runAutomations(before, rules, event)
        if (applied.length === 0 || after === before) return

        // `after` plus the archived groups as they ended up: their tasks may have been changed before the archive
        const fullAfter = withGroups(after, archivedGroups)
        setNoteDataTree(after, noteId)
        // Groups first (archive, color, order), then the tasks: the tasks of an archived group are not in `after`
        await applyOrRefresh(noteId, () => applyDBAutomationChanges([...diffGroupStatements(before, after), ...diffTaskStatements(before, fullAfter)]))

        const tasks = taskChanges(before, fullAfter, touched)
        const groups = groupChanges(before, after, touchedGroups)
        if (groups.some(change => change.archived)) notifyArchiveChanged()

        const groupLabelOf = groupLabelIn(after, before)
        const titleOf = (id: number): SectionName | undefined => {
            const found = findSection(after, id)
            if (!found) return undefined
            // The direct area of a group is named after the group
            return isDefaultSection(found.section) ? { group: groupLabelOf(found.groupId) ?? "" } : found.section.title
        }
        const names = applied.map(rule => automationName(rule, titleOf, groupLabelOf))
        const command: UndoCommand = {
            label: i18n.t("automations.undoLabel", { name: names.join(", ") }),
            noteId,
            undo: () => restore(noteId, { tree: before, full: before }, { tree: after, full: fullAfter }, tasks, groups),
            redo: () => restore(noteId, { tree: after, full: fullAfter }, { tree: before, full: before }, tasks, groups),
        }
        recorder.record(command)
        const undo = undoRef.current
        // The global undo reverts the newest entry: only offer it while the automation is still that one
        const undoAutomation = () => {
            if (isLatestRef.current?.(command)) void undo?.()
            else toast.info(i18n.t("automations.undoUnavailable"))
        }
        // A short title, then the sentence of each rule (one per line) in plain text: the whole sentence in bold was a wall of text
        toast.success(
            i18n.t(names.length === 1 ? "automations.ranTitle" : "automations.ranManyTitle"),
            {
                duration: undo ? ACTION_TOAST_DURATION : undefined,
                description: names.join("\n"),
                classNames: { description: "whitespace-pre-line" },
                ...(undo ? { action: { label: i18n.t("undo.undo"), onClick: undoAutomation } } : {}),
            },
        )
    }, [getRules, getCachedNoteTree, setNoteDataTree, applyOrRefresh, notifyArchiveChanged, recorder, restore])

    /** Runs the rules for an event (never rejects: a failure is reported). An undo asked meanwhile waits for it. */
    const dispatch = useCallback((event: AutomationEvent, noteId?: number | null) => recorder.track(run(event, noteId).catch(error => {
        reportError(error, getErrorMessage(error))
    })), [recorder, run])

    /**
     * Aligns the colors with the state rules (no tasks to do -> one color, some -> another). Silent on purpose: no toast and
     * no undo entry, because the color derives from the tasks (undoing the user action re-aligns it). Never rejects.
     */
    const syncRules = useCallback((target?: number | null) => recorder.track((async () => {
        const noteId = target ?? activeIdRef.current
        if (noteId === null) return
        const rules = await getRules(noteId)
        if (!rules.some(rule => rule.enabled && isStateTrigger(rule.trigger.type))) return
        // Read after the await: the user may have acted while the rules were loading
        const before = getCachedNoteTree(noteId)
        if (!before) return
        const { tree: after } = syncStateRules(before, rules)
        if (after === before) return
        setNoteDataTree(after, noteId)
        await applyOrRefresh(noteId, () => applyDBAutomationChanges([...diffGroupStatements(before, after), ...diffSectionStatements(before, after)]))
    })().catch(error => {
        reportError(error, getErrorMessage(error))
    })), [recorder, getRules, getCachedNoteTree, setNoteDataTree, applyOrRefresh])

    /** The public `sync`: whoever asks from outside has just changed the rules (the automations dialog), so they are read again. */
    const sync = useCallback((noteId?: number | null) => {
        const id = noteId ?? activeIdRef.current
        if (id !== null) rulesCache.current.delete(id)
        return syncRules(noteId)
    }, [syncRules])

    // Only the structure matters: the sync itself changes colors, which keep the signature (and so avoid a loop)
    const signature = useMemo(() => noteDataTree ? structureSignature(noteDataTree) : null, [noteDataTree])
    useEffect(() => {
        if (signature === null) return
        void syncRules(activeId)
    }, [signature, activeId, syncRules])

    const value = useMemo(() => ({ dispatch, sync }), [dispatch, sync])
    return <AutomationsContext.Provider value={value}>{children}</AutomationsContext.Provider>
}
