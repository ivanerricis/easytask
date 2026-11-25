import type { TFunction } from "i18next"
import { addDays, dueStatus, formatDueDate, formatDueTime, toDueDate, type DueStatus } from "@/lib/due-date"

type DueTask = { due_date?: string | null, due_time?: string | null, completed?: boolean | number }

/** The short text of a due date ("Today, 14:30", "Tomorrow", "Yesterday", "12 Dec") and where it stands (`none` when the task is done). Null for a task without a date. */
export function dueLabel(task: DueTask, t: TFunction, language: string, now: Date): { text: string, status: DueStatus } | null {
    const date = task.due_date
    if (!date) return null
    const today = toDueDate(now)
    const day = date === today ? t("tasks.due.today")
        : date === addDays(today, 1) ? t("tasks.due.tomorrow")
        : date === addDays(today, -1) ? t("tasks.due.yesterday")
        : formatDueDate(date, language, now)
    const text = task.due_time ? t("tasks.due.at", { date: day, time: formatDueTime(task.due_time, language) }) : day
    return { text, status: dueStatus(task, now) }
}
