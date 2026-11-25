/**
 * Due dates of the tasks: a DATE (YYYY-MM-DD) with an optional TIME (HH:MM, local time, only together with a date).
 * Dates are plain strings in the local calendar: no time zone is involved, so a due date never shifts.
 */

export type DueValue = { date: string | null, time: string | null }

/** Where a due date stands now: `none` (no date or the task is done), `overdue`, `today`, `tomorrow` or `later`. */
export type DueStatus = "none" | "overdue" | "today" | "tomorrow" | "later"

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** True for a real calendar date written as YYYY-MM-DD (2025-02-30 is not). */
export function isValidDueDate(value: unknown): value is string {
    if (typeof value !== "string") return false
    const match = DATE_RE.exec(value)
    if (!match) return false
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
    const date = new Date(year, month - 1, day)
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/** True for a time written as HH:MM (00:00 to 23:59). */
export function isValidDueTime(value: unknown): value is string {
    return typeof value === "string" && TIME_RE.test(value)
}

/** Cleans a due date and time read from a file or the database: an invalid date is none, a time without a date is dropped. */
export function normalizeDue(date: unknown, time: unknown): DueValue {
    if (!isValidDueDate(date)) return { date: null, time: null }
    return { date, time: isValidDueTime(time) ? time : null }
}

const pad = (value: number) => String(value).padStart(2, "0")

/** A Date as YYYY-MM-DD in the local calendar. */
export function toDueDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A Date as HH:MM in local time. */
export function toDueTime(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** YYYY-MM-DD as a Date at local midnight (the date must be valid). */
export function fromDueDate(value: string): Date {
    const [year, month, day] = value.split("-").map(Number)
    return new Date(year, month - 1, day)
}

/** The date `days` after (or before, when negative) a YYYY-MM-DD date. */
export function addDays(value: string, days: number): string {
    const date = fromDueDate(value)
    date.setDate(date.getDate() + days)
    return toDueDate(date)
}

/** The moment a due date falls (a date without a time is the end of that day), as a Date. */
export function dueMoment(date: string, time: string | null): Date {
    const moment = fromDueDate(date)
    if (time && isValidDueTime(time)) {
        const [hours, minutes] = time.split(":").map(Number)
        moment.setHours(hours, minutes, 0, 0)
    } else {
        moment.setHours(23, 59, 59, 999)
    }
    return moment
}

/**
 * Where the due date of a task stands. A completed task is never overdue (`none`). A due date with a time is overdue once the
 * time has passed; one without a time is overdue from the next day.
 */
export function dueStatus(task: { due_date?: string | null, due_time?: string | null, completed?: boolean | number }, now: Date = new Date()): DueStatus {
    if (task.completed || !isValidDueDate(task.due_date)) return "none"
    const today = toDueDate(now)
    if (task.due_date < today) return "overdue"
    if (task.due_date === today) return dueMoment(task.due_date, task.due_time ?? null) < now ? "overdue" : "today"
    return task.due_date === addDays(today, 1) ? "tomorrow" : "later"
}

/** The date as a short text of the language ("12 Dec", with the year when it is not the current one). */
export function formatDueDate(date: string, language: string, now: Date = new Date()): string {
    const value = fromDueDate(date)
    const sameYear = value.getFullYear() === now.getFullYear()
    return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(value)
}

/** The time as the language writes it ("14:30" or "2:30 PM"). */
export function formatDueTime(time: string, language: string): string {
    const [hours, minutes] = time.split(":").map(Number)
    return new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes))
}
