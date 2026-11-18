/** A visible row of a task list, already flattened (open subtasks included, in the visible order). */
export type TaskKeyRow = {
    key: string
    level: number
    parentKey: string | null
    hasChildren: boolean
    expanded: boolean
}

export type TaskKeyEvent = { key: string, altKey: boolean, shiftKey: boolean, ctrlKey: boolean, metaKey: boolean }

/** What a key does on a task row. For the focus actions `key` is the row to focus; for expand / collapse it is the current row. */
type TaskKeyAction =
    | { type: "focus", key: string }
    | { type: "expand", key: string }
    | { type: "collapse", key: string }
    | { type: "focusFirstChild", key: string }
    | { type: "focusParent", key: string }
    | { type: "extend", key: string }
    | { type: "toggleSelect" }
    | { type: "toggle" }
    | { type: "rename" }
    | { type: "menu" }
    | { type: "delete" }
    | { type: "copy" }
    | { type: "paste" }
    | { type: "move", step: -1 | 1 }

/**
 * Keyboard of a task list (same model as the tree of the sidebar), within one list only:
 * Up / Down / Home / End move between the rows, Right opens a closed task with subtasks (on an open one it goes to its
 * first subtask), Left closes an open one (otherwise it goes to the parent), Space toggles, Enter renames,
 * Shift+F10 or the menu key open the menu, Shift+Up / Down / Home / End extend the selection to that row (`key`),
 * Ctrl/Cmd+Space toggles the selection of the row, Alt+Up / Alt+Down move the task one step, Delete trashes the task (or the
 * selection), Ctrl/Cmd+C copies it and Ctrl/Cmd+V pastes the copied tasks below it.
 * Returns null for any other key or modifier; a handled key that cannot move (Down on the last row) focuses the same row.
 */
export function taskKeyAction(rows: TaskKeyRow[], currentKey: string, event: TaskKeyEvent): TaskKeyAction | null {
    const index = rows.findIndex(row => row.key === currentKey)
    if (index < 0) return null
    const current = rows[index]
    const focus = (target: TaskKeyRow | undefined): TaskKeyAction => ({ type: "focus", key: (target ?? current).key })

    if (event.ctrlKey || event.metaKey) {
        if (event.shiftKey || event.altKey) return null
        if (event.key === " ") return { type: "toggleSelect" }
        const letter = event.key.toLowerCase()
        return letter === "c" ? { type: "copy" } : letter === "v" ? { type: "paste" } : null
    }

    if (event.altKey) {
        if (event.shiftKey) return null
        if (event.key === "ArrowUp") return { type: "move", step: -1 }
        if (event.key === "ArrowDown") return { type: "move", step: 1 }
        return null
    }
    if (event.shiftKey) {
        const extend = (target: TaskKeyRow | undefined): TaskKeyAction => ({ type: "extend", key: (target ?? current).key })
        switch (event.key) {
            case "F10": return { type: "menu" }
            case "ArrowDown": return extend(rows[index + 1])
            case "ArrowUp": return extend(rows[index - 1])
            case "Home": return extend(rows[0])
            case "End": return extend(rows[rows.length - 1])
            default: return null
        }
    }

    switch (event.key) {
        case "ArrowDown": return focus(rows[index + 1])
        case "ArrowUp": return focus(rows[index - 1])
        case "Home": return focus(rows[0])
        case "End": return focus(rows[rows.length - 1])
        case "ArrowRight": {
            if (!current.hasChildren) return focus(current)
            if (!current.expanded) return { type: "expand", key: current.key }
            const next = rows[index + 1]
            return next && next.parentKey === current.key ? { type: "focusFirstChild", key: next.key } : focus(current)
        }
        case "ArrowLeft": {
            if (current.hasChildren && current.expanded) return { type: "collapse", key: current.key }
            const parent = current.parentKey === null ? undefined : rows.find(row => row.key === current.parentKey)
            return parent ? { type: "focusParent", key: parent.key } : focus(current)
        }
        case " ": return { type: "toggle" }
        case "Enter": return { type: "rename" }
        case "ContextMenu": return { type: "menu" }
        case "Delete": return { type: "delete" }
        default: return null
    }
}
