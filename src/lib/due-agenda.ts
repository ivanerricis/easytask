import { addDays, fromDueDate, toDueDate } from "@/lib/due-date"

type Dated = { due_date: string, due_time: string | null }

/** One row of the agenda: a day with its tasks, or a run of consecutive days with none. */
export type AgendaRow<T> =
    | { type: "day", date: string, tasks: T[] }
    | { type: "empty", from: string, to: string }

export type Agenda<T> = {
    /** The Monday of the week. */
    weekStart: string
    weekEnd: string
    /** Open tasks due before the week: only for the current week (older overdue tasks must not disappear), else empty. */
    overdue: T[]
    rows: AgendaRow<T>[]
}

/** The Monday (YYYY-MM-DD) of the week that holds a date. */
export function weekStartOf(date: string): string {
    const day = fromDueDate(date).getDay() // 0 = Sunday
    return addDays(date, -((day + 6) % 7))
}

const byMoment = (a: Dated, b: Dated) =>
    a.due_date.localeCompare(b.due_date) || (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99")

/**
 * The agenda of a week (Monday to Sunday): its days with their tasks (those with a time first), the days without any
 * collapsed in runs. When the week is the current one, every task due before it is listed apart as "overdue".
 * @param tasks The open tasks (any date); only the ones of the week, and the older ones for the current week, are used.
 * @param weekStart The Monday of the week to show.
 * @param today Today, YYYY-MM-DD.
 */
export function buildAgenda<T extends Dated>(tasks: readonly T[], weekStart: string, today: string): Agenda<T> {
    const weekEnd = addDays(weekStart, 6)
    const sorted = [...tasks].sort(byMoment)
    const overdue = weekStart === weekStartOf(today) ? sorted.filter(task => task.due_date < weekStart) : []
    const rows: AgendaRow<T>[] = []
    for (let offset = 0; offset < 7; offset++) {
        const date = addDays(weekStart, offset)
        const day = sorted.filter(task => task.due_date === date)
        const last = rows[rows.length - 1]
        if (day.length > 0) rows.push({ type: "day", date, tasks: day })
        else if (last?.type === "empty") last.to = date
        else rows.push({ type: "empty", from: date, to: date })
    }
    return { weekStart, weekEnd, overdue, rows }
}

/** Today, as YYYY-MM-DD. */
export const todayOf = (now: Date) => toDueDate(now)
