import { dueMoment, toDueDate } from "@/lib/due-date"

/** The part of a due task the notifications need. */
export type NotifiableTask = { id: number, due_date: string, due_time: string | null }

/** What was notified: task id -> the due date and time notified (a task whose date or time changed is notified again). */
export type NotifiedMap = Record<string, string>

/** A timed due date is notified on its own while it is at most this old; an older one (the computer slept) goes in the summary. */
export const RECENT_MS = 10 * 60_000

/** The due date and time of a task as one text: the identity of what is notified. */
export const dueKey = (task: { due_date: string, due_time: string | null }) => `${task.due_date}|${task.due_time ?? ""}`

/** Whether this due date and time was already notified. */
export const isNotified = (notified: NotifiedMap, task: NotifiableTask) => notified[String(task.id)] === dueKey(task)

export type NotificationPlan<T extends NotifiableTask> = {
    /** Timed due dates that have just come: one notification each. */
    individual: T[]
    /** Overdue and today's due dates for the one summary notification. */
    summary: T[]
}

/**
 * What to notify now. A due date with a time is notified at that time, on its own; a due date without a time goes in the
 * summary, sent when the app starts (`startup`) and when the day changes (`newDay`). A timed due date that was missed (the
 * app was closed, the computer asleep) is added to the summary. What was already notified is left out.
 * @param tasks The open tasks that are overdue or due today.
 * @param notified What was notified before.
 * @param now The current time.
 * @param startup True for the first pass after the app started.
 * @param newDay True when the day changed since the last pass.
 */
export function planNotifications<T extends NotifiableTask>(tasks: readonly T[], notified: NotifiedMap, now: Date, startup: boolean, newDay: boolean): NotificationPlan<T> {
    const individual: T[] = []
    const summary: T[] = []
    const today = toDueDate(now)
    const summaryDay = startup || newDay
    for (const task of tasks) {
        if (isNotified(notified, task) || task.due_date > today) continue
        if (task.due_time) {
            const age = now.getTime() - dueMoment(task.due_date, task.due_time).getTime()
            if (age < 0) continue
            if (age <= RECENT_MS && !startup) individual.push(task)
            else summary.push(task)
        } else if (summaryDay) {
            summary.push(task)
        }
    }
    return { individual, summary }
}

/** The notified map with these tasks added, and the entries older than a month dropped (their date is long past). */
export function markNotified(notified: NotifiedMap, tasks: readonly NotifiableTask[], now: Date): NotifiedMap {
    const limit = toDueDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30))
    const next: NotifiedMap = {}
    for (const [id, key] of Object.entries(notified)) if (key.slice(0, 10) >= limit) next[id] = key
    for (const task of tasks) next[String(task.id)] = dueKey(task)
    return next
}
