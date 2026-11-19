import i18n from "@/i18n"
import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore, type HTMLAttributes } from "react"
import { registerZone } from "./note-dnd-hit"
import { newOwnerId } from "./note-dnd-owner"
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
import type { NoteDragPress } from "./note-dnd-pointer"

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
export type NoteDndState = {
    /** What is dragged from this note. */
    active: NoteDragRef | null
    hover: NoteHover
    /**
     * What is dragged from the OTHER note of the split view while crossing is allowed (Ctrl held): the droppables of this note show
     * themselves for it (the slots of a new group), and the drag of the other note writes `hover` here when the pointer is over this note.
     */
    incoming: NoteDragRef | null
    /** On the note the drag started in: the pointer is over a valid target of the other note (the cursor is not "not allowed"). */
    remote: boolean
}

export const NO_HOVER: NoteHover = { overKey: null, zone: null }

/**
 * The state of the drag lives in a small store, not in a React context: a context change re-renders every droppable of the
 * note (hundreds of rows) each time the pointer moves over another one, while with the store each row subscribes only to
 * what concerns it (its own drop zone, the kind of item being dragged).
 */
export type NoteDndStore = {
    /** The id of the drag provider this store belongs to (see note-dnd-owner). */
    owner: string
    getState: () => NoteDndState
    /** Called after every change. */
    subscribe: (listener: () => void) => () => void
    /** Called only when the dragged item changes (a drag starts or ends, or one from the other note comes in). */
    subscribeActive: (listener: () => void) => () => void
    /** Called only when the hover moves onto or off the droppable `key`, or changes its zone while on it: a change of the target wakes the two rows it concerns, not the hundreds of the others. */
    subscribeHover: (key: string, listener: () => void) => () => void
    /** Replaces the parts given; the listeners are called only when one of them is really different. */
    set: (next: Partial<NoteDndState>) => void
}

export const createNoteDndStore = (owner: string = newOwnerId()): NoteDndStore => {
    let state: NoteDndState = { active: null, hover: NO_HOVER, incoming: null, remote: false }
    const listeners = new Set<() => void>()
    const activeListeners = new Set<() => void>()
    const hoverListeners = new Map<string, Set<() => void>>()
    return {
        owner,
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
        },
        subscribeActive: listener => {
            activeListeners.add(listener)
            return () => { activeListeners.delete(listener) }
        },
        subscribeHover: (key, listener) => {
            const set = hoverListeners.get(key) ?? new Set()
            set.add(listener)
            hoverListeners.set(key, set)
            return () => {
                set.delete(listener)
                if (set.size === 0 && hoverListeners.get(key) === set) hoverListeners.delete(key)
            }
        },
        set: next => {
            const before = state
            const merged = { ...state, ...next }
            if (merged.active === before.active && merged.hover === before.hover && merged.incoming === before.incoming && merged.remote === before.remote) return
            state = merged
            if (merged.active !== before.active || merged.incoming !== before.incoming) [...activeListeners].forEach(listener => listener())
            if (merged.hover !== before.hover) {
                const keys = new Set([before.hover.overKey, merged.hover.overKey])
                for (const key of keys) if (key !== null) [...(hoverListeners.get(key) ?? [])].forEach(listener => listener())
            }
            listeners.forEach(listener => listener())
        },
    }
}

/** Without a provider (a row rendered alone) nothing is being dragged. */
const idleStore = createNoteDndStore("")

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
    const store = useContext(NoteDndStoreContext)
    const owner = store.owner
    const setNodeRef = useCallback((node: HTMLElement | null) => registerZone(key, kind, id, ACCEPTS[kind], node, owner), [key, kind, id, owner])
    // Woken only when the hover goes onto or off this droppable (not at every change of the target, which would run the selector of every row of the note)
    const subscribeZone = useCallback((listener: () => void) => store.subscribeHover(key, listener), [store, key])
    const zone = useSyncExternalStore(subscribeZone, () => { const { hover } = store.getState(); return hover.overKey === key ? hover.zone : null })
    // A task row reads `active` only together with `zone`, which is null outside a drag: its value never changes, so a drag starting or ending does not re-render the rows (nor wake them)
    const subscribeKind = useCallback((listener: () => void) => kind === "task" ? () => undefined : store.subscribeActive(listener), [store, kind])
    const activeKind = useSyncExternalStore(subscribeKind, () => kind === "task" ? "task" : (store.getState().active ?? store.getState().incoming)?.kind ?? null)
    // Only the kind of the dragged item is used by the droppables
    const active = useMemo(() => activeKind ? { kind: activeKind } : null, [activeKind])
    return { setNodeRef, zone, active }
}

/** Starts the drag gesture of the provider (see note-dnd-pointer). Without a provider nothing can be dragged. */
export const NoteDragPressContext = createContext<NoteDragPress>(() => undefined)

/**
 * Registers a draggable (group, section or task). There is no drag handle: `dragProps` goes on the element that
 * starts the drag (the header of a group or section, the row of a task); a click without moving (5px) is not a drag.
 * The whole item is dimmed while it is dragged (the preview is rendered by the NoteDragOverlay).
 * The pointer events of portals rendered inside that element (dialogs) do not start a drag.
 *
 * Not a dnd-kit hook: a `useDraggable` re-renders its component each time dnd-kit's `active` changes, i.e. every row of the note at the
 * start and the end of a drag. Here `dragProps` and `setNodeRef` never change and `isDragging` is read from the store with the id of
 * the item, so only the dragged item re-renders.
 * @category Note DnD
 */
export function useNoteDrag(kind: NoteDragKind, id: number) {
    const press = useContext(NoteDragPressContext)
    // The element that is dragged (the one the preview starts over), which is not always the one that gets the pointer down (a header)
    const nodeRef = useRef<HTMLElement | null>(null)
    const setNodeRef = useCallback((node: HTMLElement | null) => { nodeRef.current = node }, [])
    const dragProps = useMemo<HTMLAttributes<HTMLElement>>(
        () => ({ onPointerDown: event => press(event, { kind, id }, nodeRef.current) }),
        [press, kind, id],
    )
    const store = useContext(NoteDndStoreContext)
    // Woken only when a drag starts or ends, not at every change of the target
    const isDragging = useSyncExternalStore(store.subscribeActive, () => { const { active } = store.getState(); return active?.kind === kind && active.id === id })
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
