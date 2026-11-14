import { useEffect, useState, type ReactNode } from "react"
import { useWorkspace } from "@/contexts/use-workspace"
import { createSelectionStore } from "./selection"
import { SelectionContext } from "./selection-context-object"

/** True when the focus is somewhere Esc has its own meaning (a field, a dialog, a menu). */
const escapeIsTaken = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog'], [role='menu']")

/**
 * Holds the multi-selection of the sidebar tree. The selection belongs to one workspace (it is cleared when the
 * workspace changes) and Esc clears it, unless another handler already used the key or the focus is in a field/dialog.
 */
export function SelectionProvider({ children }: { children: ReactNode }) {
    const { currentWorkspace } = useWorkspace()
    const [store] = useState(createSelectionStore)
    const workspaceId = currentWorkspace?.id ?? null

    useEffect(() => { store.reset() }, [store, workspaceId])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented || store.getSelected().size === 0) return
            if (escapeIsTaken(event.target)) return
            store.reset()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [store])

    return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>
}

