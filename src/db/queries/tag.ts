import i18n from "@/i18n"
import type { Group, Tag, Task } from "@/types/types"
import { toStoredShape, type StoredTagShape } from "@/lib/tag-shapes"
import { createError, handleDBError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { getDB } from "../dbManager"
import { Transaction, type TxRef } from "../transaction"
import { chunked, placeholders } from "./sql"

const TAG_MESSAGES = () => ({ UNIQUE: i18n.t("errors.tag.unique"), CHECK: i18n.t("errors.tag.check") })

const loadFailed = (error: unknown) =>
    createError("TAG_LOAD_FAILED", i18n.t("errors.tag.load", { message: getErrorMessage(error) }))

/** The tags a note uses, as the template and the export store them (the id of the workspace tag, its name, color and shape). */
export type UsedTag = Pick<Tag, "id" | "name" | "color" | "shape">

/** One link of a task with a tag, with the tag itself (the links come ordered by the tag list; `position` is the place of the tag in it). */
export type TagLinkRow = UsedTag & { taskID: number, position?: number }

/** One link of a group with a tag, with the tag itself (the links come ordered by the tag list). */
export type GroupTagLinkRow = UsedTag & { groupID: number, position?: number }

/** The ids of the tasks and of the groups that have a tag (what a deletion of the tag has to give back). */
export type TagLinks = { taskIds: number[], groupIds: number[] }

/** No links. */
export const NO_TAG_LINKS: TagLinks = { taskIds: [], groupIds: [] }

/** Links of a row (a task or a group) by its id, as `tagIDs` lists in the order the links come. */
function idsByOwner(links: readonly { owner: number, tagID: number }[]): Map<number, number[]> {
    const byOwner = new Map<number, number[]>()
    for (const { owner, tagID } of links) {
        const ids = byOwner.get(owner)
        if (ids) ids.push(tagID)
        else byOwner.set(owner, [tagID])
    }
    return byOwner
}

/**
 * Gives every task its `tagIDs` (only the tasks that have tags get the property) and, when given, every group its own, and
 * returns the tags in use (by tasks or groups), in tag list order.
 * @param tasks The tasks; they are changed in place.
 * @param links The links of those tasks, ordered by the position of the tag.
 * @param groups The groups, changed in place (none by default).
 * @param groupLinks The links of those groups, ordered by the position of the tag.
 */
export function attachTags(tasks: Task[], links: readonly TagLinkRow[], groups: Group[] = [], groupLinks: readonly GroupTagLinkRow[] = []): UsedTag[] {
    const used = new Map<number, UsedTag & { position: number }>()
    const remember = (link: UsedTag & { position?: number }) => {
        if (!used.has(link.id)) used.set(link.id, { id: link.id, name: link.name, color: link.color, shape: toStoredShape(link.shape), position: link.position ?? used.size })
    }
    for (const link of links) remember(link)
    for (const link of groupLinks) remember(link)
    const byTask = idsByOwner(links.map(link => ({ owner: link.taskID, tagID: link.id })))
    for (const task of tasks) {
        const ids = byTask.get(task.id)
        if (ids) task.tagIDs = ids
    }
    const byGroup = idsByOwner(groupLinks.map(link => ({ owner: link.groupID, tagID: link.id })))
    for (const group of groups) {
        const ids = byGroup.get(group.id)
        if (ids) group.tagIDs = ids
    }
    const ordered = [...used.values()]
    // The two lists are each in tag order; the union is put in the same order (stable: the first seen wins a tie)
    if (groupLinks.length > 0) ordered.sort((a, b) => a.position - b.position || a.id - b.id)
    return ordered.map(({ id, name, color, shape }) => ({ id, name, color, shape }))
}

/** A tag as stored: the color is NULL without one. */
const toTag = (row: Tag): Tag => ({ ...row, color: row.color ?? null, shape: toStoredShape(row.shape) })

/**
 * The tags of a workspace, in the order of the list.
 * @param workspaceId The ID of the workspace.
 * @throws A createError('TAG_LOAD_FAILED') error when the query fails.
 * @category Database Queries
 */
export async function getDBTags(workspaceId: number): Promise<Tag[]> {
    try {
        const db = await getDB()
        const rows = await db.select<Tag[]>('SELECT id, workspaceID, name, color, shape, position FROM tag WHERE workspaceID = ? ORDER BY position, id', [workspaceId])
        return rows.map(toTag)
    } catch (error: unknown) {
        throw loadFailed(error)
    }
}

/**
 * Creates a tag at the end of the list of the workspace.
 * @param workspaceId The ID of the workspace.
 * @param name The name (not empty, unique in the workspace ignoring the case).
 * @param color The color (hex); none when omitted.
 * @param shape The shape (see TagShape); the default pill when omitted.
 * @returns The new tag.
 * @throws A "TAG_EXISTS" error on a name clash, "TAG_CHECK_FAILED" for an empty name.
 * @category Database Queries
 */
export async function createDBTag(workspaceId: number, name: string, color?: string | null, shape?: StoredTagShape): Promise<Tag> {
    try {
        const db = await getDB()
        const result = await db.execute(
            `INSERT INTO tag (workspaceID, name, color, shape, position)
             SELECT ?, ?, ?, ?, COALESCE(MAX(position) + 1, 0) FROM tag WHERE workspaceID = ?`,
            [workspaceId, name.trim(), color ?? null, toStoredShape(shape), workspaceId])
        const id = result.lastInsertId as number
        const rows = await db.select<Tag[]>('SELECT id, workspaceID, name, color, shape, position FROM tag WHERE id = ?', [id])
        return toTag(rows[0] ?? { id, workspaceID: workspaceId, name: name.trim(), color: color ?? null, shape: toStoredShape(shape), position: 0 })
    } catch (error: unknown) {
        return handleDBError(error, "TAG", TAG_MESSAGES())
    }
}

/**
 * Renames a tag.
 * @throws A "TAG_EXISTS" error on a name clash in the workspace, "TAG_CHECK_FAILED" for an empty name.
 * @category Database Queries
 */
export async function renameDBTag(tagId: number, name: string): Promise<void> {
    try {
        const db = await getDB()
        await db.execute('UPDATE tag SET name = ? WHERE id = ?', [name.trim(), tagId])
    } catch (error: unknown) {
        handleDBError(error, "TAG", TAG_MESSAGES())
    }
}

/**
 * Sets the color of a tag (null = no color).
 * @category Database Queries
 */
export async function updateDBTagColor(tagId: number, color: string | null): Promise<void> {
    try {
        const db = await getDB()
        await db.execute('UPDATE tag SET color = ? WHERE id = ?', [color, tagId])
    } catch (error: unknown) {
        handleDBError(error, "TAG", { ...TAG_MESSAGES(), CHECK: i18n.t("errors.item.colorCheck") })
    }
}

/**
 * Sets the shape of a tag (null = the default pill).
 * @category Database Queries
 */
export async function updateDBTagShape(tagId: number, shape: StoredTagShape): Promise<void> {
    try {
        const db = await getDB()
        await db.execute('UPDATE tag SET shape = ? WHERE id = ?', [toStoredShape(shape), tagId])
    } catch (error: unknown) {
        handleDBError(error, "TAG", TAG_MESSAGES())
    }
}

/**
 * Deletes a tag for good, with its links (also those of the tasks in the trash or archived, and of the groups).
 * @returns The ids of the tasks and of the groups that had the tag, to give it back with {@link restoreDBTag}.
 * @category Database Queries
 */
export async function deleteDBTag(tagId: number): Promise<TagLinks> {
    try {
        const db = await getDB()
        const [tasks, groups] = await Promise.all([
            db.select<{ taskID: number }[]>('SELECT taskID FROM task_tag WHERE tagID = ? ORDER BY taskID', [tagId]),
            db.select<{ groupID: number }[]>('SELECT groupID FROM section_group_tag WHERE tagID = ? ORDER BY groupID', [tagId]),
        ])
        await db.execute('DELETE FROM tag WHERE id = ?', [tagId])
        return { taskIds: tasks.map(link => link.taskID), groupIds: groups.map(link => link.groupID) }
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TAG_DELETE_FAILED", i18n.t("errors.tag.delete", { message: getErrorMessage(e) })))
    }
}

/**
 * Puts a deleted tag back with the same id, place and links (the undo of a deletion or the redo of a creation). A task or a
 * group that no longer exists is skipped.
 * @param tag The tag as it was.
 * @param links The tasks and the groups that had it.
 * @throws A "TAG_EXISTS" error when another tag took the name meanwhile.
 * @category Database Queries
 */
export async function restoreDBTag(tag: Tag, links: Partial<TagLinks> = NO_TAG_LINKS): Promise<void> {
    const tx = new Transaction()
    const insert = tx.add('INSERT INTO tag (id, workspaceID, name, color, shape, position) VALUES (?, ?, ?, ?, ?, ?)',
        [tag.id, tag.workspaceID, tag.name, tag.color, toStoredShape(tag.shape), tag.position])
    for (const ids of chunked(links.taskIds ?? []))
        tx.add(`INSERT OR IGNORE INTO task_tag (taskID, tagID) SELECT id, ? FROM task WHERE id IN (${placeholders(ids.length)})`, [tag.id, ...ids])
    for (const ids of chunked(links.groupIds ?? []))
        tx.add(`INSERT OR IGNORE INTO section_group_tag (groupID, tagID) SELECT id, ? FROM section_group WHERE id IN (${placeholders(ids.length)})`, [tag.id, ...ids])
    try {
        await tx.run()
    } catch (error: unknown) {
        const failed = (error as { statementIndex?: number }).statementIndex === insert
        if (failed) handleDBError(error, "TAG", TAG_MESSAGES())
        throw toAppError(error, e => createError("TAG_RESTORE_FAILED", i18n.t("errors.tag.restore", { message: getErrorMessage(e) })))
    }
}

/**
 * Gives a tag to some tasks, or takes it away from them, in one transaction. A task that already has it (or has not) is left as it is.
 * @param tagId The tag.
 * @param taskIds The tasks.
 * @param assigned True to give the tag, false to remove it.
 * @category Database Queries
 */
export async function setDBTaskTag(tagId: number, taskIds: readonly number[], assigned: boolean): Promise<void> {
    if (taskIds.length === 0) return
    try {
        const tx = new Transaction()
        for (const ids of chunked(taskIds, 400)) {
            if (assigned) tx.add(`INSERT OR IGNORE INTO task_tag (taskID, tagID) VALUES ${ids.map(() => "(?, ?)").join(", ")}`, ids.flatMap(id => [id, tagId]))
            else tx.add(`DELETE FROM task_tag WHERE tagID = ? AND taskID IN (${placeholders(ids.length)})`, [tagId, ...ids])
        }
        await tx.run()
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TAG_ASSIGN_FAILED", i18n.t("errors.tag.assign", { message: getErrorMessage(e) })))
    }
}

/**
 * Gives a tag to some groups, or takes it away from them, in one transaction. A group that already has it (or has not) is left as it is.
 * @param tagId The tag.
 * @param groupIds The groups.
 * @param assigned True to give the tag, false to remove it.
 * @category Database Queries
 */
export async function setDBGroupTag(tagId: number, groupIds: readonly number[], assigned: boolean): Promise<void> {
    if (groupIds.length === 0) return
    try {
        const tx = new Transaction()
        for (const ids of chunked(groupIds, 400)) {
            if (assigned) tx.add(`INSERT OR IGNORE INTO section_group_tag (groupID, tagID) VALUES ${ids.map(() => "(?, ?)").join(", ")}`, ids.flatMap(id => [id, tagId]))
            else tx.add(`DELETE FROM section_group_tag WHERE tagID = ? AND groupID IN (${placeholders(ids.length)})`, [tagId, ...ids])
        }
        await tx.run()
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TAG_ASSIGN_FAILED", i18n.t("errors.tag.assign", { message: getErrorMessage(e) })))
    }
}

/**
 * The tags of the tasks of a section (not deleted, not archived), as the template snapshot wants them.
 * @param sectionId The ID of the section.
 * @param tasks The tasks of the section: they get their `tagIDs`.
 * @returns The tags in use.
 * @category Database Queries
 */
export async function loadSectionTags(sectionId: number, tasks: Task[]): Promise<UsedTag[]> {
    const db = await getDB()
    const links = await db.select<TagLinkRow[]>(
        `SELECT tt.taskID, tg.id, tg.name, tg.color, tg.shape, tg.position FROM task_tag tt
         INNER JOIN tag tg ON tg.id = tt.tagID
         INNER JOIN task t ON t.id = tt.taskID
         WHERE t.sectionID = ? AND t.deleted_at IS NULL AND t.archived_at IS NULL
         ORDER BY tg.position, tg.id`, [sectionId])
    return attachTags(tasks, links)
}

/** SQL (one `?` for the section) of the workspace a section belongs to: its note's, or the template's for the note of a template draft. */
export const WORKSPACE_OF_SECTION = `(SELECT COALESCE(n.workspaceID, (SELECT t.workspaceID FROM note_template t WHERE t.id = n.templateID))
    FROM section s INNER JOIN section_group g ON g.id = s.groupID INNER JOIN note n ON n.id = g.noteID WHERE s.id = ?)`

/** SQL (one `?` for the note) of the workspace a note belongs to (the template's for a template draft). */
export const WORKSPACE_OF_NOTE = `(SELECT COALESCE(n.workspaceID, (SELECT t.workspaceID FROM note_template t WHERE t.id = n.templateID))
    FROM note n WHERE n.id = ?)`

/**
 * Adds to a transaction the statement that creates a tag in the workspace that `workspaceSql` resolves from `ref`, at the end
 * of its list, unless the workspace already has a tag with that name (the case is ignored): that one is kept as it is.
 * @param tx The transaction collecting the statements.
 * @param workspaceSql {@link WORKSPACE_OF_SECTION} or {@link WORKSPACE_OF_NOTE}.
 * @param ref The section or note (id or reference to the statement that creates it) the SQL looks at.
 * @param tag The name, color and shape of the tag (the shape is set only when the tag is created).
 * @category Database Queries
 */
export function addEnsureTag(tx: Transaction, workspaceSql: string, ref: number | TxRef, tag: { name: string, color: string | null, shape?: string | null }): void {
    tx.add(
        `INSERT OR IGNORE INTO tag (workspaceID, name, color, shape, position)
         SELECT ${workspaceSql}, ?, ?, ?, COALESCE(MAX(position) + 1, 0) FROM tag WHERE workspaceID = ${workspaceSql}`,
        [ref, tag.name.trim(), tag.color || null, toStoredShape(tag.shape), ref])
}

/** The id, name and color of the tags of the workspaces of some notes, by tag id: what a rule needs to name its tags in a copy or an export. */
export async function getDBTagIndex(noteIds: readonly number[]): Promise<Map<number, { name: string, color: string | null, shape?: string | null }>> {
    const index = new Map<number, { name: string, color: string | null, shape?: string | null }>()
    const db = await getDB()
    for (const ids of chunked(noteIds)) {
        const rows = await db.select<{ id: number, name: string, color: string | null, shape: string | null }[]>(
            `SELECT id, name, color, shape FROM tag WHERE workspaceID IN (
                SELECT COALESCE(n.workspaceID, (SELECT t.workspaceID FROM note_template t WHERE t.id = n.templateID)) FROM note n WHERE n.id IN (${placeholders(ids.length)}))`, ids)
        for (const row of rows) index.set(row.id, { name: row.name, color: row.color ?? null, ...(row.shape ? { shape: row.shape } : {}) })
    }
    return index
}

/**
 * The tags of the workspace a note belongs to (the template's workspace for a template draft), in the order of the list.
 * @param noteId The ID of the note.
 * @throws A createError('TAG_LOAD_FAILED') error when the query fails.
 * @category Database Queries
 */
export async function getDBNoteTags(noteId: number): Promise<Tag[]> {
    try {
        const db = await getDB()
        const rows = await db.select<Tag[]>(
            `SELECT id, workspaceID, name, color, shape, position FROM tag WHERE workspaceID = ${WORKSPACE_OF_NOTE} ORDER BY position, id`, [noteId])
        return rows.map(toTag)
    } catch (error: unknown) {
        throw loadFailed(error)
    }
}
