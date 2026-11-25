import { addDays, dueStatus, fromDueDate } from "@/lib/due-date"
import { weekStartOf } from "@/lib/due-agenda"
import type { DueTask } from "@/db/queries/due"

/** How many weeks (the current one included) the chart of the completed tasks shows. */
export const STATS_WEEKS = 12
/** A note nobody edited for this many days is "stale". */
export const STALE_DAYS = 30

/** A note of the workspace, as stored. */
export type StatsNoteRow = { id: number, name: string, edit_date: string }
/** The visible tasks of a note, counted (subtasks included), with the last edit date among them. */
export type StatsNoteTasksRow = { noteID: number, total: number, done: number, lastTaskEdit: string | null }
/** The tasks completed on a day (YYYY-MM-DD). */
export type StatsCompletionRow = { day: string, count: number }

export type NoteStat = { id: number, name: string, done: number, total: number, lastEdit: string }
export type WeekStat = { start: string, count: number }

/** The statistics of a workspace, ready to draw. */
export type WorkspaceStats = {
    /** The last weeks (Monday-based), the oldest first, the current one last. */
    weeks: WeekStat[]
    /** The tasks completed in the weeks shown. */
    completedInRange: number
    doneTotal: number
    openTotal: number
    /** Progress of every note, the least complete first (notes without tasks last). */
    notes: NoteStat[]
    /** The notes not edited for {@link STALE_DAYS} days or more, the oldest first, with the days passed. */
    stale: (NoteStat & { days: number })[]
    overdue: DueTask[]
    /** Open tasks due from today to the end of the current week, not overdue. */
    dueThisWeek: DueTask[]
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
    return Math.round((fromDueDate(to).getTime() - fromDueDate(from).getTime()) / 86_400_000)
}

/** The Mondays of the weeks of the chart, the oldest first. */
export function statsWeekStarts(today: string, weeks = STATS_WEEKS): string[] {
    const current = weekStartOf(today)
    return Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)))
}

/**
 * Builds the statistics from the rows of the database.
 * @param today Today, YYYY-MM-DD.
 * @param due The open tasks that are overdue or due up to the end of the current week.
 */
export function buildWorkspaceStats(
    today: string,
    notes: readonly StatsNoteRow[],
    noteTasks: readonly StatsNoteTasksRow[],
    completions: readonly StatsCompletionRow[],
    due: readonly DueTask[],
    now: Date = new Date(),
): WorkspaceStats {
    const starts = statsWeekStarts(today)
    const counts = new Map(starts.map(start => [start, 0]))
    for (const { day, count } of completions) {
        const start = weekStartOf(day)
        if (counts.has(start)) counts.set(start, counts.get(start)! + count)
    }
    const weeks = starts.map(start => ({ start, count: counts.get(start)! }))

    const tasksOf = new Map(noteTasks.map(row => [row.noteID, row]))
    const stats: NoteStat[] = notes.map(note => {
        const row = tasksOf.get(note.id)
        const lastEdit = row?.lastTaskEdit && row.lastTaskEdit > note.edit_date ? row.lastTaskEdit : note.edit_date
        return { id: note.id, name: note.name, done: row?.done ?? 0, total: row?.total ?? 0, lastEdit }
    })
    const ratio = (note: NoteStat) => note.total === 0 ? 2 : note.done / note.total
    const byProgress = [...stats].sort((a, b) => ratio(a) - ratio(b) || b.total - a.total || a.name.localeCompare(b.name))
    const stale = stats
        .map(note => ({ ...note, days: daysBetween(note.lastEdit, today) }))
        .filter(note => note.days >= STALE_DAYS)
        .sort((a, b) => b.days - a.days)

    const weekEnd = addDays(weekStartOf(today), 6)
    const overdue = due.filter(task => dueStatus(task, now) === "overdue")
    const dueThisWeek = due.filter(task => dueStatus(task, now) !== "overdue" && task.due_date <= weekEnd)

    return {
        weeks,
        completedInRange: weeks.reduce((sum, week) => sum + week.count, 0),
        doneTotal: stats.reduce((sum, note) => sum + note.done, 0),
        openTotal: stats.reduce((sum, note) => sum + note.total - note.done, 0),
        notes: byProgress,
        stale,
        overdue,
        dueThisWeek,
    }
}
