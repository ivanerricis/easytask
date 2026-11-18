import { useEffect, useState, type ReactNode } from "react"
import { useActiveNote } from "@/contexts/use-active-note"
import { usePaneFocusGetter } from "@/contexts/use-layout"
import { useActiveNoteId, useTabUiStore } from "@/contexts/use-tabs"
import { usePreferences } from "@/contexts/use-preferences"
import { collapsedIds } from "@/lib/collapsed"
import { createSelectionStore, type SelectionStore } from "../sidebar/selection"
import { flattenVisibleTasks, taskKey } from "./task-selection"
import { TaskSelectionContext } from "./use-task-selection"
import { clearsTaskSelection } from "./task-selection-clear"

/** True when the focus is somewhere Esc has its own meaning (a field, a dialog, a menu). */
const escapeIsTaken = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog'], [role='menu']")

/**
 * Tells the store which tasks are in view (in drawing order), so a range selection follows the screen and a task that is
 * deleted, archived, hidden (completed) or inside a closed group/section/task leaves the selection.
 */
function TaskSelectionSync({ store }: { store: SelectionStore }) {
    const { noteDataTree } = useActiveNote()
    const noteId = useActiveNoteId()
    const uiStore = useTabUiStore()
    const { hideCompletedTasks, completedTasksLast } = usePreferences()

    useEffect(() => {
        const sync = () => {
            if (!noteDataTree || noteId === null) return store.sync([])
            // Open = not saved as closed, or opened by the search just to show a match
            const closed = collapsedIds(noteDataTree)
            const tasks = flattenVisibleTasks(noteDataTree, {
                hideCompleted: hideCompletedTasks,
                completedLast: completedTasksLast,
                isGroupOpen: groupId => !closed.groups.has(groupId) || uiStore.isRevealed(noteId, "group", groupId),
                isSectionOpen: sectionId => !closed.sections.has(sectionId) || uiStore.isRevealed(noteId, "section", sectionId),
                isTaskOpen: taskId => !closed.tasks.has(taskId) || uiStore.isRevealed(noteId, "task", taskId),
            })
            store.sync(tasks.map(task => taskKey(task.id)))
        }
        sync()
        return uiStore.subscribe(sync)
    }, [store, noteDataTree, noteId, uiStore, hideCompletedTasks, completedTasksLast])

    return null
}

/**
 * Holds the multi-selection of the tasks of the open note (Ctrl/Cmd+click toggles, Shift+click selects a range, Esc or a left click outside the tasks clears).
 * The selection belongs to the active note (it is cleared when another note becomes active) and Esc leaves it alone when
 * another handler already used the key, the pane has not the focus or the focus is in a field/dialog/menu.
 */
export function TaskSelectionProvider({ children }: { children: ReactNode }) {
    const noteId = useActiveNoteId()
    const [store] = useState(createSelectionStore)
    const isFocused = usePaneFocusGetter()

    useEffect(() => { store.reset() }, [store, noteId])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented || !isFocused() || store.getSelected().size === 0) return
            if (escapeIsTaken(event.target)) return
            store.reset()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [store, isFocused])

    // A left click anywhere outside the tasks clears the selection (capture: nothing under the click can stop it)
    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (store.getSelected().size > 0 && clearsTaskSelection(event)) store.reset()
        }
        document.addEventListener("pointerdown", onPointerDown, true)
        return () => document.removeEventListener("pointerdown", onPointerDown, true)
    }, [store])

    return (
        <TaskSelectionContext.Provider value={store}>
            <TaskSelectionSync store={store} />
            {children}
        </TaskSelectionContext.Provider>
    )
}
