import type { Task } from "@/types/types"

/**
 * The tags the note is filtered by (a task passes with any of them: OR), or null when no filter is active.
 * Only a view, like "hide completed": the tree and every move index stay complete.
 */
export type TagFilter = readonly number[] | null

const hasAny = (ids: readonly number[] | undefined, filter: readonly number[]) => !!ids?.some(id => filter.includes(id))

/**
 * The filter that applies to the tasks of one list: null (every task is shown) when no filter is active or when the group or
 * the section that holds the list has one of the filter tags, otherwise the filter itself.
 * @category Note
 */
export const containerTagFilter = (filter: TagFilter, ...containerTags: (readonly number[] | undefined)[]): TagFilter =>
    !filter?.length || containerTags.some(ids => hasAny(ids, filter)) ? null : filter

/** The filter that applies to the subtasks of a task: a task that has a filter tag shows all its subtasks. */
export const subtaskTagFilter = (task: Task, filter: TagFilter): TagFilter =>
    filter && hasAny(task.tagIDs, filter) ? null : filter

/**
 * Whether a task stays in view under the filter: it has one of the tags, or something below it has (the ancestors of a tagged
 * subtask stay, so it keeps its place in the tree).
 * @category Note
 */
export const passesTagFilter = (task: Task, filter: TagFilter): boolean =>
    !filter || hasAny(task.tagIDs, filter) || (task.subtasks ?? []).some(subtask => passesTagFilter(subtask, filter))
