import i18n from "@/i18n"
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type HTMLAttributes, type PointerEvent } from "react"
import { useDraggable } from "@dnd-kit/core"
import { registerZone } from "./note-dnd-hit"
import { reportError } from "@/lib/report-error"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { getErrorMessage } from "@/lib/utils"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { useAutomations } from "@/hooks/use-automations"
import { captureSectionPlace, captureTaskPlace, makeLabel } from "@/contexts/undo/commands"
import { getGroupLabel } from "./groups/group-label"
import type { Group } from "@/types/types"
import type { UndoCommand } from "@/contexts/undo/stack"
import {
    ACCEPTS, moveGroupInList,
    type DropZone, type NoteDragKind, type NoteDragRef, type NoteOverKind, type SectionTarget, type TaskTarget,
} from "./note-dnd"

/**
 * Hover state shared by the droppables while dragging: the key of the droppable under the pointer
 * (null when the drop would be invalid or a no-op) and the drop zone inside it.
 * @category Note DnD
 */
export type NoteHover = {
    overKey: string | null
    zone: DropZone | null
    /** While dragging a task: the section that would receive it (highlighted as a whole), null otherwise. */
    targetSectionId?: number | null
}
type NoteDndState = { active: NoteDragRef | null, hover: NoteHover }

export const NO_HOVER: NoteHover = { overKey: null, zone: null }

/**
 * The state of the drag lives in a small store, not in a React context: a context change re-renders every droppable of the
 * note (hundreds of rows) each time the pointer moves over another one, while with the store each row subscribes only to
 * what concerns it (its own drop zone, the kind of item being dragged).
 */
export type NoteDndStore = {
    getState: () => NoteDndState
    subscribe: (listener: () => void) => () => void
    /** Replaces the parts given; the listeners are called only when one of them is really different. */
    set: (next: Partial<NoteDndState>) => void
}

export const createNoteDndStore = (): NoteDndStore => {
    let state: NoteDndState = { active: null, hover: NO_HOVER }
    const listeners = new Set<() => void>()
    return {
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
        },
        set: next => {
            const merged = { ...state, ...next }
            if (merged.active === state.active && merged.hover === state.hover) return
            state = merged
            listeners.forEach(listener => listener())
        },
    }
}

/** Without a provider (a row rendered alone) nothing is being dragged. */
const idleStore = createNoteDndStore()

export const NoteDndStoreContext = createContext<NoteDndStore>(idleStore)

/**
 * Reads a part of the drag state. The selector must return a primitive (or a value that is the same object while nothing
 * changed): the component re-renders only when the selected value changes.
 * @category Note DnD
 */
export function useNoteDndSelector<T>(selector: (state: NoteDndState) => T): T {
    const store = useContext(NoteDndStoreContext)
    return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}

/** Droppable key of a target, also used as dnd-kit id. */
export const noteKey = (kind: NoteOverKind, id: number) => `${kind}-${id}`

/**
 * Registers a droppable of the note view. Returns the ref to attach and the drop zone currently
 * highlighted on it (null when it is not the active target).
 * @category Note DnD
 */
export function useNoteDrop(kind: NoteOverKind, id: number) {
    const key = noteKey(kind, id)
    // Not a dnd-kit droppable (see note-dnd-hit): the node only goes in the registry the drag hit-tests
    const setNodeRef = useCallback((node: HTMLElement | null) => registerZone(key, kind, id, ACCEPTS[kind], node), [key, kind, id])
    const zone = useNoteDndSelector(state => state.hover.overKey === key ? state.hover.zone : null)
    // A task row reads `active` only together with `zone`, which is null outside a drag: its value never changes, so a drag starting or ending does not re-render the rows
    const activeKind = useNoteDndSelector(state => kind === "task" ? "task" : state.active?.kind ?? null)
    // Only the kind of the dragged item is used by the droppables
    const active = useMemo(() => activeKind ? { kind: activeKind } : null, [activeKind])
    return { setNodeRef, zone, active }
}

/**
 * Registers a draggable (group, section or task). There is no drag handle: `dragProps` goes on the element that
 * starts the drag (the header of a group or section, the row of a task); a click without moving (5px) is not a drag.
 * The whole item is dimmed while it is dragged (the preview is rendered by the DragOverlay).
 * The pointer events of portals rendered inside that element (dialogs) do not start a drag.
 * @category Note DnD
 */
export function useNoteDrag(kind: NoteDragKind, id: number) {
    const { setNodeRef, listeners, isDragging } = useDraggable({ id: `drag-${kind}-${id}`, data: { kind, id } })
    const start = listeners?.onPointerDown as ((event: PointerEvent<HTMLElement>) => void) | undefined
    // Kept the same object while `start` is the same, so a memoized row does not re-render because of it
    const dragProps = useMemo<HTMLAttributes<HTMLElement>>(
        () => start ? { onPointerDown: event => { if (event.currentTarget.contains(event.target as Node)) start(event) } } : {},
        [start],
    )
    return { setNodeRef, dragProps, isDragging }
}

/**
 * Applies a computed move to the open note. Used by the drag & drop and by the "Sposta in…" menus.
 * The cached note data is updated at once and restored if the write fails (errors are shown with a toast (sonner)).
 * A section moved into a NEW group is applied once the write returns the id of the new group (background reload if it is missing).
 * @category Note DnD
 */
export function useNoteMoves() {
    const { moveSection, moveDirectSection, moveSectionToNewGroup, moveTask } = useWorkspaceActions()
    const { applySectionMove, applyDirectSectionMove, applySectionMoveToNewGroup, applyTaskMove, getNoteTree } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    const { dispatch } = useAutomations()

    const moveSectionTo = useCallback((sectionId: number, target: SectionTarget) => recorder.track((async () => {
        const from = captureSectionPlace(getNoteTree(), sectionId)
        const flag = target.type === "group" && target.beforeList ? [true] as const : [] as const
        const rollback = target.type === "group" ? applySectionMove(sectionId, target.groupId, target.index, ...flag) : null
        try {
            if (target.type === "group") {
                await moveSection(sectionId, target.groupId, target.index, ...flag)
                if (from) recorder.sectionMove(sectionId, from.name, from, { groupId: target.groupId, index: target.index, ...(target.beforeList ? { beforeList: true } : {}) })
            } else {
                // The new group only exists once the write is done; without its id the note is reloaded in background
                const { groupId, defaultSectionId } = await moveSectionToNewGroup(sectionId, target.index)
                applySectionMoveToNewGroup(sectionId, groupId, target.index, defaultSectionId)
                if (from && Number.isInteger(groupId)) recorder.sectionMoveToNewGroup(sectionId, from.name, groupId, from)
            }
        } catch (err) {
            rollback?.()
            reportError(err, getErrorMessage(err))
        }
    })()), [moveSection, moveSectionToNewGroup, applySectionMove, applySectionMoveToNewGroup, getNoteTree, recorder])

    /** Moves the list of the direct tasks of a group before the `index`-th section of the group (after all of them when `index` is not less than their number). */
    const moveDirectSectionTo = useCallback((groupId: number, index: number) => recorder.track((async () => {
        const group = getNoteTree()?.groups.find(candidate => candidate.id === groupId)
        const from = group?.defaultIndex ?? 0
        const rollback = applyDirectSectionMove(groupId, index)
        try {
            await moveDirectSection(groupId, index)
            const to = getNoteTree()?.groups.find(group => group.id === groupId)?.defaultIndex ?? index
            if (to !== from) recorder.directMove(groupId, group?.name ?? "", from, to)
        } catch (err) {
            rollback()
            reportError(err, getErrorMessage(err))
        }
    })()), [moveDirectSection, applyDirectSectionMove, getNoteTree, recorder])

    const moveTaskTo = useCallback((taskId: number, target: TaskTarget) => recorder.track((async () => {
        const destination = { sectionId: target.sectionId, parentTaskId: target.parentTaskId }
        const from = captureTaskPlace(getNoteTree(), taskId)
        const rollback = applyTaskMove(taskId, destination, target.index)
        try {
            await moveTask(taskId, destination, target.index)
            if (from) recorder.taskMove(taskId, from.name, from, target)
            if (from && from.sectionId !== target.sectionId) void dispatch({ type: "task.moved", taskId, fromSectionId: from.sectionId })
        } catch (err) {
            rollback()
            reportError(err, getErrorMessage(err))
        }
    })()), [moveTask, applyTaskMove, getNoteTree, recorder, dispatch])

    return { moveSectionTo, moveDirectSectionTo, moveTaskTo }
}

/**
 * Moves a group to a new index among the groups: optimistic update of the note data, rolled back when
 * saving the positions fails.
 * @category Note DnD
 */
export function useGroupMoves() {
    const { updateGroupsPositions } = useWorkspaceActions()
    const { setNoteDataTree, getNoteTree } = useActiveNoteActions()
    const recorder = useUndoRecorder()

    /** Moves the group on the latest data of the open note (also used by undo/redo); rejects when it cannot be moved. */
    const applyGroupMove = useCallback(async (groupId: number, index: number) => {
        const tree = getNoteTree()
        const updatedGroups = tree ? moveGroupInList(tree.groups, groupId, index) : null
        if (!tree || !updatedGroups) throw new Error(i18n.t("undo.errors.unavailable"))

        setNoteDataTree({ groups: updatedGroups })
        try {
            await updateGroupsPositions(updatedGroups)
        } catch (error) {
            setNoteDataTree(tree)
            throw error
        }
    }, [getNoteTree, setNoteDataTree, updateGroupsPositions])

    const moveGroupTo = useCallback(async (groupId: number, index: number) => {
        const tree = getNoteTree()
        if (!tree || !moveGroupInList(tree.groups, groupId, index)) return
        const ordered = [...tree.groups].sort((a, b) => a.position - b.position)
        const fromIndex = ordered.findIndex(group => group.id === groupId)
        const group: Group = ordered[fromIndex]

        try {
            await applyGroupMove(groupId, index)
        } catch (error) {
            reportError(error, i18n.t("errors.moveGroup"))
            return
        }
        const command: UndoCommand = {
            label: makeLabel("move", "section_group", group.name?.trim() || getGroupLabel(group, fromIndex)),
            undo: () => applyGroupMove(groupId, fromIndex),
            redo: () => applyGroupMove(groupId, index),
        }
        recorder.record(command)
    }, [getNoteTree, applyGroupMove, recorder])

    return { moveGroupTo }
}
