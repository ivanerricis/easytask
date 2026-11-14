import i18n from "@/i18n"
import type { TrashItem, TrashedWorkspace, Workspace } from "@/types/types";
import { countTemplateContent } from "@/types/template";
import { createError, handleDBError } from "@/types/error";
import { getErrorMessage } from "@/lib/utils";
import { getDB } from "../dbManager";
import { assertItemType, type DBItemType } from "./shared_queries";
import { Transaction } from "../transaction";
import { TRASHABLE_TABLES } from "../schema/trash_index";
import { parseTemplateContent } from "./template";

const RESTORE_UNIQUE_MESSAGE = () => i18n.t("errors.trash.restoreUnique")

type TrashRow = { type: DBItemType, id: number, name: string, context: string | null, deleted_at: string, extra: number }

/** What a trashed item contained; a missing key counts as zero. */
type TrashCounts = Partial<Record<"folders" | "notes" | "groups" | "sections" | "tasks" | "audio" | "media", number>>

// Counters shown for each type, in display order (audio files have no content)
const SUMMARY_FIELDS: Partial<Record<DBItemType, (keyof TrashCounts)[]>> = {
    workspace: ["folders", "notes"],
    folder: ["folders", "notes"],
    note: ["groups", "sections", "tasks"],
    section_group: ["sections", "tasks", "audio", "media"],
    section: ["tasks"],
    task: ["tasks"],
    note_template: ["groups", "sections", "tasks"],
}

// A folder contains "subfolders" and a task "subtasks"
const SUBITEM_KEYS: Partial<Record<DBItemType, Partial<Record<keyof TrashCounts, "subfolders" | "subtasks">>>> = {
    folder: { folders: "subfolders" },
    task: { tasks: "subtasks" },
}

// Counters that reuse the shared plural keys; the others have their own "trash.summary" key
const SHARED_COUNT_KEYS: Partial<Record<keyof TrashCounts, "common.counts.group" | "common.counts.section" | "common.counts.task">> = {
    groups: "common.counts.group",
    sections: "common.counts.section",
    tasks: "common.counts.task",
}

/**
 * Describes what a trashed item contained, e.g. "2 gruppi · 3 sezioni · 5 task".
 * Zero counts are omitted, "Vuoto" (translated) is returned when nothing is left, and audio files (no content) give "".
 * @param type The type of the trashed item.
 * @param counts The number of children that come back with the item.
 * @category Database Queries
 */
export function formatTrashSummary(type: DBItemType, counts: TrashCounts): string {
    const fields = SUMMARY_FIELDS[type]
    if (!fields) return ""
    const parts = fields
        .filter(field => (counts[field] ?? 0) > 0)
        .map(field => {
            const shared = SHARED_COUNT_KEYS[field]
            const own = (SUBITEM_KEYS[type]?.[field] ?? field) as "folders" | "notes" | "audio" | "media" | "subfolders" | "subtasks"
            return i18n.t(shared && !SUBITEM_KEYS[type]?.[field] ? shared : `trash.summary.${own}`, { count: counts[field]! })
        })
    return parts.length > 0 ? parts.join(" · ") : i18n.t("trash.summary.empty")
}

type CountRow = { id: number } & Record<string, number>
const toCountMap = (rows: CountRow[]) => new Map(rows.map(({ id, ...counts }) => [id, counts as TrashCounts]))

// Sections of the workspace, to scope the task queries
const WORKSPACE_SECTIONS = `SELECT s.id FROM section s
    INNER JOIN section_group g ON g.id = s.groupID
    INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ?`

// Live tasks (subtasks at any depth) of the sections returned by sectionsSql; a task hidden by a deleted ancestor is not reached
const liveTasks = (sectionsSql: string) => `tt(sec, id) AS (
        SELECT sectionID, id FROM task WHERE taskID IS NULL AND deleted_at IS NULL AND sectionID IN (${sectionsSql})
        UNION ALL
        SELECT tt.sec, t.id FROM task t INNER JOIN tt ON t.taskID = tt.id WHERE t.deleted_at IS NULL)`

/** Column that hides an item: `deleted_at` (trash) or `archived_at` (archive). */
type HideColumn = "deleted_at" | "archived_at"

/**
 * Counts the children that come back with each trashed item (or archived one, with `column` "archived_at":
 * the roots are then the archived items that are not in the trash).
 * Soft delete only marks the item itself: its children keep deleted_at NULL and are hidden through the parent,
 * so a child counts when neither it nor any ancestor up to the trashed item is deleted
 * (anything deleted separately earlier stays in the trash on restore and is not counted).
 * One query per type of trashed item, never one per item.
 */
export async function loadTrashCounts(db: Awaited<ReturnType<typeof getDB>>, workspaceId: number, types: Set<DBItemType>, column: HideColumn = "deleted_at") {
    // Condition on the root items, written with the table/alias name of the row
    const root = (name: string) => column === "deleted_at" ? `${name}.deleted_at IS NOT NULL` : `${name}.archived_at IS NOT NULL AND ${name}.deleted_at IS NULL`
    // One query per type, independent selects (no transaction): they run in parallel on the pooled connection
    const queries: [DBItemType, string, number[]][] = []
    const load = (type: DBItemType, sql: string, params: number[]) => {
        if (types.has(type)) queries.push([type, sql, params])
    }

    load("folder",
        `WITH RECURSIVE tree(root, id) AS (
            SELECT id, id FROM folder WHERE workspaceID = ? AND ${root("folder")}
            UNION ALL
            SELECT tree.root, f.id FROM folder f INNER JOIN tree ON f.folderID = tree.id WHERE f.deleted_at IS NULL)
         SELECT tree.root AS id, COUNT(*) - 1 AS folders,
                (SELECT COUNT(*) FROM note n WHERE n.deleted_at IS NULL
                   AND n.folderID IN (SELECT t2.id FROM tree t2 WHERE t2.root = tree.root)) AS notes
         FROM tree GROUP BY tree.root`, [workspaceId])

    load("note",
        `WITH RECURSIVE ${liveTasks(`SELECT s.id FROM section s
                INNER JOIN section_group g ON g.id = s.groupID
                INNER JOIN note n ON n.id = g.noteID
                WHERE ${root("n")} AND n.workspaceID = ? AND s.deleted_at IS NULL AND g.deleted_at IS NULL`)}
         SELECT n.id,
                (SELECT COUNT(*) FROM section_group g WHERE g.noteID = n.id AND g.deleted_at IS NULL) AS groups,
                (SELECT COUNT(*) FROM section s INNER JOIN section_group g ON g.id = s.groupID
                  WHERE g.noteID = n.id AND g.deleted_at IS NULL AND s.deleted_at IS NULL AND s.is_default = 0) AS sections,
                (SELECT COUNT(*) FROM tt INNER JOIN section s ON s.id = tt.sec INNER JOIN section_group g ON g.id = s.groupID
                  WHERE g.noteID = n.id) AS tasks
         FROM note n WHERE n.workspaceID = ? AND ${root("n")}`, [workspaceId, workspaceId])

    load("section_group",
        `WITH RECURSIVE ${liveTasks(`SELECT s.id FROM section s
                INNER JOIN section_group g ON g.id = s.groupID
                INNER JOIN note n ON n.id = g.noteID
                WHERE ${root("g")} AND n.workspaceID = ? AND s.deleted_at IS NULL`)}
         SELECT g.id,
                (SELECT COUNT(*) FROM section s WHERE s.groupID = g.id AND s.deleted_at IS NULL AND s.is_default = 0) AS sections,
                (SELECT COUNT(*) FROM tt INNER JOIN section s ON s.id = tt.sec WHERE s.groupID = g.id) AS tasks,
                (SELECT COUNT(*) FROM audio_file a WHERE a.section_groupID = g.id AND a.deleted_at IS NULL) AS audio,
                (SELECT COUNT(*) FROM media_file m WHERE m.section_groupID = g.id AND m.deleted_at IS NULL) AS media
         FROM section_group g INNER JOIN note n ON n.id = g.noteID
         WHERE ${root("g")} AND n.workspaceID = ?`, [workspaceId, workspaceId])

    load("section",
        `WITH RECURSIVE ${liveTasks(`SELECT id FROM section WHERE ${root("section")} AND id IN (${WORKSPACE_SECTIONS})`)}
         SELECT sec AS id, COUNT(*) AS tasks FROM tt GROUP BY sec`, [workspaceId])

    load("task",
        `WITH RECURSIVE tree(root, id) AS (
            SELECT id, id FROM task WHERE ${root("task")} AND sectionID IN (${WORKSPACE_SECTIONS})
            UNION ALL
            SELECT tree.root, t.id FROM task t INNER JOIN tree ON t.taskID = tree.id WHERE t.deleted_at IS NULL)
         SELECT root AS id, COUNT(*) - 1 AS tasks FROM tree GROUP BY root`, [workspaceId])

    const results = await Promise.all(queries.map(([, sql, params]) => db.select<CountRow[]>(sql, params)))
    return new Map<DBItemType, Map<number, TrashCounts>>(queries.map(([type], i) => [type, toCountMap(results[i])]))
}

/** Counts of a trashed template, read from its JSON snapshot (a corrupted one counts as empty). */
const countTemplateJson = (content: string): TrashCounts => countTemplateContent(parseTemplateContent(content))

/** A row of the trash/archive listings: the SQL columns shared by both (the date column is `deleted_at` or `archived_at`). */
type HiddenRow<K extends string> = { type: DBItemType, id: number, name: string, context: string | null, extra: number } & Record<K, string>

/**
 * Maps the rows of the trash (`dateKey` "deleted_at") or archive ("archived_at") listing to their items: an unnamed group
 * gets the "unnamed group" name (with its section count), a missing context is empty, the summary comes from the counts.
 */
export function mapHiddenRows<K extends "deleted_at" | "archived_at", T extends DBItemType>(
    rows: (HiddenRow<K> & { type: T })[], counts: Map<DBItemType, Map<number, TrashCounts>>, dateKey: K,
): ({ type: T, id: number, name: string, context: string, summary: string } & Record<K, string>)[] {
    return rows.map(row => ({
        type: row.type,
        id: row.id,
        name: row.type === "section_group" && !row.name
            ? i18n.t("trash.unnamedGroup", { count: row.extra })
            : row.name,
        context: row.context ?? "",
        summary: formatTrashSummary(row.type, counts.get(row.type)?.get(row.id) ?? {}),
        [dateKey]: row[dateKey],
    }) as { type: T, id: number, name: string, context: string, summary: string } & Record<K, string>)
}

/**
 * Retrieves the items moved to the trash that belong to a workspace.
 * Only the items deleted directly are listed (their children are removed with them).
 * Groups have their name (or "Gruppo di N sezioni" when unnamed) and the note name as context;
 * sections and tasks have "Nota X" / "Nota X › Sezione Y" as context (a task directly in a group: "Nota X › Gruppo Y"),
 * audio files "Nota X › <group name>" ("Gruppo N", N = position of the group in the note, when unnamed),
 * templates "Da: <source note>" (empty when the source note no longer exists).
 * Every item also has a `summary` of what it contained (see formatTrashSummary).
 * @param workspaceId The ID of the workspace.
 * @returns The trashed items, most recently deleted first.
 * @throws A createError('TRASH_LOAD_FAILED') error when a query fails.
 * @category Database Queries
 */
export async function getDBTrash(workspaceId: number): Promise<TrashItem[]> {
    try {
        const db = await getDB()

        // Context labels are composed in SQL: the translated prefixes are bound in order of appearance
        const notePrefix = i18n.t("trash.context.note")
        const sectionPrefix = i18n.t("trash.context.section")
        const groupPrefix = i18n.t("trash.context.group")
        const fromPrefix = i18n.t("trash.context.from")

        // One UNION ALL query; `kind` keeps the historical order among items deleted at the same time
        const rows = await db.select<TrashRow[]>(
            `SELECT 'folder' AS type, 0 AS kind, f.id, f.name,
                    (SELECT p.name FROM folder p WHERE p.id = f.folderID) AS context, f.deleted_at, 0 AS extra
             FROM folder f WHERE f.workspaceID = ? AND f.deleted_at IS NOT NULL
             UNION ALL
             SELECT 'note', 1, n.id, n.name,
                    (SELECT p.name FROM folder p WHERE p.id = n.folderID), n.deleted_at, 0
             FROM note n WHERE n.workspaceID = ? AND n.deleted_at IS NOT NULL
             UNION ALL
             SELECT 'section_group', 2, g.id, COALESCE(NULLIF(TRIM(g.name), ''), ''), n.name, g.deleted_at,
                    (SELECT COUNT(*) FROM section s WHERE s.groupID = g.id AND s.is_default = 0)
             FROM section_group g INNER JOIN note n ON n.id = g.noteID
             WHERE n.workspaceID = ? AND g.deleted_at IS NOT NULL
             UNION ALL
             SELECT 'section', 3, s.id, COALESCE(s.title, ''), ? || n.name, s.deleted_at, 0
             FROM section s
             INNER JOIN section_group g ON g.id = s.groupID
             INNER JOIN note n ON n.id = g.noteID
             WHERE n.workspaceID = ? AND s.deleted_at IS NOT NULL
             UNION ALL
             SELECT 'task', 4, t.id, t.text, ? || n.name || ' › ' || CASE WHEN s.is_default = 1 THEN ? || COALESCE(NULLIF(TRIM(g.name), ''), g.position + 1) ELSE ? || COALESCE(s.title, '') END, t.deleted_at, 0
             FROM task t
             INNER JOIN section s ON s.id = t.sectionID
             INNER JOIN section_group g ON g.id = s.groupID
             INNER JOIN note n ON n.id = g.noteID
             WHERE n.workspaceID = ? AND t.deleted_at IS NOT NULL
             UNION ALL
             SELECT 'audio_file', 5, a.id, a.name, ? || n.name || ' › ' || COALESCE(NULLIF(TRIM(g.name), ''), ? || (g.position + 1)), a.deleted_at, 0
             FROM audio_file a
             INNER JOIN section_group g ON g.id = a.section_groupID
             INNER JOIN note n ON n.id = g.noteID
             WHERE n.workspaceID = ? AND a.deleted_at IS NOT NULL
             UNION ALL
             SELECT 'media_file', 7, a.id, a.name, ? || n.name || ' › ' || COALESCE(NULLIF(TRIM(g.name), ''), ? || (g.position + 1)), a.deleted_at, 0
             FROM media_file a
             INNER JOIN section_group g ON g.id = a.section_groupID
             INNER JOIN note n ON n.id = g.noteID
             WHERE n.workspaceID = ? AND a.deleted_at IS NOT NULL
             UNION ALL
             SELECT 'note_template', 6, t.id, t.name,
                    COALESCE(? || (SELECT n.name FROM note n WHERE n.id = t.sourceNoteID), ''), t.deleted_at, 0
             FROM note_template t WHERE t.workspaceID = ? AND t.deleted_at IS NOT NULL
             ORDER BY deleted_at DESC, kind, id`, [workspaceId, workspaceId, workspaceId, notePrefix, workspaceId, notePrefix, groupPrefix, sectionPrefix, workspaceId, notePrefix, groupPrefix, workspaceId, notePrefix, groupPrefix, workspaceId, fromPrefix, workspaceId])

        const counts = await loadTrashCounts(db, workspaceId, new Set(rows.map(row => row.type)))
        if (rows.some(row => row.type === "note_template")) {
            const contents = await db.select<{ id: number, content: string }[]>(
                'SELECT id, content FROM note_template WHERE workspaceID = ? AND deleted_at IS NOT NULL', [workspaceId])
            counts.set("note_template", new Map(contents.map(({ id, content }) => [id, countTemplateJson(content)])))
        }

        return mapHiddenRows(rows, counts, "deleted_at")
    } catch (error: unknown) {
        throw createError("TRASH_LOAD_FAILED", i18n.t("errors.trash.load", { message: getErrorMessage(error) }))
    }
}

/**
 * Counts the items moved to the trash that belong to a workspace: the same number getDBTrash(workspaceId) would list,
 * without building labels or summaries (only COUNT queries). Trashed workspaces are not items of a workspace trash.
 * @param workspaceId The ID of the workspace.
 * @returns The number of trashed items.
 * @throws A createError('TRASH_LOAD_FAILED') error when a query fails.
 * @category Database Queries
 */
export async function getDBTrashCount(workspaceId: number): Promise<number> {
    try {
        const db = await getDB()
        const rows = await db.select<{ total: number }[]>(
            `SELECT
                (SELECT COUNT(*) FROM folder WHERE workspaceID = ? AND deleted_at IS NOT NULL)
              + (SELECT COUNT(*) FROM note WHERE workspaceID = ? AND deleted_at IS NOT NULL)
              + (SELECT COUNT(*) FROM section_group g INNER JOIN note n ON n.id = g.noteID
                  WHERE n.workspaceID = ? AND g.deleted_at IS NOT NULL)
              + (SELECT COUNT(*) FROM section s
                  INNER JOIN section_group g ON g.id = s.groupID
                  INNER JOIN note n ON n.id = g.noteID
                  WHERE n.workspaceID = ? AND s.deleted_at IS NOT NULL)
              + (SELECT COUNT(*) FROM task t
                  INNER JOIN section s ON s.id = t.sectionID
                  INNER JOIN section_group g ON g.id = s.groupID
                  INNER JOIN note n ON n.id = g.noteID
                  WHERE n.workspaceID = ? AND t.deleted_at IS NOT NULL)
              + (SELECT COUNT(*) FROM audio_file a
                  INNER JOIN section_group g ON g.id = a.section_groupID
                  INNER JOIN note n ON n.id = g.noteID
                  WHERE n.workspaceID = ? AND a.deleted_at IS NOT NULL)
              + (SELECT COUNT(*) FROM media_file a
                  INNER JOIN section_group g ON g.id = a.section_groupID
                  INNER JOIN note n ON n.id = g.noteID
                  WHERE n.workspaceID = ? AND a.deleted_at IS NOT NULL)
              + (SELECT COUNT(*) FROM note_template WHERE workspaceID = ? AND deleted_at IS NOT NULL) AS total`,
            [workspaceId, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId])
        return rows[0]?.total ?? 0
    } catch (error: unknown) {
        throw createError("TRASH_LOAD_FAILED", i18n.t("errors.trash.load", { message: getErrorMessage(error) }))
    }
}

/**
 * Retrieves the workspaces moved to the trash, each with a `summary` ("3 cartelle · 12 note", "Vuoto" when empty)
 * counting the folders (recursively) and notes that come back with it.
 * @returns The deleted workspaces (as TrashedWorkspace), most recently deleted first.
 * @category Database Queries
 */
export async function getDBTrashedWorkspaces(): Promise<TrashedWorkspace[]> {
    try {
        const db = await getDB()
        const workspaces = await db.select<Workspace[]>('SELECT * FROM workspace WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
        if (workspaces.length === 0) return []

        // Live folders reachable from the root folders (a folder deleted separately hides its whole subtree)
        const counts = toCountMap(await db.select<CountRow[]>(
            `WITH RECURSIVE tree(ws, id) AS (
                SELECT workspaceID, id FROM folder WHERE folderID IS NULL AND deleted_at IS NULL
                  AND workspaceID IN (SELECT id FROM workspace WHERE deleted_at IS NOT NULL)
                UNION ALL
                SELECT tree.ws, f.id FROM folder f INNER JOIN tree ON f.folderID = tree.id WHERE f.deleted_at IS NULL)
             SELECT w.id,
                    (SELECT COUNT(*) FROM tree WHERE tree.ws = w.id) AS folders,
                    (SELECT COUNT(*) FROM note n WHERE n.workspaceID = w.id AND n.deleted_at IS NULL
                       AND (n.folderID IS NULL OR n.folderID IN (SELECT id FROM tree WHERE tree.ws = w.id))) AS notes
             FROM workspace w WHERE w.deleted_at IS NOT NULL`))
        return workspaces.map((w): TrashedWorkspace => ({ ...w, summary: formatTrashSummary("workspace", counts.get(w.id) ?? {}) }))
    } catch (error: unknown) {
        throw createError("TRASH_LOAD_FAILED", i18n.t("errors.trash.loadWorkspaces", { message: getErrorMessage(error) }))
    }
}

/** A parametrized SQL statement of a transaction. */
type Statement = { sql: string, params: number[] }

// Clears `column` on the folder whose id is returned by startSql and on every ancestor folder that has it set
const folderChain = (column: HideColumn, startSql: string, params: number[]): Statement => ({
    sql: `UPDATE folder SET ${column} = NULL WHERE ${column} IS NOT NULL AND id IN (
            WITH RECURSIVE anc(id, parent) AS (
                SELECT id, folderID FROM folder WHERE id = (${startSql})
                UNION
                SELECT f.id, f.folderID FROM folder f INNER JOIN anc ON f.id = anc.parent
            ) SELECT id FROM anc)`,
    params,
})

const restoreRow = (column: HideColumn, table: string, idSql: string, params: number[]): Statement => ({
    sql: `UPDATE ${table} SET ${column} = NULL WHERE ${column} IS NOT NULL AND id = (${idSql})`,
    params,
})

const NOTE_OF_GROUP = "SELECT noteID FROM section_group WHERE id = ?"
const GROUP_OF_SECTION = "SELECT groupID FROM section WHERE id = ?"
const SECTION_OF_TASK = "SELECT sectionID FROM task WHERE id = ?"

/**
 * Builds the statements that restore an item and its hidden ancestors, top-down
 * (ancestors first, so that a name conflict on the item leaves nothing half hidden).
 * @param column The column that hides the item: `deleted_at` to restore from the trash, `archived_at` to unarchive.
 * @category Database Queries
 */
export function buildRestoreStatements(itemType: DBItemType, id: number, column: HideColumn = "deleted_at"): Statement[] {
    switch (itemType) {
        case "workspace":
            return [restoreRow(column, "workspace", "SELECT ?", [id])]
        case "folder":
            return [folderChain(column, "SELECT ?", [id])]
        case "note_template":
            return [restoreRow(column, "note_template", "SELECT ?", [id])]
        case "note":
            return [
                folderChain(column, "SELECT folderID FROM note WHERE id = ?", [id]),
                restoreRow(column, "note", "SELECT ?", [id]),
            ]
        case "section_group":
            return [
                folderChain(column, `SELECT folderID FROM note WHERE id = (${NOTE_OF_GROUP})`, [id]),
                restoreRow(column, "note", NOTE_OF_GROUP, [id]),
                restoreRow(column, "section_group", "SELECT ?", [id]),
            ]
        case "section": {
            const noteOfSection = `SELECT noteID FROM section_group WHERE id = (${GROUP_OF_SECTION})`
            return [
                folderChain(column, `SELECT folderID FROM note WHERE id = (${noteOfSection})`, [id]),
                restoreRow(column, "note", noteOfSection, [id]),
                restoreRow(column, "section_group", GROUP_OF_SECTION, [id]),
                restoreRow(column, "section", "SELECT ?", [id]),
            ]
        }
        case "audio_file": {
            const groupOfAudio = "SELECT section_groupID FROM audio_file WHERE id = ?"
            const noteOfAudio = `SELECT noteID FROM section_group WHERE id = (${groupOfAudio})`
            return [
                folderChain(column, `SELECT folderID FROM note WHERE id = (${noteOfAudio})`, [id]),
                restoreRow(column, "note", noteOfAudio, [id]),
                restoreRow(column, "section_group", groupOfAudio, [id]),
                restoreRow(column, "audio_file", "SELECT ?", [id]),
            ]
        }
        case "media_file": {
            const groupOfMedia = "SELECT section_groupID FROM media_file WHERE id = ?"
            const noteOfMedia = `SELECT noteID FROM section_group WHERE id = (${groupOfMedia})`
            return [
                folderChain(column, `SELECT folderID FROM note WHERE id = (${noteOfMedia})`, [id]),
                restoreRow(column, "note", noteOfMedia, [id]),
                restoreRow(column, "section_group", groupOfMedia, [id]),
                restoreRow(column, "media_file", "SELECT ?", [id]),
            ]
        }
        case "task": {
            const groupOfTask = `SELECT groupID FROM section WHERE id = (${SECTION_OF_TASK})`
            const noteOfTask = `SELECT noteID FROM section_group WHERE id = (${groupOfTask})`
            return [
                folderChain(column, `SELECT folderID FROM note WHERE id = (${noteOfTask})`, [id]),
                restoreRow(column, "note", noteOfTask, [id]),
                restoreRow(column, "section_group", groupOfTask, [id]),
                restoreRow(column, "section", SECTION_OF_TASK, [id]),
                {
                    sql: `UPDATE task SET ${column} = NULL WHERE ${column} IS NOT NULL AND id IN (
                            WITH RECURSIVE anc(id, parent) AS (
                                SELECT id, taskID FROM task WHERE id = ?
                                UNION
                                SELECT t.id, t.taskID FROM task t INNER JOIN anc ON t.id = anc.parent
                            ) SELECT id FROM anc)`,
                    params: [id],
                },
            ]
        }
    }
}

/**
 * Restores an item from the trash together with all its deleted ancestors
 * (folder chain, note, group, section, parent tasks), so it never stays orphaned.
 * Restoring an item that is not deleted is a no-op.
 * @param itemType Type of the item to restore.
 * @param itemID ID of the item to restore.
 * All the statements run in one transaction: on a name conflict nothing is restored.
 * @throws A "<TYPE>_EXISTS" error when an active item with the same name exists.
 * @category Database Queries
 */
export async function restoreDBItem(itemType: DBItemType, itemID: number) {
    assertItemType(itemType)

    try {
        const tx = new Transaction()
        for (const statement of buildRestoreStatements(itemType, itemID))
            tx.add(statement.sql, statement.params)
        await tx.run()
    } catch (error: unknown) {
        handleDBError(error, itemType.toUpperCase(), { UNIQUE: RESTORE_UNIQUE_MESSAGE() })
    }
}

/**
 * Permanently deletes an item that is in the trash (foreign keys cascade to its children).
 * An item that is not in the trash is left untouched.
 * @param itemType Type of the item to delete.
 * @param itemID ID of the item to delete.
 * @category Database Queries
 */
export async function purgeDBItem(itemType: DBItemType, itemID: number) {
    assertItemType(itemType)
    try {
        const db = await getDB()
        await db.execute(`DELETE FROM ${itemType} WHERE id=? AND deleted_at IS NOT NULL`, [itemID])
    } catch (error: unknown) {
        throw createError(`${itemType.toUpperCase()}_PURGE_FAILED`, i18n.t("errors.trash.purge", { message: getErrorMessage(error) }))
    }
}

/**
 * Permanently deletes every trashed item of a workspace (top-level items first, children cascade),
 * all in one transaction.
 * @param workspaceId The ID of the workspace.
 * @category Database Queries
 */
export async function emptyDBTrash(workspaceId: number) {
    try {
        const tx = new Transaction()
        tx.add('DELETE FROM folder WHERE workspaceID = ? AND deleted_at IS NOT NULL', [workspaceId])
        tx.add('DELETE FROM note WHERE workspaceID = ? AND deleted_at IS NOT NULL', [workspaceId])
        tx.add(
            `DELETE FROM section_group WHERE deleted_at IS NOT NULL
             AND noteID IN (SELECT id FROM note WHERE workspaceID = ?)`, [workspaceId])
        tx.add(
            `DELETE FROM section WHERE deleted_at IS NOT NULL AND groupID IN (
                SELECT g.id FROM section_group g INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ?)`, [workspaceId])
        tx.add(
            `DELETE FROM task WHERE deleted_at IS NOT NULL AND sectionID IN (
                SELECT s.id FROM section s
                INNER JOIN section_group g ON g.id = s.groupID
                INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ?)`, [workspaceId])
        tx.add(
            `DELETE FROM audio_file WHERE deleted_at IS NOT NULL AND section_groupID IN (
                SELECT g.id FROM section_group g INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ?)`, [workspaceId])
        tx.add(
            `DELETE FROM media_file WHERE deleted_at IS NOT NULL AND section_groupID IN (
                SELECT g.id FROM section_group g INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ?)`, [workspaceId])
        tx.add('DELETE FROM note_template WHERE workspaceID = ? AND deleted_at IS NOT NULL', [workspaceId])
        await tx.run()
    } catch (error: unknown) {
        throw createError("TRASH_EMPTY_FAILED", i18n.t("errors.trash.empty", { message: getErrorMessage(error) }))
    }
}

// Every table with a trash, children before parents (a cascade then never hides a row that is still to be counted).
// The COUNT queries stay (instead of the rows affected by the DELETEs): the rows deleted by a cascade of the same statement
// (e.g. trashed subtasks) would not be counted the same way, and the totals must keep their meaning.

/**
 * Permanently deletes everything that has been in the trash for more than `days` days, in ALL workspaces
 * (trashed workspaces included), all in one transaction. Archived items are not in the trash and are never touched.
 * Children of a deleted item go with it through the foreign keys, but only the items that were themselves in the trash count.
 * @param days Age in days (a positive integer); anything else deletes nothing.
 * @returns How many trashed items were deleted.
 * @throws A createError('TRASH_EMPTY_FAILED') error when a query fails (nothing is deleted).
 * @category Database Queries
 */
export async function purgeDBTrashOlderThan(days: number): Promise<number> {
    if (!Number.isInteger(days) || days <= 0) return 0
    try {
        const db = await getDB()
        // deleted_at is written with datetime('now','localtime'): same format and time zone as the cutoff
        const cutoff = `datetime('now', 'localtime', ?)`
        const modifier = `-${days} days`
        const [counts] = await db.select<Record<string, number>[]>(
            `SELECT ${TRASHABLE_TABLES.map(table => `(SELECT COUNT(*) FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}) AS ${table}`).join(", ")}`,
            TRASHABLE_TABLES.map(() => modifier))
        const total = TRASHABLE_TABLES.reduce((sum, table) => sum + (counts?.[table] ?? 0), 0)
        if (total === 0) return 0

        const tx = new Transaction()
        for (const table of TRASHABLE_TABLES)
            tx.add(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`, [modifier])
        await tx.run()
        return total
    } catch (error: unknown) {
        throw createError("TRASH_EMPTY_FAILED", i18n.t("errors.trash.empty", { message: getErrorMessage(error) }))
    }
}
