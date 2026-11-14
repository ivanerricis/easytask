import { useEffect, type RefObject } from "react"
import { findTreeItem, type TreeData } from "./tree-dnd"
import { parseSelectionKey } from "./selection"
import { useSelectionStore } from "./selection-context-object"
import { whenRowMounted } from "./row-mounted"
import type { FlatRow } from "./flat-tree"
import type { VirtualTreeHandle } from "./VirtualTree"

type UseTreeRevealOptions = {
    /** An item to show: its row is selected, scrolled into view and focused once it is in the tree. */
    reveal: { key: string, seq: number } | null
    /** Called when the reveal is done (or cannot be done), so the request can be dropped. */
    onRevealed?: () => void
    tree: TreeData
    flatRows: FlatRow[]
    virtualized: boolean
    rootElRef: RefObject<HTMLDivElement | null>
    virtualRef: RefObject<VirtualTreeHandle | null>
}

/**
 * Serves the reveal requests: selects the row of the item, scrolls to it (a virtualized row has to be scrolled to first) and
 * focuses it once it is mounted. Must run after the selection was synced with the rows in view: the key has to be among them.
 */
export const useTreeReveal = ({ reveal, onRevealed, tree, flatRows, virtualized, rootElRef, virtualRef }: UseTreeRevealOptions) => {
    const store = useSelectionStore()
    useEffect(() => {
        if (!reveal) return
        const target = parseSelectionKey(reveal.key)
        if (!target || !findTreeItem(tree, target)) {
            onRevealed?.()
            return
        }
        if (!flatRows.some(row => row.key === reveal.key)) return
        store?.reset()
        store?.toggle(reveal.key)
        if (virtualized) virtualRef.current?.scrollToKey(reveal.key)
        // The row may mount a frame or more later; the focus waits one more frame (the overlay sidebar sets its own focus first)
        let focusFrame = 0
        const cancel = whenRowMounted(rootElRef.current, reveal.key, row => {
            row.scrollIntoView({ block: "nearest" })
            focusFrame = requestAnimationFrame(() => {
                row.focus({ preventScroll: true })
                onRevealed?.()
            })
        }, { onTimeout: onRevealed })
        return () => {
            cancel()
            cancelAnimationFrame(focusFrame)
        }
    }, [reveal, flatRows, virtualized, tree, store, onRevealed, rootElRef, virtualRef])
}
