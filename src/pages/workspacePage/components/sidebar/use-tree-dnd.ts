import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
    type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { buildDndAccessibility } from "@/lib/dnd-accessibility"
import { setGrabCursorNotAllowed, useGrabbingCursor } from "@/hooks/use-grabbing-cursor"
import { useWorkspace } from "@/contexts/use-workspace"
import {
    computeDropTarget, computeDropZone, findTreeItem,
    type DropTarget, type DropZone, type TreeData, type TreeRef,
} from "./tree-dnd"
import { NO_TREE_HOVER, createTreeHoverStore, markTreeDragEnd, treeRowKey, type TreeHover } from "./tree-row"
import { selectionKey } from "./selection"
import { useSelectionStore } from "./selection-context"
import { useSelectionActions } from "./selection-actions"
import { useMoveTreeItem } from "./use-move-tree-item"
import { useTreeLive } from "./use-tree-live"
import { holdTreeZone } from "./tree-dnd-live"
import { isInRowGap } from "../note-dnd-live"
import type { FlatRow } from "./flat-tree"
import type { PlannedMove } from "./tree-multi-move"

/** Id of the droppable of the empty root area. */
export const ROOT_DROP_ID = "root"
const AUTO_EXPAND_DELAY = 600

// Rows win over the root area; the closest-center fallback is only for the keyboard (no pointer).
export const collisionDetection: CollisionDetection = (args) => {
    let hits = pointerWithin(args)
    if (!hits.length && !args.pointerCoordinates) hits = closestCenter(args)
    const rows = hits.filter(hit => hit.id !== ROOT_DROP_ID)
    return rows.length ? rows : hits
}

const getPointerY = (event: DragMoveEvent): number | null => {
    const origin = event.activatorEvent as { clientY?: number } | null
    if (origin && typeof origin.clientY === "number") return origin.clientY + event.delta.y
    const translated = event.active.rect.current.translated
    return translated ? translated.top + translated.height / 2 : null
}

type UseTreeDndOptions = {
    tree: TreeData
    /** The visible rows, in the order they are drawn (the live drag works out the room of the rows from it). */
    rows: FlatRow[]
    collapsedIds: Set<number>
    onExpandFolder: (folderId: number) => void
}

/**
 * Drag & drop of the tree: the sensors, the spoken texts, the handlers of the drag (the zone and the target being hovered, the
 * plan of a move of the whole selection) and the auto expand of a collapsed folder that is hovered for a while.
 */
export const useTreeDnd = ({ tree, rows, collapsedIds, onExpandFolder }: UseTreeDndOptions) => {
    const { currentWorkspace } = useWorkspace()
    const moveItem = useMoveTreeItem()
    // What is hovered lives in a store: each row reads only its own drop zone (see TreeHover)
    const [hoverStore] = useState(createTreeHoverStore)
    const [activeRef, setActiveRef] = useState<TreeRef | null>(null)
    useGrabbingCursor(activeRef !== null)
    const targetRef = useRef<DropTarget | null>(null)
    // Dragging a selected row drags the whole selection: the plan of the move being hovered (null = no valid target)
    const store = useSelectionStore()
    const selectionActions = useSelectionActions()
    const [multiCount, setMultiCount] = useState(0)
    const multiPlanRef = useRef<PlannedMove[] | null>(null)
    // The items a multi drag moves, computed once at drag start (not on every pointer move)
    const multiTargetsRef = useRef<TreeRef[]>([])
    // What the last pointer move resolved to: while it stays the same nothing needs recomputing
    const lastMoveRef = useRef<{ tree: object, active: string, over: string | null, zone: DropZone } | null>(null)
    // Live drag: the rows step aside (see use-tree-live). What the rows show now: the row, its zone and its rect (the pointer in the
    // few px between two rows keeps the place of the row left behind)
    const live = useTreeLive(rows, tree)
    const liveShownRef = useRef<{ over: string | null, zone: DropZone, rect: { top: number, bottom: number } | null } | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    )

    const workspaceName = currentWorkspace?.name
    const accessibility = useMemo(() => buildDndAccessibility(entry => {
        if (entry.id === ROOT_DROP_ID) return workspaceName
        const ref = entry.data.current as TreeRef | undefined
        return ref ? findTreeItem(tree, ref)?.name : undefined
    }, { keyboard: true }), [tree, workspaceName])

    const reset = useCallback(() => {
        targetRef.current = null
        multiPlanRef.current = null
        multiTargetsRef.current = []
        lastMoveRef.current = null
        liveShownRef.current = null
        setMultiCount(0)
        setActiveRef(null)
        hoverStore.set(NO_TREE_HOVER)
    }, [hoverStore])

    const onDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as TreeRef | undefined
        setActiveRef(data ?? null)
        const dragsSelection = !!data && !!store && !!selectionActions && store.has(selectionKey(data.type, data.id)) && store.getSelected().size >= 2
        const targets = dragsSelection ? selectionActions.getTargets() : []
        multiTargetsRef.current = targets.map(item => ({ type: item.itemType, id: item.id }))
        lastMoveRef.current = null
        liveShownRef.current = null
        setMultiCount(targets.length)
        if (data) live.start(data, { keyboard: (event.activatorEvent as Event | null)?.type === "keydown", selection: targets.length > 0 })
    }

    const onDragMove = (event: DragMoveEvent) => {
        const active = event.active.data.current as TreeRef | undefined
        const over = event.over
        if (!active || !over) {
            targetRef.current = null
            multiPlanRef.current = null
            lastMoveRef.current = null
            if (liveShownRef.current) live.show(null, "inside", false)
            liveShownRef.current = null
            hoverStore.set(NO_TREE_HOVER)
            setGrabCursorNotAllowed(true)
            return
        }

        const pointerY = getPointerY(event)
        // The few px between two rows belong to the empty area of the root: the rows (and the drop) keep the place of the row left behind
        const shown = liveShownRef.current
        if (live.active() && over.id === ROOT_DROP_ID && shown?.rect && pointerY != null && isInRowGap(shown.rect, pointerY)) return

        let overRef: TreeRef | null = null
        let zone: DropZone = "inside"
        if (over.id !== ROOT_DROP_ID) {
            overRef = over.data.current as TreeRef
            if (pointerY == null) return
            const overItem = findTreeItem(tree, overRef)
            const expandedWithChildren = overRef.type === "folder" && !collapsedIds.has(overRef.id) &&
                !!overItem && "subfolders" in overItem && (overItem.subfolders.length + overItem.notes.length) > 0
            zone = computeDropZone(overRef.type, over.rect, pointerY, { expandedWithChildren })
            // The rows follow the zone with a small hysteresis; the drop uses the same zone, so what is shown is what is dropped
            if (live.active()) {
                const previous = shown?.over === treeRowKey(overRef.type, overRef.id) ? shown.zone : null
                zone = holdTreeZone(overRef.type, previous, zone, over.rect, pointerY)
            }
        }

        // Same row, zone and tree as the last move: the target and the plan would come out the same
        const last = lastMoveRef.current
        const activeKey = treeRowKey(active.type, active.id)
        const overKey = overRef ? treeRowKey(overRef.type, overRef.id) : null
        if (last && last.tree === tree && last.active === activeKey && last.over === overKey && last.zone === zone) return
        lastMoveRef.current = { tree, active: activeKey, over: overKey, zone }

        // Invalid or no-op targets (e.g. a folder into its own descendant) show no indicator
        const plan = multiCount > 0 && selectionActions ? selectionActions.planDrop(overRef, zone, multiTargetsRef.current) : null
        multiPlanRef.current = plan
        const target = multiCount > 0 ? null : computeDropTarget(tree, active, overRef, zone)
        targetRef.current = target
        const valid = multiCount > 0 ? !!plan : !!target
        // Over nothing the item can be dropped on (no row, or a no-op target such as a folder into itself) the cursor says so
        setGrabCursorNotAllowed(!valid)
        // With the live drag the rows open the room: the line (before / after) and the ring of the first place are not drawn, the root is not tinted
        const shifted = live.active() && live.show(target, zone, overRef !== null)
        if (live.active()) liveShownRef.current = { over: overKey, zone, rect: overRef ? { top: over.rect.top, bottom: over.rect.bottom } : null }
        const next: TreeHover = {
            overKey: overRef && valid ? treeRowKey(overRef.type, overRef.id) : null,
            zone: valid && !shifted ? zone : null,
            rootActive: !overRef && valid && !shifted,
        }
        const prev = hoverStore.getState()
        if (prev.overKey !== next.overKey || prev.zone !== next.zone || prev.rootActive !== next.rootActive) hoverStore.set(next)
    }

    const onDragEnd = async (event: DragEndEvent) => {
        markTreeDragEnd()
        const active = event.active.data.current as TreeRef | undefined
        const target = targetRef.current
        const plan = multiPlanRef.current
        reset()
        live.finish(!!active && !!event.over && (!!target || !!plan))
        if (active && event.over && plan && selectionActions) {
            await selectionActions.executeMove(plan)
            const folderId = plan[0].to.folderId
            if (folderId != null) onExpandFolder(folderId)
            return
        }
        if (!active || !event.over || !target) return
        await moveItem(active.type, active.id, target, () => {
            if (target.folderId != null) onExpandFolder(target.folderId)
        })
    }

    const onDragCancel = () => {
        markTreeDragEnd()
        reset()
        live.finish(false)
    }

    // Open a collapsed folder after hovering it for a while during a drag
    // (listening to the store, not to its state: the tree does not re-render each time the pointer changes row)
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined
        let hovered: number | null = null
        const check = () => {
            const key = hoverStore.getState().overKey
            const folderId = key?.startsWith("folder-") ? Number(key.slice("folder-".length)) : null
            if (folderId === hovered) return
            hovered = folderId
            clearTimeout(timer)
            if (folderId != null && collapsedIds.has(folderId)) timer = setTimeout(() => onExpandFolder(folderId), AUTO_EXPAND_DELAY)
        }
        check()
        const unsubscribe = hoverStore.subscribe(check)
        return () => { unsubscribe(); clearTimeout(timer) }
    }, [hoverStore, collapsedIds, onExpandFolder])

    return {
        hoverStore, activeRef, multiCount,
        dndProps: { sensors, accessibility, collisionDetection, measuring: live.measuring, onDragStart, onDragMove, onDragEnd, onDragCancel },
    }
}
