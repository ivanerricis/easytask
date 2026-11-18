import { useCallback, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import type { Step } from "../note-steps"
import { readTaskRows, siblingPosition } from "./task-key-rows"
import { taskKeyAction } from "./task-keyboard"
import { useTaskTree } from "./task-tree-context"
import { useTaskSelectionActions, useTaskSelectionStore } from "./use-task-selection"
import { taskKey } from "./task-selection"
import { focusKeepingDetails } from "./task-focus-intent"
import { announce } from "./note-announcer-store"

type RowKeysOptions = {
    taskId: number
    /** Text of the task, for the announcement of Ctrl+Space. */
    taskText: string
    subtasksOpen: boolean
    onToggleSubtasks: () => void
    /** Space: completes / reopens the task. */
    onToggleCompleted: () => void
    /** Enter: starts the inline rename. */
    onRename: () => void
}

/** A row by task id, looked up in the given list (the arrows never leave it) or, by default, in the whole document. */
const rowOf = (id: number | string, scope: ParentNode = document) => scope.querySelector<HTMLElement>(`[role='treeitem'][data-task-id="${id}"]`)

/**
 * Focuses a row that may not be drawn yet (a moved task is drawn again in its new place) and tells where it ended up.
 * The whole document is searched: the task can land in another list (section) than the one it came from.
 */
function focusMoved(taskId: number, announceMoved: (position: number, total: number) => void, triesLeft = 20) {
    const row = rowOf(taskId)
    const tree = row?.closest("[role='tree']")
    if (!row || !tree) {
        if (triesLeft > 0) requestAnimationFrame(() => focusMoved(taskId, announceMoved, triesLeft - 1))
        return
    }
    // Moving a node in the DOM can drop its focus
    row.focus()
    const place = siblingPosition(readTaskRows(tree), String(taskId))
    if (place) announceMoved(place.position, place.total)
}

/** After a task left the list, the focus goes to the row that took its place (when it is still there and nothing else has the focus). */
function focusAfterRemoval(neighborId: string | undefined) {
    if (!neighborId) return
    const active = document.activeElement
    if (active && active !== document.body) return
    const row = rowOf(neighborId)
    if (row) focusKeepingDetails(row)
}

/**
 * Keydown of a task row (only when the focus is on the row itself, not on a field, button or menu inside it): the arrows
 * move between the rows of the list, Left / Right close / open the subtasks, Space completes, Enter renames, Shift+F10 or
 * the menu key open the menu, Alt+Up / Alt+Down move the task one step, Shift+arrows / Home / End extend the multi-selection
 * and Ctrl+Space adds or removes the task (neither changes the task shown in the details). Delete moves the task (or the selection
 * it is part of) to the trash with no confirmation, Ctrl+C copies it and Ctrl+V pastes the copied tasks below it.
 */
export function useTaskRowKeys({ taskId, taskText, subtasksOpen, onToggleSubtasks, onToggleCompleted, onRename }: RowKeysOptions) {
    const tree = useTaskTree()
    const selection = useTaskSelectionStore()
    const actions = useTaskSelectionActions()
    const { t } = useTranslation()

    return useCallback((event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return
        const row = event.currentTarget
        const list = row.closest("[role='tree']")
        if (!list) return
        const action = taskKeyAction(readTaskRows(list), String(taskId), event)
        if (!action) return
        event.preventDefault()

        switch (action.type) {
            case "focus":
            case "focusFirstChild":
            case "focusParent":
                rowOf(action.key, list)?.focus()
                break
            case "extend": {
                // Without a selection store (no multi-selection) it is a plain arrow
                if (!selection) {
                    rowOf(action.key, list)?.focus()
                    break
                }
                selection.extend(taskKey(taskId), taskKey(Number(action.key)))
                focusKeepingDetails(rowOf(action.key, list))
                break
            }
            case "toggleSelect": {
                if (!selection) break
                const key = taskKey(taskId)
                selection.toggle(key)
                // From 2 tasks up the count of the selection bar is announced
                const left = selection.getSelected().size
                if (left <= 1) announce(t(selection.has(key) ? "tasks.keyboard.selected" : "tasks.keyboard.deselected", { text: taskText }))
                break
            }
            case "expand":
                if (!subtasksOpen) onToggleSubtasks()
                break
            case "collapse":
                if (subtasksOpen) onToggleSubtasks()
                break
            case "toggle":
                onToggleCompleted()
                break
            case "rename":
                onRename()
                break
            case "delete": {
                if (!actions) break
                // The row that takes the focus: the next one outside the subtasks of this task, else the previous one
                const rows = readTaskRows(list)
                const at = rows.findIndex(candidate => candidate.key === String(taskId))
                const next = rows.slice(at + 1).find(candidate => candidate.level <= rows[at].level)
                const neighbor = (next ?? rows[at - 1])?.key
                void actions.deleteNow({ itemType: "task", id: taskId, name: taskText }).then(() => focusAfterRemoval(neighbor))
                break
            }
            case "copy":
                void actions?.copy({ itemType: "task", id: taskId, name: taskText })
                break
            case "paste":
                void actions?.paste(taskId)
                break
            case "menu": {
                // The menu opens where a right click would: at the start of the row
                const box = row.getBoundingClientRect()
                row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: box.left + 16, clientY: box.top + box.height / 2 }))
                break
            }
            case "move": {
                const step: Step = action.step
                void (async () => {
                    // A failed write is reported (and rolled back) by the move itself
                    const moved = tree ? await tree.move(taskId, step).catch(() => null) : false
                    if (moved === null) return
                    if (moved && tree) focusMoved(taskId, tree.announceMoved)
                    else tree?.announceCannotMove()
                })()
                break
            }
        }
    }, [taskId, taskText, selection, actions, t, subtasksOpen, onToggleSubtasks, onToggleCompleted, onRename, tree])
}
