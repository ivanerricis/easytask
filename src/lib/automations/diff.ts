import type { Group, NoteDataTree, Task } from "@/types/types"
import type { TxStatement } from "@/db/transaction"
import { buildPositionUpdate } from "@/db/queries/ordering"
import { findGroup, findSection, findTask, moveGroupInList, moveTask, patchGroup, patchTask, removeGroup } from "@/contexts/note-tree-ops"
import { taskSections } from "@/lib/group-sections"
import { clampIndex } from "@/lib/number"

/** The persisted state of a task: where it is (`s<id>` = top level of a section, `t<id>` = under a task) and its flags. */
type TaskState = {
    container: string
    index: number
    sectionId: number | null
    completed: boolean
    priority: boolean
    color: string | null
    /** The ids of its tags, ascending. */
    tags: number[]
}

type Flat = { tasks: Map<number, TaskState>, containers: Map<string, number[]> }

function flatten(tree: NoteDataTree): Flat {
    const tasks = new Map<number, TaskState>()
    const containers = new Map<string, number[]>()
    const visit = (list: Task[], container: string, sectionId: number) => {
        containers.set(container, list.map(task => task.id))
        list.forEach((task, index) => {
            tasks.set(task.id, {
                container, index, sectionId,
                completed: !!task.completed, priority: !!task.priority, color: task.color ?? null,
                tags: [...(task.tagIDs ?? [])].sort((a, b) => a - b),
            })
            visit(task.subtasks, `t${task.id}`, sectionId)
        })
    }
    for (const group of tree.groups)
        for (const section of taskSections(group)) visit(section.tasks, `s${section.id}`, section.id)
    return { tasks, containers }
}

const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i])

/**
 * The statements that bring the tasks of the database from `before` to `after` (two versions of the same note):
 * - a task with a new parent gets it with its whole subtree (trashed descendants included, like moveDBTask);
 * - only the flags that changed are written (the edit timestamp trigger fires on the written columns);
 * - every task list whose order changed is renumbered.
 * Tasks present in only one of the trees are ignored.
 * @category Automations
 */
export function diffTaskStatements(before: NoteDataTree, after: NoteDataTree): TxStatement[] {
    const previous = flatten(before)
    const next = flatten(after)
    const statements: TxStatement[] = []

    for (const [id, state] of next.tasks) {
        const old = previous.tasks.get(id)
        if (!old) continue
        if (old.container !== state.container) {
            const parentTaskId = state.container.startsWith("t") ? Number(state.container.slice(1)) : null
            statements.push({
                sql: `WITH RECURSIVE subtree AS (
                    SELECT id FROM task WHERE taskID = ?
                    UNION
                    SELECT t.id FROM task t INNER JOIN subtree s ON t.taskID = s.id
                )
                UPDATE task SET
                    sectionID = ?,
                    taskID = CASE WHEN id = ? THEN ? ELSE taskID END
                WHERE id IN (SELECT id FROM subtree) OR id = ?`,
                params: [id, state.sectionId, id, parentTaskId, id],
            })
        }
        const sets: string[] = []
        const params: unknown[] = []
        if (old.completed !== state.completed) { sets.push("completed = ?"); params.push(state.completed ? 1 : 0) }
        if (old.priority !== state.priority) { sets.push("priority = ?"); params.push(state.priority ? 1 : 0) }
        if (old.color !== state.color) { sets.push("color = ?"); params.push(state.color) }
        if (sets.length > 0) statements.push({ sql: `UPDATE task SET ${sets.join(", ")} WHERE id = ?`, params: [...params, id] })
        for (const tagId of state.tags.filter(tag => !old.tags.includes(tag)))
            statements.push({ sql: "INSERT OR IGNORE INTO task_tag (taskID, tagID) SELECT ?, id FROM tag WHERE id = ?", params: [id, tagId] })
        for (const tagId of old.tags.filter(tag => !state.tags.includes(tag)))
            statements.push({ sql: "DELETE FROM task_tag WHERE taskID = ? AND tagID = ?", params: [id, tagId] })
    }

    for (const [container, ids] of next.containers) {
        const old = previous.containers.get(container)
        if (ids.length === 0 || (old && sameList(old, ids))) continue
        statements.push(buildPositionUpdate("task", ids))
    }
    return statements
}

/**
 * What an automation changed on a task: its place (parent or index) and/or some of its flags.
 * @category Automations
 */
export type TaskChange = { id: number, place: boolean, completed: boolean, priority: boolean, color: boolean, tags: boolean }

/**
 * What changed between two versions of a note on the given tasks (those an automation acted on); tasks missing from
 * a tree or left unchanged are omitted.
 * @category Automations
 */
export function taskChanges(before: NoteDataTree, after: NoteDataTree, ids: readonly number[]): TaskChange[] {
    const previous = flatten(before).tasks
    const next = flatten(after).tasks
    const changes: TaskChange[] = []
    for (const id of ids) {
        const old = previous.get(id)
        const state = next.get(id)
        if (!old || !state) continue
        const change = {
            id,
            place: old.container !== state.container || old.index !== state.index,
            completed: old.completed !== state.completed,
            priority: old.priority !== state.priority,
            color: old.color !== state.color,
            tags: old.tags.length !== state.tags.length || old.tags.some((tag, i) => tag !== state.tags[i]),
        }
        if (change.place || change.completed || change.priority || change.color || change.tags) changes.push(change)
    }
    return changes
}

/**
 * Gives some tasks of `current` what they have in `source` (used to undo/redo an automation on the latest note, which
 * may have changed since): only the parts in `changes`, so a later edit of another field is kept. A task, or a
 * destination, that is no longer in `current` is skipped.
 * @category Automations
 */
export function restoreTasks(current: NoteDataTree, source: NoteDataTree, changes: readonly TaskChange[]): NoteDataTree {
    const located = changes
        .map(change => ({ change, found: findTask(source, change.id) }))
        .filter((item): item is { change: TaskChange, found: NonNullable<ReturnType<typeof findTask>> } => item.found !== undefined)
        // Lower indexes first, so that an insertion does not shift a place restored before it
        .sort((a, b) => a.found.index - b.found.index)

    let tree = current
    for (const { change, found: { task, parent, index } } of located) {
        if (!findTask(tree, task.id)) continue
        if (change.place) {
            if ("sectionId" in parent) {
                if (findSection(tree, parent.sectionId)) tree = moveTask(tree, task.id, { sectionId: parent.sectionId, parentTaskId: null }, index)
            } else {
                const parentTask = findTask(tree, parent.parentTaskId)
                const sectionId = parentTask?.task.sectionID
                if (parentTask && sectionId != null) tree = moveTask(tree, task.id, { sectionId, parentTaskId: parent.parentTaskId }, index)
            }
        }
        const patch: Partial<Task> = {}
        if (change.completed) patch.completed = !!task.completed
        if (change.priority) patch.priority = !!task.priority
        if (change.color) patch.color = task.color ?? null
        if (change.tags) patch.tagIDs = task.tagIDs ?? []
        if (Object.keys(patch).length > 0) tree = patchTask(tree, task.id, patch)
    }
    return tree
}

const byPosition = (tree: NoteDataTree) => [...tree.groups].sort((a, b) => a.position - b.position)

/** The ids of the groups of a tree in note order. */
const groupOrder = (tree: NoteDataTree) => byPosition(tree).map(group => group.id)

/**
 * The statements that bring the groups of the database from `before` to `after` (two versions of the same note):
 * - a changed color is written;
 * - when the order of the groups present in both changed, they are renumbered;
 * - a group only in `before` has been archived by an automation, a group only in `after` is restored from the archive
 *   (the undo of that).
 * @category Automations
 */
export function diffGroupStatements(before: NoteDataTree, after: NoteDataTree): TxStatement[] {
    const previous = new Map(before.groups.map(group => [group.id, group]))
    const next = new Map(after.groups.map(group => [group.id, group]))
    const statements: TxStatement[] = []

    for (const id of previous.keys())
        if (!next.has(id)) statements.push({
            sql: "UPDATE section_group SET archived_at = datetime('now','localtime') WHERE id = ? AND archived_at IS NULL AND deleted_at IS NULL",
            params: [id],
        })

    for (const [id, group] of next) {
        const old = previous.get(id)
        if (!old) statements.push({ sql: "UPDATE section_group SET archived_at = NULL WHERE id = ?", params: [id] })
        else if ((old.color ?? null) !== (group.color ?? null)) statements.push({ sql: "UPDATE section_group SET color = ? WHERE id = ?", params: [group.color ?? null, id] })
    }

    const shared = groupOrder(after).filter(id => previous.has(id))
    if (!sameList(groupOrder(before).filter(id => next.has(id)), shared) && shared.length > 0)
        statements.push(buildPositionUpdate("section_group", shared))
    return statements
}

/**
 * The statements that write the colors of the sections that changed between two versions of the same note (sections in
 * both trees only).
 * @category Automations
 */
export function diffSectionStatements(before: NoteDataTree, after: NoteDataTree): TxStatement[] {
    const previous = new Map(before.groups.flatMap(taskSections).map(section => [section.id, section]))
    const statements: TxStatement[] = []
    for (const section of after.groups.flatMap(taskSections)) {
        const old = previous.get(section.id)
        if (old && (old.color ?? null) !== (section.color ?? null))
            statements.push({ sql: "UPDATE section SET color = ? WHERE id = ?", params: [section.color ?? null, section.id] })
    }
    return statements
}

/**
 * What an automation changed on a group: its place among the groups, its color, or whether it was archived (present in
 * only one of the two trees).
 * @category Automations
 */
export type GroupChange = { id: number, place: boolean, color: boolean, archived: boolean }

/**
 * What changed between two versions of a note on the given groups (those an automation acted on); groups missing from
 * both trees or left unchanged are omitted.
 * @category Automations
 */
export function groupChanges(before: NoteDataTree, after: NoteDataTree, ids: readonly number[]): GroupChange[] {
    const previous = new Map(before.groups.map(group => [group.id, group]))
    const next = new Map(after.groups.map(group => [group.id, group]))
    // The place is compared among the groups present in both versions, so an archived group does not shift the others
    const oldOrder = groupOrder(before).filter(id => next.has(id))
    const newOrder = groupOrder(after).filter(id => previous.has(id))
    const changes: GroupChange[] = []
    for (const id of ids) {
        const old = previous.get(id)
        const group = next.get(id)
        if (!old && !group) continue
        const both = !!old && !!group
        const change: GroupChange = {
            id,
            archived: !both,
            place: both && oldOrder.indexOf(id) !== newOrder.indexOf(id),
            color: both && (old.color ?? null) !== (group.color ?? null),
        }
        if (change.archived || change.place || change.color) changes.push(change)
    }
    return changes
}

/**
 * The tree plus the groups of `extra` it does not have (appended): lets the task diff see the tasks of a group that an
 * automation archived, whose last state is not in the tree any more.
 * @category Automations
 */
export function withGroups(tree: NoteDataTree, extra: readonly Group[]): NoteDataTree {
    const missing = extra.filter(group => !tree.groups.some(item => item.id === group.id))
    return missing.length === 0 ? tree : { groups: [...tree.groups, ...missing] }
}

/** Puts a group at `index` among the groups of the tree (by position), renumbering the positions from 0. */
function placeGroup(tree: NoteDataTree, group: Group, index: number): NoteDataTree {
    const groups = byPosition(tree)
    groups.splice(clampIndex(index, groups.length), 0, group)
    return { groups: groups.map((item, position) => ({ ...item, position })) }
}

/**
 * Gives some groups of `current` what they have in `source` (used to undo/redo an automation on the latest note, which
 * may have changed since): only the parts in `changes`. A group archived in `current` is brought back with its sections
 * and tasks as they are in `source`, one that is archived in `source` is removed.
 * @category Automations
 */
export function restoreGroups(current: NoteDataTree, source: NoteDataTree, changes: readonly GroupChange[]): NoteDataTree {
    const sourceOrder = groupOrder(source)
    // Lower indexes first, so that an insertion does not shift a place restored before it
    const ordered = [...changes].sort((a, b) => sourceOrder.indexOf(a.id) - sourceOrder.indexOf(b.id))

    let tree = current
    for (const change of ordered) {
        const wanted = findGroup(source, change.id)
        const present = findGroup(tree, change.id)
        if (change.archived) {
            if (wanted && !present) {
                // Index among the groups that exist now
                const index = sourceOrder.slice(0, sourceOrder.indexOf(change.id)).filter(id => !!findGroup(tree, id)).length
                tree = placeGroup(tree, wanted.group, index)
            } else if (!wanted && present) {
                tree = removeGroup(tree, change.id)
            }
            continue
        }
        if (!wanted || !present) continue
        if (change.color) tree = patchGroup(tree, change.id, { color: wanted.group.color ?? null })
        if (change.place) {
            const index = sourceOrder.slice(0, sourceOrder.indexOf(change.id)).filter(id => !!findGroup(tree, id)).length
            tree = { groups: moveGroupInList(tree.groups, change.id, index) ?? tree.groups }
        }
    }
    return tree
}
