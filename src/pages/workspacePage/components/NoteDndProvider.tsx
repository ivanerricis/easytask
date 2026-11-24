import { getSectionLabel } from "./section/section-label"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { usePreference } from "@/contexts/use-preference"
import {
    computeLiveShifts, computeLiveSlot, GROUPS_LIST, groupListKey, holdHalfZone, holdHalfZoneX, holdLiveZone, isInColumnGap, isInRowGap, taskListKey, type LivePending, type LiveSnapshot,
} from "./note-dnd-live"
import { applyShifts, clearShifts, hasShifts, readLiveSnapshot } from "./note-dnd-shift"
import { clearZones, hitTest, measureZones, zoneRect } from "./note-dnd-hit"
import { getGroupLabel } from "./groups/group-label"
import { useActiveNote } from "@/contexts/use-active-note"
import { useGrabbingCursor } from "@/hooks/use-grabbing-cursor"
import {
    computeCrossGroupDropZone, computeDropZone, computeFirstGroupTarget, computeGroupDropZone, computeGroupTarget, computeSectionTarget, findGroup, computeTaskTarget, findSection, findTask,
    type DropZone, type NoteDragRef, type NoteOverKind, type NoteOverRef, type SectionTarget, type TaskTarget,
} from "./note-dnd"
import { useTaskSelectionStore } from "./tasks/use-task-selection"
import { taskKey } from "./tasks/task-selection"
import { announce } from "./tasks/note-announcer-store"
import type { NoteDataTree } from "@/types/types"
import { NO_HOVER, NoteDndStoreContext, NoteDragPressContext, createNoteDndStore, noteKey, useGroupMoves, useNoteDndSelector, useNoteMoves, type NoteHover } from "./note-dnd-state"
import { createPointerDrag, type Modifiers, type Point, type PointerDragHandlers } from "./note-dnd-pointer"
import { otherScrollers, SCROLLABLE, scrollableAncestors, startAutoScroll, startScrollLock, type ScrollLock } from "./note-dnd-autoscroll"
import { createOverlayFollower } from "./note-dnd-overlay"
import { NoteDragOverlay } from "./NoteDragOverlay"
import { getNoteOwner, hasOtherNote, NoteOwnerContext, otherOwners, ownerKey, ownerOfKey, registerNoteOwner, stripOwner, type OwnerInfo } from "./note-dnd-owner"
import { useCrossNoteMoves } from "./note-dnd-cross"
import { setVeilLiftedPane } from "./note-dnd-veil"
import { usePane } from "@/contexts/use-layout"

/** Where a drop goes when it crosses to the other note of the split view: that note and the provider (pane) it belongs to. */
type Remote = { noteId: number, owner: string }

type PendingDrop = (
    | { kind: "section", id: number, target: SectionTarget }
    | { kind: "group", id: number, index: number }
    | { kind: "task", id: number, target: TaskTarget }
    // A task dropped on the empty area of an empty note: a group is created there to hold it (only crossing)
    | { kind: "task-new-group", id: number }
) & { remote?: Remote }

/** The edges of a drop zone, as the hit test measures them. */
type Rect = { top: number, bottom: number, left: number, right: number }

/**
 * The cursor of the whole window while something is dragged. Over nothing valid (no droppable, or a no-op target such as a task
 * under itself) it says the drop does nothing. It is its own component so that the changes of the target re-render only this
 * (a render of the provider walks the whole note).
 */
const DragCursor = () => {
    const active = useNoteDndSelector(state => state.active !== null)
    // A valid target in the other note of the split view counts too
    const noTarget = useNoteDndSelector(state => state.hover.overKey === null && !state.remote)
    useGrabbingCursor(active, noTarget)
    useLayoutEffect(() => {
        if (!active) return
        document.body.setAttribute("data-note-dragging", "")
        return () => document.body.removeAttribute("data-note-dragging")
    }, [active])
    return null
}

/** The pane of the other note under the pointer (by its area, or by the zone the hit test found in it), null when none. */
const paneUnder = (owner: string, pointer: Point, hitOwner: string | undefined, bounds: Map<OwnerInfo, DOMRect | null>): number | null => {
    for (const info of otherOwners(owner)) {
        if (info.pane === undefined || info.noteId === null) continue
        if (hitOwner !== undefined && info.store.owner === hitOwner) return info.pane
        const rect = bounds.get(info)
        if (rect && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom) return info.pane
    }
    return null
}

/** Longest wait for the optimistic update of a drop before the rows are put back anyway. */
const SETTLE_TIMEOUT = 500

/**
 * Drag & drop of groups, sections and tasks inside the open note, driven by its own pointer controller (see note-dnd-pointer), not by dnd-kit.
 * Drop zones, from the pointer position on the hovered element:
 * - group (dragged by its header) over another group: as soon as the pointer is in its column it takes its place: after it when it
 *   stands later in the resting order, before it when earlier (no half to pass), persisted with an optimistic update of the
 *   group positions;
 * - the drop zone of a group is its whole column (the full height of the note), not only its card: a section, a task or a group
 *   dropped in the empty space under a short card counts as dropped on the group;
 * - section dragged over a section card: top half = before, bottom half = after (any group);
 * - section dragged over the empty area of a group (or its header): appended to the group;
 * - section dragged over a slot between two groups / the "Nuovo gruppo" column at the end: new group;
 * - task dragged over a task row: top 25% = before, bottom 25% = after, middle = inside (last subtask);
 *   for a task with subtasks the bottom 25% means "first subtask";
 * - task dragged over a section (header, empty body): last top level task of that section.
 * Invalid or no-op targets (e.g. a task under itself or its own descendant) show no indicator and do nothing.
 *
 * In a split view the zones of the other note are targets too, but only while Ctrl is held for the drag (see {@link useCrossNoteMoves}):
 * the item is moved there, or copied with Alt held at the release. While Ctrl is held the note the drag started in does not scroll and
 * the other one does. A group dropped over a group of the other note goes before it (left half) or after it (right half).
 * @category Note DnD
 */
export const NoteDndProvider = ({ children }: { children: ReactNode }) => {
    const { t } = useTranslation() // re-renders on language change so the screen reader texts follow it
    const selection = useTaskSelectionStore()
    const { noteDataTree } = useActiveNote()
    const { moveSectionTo, moveTaskTo } = useNoteMoves()
    const { noteId, getTree, dropAcross, dropTaskInEmptyNote } = useCrossNoteMoves()
    // What is being dragged and over what is in a store (see NoteDndStore): only the preview, the cursor and the dragged row depend on it
    const [store] = useState(createNoteDndStore)
    const owner = store.owner
    const paneContext = usePane()
    const pane = paneContext?.pane
    const rootRef = paneContext?.rootRef
    useEffect(
        () => registerNoteOwner(owner, noteId, store, { pane, bounds: () => rootRef?.current?.getBoundingClientRect() ?? null }),
        [owner, noteId, store, pane, rootRef],
    )
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
    /** The wheel and the scroll of the containers of this note, locked while the drag may cross to the other one (Ctrl held). */
    const lockRef = useRef<ScrollLock | null>(null)
    /** The other note whose rows show the target now (so it can be told when the pointer leaves it). */
    const remoteShownRef = useRef<OwnerInfo | null>(null)
    /** The area of the other panes, measured once at the start of a drag (the panes do not move meanwhile): the veil of the one under the pointer is lifted. */
    const boundsRef = useRef(new Map<OwnerInfo, DOMRect | null>())

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

    const describe = (ref: { kind?: NoteOverKind, id?: number } | undefined, tree: NoteDataTree | null = noteDataTree) => {
        if (!tree || !ref || typeof ref.id !== "number") return undefined
        if (ref.kind === "group") {
            const found = findGroup(tree, ref.id)
            return found ? getGroupLabel(found.group, found.index) : undefined
        }
        if (ref.kind === "section") return (s => s && getSectionLabel(s))(findSection(tree, ref.id))
        if (ref.kind === "task") return findTask(tree, ref.id)?.text
        return undefined
    }
    const nameOf = (ref: { kind?: NoteOverKind, id?: number } | undefined, tree?: NoteDataTree | null) => describe(ref, tree) ?? t("dnd.unknownItem")
    /** The target announced last (null: none), to announce only when it changes. */
    const announcedRef = useRef<NoteOverRef | null>(null)
    const announceOver = (over: NoteOverRef | null, tree?: NoteDataTree | null) => {
        const dragged = store.getState().active
        const before = announcedRef.current
        if (before?.kind === over?.kind && before?.id === over?.id) return
        announcedRef.current = over
        if (dragged) announce(over ? t("dnd.over", { name: nameOf(dragged), target: nameOf(over, tree) }) : t("dnd.overNone", { name: nameOf(dragged) }))
    }
    const announceEnd = (dragged: NoteDragRef | null, over: NoteOverRef | null, tree?: NoteDataTree | null) => {
        if (dragged) announce(over ? t("dnd.end", { name: nameOf(dragged), target: nameOf(over, tree) }) : t("dnd.endNone", { name: nameOf(dragged) }))
    }

    /** Shows (or, with null, takes away) the target in the other note, and tells it what is dragged from here while crossing is allowed. */
    const showRemote = (info: OwnerInfo | null, hover: NoteHover, incoming: NoteDragRef | null) => {
        const previous = remoteShownRef.current
        if (previous && previous !== info) previous.store.set({ hover: NO_HOVER })
        remoteShownRef.current = info
        info?.store.set({ hover, incoming })
        store.set({ remote: !!info && hover.overKey !== null })
    }

    /** Every other note gets (or loses) the dragged item as `incoming`: its droppables that only show while a section is dragged appear. */
    const offerToOthers = (incoming: NoteDragRef | null) => {
        for (const info of otherOwners(owner)) info.store.set({ incoming })
    }

    const reset = () => {
        stopScrollRef.current?.()
        stopScrollRef.current = null
        lockRef.current = null
        follower.end()
        clearZones()
        pendingRef.current = null
        lastMoveRef.current = null
        announcedRef.current = null
        liveRef.current = null
        liveShownRef.current = null
        remoteShownRef.current?.store.set({ hover: NO_HOVER })
        remoteShownRef.current = null
        offerToOthers(null)
        setVeilLiftedPane(null)
        store.set({ active: null, hover: NO_HOVER, remote: false })
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
        boundsRef.current = new Map(otherOwners(owner).map(info => [info, info.bounds?.() ?? null]))
        measureZones(data.kind, () => refreshLive(data.kind))
        // What scrolls near an edge: this note's containers, and, while Ctrl is held and there is another note, only the containers of the other one
        const sources = scrollableAncestors(node)
        // The whole note the drag started in (its row of groups and every list inside it) stays still with Ctrl; the containers of the other one are found once
        const root = node?.closest<HTMLElement>('[data-testid="group-scroll"]') ?? null
        const own = root ? [root, ...root.querySelectorAll<HTMLElement>(SCROLLABLE)] : sources
        let others: HTMLElement[] | null = null
        const othersNow = () => others ??= otherScrollers(root ? [root] : sources)
        const lock = startScrollLock(() => own)
        lockRef.current = lock
        const stopAuto = startAutoScroll(() => drag.getModifiers().ctrl && hasOtherNote(owner) ? othersNow() : sources, () => drag.getPointer())
        stopScrollRef.current = () => { stopAuto(); lock.stop() }
        follower.begin(node?.getBoundingClientRect() ?? null, press, pointer)
        announce(t("dnd.start", { name: nameOf(data) }))
        // A task of a multi-selection moves alone: the selection is dropped so what is dragged is what moves
        if (data.kind === "task" && selection && selection.getSelected().size >= 2 && selection.has(taskKey(data.id))) {
            selection.reset()
            announce(t("tasks.keyboard.dragSingle"))
        }
        // The layout at rest, before anything moves: the sizes the shifts are computed from
        liveRef.current = liveDrag ? { snapshot: readLiveSnapshot(data.kind, node), dragged: ownerKey(owner, noteKey(data.kind, data.id)), axis: data.kind === "group" ? "x" : "y" } : null
        store.set({ active: { kind: data.kind, id: data.id } })
    }

    /** The rect the place being shown was hit with, where it is now (the content may have scrolled since). */
    const shownRect = (shown: { place: LivePending | null, rect: Rect | null }): Rect | null => {
        const over = shown.place?.over
        const [kind, id] = over ? stripOwner(over).split("-") : []
        const fresh = (kind === "group" || kind === "section") && id && over ? zoneRect(kind, Number(id), ownerOfKey(over)) : null
        return fresh ?? shown.rect
    }

    const handleDragMove = (pointer: Point) => {
        const dragged = store.getState().active
        follower.follow(pointer)
        // Ctrl held: the drag may cross to the other note (when there is one open), and this note's containers do not scroll
        const crossing = drag.getModifiers().ctrl && hasOtherNote(owner)
        lockRef.current?.update(crossing)
        if (dragged) offerToOthers(crossing ? dragged : null)
        const hit = dragged ? hitTest(pointer, { owner, cross: crossing }) : null
        // The pane the item is over (crossing): its veil is lifted, not only when the pointer is on a drop zone but over any part of it
        setVeilLiftedPane(dragged && crossing ? paneUnder(owner, pointer, hit?.owner, boundsRef.current) : null)
        // What the zone under the pointer belongs to: this note, or (crossing) the other one, whose tree the target is computed on
        const remote = hit && hit.owner !== owner ? getNoteOwner(hit.owner) : undefined
        const remoteTree = remote && remote.noteId !== null ? getTree(remote.noteId) : null
        const lost = !!hit && hit.owner !== owner && !remoteTree
        const targetTree = remote ? remoteTree : noteDataTree
        const hitOwner = hit?.owner ?? owner
        const isRemote = !!remote && !!remoteTree
        // The two panes of a split view can show the same note: a drop on the other pane is then a move inside one note
        const otherNote = isRemote && remote.noteId !== noteId
        const from = otherNote ? noteDataTree ?? undefined : undefined
        const own = (key: string) => ownerKey(hitOwner, key)
        const over = hit && !lost ? { data: { current: hit.ref }, rect: hit.rect } : null
        // The few px around a column belong to no group: the columns (and the drop) keep the place of the group left behind
        if (dragged?.kind === "group" && !over && liveRef.current) {
            const shown = liveShownRef.current
            const rect = shown?.place ? shownRect(shown) : null
            if (rect && isInColumnGap(rect, pointer)) return
        }
        if (!dragged || !over || !noteDataTree || !targetTree) {
            pendingRef.current = null
            lastMoveRef.current = null
            if (liveShownRef.current) syncLive(null)
            store.set({ hover: NO_HOVER })
            showRemote(null, NO_HOVER, crossing ? dragged : null)
            announceOver(null)
            return
        }

        const overData = over.data.current as NoteOverRef
        const overRef: NoteOverRef = { kind: overData.kind, id: overData.id }
        let zone: DropZone = "inside"
        if (dragged.kind === "group") {
            // Entering the column of another group is enough (no half to pass): the side is the one of the resting order; in another note, the half of the column
            zone = overRef.kind === "group" ? (otherNote ? computeCrossGroupDropZone(over.rect, pointer.x) : computeGroupDropZone(targetTree, dragged.id, overRef.id)) : "after"
        } else if (overRef.kind === "task" || overRef.kind === "section") {
            const pointerY = pointer.y
            const overTask = overRef.kind === "task" ? findTask(targetTree, overRef.id) : undefined
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
                const liveZone = shown?.place?.over === own(overKey) && shown.place.zone
                    ? holdLiveZone(shown.place.zone, zone, over.rect, pointerY)
                    : zone
                const key = `${own(overKey)}|${liveZone}`
                if (!(shown && shown.key === key && shown.tree === targetTree)) {
                    const target = computeTaskTarget(targetTree, dragged.id, overRef, liveZone, from)
                    syncLive(target ? { over: own(overKey), zone: liveZone, list: own(taskListKey(target)) } : null, { key, tree: targetTree })
                }
            }
        } else if (liveRef.current && dragged.kind === "section") {
            const overKey = noteKey(overRef.kind, overRef.id)
            const shown = liveShownRef.current
            const pointerY = pointer.y
            // The few px between two sections belong to the group: the rows (and the drop) keep the place of the section left behind
            const heldRect = shown?.place && overRef.kind === "group" ? shownRect(shown) : null
            if (heldRect && shown?.place?.list === own(groupListKey(overRef.id)) && isInRowGap(heldRect, pointerY)) return
            const liveZone = overRef.kind === "section" && shown?.place?.over === own(overKey) && shown.place.zone
                ? holdHalfZone(shown.place.zone, zone, over.rect, pointerY)
                : zone
            const key = `${own(overKey)}|${liveZone}`
            if (!(shown && shown.key === key && shown.tree === targetTree)) {
                const target = overRef.kind === "new-group" ? null : computeSectionTarget(targetTree, dragged.id, overRef, liveZone, from)
                let place: LivePending | null = null
                if (target?.type === "group") {
                    const list = own(groupListKey(target.groupId))
                    place = overRef.kind === "section" && (liveZone === "before" || liveZone === "after")
                        ? { over: own(overKey), zone: liveZone, list }
                        : { over: null, zone: null, list } // on the empty area of a group: at its end
                }
                syncLive(place, { key, tree: targetTree, rect: place?.over ? over.rect : null })
            }
        } else if (liveRef.current && dragged.kind === "group") {
            if (overRef.kind !== "group") {
                if (liveShownRef.current) syncLive(null)
            } else {
                const overKey = noteKey("group", overRef.id)
                const shown = liveShownRef.current
                // One side per column (the resting order), so nothing flickers: no hysteresis needed. In another note the half of the column decides, with a margin around the middle
                const liveZone = otherNote && shown?.place?.over === own(overKey) && shown.place.zone
                    ? holdHalfZoneX(shown.place.zone, zone, over.rect, pointer.x)
                    : zone
                const key = `${own(overKey)}|${liveZone}`
                if (!(shown && shown.key === key && shown.tree === targetTree)) {
                    const target = computeGroupTarget(targetTree, dragged.id, overRef, liveZone, from)
                    syncLive(target ? { over: own(overKey), zone: liveZone, list: own(GROUPS_LIST) } : null, { key, tree: targetTree, rect: target ? over.rect : null })
                }
            }
        }

        // Same item over the same zone of the same tree: the target is the one already computed
        const moveKey = `${hitOwner}|${dragged.kind}-${dragged.id}|${noteKey(overRef.kind, overRef.id)}|${zone}`
        if (lastMoveRef.current?.key === moveKey && lastMoveRef.current.tree === targetTree) return
        lastMoveRef.current = { key: moveKey, tree: targetTree }

        let pending: PendingDrop | null = null
        if (overRef.kind === "new-group" && dragged.kind !== "section") {
            // The empty area of an empty note of the other pane: a group is the first group, a task gets a new group
            const first = computeFirstGroupTarget(targetTree, dragged.kind, otherNote)
            if (first?.kind === "group") pending = { kind: "group", id: dragged.id, index: first.index }
            else if (first) pending = { kind: "task-new-group", id: dragged.id }
        } else if (dragged.kind === "group") {
            const target = computeGroupTarget(targetTree, dragged.id, overRef, zone, from)
            if (target) pending = { kind: "group", id: dragged.id, index: target.index }
        } else if (dragged.kind === "section") {
            const target = computeSectionTarget(targetTree, dragged.id, overRef, zone, from)
            if (target) pending = { kind: "section", id: dragged.id, target }
        } else {
            const target = computeTaskTarget(targetTree, dragged.id, overRef, zone, from)
            if (target) pending = { kind: "task", id: dragged.id, target }
        }
        if (pending && isRemote && remote.noteId !== null) pending = { ...pending, remote: { noteId: remote.noteId, owner: hitOwner } }
        pendingRef.current = pending

        const targetSectionId = pending?.kind === "task" ? pending.target.sectionId : null
        const next: NoteHover = pending ? { overKey: noteKey(overRef.kind, overRef.id), zone, targetSectionId } : NO_HOVER
        if (isRemote) {
            // The target is drawn by the other note; this one shows none
            if (store.getState().hover !== NO_HOVER) store.set({ hover: NO_HOVER })
            showRemote(remote, next, dragged)
        } else {
            showRemote(null, NO_HOVER, crossing ? dragged : null)
            const prev = store.getState().hover
            if (prev.overKey !== next.overKey || prev.zone !== next.zone || prev.targetSectionId !== next.targetSectionId) store.set({ hover: next })
        }
        announceOver(pending ? overRef : null, targetTree)
    }

    const handleDragEnd = async (modifiers: Modifiers) => {
        // Releasing Ctrl before the button takes the other note away as a target, like it does while moving
        const pending = pendingRef.current?.remote && !modifiers.ctrl ? null : pendingRef.current
        const shifted = hasShifts()
        const remoteTree = pending?.remote ? getTree(pending.remote.noteId) : null
        announceEnd(store.getState().active, pending ? announcedRef.current : null, remoteTree ?? noteDataTree)
        reset()
        const copy = !!pending?.remote && modifiers.alt
        if (shifted && !copy && (pending?.kind === "task" || pending?.kind === "task-new-group" || pending?.kind === "group" || (pending?.kind === "section" && pending.target.type === "group"))) {
            // The optimistic update below replaces the tree: the rows go back in that commit (see the layout effect)
            settleRef.current = setTimeout(() => { settleRef.current = null; clearShifts(false) }, SETTLE_TIMEOUT)
        } else {
            clearShifts(!pending || copy)
        }
        if (!pending) return
        if (pending.remote) {
            const toNoteId = pending.remote.noteId
            if (pending.kind === "group") await dropAcross({ kind: "group", id: pending.id, toNoteId, index: pending.index, copy })
            else if (pending.kind === "task-new-group") await dropTaskInEmptyNote({ id: pending.id, toNoteId, copy })
            else if (pending.kind === "section") await dropAcross({ kind: "section", id: pending.id, toNoteId, target: pending.target, copy })
            else await dropAcross({ kind: "task", id: pending.id, toNoteId, target: pending.target, copy })
            return
        }
        if (pending.kind === "task-new-group") return
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
        drag.setHandlers({ start: handleDragStart, move: handleDragMove, end: modifiers => { void handleDragEnd(modifiers) }, cancel: handleDragCancel })
    })
    useEffect(() => () => drag.cancel(), [drag])

    return (
        <NoteDndStoreContext.Provider value={store}>
            <NoteOwnerContext.Provider value={owner}>
                <NoteDragPressContext.Provider value={drag.press}>
                    {children}
                    <DragCursor />
                    <NoteDragOverlay follower={follower} />
                </NoteDragPressContext.Provider>
            </NoteOwnerContext.Provider>
        </NoteDndStoreContext.Provider>
    )
}
