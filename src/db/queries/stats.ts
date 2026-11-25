import { createError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import i18n from "@/i18n"
import { addDays } from "@/lib/due-date"
import { weekStartOf } from "@/lib/due-agenda"
import { buildWorkspaceStats, statsWeekStarts, type StatsCompletionRow, type StatsNoteRow, type StatsNoteTasksRow, type WorkspaceStats } from "@/lib/workspace-stats"
import { getDB } from "../dbManager"
import { getDBDueTasks, HIDDEN_ROWS_CTE, VISIBLE_TASKS_FROM, VISIBLE_TASKS_WHERE } from "./due"

/**
 * The statistics of a workspace: tasks completed per week (last weeks, from `task.completed_at`), progress and last edit of every
 * note, notes not edited for a while, overdue tasks and tasks due this week. Tasks and notes in the trash or archived do not count.
 * @param workspaceId The workspace.
 * @param today Today, YYYY-MM-DD (local).
 * @category Database Queries
 */
export async function getDBWorkspaceStats(workspaceId: number, today: string): Promise<WorkspaceStats> {
    try {
        const db = await getDB()
        const since = statsWeekStarts(today)[0]
        const [notes, noteTasks, completions, due] = await Promise.all([
            db.select<StatsNoteRow[]>(`
                ${HIDDEN_ROWS_CTE}
                SELECT n.id, n.name, n.edit_date FROM note n
                WHERE n.workspaceID = ? AND n.deleted_at IS NULL AND n.archived_at IS NULL
                  AND (n.folderID IS NULL OR n.folderID NOT IN (SELECT id FROM hidden_folder))`, [workspaceId]),
            db.select<StatsNoteTasksRow[]>(`
                ${HIDDEN_ROWS_CTE}
                SELECT n.id AS noteID, COUNT(*) AS total, COALESCE(SUM(t.completed), 0) AS done, MAX(t.edit_date) AS lastTaskEdit
                ${VISIBLE_TASKS_FROM}
                WHERE w.id = ? AND ${VISIBLE_TASKS_WHERE}
                GROUP BY n.id`, [workspaceId]),
            db.select<StatsCompletionRow[]>(`
                ${HIDDEN_ROWS_CTE}
                SELECT SUBSTR(t.completed_at, 1, 10) AS day, COUNT(*) AS count
                ${VISIBLE_TASKS_FROM}
                WHERE w.id = ? AND t.completed = 1 AND t.completed_at >= ? AND ${VISIBLE_TASKS_WHERE}
                GROUP BY day`, [workspaceId, since]),
            getDBDueTasks(addDays(weekStartOf(today), 6), workspaceId),
        ])
        return buildWorkspaceStats(today, notes, noteTasks, completions, due)
    } catch (error: unknown) {
        throw createError("STATS_LOAD_FAILED", i18n.t("errors.stats.load", { message: getErrorMessage(error) }))
    }
}
