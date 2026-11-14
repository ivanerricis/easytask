import { createContext, useContext, useSyncExternalStore } from "react"
import { selectionKey, type SelectionStore } from "./selection"
import type { TreeItemType } from "./tree-dnd"

export const SelectionContext = createContext<SelectionStore | null>(null)

/** The selection store (null outside a SelectionProvider: rows then behave as without selection). */
export const useSelectionStore = () => useContext(SelectionContext)

const NEVER = () => () => {}

/** Whether an item is selected; only the rows whose state changes re-render. */
export function useIsSelected(type: TreeItemType, id: number): boolean {
    const store = useSelectionStore()
    const key = selectionKey(type, id)
    return useSyncExternalStore(store?.subscribe ?? NEVER, () => store?.has(key) ?? false)
}

/** Whether an item is selected together with at least another one: its menu then acts on the whole selection. */
export function useIsInMultiSelection(type: TreeItemType, id: number): boolean {
    const store = useSelectionStore()
    const key = selectionKey(type, id)
    return useSyncExternalStore(store?.subscribe ?? NEVER, () => !!store && store.has(key) && store.getSelected().size >= 2)
}

const EMPTY: ReadonlySet<string> = new Set()

/** The selected keys (a new set on every change). */
export function useSelectedKeys(): ReadonlySet<string> {
    const store = useSelectionStore()
    return useSyncExternalStore(store?.subscribe ?? NEVER, () => store?.getSelected() ?? EMPTY)
}
