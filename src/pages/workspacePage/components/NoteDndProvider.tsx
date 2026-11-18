import { getSectionLabel } from "./section/section-label"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { usePreference } from "@/contexts/use-preference"
import {
    computeLiveShifts, computeLiveSlot, GROUPS_LIST, groupListKey, holdHalfZone, holdLiveZone, isInColumnGap, isInRowGap, taskListKey, type LivePending, type LiveSnapshot,
} from "./note-dnd-live"
import { applyShifts, clearShifts, hasShifts, readLiveSnapshot } from "./note-dnd-shift"
import { clearZones, hitTest, measureZones, zoneRect } from "./note-dnd-hit"
import { getGroupLabel } from "./groups/group-label"
import { useActiveNote } from "@/contexts/use-active-note"
import { useGrabbingCursor } from "@/hooks/use-grabbing-cursor"
import {
    computeDropZone, computeGroupDropZone, computeGroupTarget, computeSectionTarget, findGroup, computeTaskTarget, findSection, findTask,
    type DropZone, type NoteDragRef, type NoteOverKind, type NoteOverRef, type SectionTarget, type TaskTarget,
} from "./note-dnd"
import { useTaskSelectionStore } from "./tasks/use-task-selection"
import { taskKey } from "./tasks/task-selection"
import { announce } from "./tasks/note-announcer-store"
import type { NoteDataTree } from "@/types/types"
import { NO_HOVER, NoteDndStoreContext, NoteDragPressContext, createNoteDndStore, noteKey, useGroupMoves, useNoteDndSelector, useNoteMoves, type NoteHover } from "./note-dnd-state"
import { createPointerDrag, type Point, type PointerDragHandlers } from "./note-dnd-pointer"
import { scrollableAncestors, startAutoScroll } from "./note-dnd-autoscroll"
import { createOverlayFollower } from "./note-dnd-overlay"
import { NoteDragOverlay } from "./NoteDragOverlay"

type PendingDrop =
    | { kind: "section", id: number, target: SectionTarget }
    | { kind: "group", id: number, index: number }
    | { kind: "task", id: number, target: TaskTarget }

/** The edges of a drop zone, as the hit test measures them. */
type Rect = { top: number, bottom: number, left: number, right: number }

/**
 * The cursor of the whole window while something is dragged. Over nothing valid (no droppable, or a no-op target such as a task
 * under itself) it says the drop does nothing. It is its own component so that the changes of the target re-render only this
 * (a render of the provider walks the whole note).
 */
const DragCursor = () => {
    const active = useNoteDndSelector(state => state.active !== null)
    const noTarget = useNoteDndSelector(state => state.hover.overKey === null)
    useGrabbingCursor(active, noTarget)
    useLayoutEffect(() => {
        if (!active) return
        document.body.setAttribute("data-note-dragging", "")
        return () => document.body.removeAttribute("data-note-dragging")
    }, [active])
    return null
}

/** Longest wait for the optimistic update of a drop before the rows are put back anyway. */
const SETTLE_TIMEOUT = 500

/**
 * Drag & drop of groups, sections and tasks inside the open note, driven by its own pointer controller (see note-dnd-pointer), not by dnd-kit.
 * Drop zones, from the pointer position on the hovered element:
 * - group (dragged by its header) over another group: left half = before, right half = after,
 *   persisted with an optimistic update of the group positions;
 * - section dragged over a section card: top half = before, bottom half = after (any group);
 * - section dragged over the empty area of a group (or its header): appended to the group;
 * - section dragged over a slot between two groups / the "Nuovo gruppo" column at the end: new group;
 * - task dragged over a task row: top 25% = before, bottom 25% = after, middle = inside (last subtask);
 *   for a task with subtasks the bottom 25% means "first subtask";
 * - task dragged over a section (header, empty body): last top level task of that section.
 * Invalid or no-op targets (e.g. a task under itself or its own descendant) show no indicator and do nothing.
 * @category Note DnD
 */
export const NoteDndProvider = ({ children }: { children: ReactNode }) => {
    const { t } = useTranslation() // re-renders on language change so the screen reader texts follow it
    const selection = useTaskSelectionStore()
    const { noteDataTree } = useActiveNote()
    const { moveSectionTo, moveTaskTo } = useNoteMoves()
    // What is being dragged and over what is in a store (see NoteDndStore): only the preview, the cursor and the dragged row depend on it
    const [store] = useState(createNoteDndStore)
    const { moveGroupTo } = useGroupMoves()
    const pendingRef = useRef<PendingDrop | null>(null)
    const lastMoveRef = useRef<{ key: string, tree: NoteDataTree } | null>(null)
    // Live drag of the tasks, the sections and the groups: the rows are moved with a transform (see note-dnd-shift), never through React state
    const liveDrag = usePreference(preferences => preferences.liveDrag) ?? true
    const liveRef = useRef<{ snapshot: LiveSnapshot, dragged: string, axis: "x" | "y" } | null>(null)
    /**
     * The place the rows are showing now (with hysteresis: it can lag behind the real zone by a few px), the key of what it was computed
     * from, the tree of that moment and, for a place next to a section, the rect it was measured at (null place: nothing is moved).
     */
    const liveShownRef = useRef<{ key: string, tree: NoteDataTree, place: LivePending | null, rect: Rect | null } | null>(null)
    const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    /** What follows the pointer (the preview) and what scrolls near an edge: set at the start of a drag, put away at its end. */
    const [follower] = useState(createOverlayFollower)
    const [drag] = useState(createPointerDrag)
    const stopScrollRef = useRef<(() => void) | null>(null)

    // After a drop the rows are put back in the very commit that moves the task in the tree, so the old order is never painted
    const settle = () => {
        if (settleRef.current === null) return
        clearTimeout(settleRef.current)
        settleRef.current = null
        clearShifts(false)
    }
    useLayoutEffect(settle, [noteDataTree])
    useEffect(() => () => {
        if (settleRef.current !== null) clearTimeout(settleRef.current)
        clearShifts(false)
    }, [])

    const describe = (ref: { kind?: NoteOverKind, id?: number } | undefined) => {
        if (!noteDataTree || !ref || typeof ref.id !== "number") return undefined
        if (ref.kind === "group") {
            const found = findGroup(noteDataTree, ref.id)
            return found ? getGroupLabel(found.group, found.index) : undefined
        }
        if (ref.kind === "section") return (s => s && getSectionLabel(s))(findSection(noteDataTree, ref.id))
        if (ref.kind === "task") return findTask(noteDataTree, ref.id)?.text
        return undefined
    }
    const nameOf = (ref: { kind?: NoteOverKind, id?: number } | undefined) => describe(ref) ?? t("dnd.unknownItem")
    /** The target announced last (null: none), to announce only when it changes. */
    const announcedRef = useRef<NoteOverRef | null>(null)
    const announceOver = (over: NoteOverRef | null) => {
        const dragged = store.getState().active
        const before = announcedRef.current
        if (before?.kind === over?.kind && before?.id === over?.id) return
        announcedRef.current = over
        if (dragged) announce(over ? t("dnd.over", { name: nameOf(dragged), target: nameOf(over) }) : t("dnd.overNone", { name: nameOf(dragged) }))
    }
    const announceEnd = (dragged: NoteDragRef | null, over: NoteOverRef | null) => {
        if (dragged) announce(over ? t("dnd.end", { name: nameOf(dragged), target: nameOf(over) }) : t("dnd.endNone", { name: nameOf(dragged) }))
    }

    const reset = () => {
        stopScrollRef.current?.()
        stopScrollRef.current = null
        follower.end()
        clearZones()
        pendingRef.current = null
        lastMoveRef.current = null
        announcedRef.current = null
        liveRef.current = null
        liveShownRef.current = null
        store.set({ active: null, hover: NO_HOVER })
    }

    /** Moves the rows to open the room of `place` (null: puts them back). The other drops keep the ring / the line. */
    const syncLive = (place: LivePending | null, shown?: { key: string, tree: NoteDataTree, rect?: Rect | null }) => {
        const live = liveRef.current
        if (!live) return
        liveShownRef.current = shown ? { key: shown.key, tree: shown.tree, place, rect: shown.rect ?? null } : null
        const shifts = place ? computeLiveShifts(live.snapshot, live.dragged, place) : null
        const slot = place && shifts && shifts.size > 0 ? computeLiveSlot(live.snapshot, live.dragged, place) : null
        applyShifts(shifts ?? new Map(), shifts && shifts.size > 0 ? live.dragged : null, live.axis, slot)
    }

    /**
     * A row changed its size during the drag (an image that finished loading, a text that wrapped): the layout at rest is read again (the
     * shifts applied are taken out) and the rows are moved by the new sizes, so the room that opens is as tall as it should be. The zones
     * of the hit test measure themselves again by their own flag.
     */
    const refreshLive = (kind: NoteDragRef["kind"]) => {
        const live = liveRef.current
        if (!live) return
        live.snapshot = readLiveSnapshot(kind)
        const shown = liveShownRef.current
        if (shown?.place) syncLive(shown.place, shown)
    }

    const handleDragStart: PointerDragHandlers["start"] = (data, { pointer, press, node }) => {
        lastMoveRef.current = null
        measureZones(data.kind, () => refreshLive(data.kind))
        stopScrollRef.current = startAutoScroll(scrollableAncestors(node), () => drag.getPointer())
        follower.begin(node?.getBoundingClientRect() ?? null, press, pointer)
        announce(t("dnd.start", { name: nameOf(data) }))
        // A task of a multi-selection moves alone: the selection is dropped so what is dragged is what moves
        if (data.kind === "task" && selection && selection.getSelected().size >= 2 && selection.has(taskKey(data.id))) {
            selection.reset()
            announce(t("tasks.keyboard.dragSingle"))
        }
        // The layout at rest, before anything moves: the sizes the shifts are computed from
        liveRef.current = liveDrag ? { snapshot: readLiveSnapshot(data.kind, node), dragged: noteKey(data.kind, data.id), axis: data.kind === "group" ? "x" : "y" } : null
        store.set({ active: { kind: data.kind, id: data.id } })
    }

    /** The rect the place being shown was hit with, where it is now (the content may have scrolled since). */
    const shownRect = (shown: { place: LivePending | null, rect: Rect | null }): Rect | null => {
        const [kind, id] = shown.place?.over?.split("-") ?? []
        const fresh = (kind === "group" || kind === "section") && id ? zoneRect(kind, Number(id)) : null
        return fresh ?? shown.rect
    }

    const handleDragMove = (pointer: Point) => {
        const dragged = store.getState().active
        follower.follow(pointer)
        const hit = dragged ? hitTest(pointer) : null
        const over = hit ? { data: { current: hit.ref }, rect: hit.rect } : null
        // The few px around a column belong to no group: the columns (and the drop) keep the place of the group left behind
        if (dragged?.kind === "group" && !over && liveRef.current) {
            const shown = liveShownRef.current
            const rect = shown?.place ? shownRect(shown) : null
            if (rect && isInColumnGap(rect, pointer)) return
        }
        if (!dragged || !over || !noteDataTree) {
            pendingRef.current = null
            lastMoveRef.current = null
            if (liveShownRef.current) syncLive(null)
            store.set({ hover: NO_HOVER })
            announceOver(null)
            return
        }

        const overData = over.data.current as NoteOverRef
        const overRef: NoteOverRef = { kind: overData.kind, id: overData.id }
        let zone: DropZone = "inside"
        if (dragged.kind === "group") {
            // Entering the column of another group is enough (no half to pass): the side is the one of the resting order
            zone = overRef.kind === "group" ? computeGroupDropZone(noteDataTree, dragged.id, overRef.id) : "after"
        } else if (overRef.kind === "task" || overRef.kind === "section") {
            const pointerY = pointer.y
            const overTask = overRef.kind === "task" ? findTask(noteDataTree, overRef.id) : undefined
            zone = computeDropZone(dragged.kind, overRef.kind, over.rect, pointerY, { hasSubtasks: (overTask?.subtasks.length ?? 0) > 0 })
        }

        // The rows follow the zone with a small hysteresis (presentation only: the drop below uses the real zone)
        if (liveRef.current && dragged.kind === "task") {
            if (overRef.kind !== "task") {
                if (liveShownRef.current) syncLive(null)
            } else {
                const overKey = noteKey("task", overRef.id)
                const shown = liveShownRef.current
                const pointerY = pointer.y
                const liveZone = shown?.place?.over === overKey && shown.place.zone
                    ? holdLiveZone(shown.place.zone, zone, over.rect, pointerY)
                    : zone
                const key = `${overKey}|${liveZone}`
                if (!(shown && shown.key === key && shown.tree === noteDataTree)) {
                    const target = computeTaskTarget(noteDataTree, dragged.id, overRef, liveZone)
                    syncLive(target ? { over: overKey, zone: liveZone, list: taskListKey(target) } : null, { key, tree: noteDataTree })
                }
            }
        } else if (liveRef.current && dragged.kind === "section") {
            const overKey = noteKey(overRef.kind, overRef.id)
            const shown = liveShownRef.current
            const pointerY = pointer.y
            // The few px between two sections belong to the group: the rows (and the drop) keep the place of the section left behind
            const heldRect = shown?.place && overRef.kind === "group" ? shownRect(shown) : null
            if (heldRect && shown?.place?.list === groupListKey(overRef.id) && isInRowGap(heldRect, pointerY)) return
            const liveZone = overRef.kind === "section" && shown?.place?.over === overKey && shown.place.zone
                ? holdHalfZone(shown.place.zone, zone, over.rect, pointerY)
                : zone
            const key = `${overKey}|${liveZone}`
            if (!(shown && shown.key === key && shown.tree === noteDataTree)) {
                const target = overRef.kind === "new-group" ? null : computeSectionTarget(noteDataTree, dragged.id, overRef, liveZone)
                let place: LivePending | null = null
                if (target?.type === "group") {
                    const list = groupListKey(target.groupId)
                    place = overRef.kind === "section" && (liveZone === "before" || liveZone === "after")
                        ? { over: overKey, zone: liveZone, list }
                        : { over: null, zone: null, list } // on the empty area of a group: at its end
                }
                syncLive(place, { key, tree: noteDataTree, rect: place?.over ? over.rect : null })
            }
        } else if (liveRef.current && dragged.kind === "group") {
            if (overRef.kind !== "group") {
                if (liveShownRef.current) syncLive(null)
            } else {
                const overKey = noteKey("group", overRef.id)
                const shown = liveShownRef.current
                // One side per column (the resting order), so nothing flickers: no hysteresis needed
                const key = `${overKey}|${zone}`
                if (!(shown && shown.key === key && shown.tree === noteDataTree)) {
                    const target = computeGroupTarget(noteDataTree, dragged.id, overRef, zone)
                    syncLive(target ? { over: overKey, zone, list: GROUPS_LIST } : null, { key, tree: noteDataTree, rect: target ? over.rect : null })
                }
            }
        }

        // Same item over the same zone of the same tree: the target is the one already computed
        const moveKey = `${dragged.kind}-${dragged.id}|${noteKey(overRef.kind, overRef.id)}|${zone}`
        if (lastMoveRef.current?.key === moveKey && lastMoveRef.current.tree === noteDataTree) return
        lastMoveRef.current = { key: moveKey, tree: noteDataTree }

        let pending: PendingDrop | null = null
        if (dragged.kind === "group") {
            const target = computeGroupTarget(noteDataTree, dragged.id, overRef, zone)
            if (target) pending = { kind: "group", id: dragged.id, index: target.index }
        } else if (dragged.kind === "section") {
            const target = computeSectionTarget(noteDataTree, dragged.id, overRef, zone)
            if (target) pending = { kind: "section", id: dragged.id, target }
        } else {
            const target = computeTaskTarget(noteDataTree, dragged.id, overRef, zone)
            if (target) pending = { kind: "task", id: dragged.id, target }
        }
        pendingRef.current = pending

        const targetSectionId = pending?.kind === "task" ? pending.target.sectionId : null
        const next: NoteHover = pending ? { overKey: noteKey(overRef.kind, overRef.id), zone, targetSectionId } : NO_HOVER
        const prev = store.getState().hover
        if (prev.overKey !== next.overKey || prev.zone !== next.zone || prev.targetSectionId !== next.targetSectionId) store.set({ hover: next })
        announceOver(pending ? overRef : null)
    }

    const handleDragEnd = async () => {
        const pending = pendingRef.current
        const shifted = hasShifts()
        announceEnd(store.getState().active, pending ? announcedRef.current : null)
        reset()
        if (shifted && (pending?.kind === "task" || pending?.kind === "group" || (pending?.kind === "section" && pending.target.type === "group"))) {
            // The optimistic update below replaces the tree: the rows go back in that commit (see the layout effect)
            settleRef.current = setTimeout(() => { settleRef.current = null; clearShifts(false) }, SETTLE_TIMEOUT)
        } else {
            clearShifts(!pending)
        }
        if (!pending) return
        if (pending.kind === "group") await moveGroupTo(pending.id, pending.index)
        else if (pending.kind === "section") await moveSectionTo(pending.id, pending.target)
        else await moveTaskTo(pending.id, pending.target)
    }

    const handleDragCancel = () => {
        const dragged = store.getState().active
        if (dragged) announce(t("dnd.cancel", { name: nameOf(dragged) }))
        reset()
        clearShifts(true)
    }

    // The controller calls the handlers of the latest render (they read the note and the preferences of that render)
    useLayoutEffect(() => {
        drag.setHandlers({ start: handleDragStart, move: handleDragMove, end: () => { void handleDragEnd() }, cancel: handleDragCancel })
    })
    useEffect(() => () => drag.cancel(), [drag])

    return (
        <NoteDndStoreContext.Provider value={store}>
            <NoteDragPressContext.Provider value={drag.press}>
                {children}
                <DragCursor />
                <NoteDragOverlay follower={follower} />
            </NoteDragPressContext.Provider>
        </NoteDndStoreContext.Provider>
    )
}
