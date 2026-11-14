import type { MouseEvent } from "react"
import { handleSelectionClick } from "./selection"
import { useSelectionStore } from "./selection-context-object"
import type { TreeItemType } from "./tree-dnd"
import { treeRowKey, wasTreeJustDragged } from "./tree-row"

/**
 * Click and Enter of a tree row. Ctrl/Cmd+click and Shift+click only select; a plain click (and Enter) clears the selection
 * and runs `onPlain` (open the note, toggle the folder). The click that ends a drag is ignored.
 */
export const useTreeRowHandlers = (type: TreeItemType, id: number, onPlain: () => void) => {
    const store = useSelectionStore()
    const key = treeRowKey(type, id)
    const handleClick = (event: MouseEvent) => {
        if (wasTreeJustDragged()) return
        if (handleSelectionClick(store, key, event)) return
        onPlain()
    }
    const handleActivate = () => {
        store?.reset(key)
        onPlain()
    }
    return { handleClick, handleActivate }
}
