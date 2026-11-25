import i18n from "@/i18n"
import type { Task } from "@/types/types"
import type { TemplateTask } from "@/types/template"
import { createError, handleDBError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { getDB } from "../dbManager"
import { Transaction } from "../transaction"
import { assertSameWorkspace, moveDBSection, moveDBSectionToNewGroup, moveDBTask, type TaskMoveTarget } from "./move"
import { addPositions, clampIndex, groupOrderRows, insertAmongSections, siblingIds } from "./ordering"
import { addNoteContent, addSections, addTaskTree, buildContentFromRows, createSectionSnapshotter } from "./template"
import { uniqueCopyName } from "./duplicate"
import { getDBNoteData } from "./note"
import { loadSectionTags } from "./tag"
import { loadTaskFiles } from "./task-file"
import { DEFAULT_SECTION_SQL } from "./sql"

/**
 * Moves and copies between the two notes of the split view. A move keeps the ids (and so tags, trashed descendants, audio and
 * media files, which are tied to the row and not to the note); a copy writes new rows. Both notes must belong to the same workspace.
 * Nothing here reloads the notes: the caller updates them.
 * @category Database Queries
 */

/** Moves a task (with its subtasks) to a section of another note: see {@link moveDBTask}. */
export const moveDBTaskToNote = (taskId: number, target: TaskMoveTarget, targetIndex: number) =>
    moveDBTask(taskId, target, targetIndex, { acrossNotes: true })

/** Moves a section (with its tasks) to a group of another note: see {@link moveDBSection}. */
export const moveDBSectionToNote = (sectionId: number, targetGroupId: number, targetIndex: number, options: { beforeList?: boolean } = {}) =>
    moveDBSection(sectionId, targetGroupId, targetIndex, { ...options, acrossNotes: true })

/** Moves a section into a brand new group of another note, at `groupPosition` among its groups: see {@link moveDBSectionToNewGroup}. */
export const moveDBSectionToNewGroupOfNote = (sectionId: number, noteId: number, groupPosition: number) =>
    moveDBSectionToNewGroup(sectionId, groupPosition, { noteId })

/**
 * Moves a group, with its sections, tasks, subtasks, tags, audio and media files, to another note at `index` among the visible
 * (not archived) groups of that note. Both notes are renumbered (one UPDATE each) in one transaction.
 * @param groupId The group (neither deleted nor archived).
 * @param targetNoteId The note that receives it (not deleted, same workspace; the note of the group itself is allowed and is a reorder).
 * @param index Place among the groups of the target note (0 based, clamped).
 * @throws GROUP_MOVE_INVALID when the group or the note is not valid.
 * @category Database Queries
 */
export async function moveDBGroupToNote(groupId: number, targetNoteId: number, index: number): Promise<void> {
    try {
        const db = await getDB()
        const rows = await db.select<{ id: number, noteID: number }[]>(
            'SELECT id, noteID FROM section_group WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL', [groupId])
        if (!rows[0]) throw createError("GROUP_MOVE_INVALID", i18n.t("errors.move.groupMissing"))
        const sourceNoteId = rows[0].noteID
        await assertSameWorkspace(db, sourceNoteId, targetNoteId, "GROUP_MOVE_INVALID")

        const order = await groupsOf(db, targetNoteId, groupId, index)
        const tx = new Transaction()
        addPositions(tx, "section_group", order, { column: "noteID", value: targetNoteId })
        if (sourceNoteId !== targetNoteId) addPositions(tx, "section_group", (await groupsOf(db, sourceNoteId, groupId)).map(group => group.id))
        await tx.run()
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "GROUP"))
    }
}

/** The ids of the live groups of a note without `excludeId`, in order; with `insert` the id goes in at that index among the visible ones. */
async function groupsOf(db: Awaited<ReturnType<typeof getDB>>, noteId: number, excludeId: number): Promise<{ id: number }[]>
async function groupsOf(db: Awaited<ReturnType<typeof getDB>>, noteId: number, excludeId: number, insert: number): Promise<number[]>
async function groupsOf(db: Awaited<ReturnType<typeof getDB>>, noteId: number, excludeId: number, insert?: number): Promise<{ id: number }[] | number[]> {
    const groups = await db.select<{ id: number, archived_at: string | null }[]>(
        'SELECT id, archived_at FROM section_group WHERE noteID = ? AND deleted_at IS NULL AND id <> ? ORDER BY position, id', [noteId, excludeId])
    if (insert === undefined) return groups
    const ids = groups.map(group => group.id)
    // Only the groups the note shows count for the index (an archived one keeps its place)
    const visible = groups.filter(group => group.archived_at === null)
    const at = clampIndex(insert, visible.length)
    ids.splice(at < visible.length ? ids.indexOf(visible[at].id) : ids.length, 0, excludeId)
    return ids
}

/** The destination of a copy of a task: a section (top level) or a parent task of that section. */
type CopyTaskTarget = TaskMoveTarget

/**
 * Inserts copies of tasks (with their subtasks and tags, by name) in a section or under a task, at `index` among the siblings, in
 * ONE transaction. The destination can be in any note (the tags are looked up in the workspace of the destination).
 * @param tasks Snapshots of the tasks (see snapshotTasks), in order.
 * @param target The section, and the parent task unless it is a top level task.
 * @param index Place among the siblings (0 based, clamped).
 * @returns The ids of the new top level tasks, in order.
 * @throws TASK_MOVE_INVALID when the section or the parent task does not exist.
 * @category Database Queries
 */
export async function copyDBTasksToNote(tasks: readonly TemplateTask[], target: CopyTaskTarget, index: number): Promise<number[]> {
    if (tasks.length === 0) return []
    try {
        const db = await getDB()
        const parentId = target.parentTaskId ?? null
        const [sections, parents] = await Promise.all([
            db.select<{ id: number }[]>(
                `SELECT s.id FROM section s INNER JOIN section_group g ON g.id = s.groupID
                 WHERE s.id = ? AND s.deleted_at IS NULL AND g.deleted_at IS NULL AND s.archived_at IS NULL AND g.archived_at IS NULL`, [target.sectionId]),
            parentId != null ? db.select<{ sectionID: number }[]>('SELECT sectionID FROM task WHERE id = ? AND deleted_at IS NULL', [parentId]) : Promise.resolve(null),
        ])
        if (!sections[0]) throw createError("TASK_MOVE_INVALID", i18n.t("errors.move.sectionTargetInvalid"))
        if (parentId != null && parents?.[0]?.sectionID !== target.sectionId) throw createError("TASK_MOVE_INVALID", i18n.t("errors.move.taskTargetInvalid"))

        const order = parentId == null
            ? await siblingIds(db, "task", "sectionID = ? AND taskID IS NULL", [target.sectionId], -1)
            : await siblingIds(db, "task", "taskID = ?", [parentId], -1)
        const tx = new Transaction()
        const refs = addTaskTree(tx, target.sectionId, tasks.map(task => ({ sectionRef: target.sectionId, parentRef: parentId, task })))
        const ids: (number | (typeof refs)[number])[] = [...order]
        ids.splice(clampIndex(index, order.length), 0, ...refs)
        addPositions(tx, "task", ids)
        const results = await tx.run()
        return refs.map(ref => results[ref.$ref].lastInsertId - ref.offset)
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "TASK", { UNIQUE: i18n.t("errors.task.unique"), CHECK: i18n.t("errors.task.check") }))
    }
}

/** Where a copy of a section goes: a group of any note, or a new group of a note at `index` among its groups. */
export type CopySectionTarget =
    | { type: "group", groupId: number, index: number, beforeList?: boolean }
    | { type: "new-group", noteId: number, index: number }

/**
 * Inserts a copy of a section, with its tasks, subtasks and tags, in a group (at `index` among its sections, like a move) or in a
 * new group of a note, in ONE transaction. The copy keeps the title unless the group already has a section with it: then it is
 * "<title> (copy)". The original is untouched.
 * @returns The ids of the new section and, for a new group, of the group.
 * @throws SECTION_MOVE_INVALID when the section or the destination does not exist.
 * @category Database Queries
 */
export async function copyDBSectionToNote(sectionId: number, target: CopySectionTarget): Promise<{ sectionId: number, groupId?: number }> {
    try {
        const db = await getDB()
        const rows = await db.select<{ id: number, title: string | null, color: string | null, position: number, task_order: "manual" | "open-first" | "done-first" | null, archived_at: string | null }[]>(
            'SELECT id, title, color, position, task_order, archived_at FROM section WHERE id = ? AND deleted_at IS NULL AND is_default = 0', [sectionId])
        const source = rows[0]
        if (!source) throw createError("SECTION_MOVE_INVALID", i18n.t("errors.move.sectionMissing"))
        const tasks = await db.select<Task[]>(
            'SELECT * FROM task WHERE sectionID = ? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY position, id', [sectionId])
        // The tags of the section itself go with the copy, like the ones of its tasks
        const section = { ...source, title: source.title ?? "" } as typeof source & { title: string, tagIDs?: number[] }
        const tags = await loadSectionTags(sectionId, tasks, section)
        await loadTaskFiles(tasks)
        const snapshot = createSectionSnapshotter(tasks, tags)(section)

        const tx = new Transaction()
        if (target.type === "group") {
            const groups = await db.select<{ id: number }[]>(
                'SELECT id FROM section_group WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL', [target.groupId])
            if (!groups[0]) throw createError("SECTION_MOVE_INVALID", i18n.t("errors.move.groupInvalid"))
            const taken = await db.select<{ title: string | null }[]>('SELECT title FROM section WHERE groupID = ? AND deleted_at IS NULL AND archived_at IS NULL', [target.groupId])
            const titles = new Set(taken.flatMap(row => row.title ? [row.title] : []))
            const title = source.title && titles.has(source.title) ? uniqueCopyName(source.title, titles) : source.title ?? ""
            const [ref] = addSections(tx, [{ groupRef: target.groupId, section: { ...snapshot, title, position: 0 } }])
            addPositions(tx, "section", insertAmongSections(await groupOrderRows(db, target.groupId, -1), target.index, ref, target.beforeList))
            const results = await tx.run()
            return { sectionId: results[ref.$ref].lastInsertId - ref.offset }
        }

        const notes = await db.select<{ id: number }[]>("SELECT id FROM note WHERE id = ? AND deleted_at IS NULL AND kind = 'note'", [target.noteId])
        if (!notes[0]) throw createError("SECTION_MOVE_INVALID", i18n.t("errors.move.noteInvalid"))
        const groups = await db.select<{ id: number }[]>(
            'SELECT id FROM section_group WHERE noteID = ? AND deleted_at IS NULL ORDER BY position, id', [target.noteId])
        const order: (number | { $ref: number, offset: number })[] = groups.map(group => group.id)
        const index = clampIndex(target.index, order.length)
        const created = tx.add('INSERT INTO section_group (noteID, position) VALUES (?, ?)', [target.noteId, index])
        const group = tx.idOf(created)
        tx.add(DEFAULT_SECTION_SQL, [group])
        order.splice(index, 0, group)
        const [ref] = addSections(tx, [{ groupRef: group, section: { ...snapshot, position: 1 } }])
        addPositions(tx, "section_group", order)
        const results = await tx.run()
        return { sectionId: results[ref.$ref].lastInsertId - ref.offset, groupId: results[created].lastInsertId }
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "SECTION", { UNIQUE: i18n.t("errors.move.sectionUnique"), CHECK: i18n.t("errors.section.check") }))
    }
}

/**
 * Inserts a copy of a group, with its sections, tasks, subtasks, tags (by name) and settings (name, color, width), in a note at
 * `index` among its visible groups, in ONE transaction. Audio and media files are not copied (as when a note is duplicated).
 * @returns The id of the new group.
 * @throws GROUP_MOVE_INVALID when the group or the note does not exist.
 * @category Database Queries
 */
export async function copyDBGroupToNote(groupId: number, targetNoteId: number, index: number): Promise<number> {
    try {
        const db = await getDB()
        const rows = await db.select<{ id: number, noteID: number }[]>(
            'SELECT id, noteID FROM section_group WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL', [groupId])
        if (!rows[0]) throw createError("GROUP_MOVE_INVALID", i18n.t("errors.move.groupMissing"))
        await assertSameWorkspace(db, rows[0].noteID, targetNoteId, "GROUP_MOVE_INVALID")

        const data = await getDBNoteData(rows[0].noteID)
        const group = data.groups.find(candidate => candidate.id === groupId)
        if (!group) throw createError("GROUP_MOVE_INVALID", i18n.t("errors.move.groupMissing"))
        const sections = data.sections.filter(section => section.groupID === groupId)
        const sectionIds = new Set(sections.map(section => section.id))
        const { content } = buildContentFromRows({ groups: [group], sections, tasks: data.tasks.filter(task => task.sectionID !== null && sectionIds.has(task.sectionID)), tags: data.tags })

        const order = await groupsOf(db, targetNoteId, -1, index)
        const tx = new Transaction()
        const { groups } = addNoteContent(tx, targetNoteId, content)
        // The new group is the one in `order` at the place `-1` stands for
        const ref = groups[0]
        addPositions(tx, "section_group", order.map(id => id === -1 ? ref : id))
        const results = await tx.run()
        return results[ref.$ref].lastInsertId - ref.offset
    } catch (error: unknown) {
        throw toAppError(error, e => createError("DUPLICATE_FAILED", i18n.t("errors.duplicate.apply", { message: getErrorMessage(e) })))
    }
}
