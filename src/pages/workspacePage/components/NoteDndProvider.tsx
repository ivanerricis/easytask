import { getSectionLabel } from "./section/section-label"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { CSSProperties, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"
import {
    DndContext, DragOverlay, PointerSensor, getClientRect, useSensor, useSensors,
    type Collision, type CollisionDetection, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { usePreference } from "@/contexts/use-preference"
import { computeLiveShifts, makeShiftFreeMeasure, taskListKey, type LiveSnapshot } from "./note-dnd-live"
import { applyShifts, clearShifts, hasShifts, readLiveSnapshot, shiftOf } from "./note-dnd-shift"
import { getGroupLabel } from "./groups/group-label"
import { useActiveNote } from "@/contexts/use-active-note"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { hexToRgba } from "@/lib/utils"
import { useGrabbingCursor } from "@/hooks/use-grabbing-cursor"
import {
    computeDropZone, computeGroupDropZone, computeGroupTarget, computeSectionTarget, findGroup, computeTaskTarget, findSection, findTask,
    type DropZone, type NoteDragKind, type NoteDragRef, type NoteOverKind, type NoteOverRef, type SectionTarget, type TaskTarget,
} from "./note-dnd"
import { useTaskSelectionStore } from "./tasks/use-task-selection"
import { taskKey } from "./tasks/task-selection"
import { announce } from "./tasks/note-announcer-store"
import { buildDndAccessibility } from "@/lib/dnd-accessibility"
import type { NoteDataTree } from "@/types/types"
import { NO_HOVER, NoteDndStoreContext, createNoteDndStore, noteKey, useGroupMoves, useNoteMoves, type NoteHover } from "./note-dnd-state"

type PendingDrop =
    | { kind: "section", id: number, target: SectionTarget }
    | { kind: "group", id: number, index: number }
    | { kind: "task", id: number, target: TaskTarget }

/**
 * The droppable under the pointer wins, the smallest one first (a task row beats its section card, a section card
 * beats its group). Only droppables that accept the dragged kind take part.
 */
const collisionDetection: CollisionDetection = ({ active, droppableContainers, droppableRects, pointerCoordinates }) => {
    const kind = active.data.current?.kind as NoteDragKind | undefined
    if (!kind || !pointerCoordinates) return []
    const hits: Collision[] = []
    for (const container of droppableContainers) {
        const accepts = container.data.current?.accepts as NoteDragKind[] | undefined
        const rect = droppableRects.get(container.id)
        if (!accepts?.includes(kind) || !rect) continue
        const { x, y } = pointerCoordinates
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
        hits.push({ id: container.id, data: { droppableContainer: container, value: rect.width * rect.height } })
    }
    return hits.sort((a, b) => (a.data?.value as number) - (b.data?.value as number))
}

/**
 * With the live drag the rows are moved by a transform while the drag goes on: the places to hit are measured without it, or the
 * target would flip between the place and its shifted copy.
 */
const LIVE_MEASURING = { droppable: { measure: makeShiftFreeMeasure(element => getClientRect(element, { ignoreTransform: true }), shiftOf) } }

/** Longest wait for the optimistic update of a drop before the rows are put back anyway. */
const SETTLE_TIMEOUT = 500

/** The color of an item over the background of its preview, like its header (none: the preview keeps its own background). */
const tintOf = (color: string | null | undefined, alpha: number): CSSProperties | undefined => {
    const tint = color ? hexToRgba(alpha, color) : undefined
    return tint ? { backgroundImage: `linear-gradient(${tint}, ${tint})` } : undefined
}

const getPointer = (event: DragMoveEvent): { x: number, y: number } | null => {
    const origin = event.activatorEvent as { clientX?: number, clientY?: number } | null
    if (origin && typeof origin.clientX === "number" && typeof origin.clientY === "number")
        return { x: origin.clientX + event.delta.x, y: origin.clientY + event.delta.y }
    const translated = event.active.rect.current.translated
    return translated
        ? { x: translated.left + translated.width / 2, y: translated.top + translated.height / 2 }
        : null
}

/**
 * Drag & drop of groups, sections and tasks inside the open note (dnd-kit).
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
    const colorAlpha = useColorAlpha()
    const { moveSectionTo, moveTaskTo } = useNoteMoves()
    // What is being dragged and over what is in a store (see NoteDndStore): only the preview and the cursor depend on it here
    const [store] = useState(createNoteDndStore)
    const active = useSyncExternalStore(store.subscribe, () => store.getState().active)
    const { moveGroupTo } = useGroupMoves()
    const pendingRef = useRef<PendingDrop | null>(null)
    const lastMoveRef = useRef<{ key: string, tree: NoteDataTree } | null>(null)
    // Live drag of the tasks: the rows are moved with a transform (see note-dnd-shift), never through React state
    const liveDrag = usePreference(preferences => preferences.liveDrag) ?? true
    const liveRef = useRef<{ snapshot: LiveSnapshot, dragged: string } | null>(null)
    const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

    const accessibility = buildDndAccessibility(entry => {
        const ref = entry.data.current as { kind?: NoteOverKind, id?: number } | undefined
        if (!noteDataTree || !ref || typeof ref.id !== "number") return undefined
        if (ref.kind === "group") {
            const found = findGroup(noteDataTree, ref.id)
            return found ? getGroupLabel(found.group, found.index) : undefined
        }
        if (ref.kind === "section") return (s => s && getSectionLabel(s))(findSection(noteDataTree, ref.id))
        if (ref.kind === "task") return findTask(noteDataTree, ref.id)?.text
        return undefined
    }, { keyboard: false })

    const reset = () => {
        pendingRef.current = null
        lastMoveRef.current = null
        liveRef.current = null
        store.set({ active: null, hover: NO_HOVER })
    }

    /** Moves the rows to open the room of the pending drop of a task (nothing for the other cases: they keep the ring / the line). */
    const syncLive = (pending: PendingDrop | null, over?: NoteOverRef, zone?: DropZone) => {
        const live = liveRef.current
        if (!live) return
        const shifts = pending?.kind === "task" && over?.kind === "task"
            ? computeLiveShifts(live.snapshot, live.dragged, { over: noteKey("task", over.id), zone: zone ?? null, list: taskListKey(pending.target) })
            : null
        applyShifts(shifts ?? new Map(), shifts && shifts.size > 0 ? live.dragged : null)
    }

    const handleDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as NoteDragRef | undefined
        lastMoveRef.current = null
        // A task of a multi-selection moves alone: the selection is dropped so what is dragged is what moves
        if (data?.kind === "task" && selection && selection.getSelected().size >= 2 && selection.has(taskKey(data.id))) {
            selection.reset()
            announce(t("tasks.keyboard.dragSingle"))
        }
        // The layout at rest, before anything moves: the sizes the shifts are computed from
        liveRef.current = liveDrag && data?.kind === "task" ? { snapshot: readLiveSnapshot(), dragged: noteKey("task", data.id) } : null
        store.set({ active: data ? { kind: data.kind, id: data.id } : null })
    }

    const handleDragMove = (event: DragMoveEvent) => {
        const dragged = event.active.data.current as NoteDragRef | undefined
        const over = event.over
        if (!dragged || !over || !noteDataTree) {
            pendingRef.current = null
            lastMoveRef.current = null
            syncLive(null)
            store.set({ hover: NO_HOVER })
            return
        }

        const overData = over.data.current as NoteOverRef
        const overRef: NoteOverRef = { kind: overData.kind, id: overData.id }
        let zone: DropZone = "inside"
        if (dragged.kind === "group") {
            const pointer = getPointer(event)
            if (!pointer) return
            zone = computeGroupDropZone(over.rect, pointer.x)
        } else if (overRef.kind === "task" || overRef.kind === "section") {
            const pointerY = getPointer(event)?.y
            if (pointerY == null) return
            const overTask = overRef.kind === "task" ? findTask(noteDataTree, overRef.id) : undefined
            zone = computeDropZone(dragged.kind, overRef.kind, over.rect, pointerY, { hasSubtasks: (overTask?.subtasks.length ?? 0) > 0 })
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
        syncLive(pending, overRef, zone)

        const targetSectionId = pending?.kind === "task" ? pending.target.sectionId : null
        const next: NoteHover = pending ? { overKey: noteKey(overRef.kind, overRef.id), zone, targetSectionId } : NO_HOVER
        const prev = store.getState().hover
        if (prev.overKey !== next.overKey || prev.zone !== next.zone || prev.targetSectionId !== next.targetSectionId) store.set({ hover: next })
    }

    const handleDragEnd = async () => {
        const pending = pendingRef.current
        const shifted = hasShifts()
        reset()
        if (shifted && pending?.kind === "task") {
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
        reset()
        clearShifts(true)
    }

    // Over nothing valid (no droppable, or a no-op target such as a task under itself) the cursor says the drop does nothing
    const noTarget = useSyncExternalStore(store.subscribe, () => store.getState().hover.overKey === null)
    useGrabbingCursor(active !== null, noTarget)

    const preview = useMemo(() => {
        if (!active || !noteDataTree) return null
        if (active.kind === "group") {
            const found = findGroup(noteDataTree, active.id)
            return found ? (
                <div
                    className="min-w-[200px] max-w-[320px] truncate rounded-xs border bg-background p-2 text-sm font-semibold shadow-lg"
                    style={tintOf(found.group.color, colorAlpha.header())}
                >
                    {getGroupLabel(found.group, found.index)}
                </div>
            ) : null
        }
        if (active.kind === "section") {
            const section = findSection(noteDataTree, active.id)
            return section ? (
                <div
                    className="min-w-[250px] max-w-[320px] truncate rounded-xs border bg-accent p-2 text-sm shadow-lg"
                    style={tintOf(section.color, colorAlpha.header())}
                >
                    {getSectionLabel(section)}
                </div>
            ) : null
        }
        const task = findTask(noteDataTree, active.id)
        return task ? (
            <div
                className="max-w-[320px] truncate rounded-xs border bg-background p-2 text-sm shadow-lg border-l-4"
                style={task.color ? { borderLeftColor: task.color } : undefined}
            >
                {task.text}
            </div>
        ) : null
    }, [active, noteDataTree, colorAlpha])

    return (
        <NoteDndStoreContext.Provider value={store}>
            <DndContext
                sensors={sensors}
                accessibility={accessibility}
                collisionDetection={collisionDetection}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
                measuring={liveDrag ? LIVE_MEASURING : undefined}
            >
                {children}
                {createPortal(<DragOverlay dropAnimation={null}>{preview && <div className="rotate-2">{preview}</div>}</DragOverlay>, document.body)}
            </DndContext>
        </NoteDndStoreContext.Provider>
    )
}
