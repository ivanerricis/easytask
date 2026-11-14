import i18n from "@/i18n"
import type { Tag, Task } from "@/types/types"
import { createError, handleDBError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { getDB } from "../dbManager"
import { Transaction, type TxRef } from "../transaction"
import { chunked, placeholders } from "./sql"

const TAG_MESSAGES = () => ({ UNIQUE: i18n.t("errors.tag.unique"), CHECK: i18n.t("errors.tag.check") })

const loadFailed = (error: unknown) =>
    createError("TAG_LOAD_FAILED", i18n.t("errors.tag.load", { message: getErrorMessage(error) }))

/** The tags a note uses, as the template and the export store them (the id of the workspace tag, its name and color). */
export type UsedTag = Pick<Tag, "id" | "name" | "color">

/** One link of a task with a tag, with the tag itself (the links come ordered by the tag list). */
export type TagLinkRow = UsedTag & { taskID: number }

/**
 * Gives every task its `tagIDs` (only the tasks that have tags get the property) and returns the tags in use, in tag list order.
 * @param tasks The tasks; they are changed in place.
 * @param links The links of those tasks, ordered by the position of the tag.
 */
export function attachTags(tasks: Task[], links: readonly TagLinkRow[]): UsedTag[] {
    const byTask = new Map<number, number[]>()
    const used = new Map<number, UsedTag>()
    for (const { taskID, ...tag } of links) {
        const ids = byTask.get(taskID)
        if (ids) ids.push(tag.id)
        else byTask.set(taskID, [tag.id])
        if (!used.has(tag.id)) used.set(tag.id, tag)
    }
    for (const task of tasks) {
        const ids = byTask.get(task.id)
        if (ids) task.tagIDs = ids
    }
    return [...used.values()]
}

/** A tag as stored: the color is NULL without one. */
const toTag = (row: Tag): Tag => ({ ...row, color: row.color ?? null })

/**
 * The tags of a workspace, in the order of the list.
 * @param workspaceId The ID of the workspace.
 * @throws A createError('TAG_LOAD_FAILED') error when the query fails.
 * @category Database Queries
 */
export async function getDBTags(workspaceId: number): Promise<Tag[]> {
    try {
        const db = await getDB()
        const rows = await db.select<Tag[]>('SELECT id, workspaceID, name, color, position FROM tag WHERE workspaceID = ? ORDER BY position, id', [workspaceId])
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
 * @returns The new tag.
 * @throws A "TAG_EXISTS" error on a name clash, "TAG_CHECK_FAILED" for an empty name.
 * @category Database Queries
 */
export async function createDBTag(workspaceId: number, name: string, color?: string | null): Promise<Tag> {
    try {
        const db = await getDB()
        const result = await db.execute(
            `INSERT INTO tag (workspaceID, name, color, position)
             SELECT ?, ?, ?, COALESCE(MAX(position) + 1, 0) FROM tag WHERE workspaceID = ?`,
            [workspaceId, name.trim(), color ?? null, workspaceId])
        const id = result.lastInsertId as number
        const rows = await db.select<Tag[]>('SELECT id, workspaceID, name, color, position FROM tag WHERE id = ?', [id])
        return toTag(rows[0] ?? { id, workspaceID: workspaceId, name: name.trim(), color: color ?? null, position: 0 })
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
 * Deletes a tag for good, with its links (also those of the tasks in the trash or archived).
 * @returns The ids of the tasks that had the tag, to give it back with {@link restoreDBTag}.
 * @category Database Queries
 */
export async function deleteDBTag(tagId: number): Promise<number[]> {
    try {
        const db = await getDB()
        const links = await db.select<{ taskID: number }[]>('SELECT taskID FROM task_tag WHERE tagID = ? ORDER BY taskID', [tagId])
        await db.execute('DELETE FROM tag WHERE id = ?', [tagId])
        return links.map(link => link.taskID)
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TAG_DELETE_FAILED", i18n.t("errors.tag.delete", { message: getErrorMessage(e) })))
    }
}

/**
 * Puts a deleted tag back with the same id, place and links (the undo of a deletion or the redo of a creation). A task that
 * no longer exists is skipped.
 * @param tag The tag as it was.
 * @param taskIds The tasks that had it.
 * @throws A "TAG_EXISTS" error when another tag took the name meanwhile.
 * @category Database Queries
 */
export async function restoreDBTag(tag: Tag, taskIds: readonly number[]): Promise<void> {
    const tx = new Transaction()
    const insert = tx.add('INSERT INTO tag (id, workspaceID, name, color, position) VALUES (?, ?, ?, ?, ?)',
        [tag.id, tag.workspaceID, tag.name, tag.color, tag.position])
    for (const ids of chunked(taskIds))
        tx.add(`INSERT OR IGNORE INTO task_tag (taskID, tagID) SELECT id, ? FROM task WHERE id IN (${placeholders(ids.length)})`, [tag.id, ...ids])
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
 * The tags of the tasks of a section (not deleted, not archived), as the template snapshot wants them.
 * @param sectionId The ID of the section.
 * @param tasks The tasks of the section: they get their `tagIDs`.
 * @returns The tags in use.
 * @category Database Queries
 */
export async function loadSectionTags(sectionId: number, tasks: Task[]): Promise<UsedTag[]> {
    const db = await getDB()
    const links = await db.select<TagLinkRow[]>(
        `SELECT tt.taskID, tg.id, tg.name, tg.color FROM task_tag tt
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
 * @param tag The name and color of the tag.
 * @category Database Queries
 */
export function addEnsureTag(tx: Transaction, workspaceSql: string, ref: number | TxRef, tag: { name: string, color: string | null }): void {
    tx.add(
        `INSERT OR IGNORE INTO tag (workspaceID, name, color, position)
         SELECT ${workspaceSql}, ?, ?, COALESCE(MAX(position) + 1, 0) FROM tag WHERE workspaceID = ${workspaceSql}`,
        [ref, tag.name.trim(), tag.color || null, ref])
}

/** The id, name and color of the tags of the workspaces of some notes, by tag id: what a rule needs to name its tags in a copy or an export. */
export async function getDBTagIndex(noteIds: readonly number[]): Promise<Map<number, { name: string, color: string | null }>> {
    const index = new Map<number, { name: string, color: string | null }>()
    const db = await getDB()
    for (const ids of chunked(noteIds)) {
        const rows = await db.select<{ id: number, name: string, color: string | null }[]>(
            `SELECT id, name, color FROM tag WHERE workspaceID IN (SELECT workspaceID FROM note WHERE id IN (${placeholders(ids.length)}))`, ids)
        for (const row of rows) index.set(row.id, { name: row.name, color: row.color ?? null })
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
            `SELECT id, workspaceID, name, color, position FROM tag WHERE workspaceID = ${WORKSPACE_OF_NOTE} ORDER BY position, id`, [noteId])
        return rows.map(toTag)
    } catch (error: unknown) {
        throw loadFailed(error)
    }
}
