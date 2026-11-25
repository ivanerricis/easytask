import { useEffect, useState } from "react"
import { getDBDueTasks, type DueTask } from "@/db/queries/due"
import { reportError } from "@/lib/report-error"
import { addDays, dueStatus, toDueDate } from "@/lib/due-date"
import { useNow } from "@/hooks/use-now"

/** How many days ahead the view looks. */
export const DUE_HORIZON_DAYS = 7

/** Counts what is overdue or due today (for a badge): the tasks of the list that need attention now. */
export function countDueNow(tasks: readonly DueTask[], now: Date): number {
    return tasks.filter(task => { const status = dueStatus(task, now); return status === "overdue" || status === "today" }).length
}

/** Loads the overdue and upcoming tasks (a week ahead) and refreshes them every minute with the clock. */
export function useDueTasks(workspaceId?: number): DueTask[] | null {
    const now = useNow()
    const [tasks, setTasks] = useState<DueTask[] | null>(null)
    const today = toDueDate(now)
    const minute = Math.floor(now.getTime() / 60_000)
    useEffect(() => {
        let cancelled = false
        getDBDueTasks(addDays(today, DUE_HORIZON_DAYS), workspaceId)
            .then(list => { if (!cancelled) setTasks(list) })
            .catch(error => reportError(error))
        return () => { cancelled = true }
    }, [today, workspaceId, minute])
    return tasks
}
