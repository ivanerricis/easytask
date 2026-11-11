import { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
    type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers"
import { useTranslation } from "react-i18next"
import { PaneTabsContext } from "@/contexts/layout-context-object"
import type { PaneIndex } from "@/contexts/layout-reducer"
import { useLayoutActions } from "@/contexts/use-layout"
import { useTabs, useTabsActions } from "@/contexts/use-tabs"
import { buildDndAccessibility } from "@/lib/dnd-accessibility"
import { setGrabCursorNotAllowed, useGrabbingCursor } from "@/hooks/use-grabbing-cursor"
import { announce } from "../tasks/note-announcer-store"
import {
    barDndId, computeTabZone, parseBarDndId, parseTabDndId, pickBarByPoint, pickTabByX, resolveTabDrop,
    type TabHover,
} from "./tab-reorder"
import { TabsDndContext, type TabsDndContextType } from "./tabs-dnd-context-object"

type Dragging = { pane: PaneIndex, noteId: number }

/**
 * First the bar under the pointer (both axes), then inside it the tab under the pointer's x (the first / last one past either end,
 * so a tab can be dropped at either end of a bar), else the bar itself (an empty bar).
 */
const collisionDetection: CollisionDetection = ({ droppableContainers, droppableRects, pointerCoordinates }) => {
    if (!pointerCoordinates) return []
    const { x, y } = pointerCoordinates
    const bars: { id: PaneIndex, left: number, right: number, top: number, bottom: number }[] = []
    const tabs: { id: string, pane: PaneIndex, left: number, right: number }[] = []
    for (const container of droppableContainers) {
        const rect = droppableRects.get(container.id)
        if (!rect) continue
        const barPane = parseBarDndId(container.id)
        if (barPane !== null) bars.push({ id: barPane, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })
        const tab = parseTabDndId(container.id)
        if (tab) tabs.push({ id: String(container.id), pane: tab.pane, left: rect.left, right: rect.right })
    }
    const pane = pickBarByPoint(bars, x, y)
    if (pane === null) return []
    const id = pickTabByX(tabs.filter(tab => tab.pane === pane), x)
    return [{ id: id ?? barDndId(pane) }]
}

/**
 * One bar (workspace not split): only the horizontal position matters, the tab under the pointer's x wins, whatever the y.
 * Past either end of the bar the first / last tab wins, so a tab can be dropped at the very start or end.
 */
const singleCollisionDetection: CollisionDetection = ({ droppableContainers, droppableRects, pointerCoordinates }) => {
    if (!pointerCoordinates) return []
    const tabs = droppableContainers.flatMap(container => {
        const rect = droppableRects.get(container.id)
        return rect && typeof container.id === "number" ? [{ id: container.id, left: rect.left, right: rect.right }] : []
    })
    const id = pickTabByX(tabs, pointerCoordinates.x)
    return id === null ? [] : [{ id }]
}

/**
 * The drag and drop context of the tab bars of the workspace. Split (default): ONE context shared by the two bars, a tab can be reordered
 * inside its bar or dropped on the other one, which moves the note to that pane at the drop position; the layout mounts it around BOTH panes.
 * Not split (`split` false): the same context for the single bar, where tabs can only be reordered, along the horizontal axis, without overlay.
 * It stays mounted when the workspace is split or unsplit, so the panes under it keep their identity.
 * @category Panes
 */
export function TabsDndProvider({ children, split = true }: { children: ReactNode, split?: boolean }) {
    const { t } = useTranslation()
    const paneTabs = useContext(PaneTabsContext)
    const { tabs: ownTabs } = useTabs()
    const { reorderTabs } = useTabsActions()
    const { moveToPane } = useLayoutActions()
    const [hover, setHover] = useState<TabHover | null>(null)
    const hoverRef = useRef<TabHover | null>(null)
    const [dragging, setDragging] = useState<Dragging | null>(null)
    useGrabbingCursor(dragging !== null)

    // A small distance keeps plain clicks (open / close tab) working
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

    const paneLabel = useCallback((pane: PaneIndex) => t(pane === 0 ? "notes.split.leftPane" : "notes.split.rightPane"), [t])
    // Not split: the tabs of the only bar, whose draggables are the plain note ids
    const noteName = useCallback((pane: PaneIndex, noteId: number) =>
        (split ? paneTabs?.[pane].tabs.tabs : ownTabs)?.find(note => note.id === noteId)?.name, [split, paneTabs, ownTabs])
    const parseId = (id: string | number) => split ? parseTabDndId(id) : { pane: 0 as PaneIndex, noteId: Number(id) }

    const accessibility = buildDndAccessibility(entry => {
        const tab = parseId(entry.id)
        if (tab) return noteName(tab.pane, tab.noteId)
        const bar = parseBarDndId(entry.id)
        return bar === null ? undefined : paneLabel(bar)
    }, { keyboard: false })

    const updateHover = (next: TabHover | null) => {
        hoverRef.current = next
        setHover(prev => prev?.pane === next?.pane && prev?.overId === next?.overId && prev?.zone === next?.zone ? prev : next)
    }

    const handleDragStart = (event: DragStartEvent) => setDragging(parseId(event.active.id))

    const handleDragMove = (event: DragMoveEvent) => {
        const { over, active, activatorEvent, delta } = event
        // Outside every bar there is nothing to drop the tab on: the cursor says so (over its own tab it is a reorder that changes nothing)
        setGrabCursorNotAllowed(!over)
        const origin = activatorEvent as { clientX?: number } | null
        if (!over || over.id === active.id || typeof origin?.clientX !== "number") return updateHover(null)
        const tab = parseId(over.id)
        if (tab) return updateHover({ pane: tab.pane, overId: tab.noteId, zone: computeTabZone(over.rect, origin.clientX + delta.x) })
        const bar = split ? parseBarDndId(over.id) : null
        updateHover(bar === null ? null : { pane: bar, overId: null, zone: "after" })
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const from = parseId(event.active.id)
        const current = hoverRef.current
        setDragging(null)
        updateHover(null)
        if (!from || (split && !paneTabs)) return
        const idsByPane = split && paneTabs
            ? [paneTabs[0].tabs.tabs.map(n => n.id), paneTabs[1].tabs.tabs.map(n => n.id)] as const
            : [ownTabs.map(n => n.id), []] as const
        const drop = resolveTabDrop(idsByPane, from.pane, from.noteId, current)
        if (!drop) return
        if (drop.kind === "reorder") return split && paneTabs ? paneTabs[drop.pane].actions.reorderTabs(drop.from, drop.to) : reorderTabs(drop.from, drop.to)
        moveToPane(drop.noteId, drop.toPane, drop.index)
        const name = noteName(drop.fromPane, drop.noteId)
        if (name) announce(t("dnd.tabMovedToPane", { name, pane: paneLabel(drop.toPane) }))
    }

    const handleDragCancel = () => {
        setDragging(null)
        updateHover(null)
    }

    // `dragging` stays local (it only feeds the overlay): the bars re-render on a hover change, not on drag start / end
    const value = useMemo<TabsDndContextType>(() => ({ hover, split }), [hover, split])
    const draggedNote = split && dragging ? paneTabs?.[dragging.pane].tabs.tabs.find(note => note.id === dragging.noteId) : undefined

    return (
        <TabsDndContext.Provider value={value}>
            <DndContext
                sensors={sensors}
                accessibility={accessibility}
                modifiers={split ? undefined : [restrictToHorizontalAxis]}
                collisionDetection={split ? collisionDetection : singleCollisionDetection}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                {children}
                {/* The tab follows the pointer outside the bar (which scrolls and clips its tabs) */}
                {split && <DragOverlay dropAnimation={null}>
                    {draggedNote && (
                        <div
                            data-testid="tab-drag-overlay"
                            className="relative flex min-h-[42px] min-w-28 max-w-60 items-center border border-primary bg-background px-2 text-sm font-medium shadow-md"
                        >
                            {draggedNote.color && <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: draggedNote.color }} />}
                            <span className="block truncate">{draggedNote.name}</span>
                        </div>
                    )}
                </DragOverlay>}
            </DndContext>
        </TabsDndContext.Provider>
    )
}
