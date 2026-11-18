import type { NoteDataTree } from "@/types/types"
import { findGroup, indexTree, type TaskTarget } from "./note-dnd"
import { directIndexOf } from "@/lib/group-sections"
import { isHiddenTask, orderedVisibleTasks } from "./section/hide-completed"
import { effectiveTaskOrder } from "@/lib/task-order"

/** One step of the "Sposta su / giù" menu items: towards the start (-1) or the end (+1) of the siblings. */
export type Step = -1 | 1

/**
 * Index to move `id` to for one step among `siblings` (the semantics of the move actions: the final index among the
 * siblings once the item has been moved). The item jumps over the nearest sibling that is shown in that direction, so
 * hidden siblings (completed tasks while they are hidden) are skipped instead of making the step look like a no-op.
 * Null when there is nothing to jump over (first or last).
 */
function stepIndex<T extends { id: number }>(siblings: T[], id: number, step: Step, isShown: (item: T) => boolean): number | null {
    const from = siblings.findIndex(item => item.id === id)
    if (from < 0) return null
    for (let index = from + step; index >= 0 && index < siblings.length; index += step) {
        // The siblings before the item keep their index once it is removed; the ones after it shift down by one,
        // so "after sibling `index`" is `index` again
        if (isShown(siblings[index])) return index
    }
    return null
}

/**
 * Destination of a task (or subtask) moved one step among its siblings, null when it is already first/last.
 * A step never crosses a section: the first/last task of a section (the direct tasks of a group included) has no step
 * further, the "Sposta in…" menu moves it to another section or to the direct area of a group.
 * @param hideCompleted Siblings hidden by the "hide completed" rule (isHiddenTask) are not on screen, so they are jumped over.
 * @param completedLast The preference "completed tasks last", the order of a section with no choice of its own. With a sorted order (that
 *   preference or the choice of the section) a step goes to the neighbour in the displayed order
 *   and never crosses from the open block to the completed one (or back). The stored order only changes between the two tasks.
 * @category Note DnD
 */
export function getTaskStep(tree: NoteDataTree, taskId: number, step: Step, hideCompleted: boolean, completedLast = false): TaskTarget | null {
    const { tasks, sections } = indexTree(tree)
    const info = tasks.get(taskId)
    if (!info) return null
    const siblings = info.parentId === null
        ? sections.get(info.sectionId)?.section.tasks ?? []
        : tasks.get(info.parentId)?.task.subtasks ?? []
    const order = effectiveTaskOrder(sections.get(info.sectionId)?.section.task_order, completedLast)
    if (order !== "manual") {
        const displayed = orderedVisibleTasks(siblings, { hideCompleted, order })
        const neighbour = displayed[displayed.findIndex(task => task.id === taskId) + step]
        const task = displayed.find(candidate => candidate.id === taskId)
        // The neighbour is in the other block, or there is none: at the edge
        if (!task || !neighbour || !!neighbour.completed !== !!task.completed) return null
        return { sectionId: info.sectionId, parentTaskId: info.parentId, index: siblings.indexOf(neighbour) }
    }
    const index = stepIndex(siblings, taskId, step, task => !isHiddenTask(task, hideCompleted))
    return index === null ? null : { sectionId: info.sectionId, parentTaskId: info.parentId, index }
}

/**
 * One step of a section among the rows of its group, where the list of the direct tasks is one of the rows:
 * - "group": the section moves to `index` among the sections (`moveSectionTo`); `beforeList` is set when the list sits exactly
 *   there (right after the section it jumps over): the move would land after the list too, so it asks to stay before it;
 * - "direct": the section jumps over the list, which is the same as moving the list the other way (`moveDirectSectionTo`).
 * @category Note DnD
 */
export type SectionStepTarget =
    | { type: "group", groupId: number, index: number, beforeList?: true }
    | { type: "direct", groupId: number, index: number }

/**
 * Destination of a section moved one step among the rows of its group (the sections and the list of the direct tasks),
 * null when it is already first/last.
 * @category Note DnD
 */
export function getSectionStep(tree: NoteDataTree, sectionId: number, step: Step): SectionStepTarget | null {
    const { sections } = indexTree(tree)
    const info = sections.get(sectionId)
    if (!info) return null
    const group = tree.groups.find(candidate => candidate.id === info.groupId)
    const siblings = group?.sections ?? []
    const from = siblings.findIndex(section => section.id === sectionId)
    if (group?.defaultSection && from >= 0) {
        const list = directIndexOf(group)
        // The list is the nearest row in that direction: the section jumps over it, i.e. the list goes the other way
        if (step < 0 && list === from) return { type: "direct", groupId: group.id, index: from + 1 }
        if (step > 0 && list === from + 1) return { type: "direct", groupId: group.id, index: from }
    }
    const index = stepIndex(siblings, sectionId, step, () => true)
    if (index === null) return null
    // The place after the section it jumps over is also after the list when the list follows that section: stay before the list
    const beforeList = step > 0 && !!group?.defaultSection && directIndexOf(group) === index + 1
    return { type: "group", groupId: info.groupId, index, ...(beforeList ? { beforeList: true as const } : {}) }
}

/**
 * Index the list of the direct tasks of a group is moved to for one step (before / after the nearest section), null when it
 * already is first/last. The index counts the sections before the list (`moveDirectSectionTo`).
 * @category Note DnD
 */
export function getDirectStep(tree: NoteDataTree, groupId: number, step: Step): number | null {
    const group = findGroup(tree, groupId)?.group
    if (!group?.defaultSection) return null
    const next = directIndexOf(group) + step
    return next < 0 || next > group.sections.length ? null : next
}
/** Index a group is moved to for one step among the groups (sorted by position), null when it is already first/last. */
export function getGroupStep(tree: NoteDataTree, groupId: number, step: Step): number | null {
    if (!findGroup(tree, groupId)) return null
    const sorted = [...tree.groups].sort((a, b) => a.position - b.position)
    return stepIndex(sorted, groupId, step, () => true)
}
