import type { Task } from "@/types/types"
// The rule only reads these two fields: it also applies to the tasks of a snapshot (template, export, Markdown)
type TaskLike = { completed: boolean, subtasks?: readonly TaskLike[] }
import type { TaskOrder } from "@/lib/task-order"
import { passesTagFilter, type TagFilter } from "./tag-filter"

/** Whether a task has at least one subtask, at any depth, that is not completed. */
export const hasOpenDescendant = (task: TaskLike): boolean =>
    (task.subtasks ?? []).some(subtask => !subtask.completed || hasOpenDescendant(subtask))

/**
 * The one rule of "hide completed tasks": a task is hidden when it is completed and nothing below it is still open.
 * A completed task with an open descendant stays visible (with its completed look), so the open work is not lost;
 * its own subtasks are then filtered by the same rule. Only a fully completed subtree disappears.
 * @category Note
 */
export const isHiddenTask = (task: TaskLike, hide: boolean): boolean =>
    hide && !!task.completed && !hasOpenDescendant(task)

/**
 * The tasks to render: with `hide` on, the ones for which `isHiddenTask` holds are left out.
 * The list is the same array when nothing is hidden. Only a view: the tree (and every move index) stays complete.
 * @category Note
 */
export const visibleTasks = (tasks: Task[], hide: boolean): Task[] =>
    hide ? tasks.filter(task => !isHiddenTask(task, true)) : tasks

/**
 * The tasks in the order they are drawn: `visibleTasks`, then (with `order` "open-first") the open tasks first and the
 * completed ones after them, or (with "done-first") the other way round, each block in its stored order. Only a view: the
 * stored order and every move index stay as they are. With a `tagFilter` the tasks that do not pass it are left out too. It is the same array when nothing changes, so a memoized list is
 * not invalidated.
 * @category Note
 */
export const orderedVisibleTasks = (tasks: Task[], { hideCompleted, order, tagFilter = null }: { hideCompleted: boolean, order: TaskOrder, tagFilter?: TagFilter }): Task[] => {
    const hidden = visibleTasks(tasks, hideCompleted)
    // The tag filter is one more reason to leave a task out (see passesTagFilter); the same array when nothing changes
    const filtered = tagFilter ? hidden.filter(task => passesTagFilter(task, tagFilter)) : hidden
    const visible = filtered.length === hidden.length ? hidden : filtered
    if (order === "manual") return visible
    const isFirstBlock = (task: Task) => order === "open-first" ? !task.completed : !!task.completed
    let seenSecond = false
    let sorted = true
    for (const task of visible) {
        if (!isFirstBlock(task)) seenSecond = true
        else if (seenSecond) { sorted = false; break }
    }
    return sorted ? visible : [...visible.filter(isFirstBlock), ...visible.filter(task => !isFirstBlock(task))]
}

const countAll = (tasks: Task[]): number =>
    tasks.reduce((sum, task) => sum + 1 + countAll(task.subtasks ?? []), 0)

/**
 * How many tasks `visibleTasks(…, true)` leaves out of a list, at any depth: a hidden task counts together with its
 * subtasks (all completed, since it is hidden), a visible one is looked into.
 * @category Note
 */
export const countHiddenCompleted = (tasks: Task[]): number =>
    tasks.reduce((sum, task) => sum + (isHiddenTask(task, true) ? 1 + countAll(task.subtasks ?? []) : countHiddenCompleted(task.subtasks ?? [])), 0)
