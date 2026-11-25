import { createError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import i18n from "@/i18n"
import { getDB } from "../dbManager"

/**
 * The rows hidden from the notes: a task (or a subtask of one) in the trash or archived, a folder (or a subfolder) in the trash or archived.
 * Starts a query (a WITH clause): the statements of the "visible tasks" views of the workspace share it.
 */
export const HIDDEN_ROWS_CTE = `
            WITH RECURSIVE hidden_task(id) AS (
                SELECT id FROM task WHERE deleted_at IS NOT NULL OR archived_at IS NOT NULL
                UNION
                SELECT t.id FROM task t INNER JOIN hidden_task h ON t.taskID = h.id
            ), hidden_folder(id) AS (
                SELECT id FROM folder WHERE deleted_at IS NOT NULL OR archived_at IS NOT NULL
                UNION
                SELECT f.id FROM folder f INNER JOIN hidden_folder h ON f.folderID = h.id
            )`

/** The tasks (`t`) with their section (`s`), group (`g`), note (`n`) and workspace (`w`); the rows in the trash or archived are cut out by {@link VISIBLE_TASKS_WHERE}. */
export const VISIBLE_TASKS_FROM = `
            FROM task t
            INNER JOIN section s ON s.id = t.sectionID AND s.deleted_at IS NULL AND s.archived_at IS NULL
            INNER JOIN section_group g ON g.id = s.groupID AND g.deleted_at IS NULL AND g.archived_at IS NULL
            INNER JOIN note n ON n.id = g.noteID AND n.deleted_at IS NULL AND n.archived_at IS NULL AND n.workspaceID IS NOT NULL
            INNER JOIN workspace w ON w.id = n.workspaceID AND w.deleted_at IS NULL`

/** The condition of a task that is not hidden (itself, an ancestor task or its folder in the trash or archived). Needs {@link HIDDEN_ROWS_CTE} and {@link VISIBLE_TASKS_FROM}. */
export const VISIBLE_TASKS_WHERE = `t.deleted_at IS NULL AND t.archived_at IS NULL
              AND t.id NOT IN (SELECT id FROM hidden_task)
              AND (n.folderID IS NULL OR n.folderID NOT IN (SELECT id FROM hidden_folder))`

/** A task with a due date, for the "due" views: where it is (note, workspace) and when it is due. */
export type DueTask = {
    id: number
    text: string
    due_date: string
    due_time: string | null
    noteID: number
    noteName: string
    /** The title of the section; null for a task directly in a group (then `groupName` may name it). */
    sectionTitle: string | null
    groupName: string | null
    workspaceID: number
    workspaceName: string
}

/**
 * The open tasks (not completed) that are overdue or due up to a date, soonest first, over all the workspaces or one of them.
 * A task that is hidden (itself or an ancestor task, its section, group, note, folder or workspace in the trash or archived) is not listed.
 * @param untilDate The last due date (YYYY-MM-DD) to list; the overdue ones (any earlier date) are always included.
 * @param workspaceId Only the tasks of this workspace (default: every workspace).
 * @category Database Queries
 */
export async function getDBDueTasks(untilDate: string, workspaceId?: number): Promise<DueTask[]> {
    try {
        const db = await getDB()
        return await db.select<DueTask[]>(`
            ${HIDDEN_ROWS_CTE}
            SELECT t.id, t.text, t.due_date, t.due_time, n.id AS noteID, n.name AS noteName, s.title AS sectionTitle, g.name AS groupName, w.id AS workspaceID, w.name AS workspaceName
            ${VISIBLE_TASKS_FROM}
            WHERE t.due_date IS NOT NULL AND t.due_date <= ? AND t.completed = 0
              AND ${VISIBLE_TASKS_WHERE}
              ${workspaceId === undefined ? "" : "AND w.id = ?"}
            ORDER BY t.due_date, COALESCE(t.due_time, '99:99'), t.id`,
            workspaceId === undefined ? [untilDate] : [untilDate, workspaceId])
    } catch (error: unknown) {
        throw createError("DUE_LOAD_FAILED", i18n.t("errors.due.load", { message: getErrorMessage(error) }))
    }
}
