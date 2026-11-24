import i18n from "@/i18n"
import { groupsByPosition, isDefaultSection, taskSections } from "@/lib/group-sections"
import type { NoteDataTree, Section, Task } from "@/types/types"
import { getGroupLabel } from "../groups/group-label"
import { getSectionLabel } from "../section/section-label"
import { orderedVisibleTasks } from "../section/hide-completed"
import { containerTagFilter, subtaskTagFilter, type TagFilter } from "../section/tag-filter"
import { effectiveTaskOrder, type TaskOrder } from "@/lib/task-order"

/** Selection key of a task in the store of the task multi-selection ("task-12"). */
export const taskKey = (id: number) => `task-${id}`

/** The task a selection key stands for (null when the key is malformed). */
export function parseTaskKey(key: string): number | null {
    const match = /^task-(\d+)$/.exec(key)
    return match ? Number(match[1]) : null
}

type FlattenOptions = {
    hideCompleted: boolean
    /** The preference "completed tasks last": the order of the sections that have no choice of their own (see effectiveTaskOrder). */
    completedLast?: boolean
    /** The tag filter of the note: the tasks it leaves out are not in view. */
    tagFilter?: TagFilter
    isGroupOpen: (groupId: number) => boolean
    isSectionOpen: (sectionId: number) => boolean
    /** Whether the subtasks of a task are shown (default: always). */
    isTaskOpen?: (taskId: number) => boolean
}

/**
 * The tasks of the note in the order they are drawn: groups by position (closed groups leave out their tasks), in each
 * group its sections in their order, the list of the tasks put directly in the group being one of them (wherever it was placed), the closed sections leaving out their tasks; every task is followed by its subtasks (depth first), unless the task is closed.
 * Completed tasks are left out when they are hidden (see orderedVisibleTasks), and are drawn after (or before) the open ones of their list according to the order of its section. It is the order of the range selection.
 * @category Note
 */
export function flattenVisibleTasks(tree: NoteDataTree, { hideCompleted, completedLast = false, tagFilter = null, isGroupOpen, isSectionOpen, isTaskOpen }: FlattenOptions): Task[] {
    const result: Task[] = []
    const visit = (list: Task[], order: TaskOrder, filter: TagFilter) => {
        for (const task of orderedVisibleTasks(list, { hideCompleted, order, tagFilter: filter })) {
            result.push(task)
            // The subtasks of a closed task are hidden: they cannot be part of a range selection
            if (!isTaskOpen || isTaskOpen(task.id)) visit(task.subtasks ?? [], order, subtaskTagFilter(task, filter))
        }
    }
    for (const group of groupsByPosition(tree.groups)) {
        if (!isGroupOpen(group.id)) continue
        for (const section of taskSections(group)) {
            // The default section has no header to close: it is open as long as the group is
            if (group.defaultSection?.id !== section.id && !isSectionOpen(section.id)) continue
            visit(section.tasks ?? [], effectiveTaskOrder(section.task_order, completedLast), containerTagFilter(tagFilter, group.tagIDs, section.tagIDs))
        }
    }
    return result
}

/** Where a task sits: its section and its parent task (null for a top level task). */
type TaskInfo = { task: Task, sectionId: number, parentId: number | null }

/** Every task of the note (also the hidden ones, those of closed groups and those directly in a group) in tree order. */
function listAllTasks(tree: NoteDataTree): TaskInfo[] {
    const result: TaskInfo[] = []
    const visit = (list: Task[], sectionId: number, parentId: number | null) => {
        for (const task of list) {
            result.push({ task, sectionId, parentId })
            visit(task.subtasks ?? [], sectionId, task.id)
        }
    }
    for (const group of groupsByPosition(tree.groups))
        for (const section of taskSections(group)) visit(section.tasks ?? [], section.id, null)
    return result
}

/**
 * The selected tasks to act on: a selected task stands for its subtasks too, so a selected task that has a selected
 * ancestor is dropped (it would be processed twice). Tree order.
 * @category Note
 */
export function getTopMostTasks(tree: NoteDataTree, ids: Iterable<number>): Task[] {
    const wanted = new Set(ids)
    const parents = new Map<number, number | null>()
    const all = listAllTasks(tree)
    for (const { task, parentId } of all) parents.set(task.id, parentId)
    const hasSelectedAncestor = (id: number) => {
        for (let parent = parents.get(id) ?? null; parent !== null; parent = parents.get(parent) ?? null)
            if (wanted.has(parent)) return true
        return false
    }
    return all.filter(({ task }) => wanted.has(task.id) && !hasSelectedAncestor(task.id)).map(({ task }) => task)
}

/** The selected tasks that still exist in the note, in tree order (the subtasks of a selected task included when selected). */
export function getSelectedTasks(tree: NoteDataTree, ids: Iterable<number>): Task[] {
    const wanted = new Set(ids)
    return listAllTasks(tree).filter(({ task }) => wanted.has(task.id)).map(({ task }) => task)
}

type TaskDestination = {
    key: string
    sectionId: number
    label: string
    /** Label of the group the destination belongs to. */
    groupLabel: string
}

/**
 * Where the "Sposta in…" menu of a multi-selection can put the tasks (as last top level tasks): every section of the
 * note and, for each group that has one, the area of the tasks put directly in the group, in the order of the group.
 * @category Note
 */
export function getTaskDestinations(tree: NoteDataTree): TaskDestination[] {
    const result: TaskDestination[] = []
    groupsByPosition(tree.groups).forEach((group, index) => {
        const groupLabel = getGroupLabel(group, index)
        const add = (section: Section, direct: boolean) => result.push({
            key: `section-${section.id}`,
            sectionId: section.id,
            label: direct ? i18n.t("tasks.selection.directTasks") : getSectionLabel(section),
            groupLabel,
        })
        // The list of the direct tasks sits where the user placed it among the sections
        for (const section of taskSections(group)) add(section, isDefaultSection(section))
    })
    return result
}
