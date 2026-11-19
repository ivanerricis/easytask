import type { Group, NoteDataTree, Task } from "@/types/types"
import { buildDefaultSection, findGroup, findSection, findTask, insertGroup, insertSection, insertTask, removeGroup, removeSection, removeTask, type TaskParent } from "./note-tree-ops"

/**
 * Pure operations of the moves between the two notes of the split view, on the cached trees of both notes (the optimistic update).
 * Every one takes the tree the item leaves (`from`) and the tree that receives it (`to`) and returns both new trees, or null when the
 * move cannot be applied (the item or the destination is not in the cache). When both are the same note (`same`), the item is taken out
 * and put back in one tree and `to` is the tree it is returned as.
 * @category ActiveNote Context
 */

export type TreePair = { from: NoteDataTree, to: NoteDataTree }

/** The groups renumbered in the order they are in (the database keeps `position` as the index among the groups). */
const renumbered = (tree: NoteDataTree): NoteDataTree => ({ groups: tree.groups.map((group, position) => group.position === position ? group : { ...group, position }) })

/** The task and its subtasks with the section of the destination (the whole subtree carries the section of its root). */
function retarget(task: Task, sectionId: number, parentTaskId: number | null): Task {
    return { ...task, sectionID: sectionId, taskID: parentTaskId, subtasks: task.subtasks.map(subtask => retarget(subtask, sectionId, task.id)) }
}

/** Moves a task (with its subtasks) to a section or under a task of the other tree, at `index` among the new siblings. */
export function moveTaskAcross(
    from: NoteDataTree, to: NoteDataTree, taskId: number, target: { sectionId: number, parentTaskId: number | null }, index: number, same = false,
): TreePair | null {
    const found = findTask(from, taskId)
    if (!found) return null
    const parent: TaskParent = target.parentTaskId !== null ? { parentTaskId: target.parentTaskId } : { sectionId: target.sectionId }
    const left = removeTask(from, taskId)
    const base = same ? left : to
    const next = insertTask(base, parent, retarget(found.task, target.sectionId, target.parentTaskId), index)
    return next === base ? null : { from: same ? next : left, to: next }
}

/** Moves a section (with its tasks) to a group of the other tree, at `index` among the sections of the group (see insertSection). */
export function moveSectionAcross(
    from: NoteDataTree, to: NoteDataTree, sectionId: number, groupId: number, index: number, beforeList = false, same = false,
): TreePair | null {
    const found = findSection(from, sectionId)
    if (!found || found.index < 0) return null
    const left = removeSection(from, sectionId)
    const base = same ? left : to
    const next = insertSection(base, groupId, { ...found.section, groupID: groupId }, index, beforeList)
    return next === base ? null : { from: same ? next : left, to: next }
}

/**
 * Moves a section into a new group the database just created (`groupId`, with its default section `defaultSectionId`) at `index`
 * among the groups of the other tree.
 */
export function moveSectionToNewGroupAcross(
    from: NoteDataTree, to: NoteDataTree, sectionId: number, noteId: number, groupId: number, defaultSectionId: number, index: number, same = false,
): TreePair | null {
    const found = findSection(from, sectionId)
    if (!found || found.index < 0 || !Number.isInteger(groupId) || !Number.isInteger(defaultSectionId)) return null
    const left = removeSection(from, sectionId)
    const base = same ? left : to
    const group: Group = { id: groupId, noteID: noteId, position: index, name: null, sections: [], defaultSection: buildDefaultSection(defaultSectionId, groupId), defaultIndex: 0 }
    const withGroup = renumbered(insertGroup(base, group, index))
    const next = insertSection(withGroup, groupId, { ...found.section, groupID: groupId }, 0)
    return next === withGroup ? null : { from: same ? next : left, to: next }
}

/** Moves a group (with its sections and tasks) to the other tree, at `index` among its groups; both lists are renumbered. */
export function moveGroupAcross(from: NoteDataTree, to: NoteDataTree, groupId: number, noteId: number, index: number, same = false): TreePair | null {
    const found = findGroup(from, groupId)
    if (!found) return null
    const left = renumbered(removeGroup(from, groupId))
    const groups = [...(same ? left : to).groups].sort((a, b) => a.position - b.position)
    groups.splice(Math.max(0, Math.min(Math.trunc(index) || 0, groups.length)), 0, { ...found.group, noteID: noteId })
    const next = renumbered({ groups })
    return { from: same ? next : left, to: next }
}

