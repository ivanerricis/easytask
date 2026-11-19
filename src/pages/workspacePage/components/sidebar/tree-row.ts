import { createContext, useCallback, useContext, type FocusEvent } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { createExternalStore, useStoreSelector, type ExternalStore } from "@/lib/external-store"
import type { DropZone, TreeItemType } from "./tree-dnd"

export const treeRowKey = (type: TreeItemType, id: number) => `${type}-${id}`

// A click is fired on the source row when a drag is released over it; ignore it.
let lastDragEnd = 0
export const markTreeDragEnd = () => { lastDragEnd = Date.now() }
export const wasTreeJustDragged = () => Date.now() - lastDragEnd < 150

/**
 * What is hovered while a row of the tree is dragged: the key of the row under the pointer (null when the drop would be
 * invalid or a no-op), the drop zone inside it, and whether the empty root area is the target.
 */
export type TreeHover = { overKey: string | null, zone: DropZone | null, rootActive: boolean }
export const NO_TREE_HOVER: TreeHover = { overKey: null, zone: null, rootActive: false }

/**
 * The hover is kept in a store, not in React state: each row reads only its own drop zone, so moving the pointer over
 * another row does not re-render every row of the tree.
 */
export type TreeHoverStore = ExternalStore<TreeHover>
export const createTreeHoverStore = (): TreeHoverStore => createExternalStore(NO_TREE_HOVER)

/** Without a provider (a row rendered alone) nothing is hovered. */
const idleHover = createTreeHoverStore()
export const TreeHoverStoreContext = createContext<TreeHoverStore>(idleHover)

/** The drop zone highlighted on a row (null when the row is not the target). */
export function useTreeDropZone(type: TreeItemType, id: number): DropZone | null {
    const key = treeRowKey(type, id)
    return useStoreSelector(useContext(TreeHoverStoreContext), hover => hover.overKey === key ? hover.zone : null)
}

/** Whether the empty root area is the target of the drag. */
export function useTreeRootActive(): boolean {
    return useStoreSelector(useContext(TreeHoverStoreContext), hover => hover.rootActive)
}

/**
 * Roving tabindex: the key of the one row that is in the tab order (the last one that had the focus), the others are reached
 * with the arrows. In a store, so that moving the focus re-renders only the two rows concerned.
 */
export type TreeTabStopStore = ExternalStore<string | null>
export const createTreeTabStopStore = (): TreeTabStopStore => createExternalStore<string | null>(null)

/** Without a provider (a row rendered alone) the row is its own tab stop. */
const noTabStopStore = createTreeTabStopStore()
export const TreeTabStopContext = createContext<TreeTabStopStore | null>(null)

/** Whether the row is the tab stop of the tree. */
export function useIsTreeTabStop(type: TreeItemType, id: number): boolean {
    const store = useContext(TreeTabStopContext)
    const key = treeRowKey(type, id)
    return useStoreSelector(store ?? noTabStopStore, current => store ? current === key : true)
}

/** Makes a row both draggable and droppable, sharing the same DOM node. */
export function useTreeRow(type: TreeItemType, id: number) {
    const key = treeRowKey(type, id)
    const data = { type, id }
    const { setNodeRef: setDragRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({ id: key, data })
    const { setNodeRef: setDropRef } = useDroppable({ id: key, data })

    const ref = useCallback((node: HTMLElement | null) => {
        setDragRef(node)
        setActivatorNodeRef(node)
        setDropRef(node)
    }, [setDragRef, setActivatorNodeRef, setDropRef])

    return { ref, attributes, listeners, isDragging }
}

export const isInsideZone = (zone: DropZone | null) => zone === "inside" || zone === "inside-start"

/** Stops row drag activation from events coming from the row's menu (also from its portal). */
export const stopDragActivation = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
}

/**
 * Keydown for a draggable tree row: Enter runs `onActivate`; every other key (Space starts a keyboard drag)
 * still reaches the dnd-kit listeners.
 */
export function treeRowKeyDown(
    listeners: Record<string, unknown> | undefined,
    onActivate: () => void,
) {
    const dndKeyDown = listeners?.onKeyDown as ((e: React.KeyboardEvent) => void) | undefined
    return (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
            e.preventDefault()
            onActivate()
            return
        }
        dndKeyDown?.(e)
    }
}

/**
 * `onFocus` of the `TooltipTrigger` of a row: only a keyboard focus opens the tooltip. A menu of the row gives the focus back
 * to it when it closes, also after a click elsewhere, and the tooltip would open again with the pointer far from the row.
 */
export const openOnKeyboardFocus = (event: FocusEvent<HTMLElement>) => {
    // preventDefault skips the handler of the trigger, which opens the tooltip
    if (!(event.target as HTMLElement).matches(":focus-visible")) event.preventDefault()
}
