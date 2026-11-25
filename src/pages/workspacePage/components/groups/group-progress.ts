import type { Group, Task } from "@/types/types"
import { taskSections } from "@/lib/group-sections"
import { GROUP_COLOR_DUE, GROUP_COLOR_PROGRESS } from "@/lib/colors"
import { dueStatus } from "@/lib/due-date"

/** Completion of a list of tasks: every task and every nested subtask counts as one unit. */
export const countTasks = (tasks: Task[]): { done: number, total: number } => {
    let done = 0
    let total = 0
    for (const task of tasks) {
        total += 1
        if (task.completed) done += 1
        const nested = countTasks(task.subtasks ?? [])
        done += nested.done
        total += nested.total
    }
    return { done, total }
}

/**
 * Completion of a group: every task and every subtask counts as one unit (the tasks directly in the group included); no tasks = 0%.
 * Not the same definition as the progress bar of a section (see `getSectionCompletionPercent`): there only top-level tasks count,
 * a task with all subtasks done counts as done, and an empty section is 100%.
 */
export const getGroupProgress = (group: Group): { done: number, total: number, percent: number } => {
    let done = 0
    let total = 0
    for (const section of taskSections(group)) {
        const counts = countTasks(section.tasks)
        done += counts.done
        total += counts.total
    }
    return { done, total, percent: total === 0 ? 0 : (done / total) * 100 }
}

/** The tints of the "Automatic" color of a group, from the group palette: green, yellow, red. */
export const PROGRESS_COLORS = { done: "#3cb44b", started: "#d9bf01", none: "#e6194b" } as const

/**
 * The "Due dates" color of a group from the nearest state of its open tasks (subtasks included, completed ones never count):
 * red when one is overdue, yellow when one is due today or tomorrow, green when they are all later, none without a due date.
 */
export const dueGroupColor = (group: Group, now: Date): string | null => {
    let worst = "none" as ReturnType<typeof dueStatus>
    const rank = { none: 0, later: 1, tomorrow: 2, today: 2, overdue: 3 } as const
    const visit = (tasks: Task[]) => {
        for (const task of tasks) {
            const status = dueStatus(task, now)
            if (rank[status] > rank[worst]) worst = status
            visit(task.subtasks ?? [])
        }
    }
    for (const section of taskSections(group)) visit(section.tasks)
    return worst === "overdue" ? PROGRESS_COLORS.none : worst === "today" || worst === "tomorrow" ? PROGRESS_COLORS.started : worst === "later" ? PROGRESS_COLORS.done : null
}

/**
 * The color a group is drawn with: its own one, or for the "Automatic" one the tint of its progress (green: no tasks or all done,
 * yellow: at least one done, red: none done). No color gives null. Pass `progress` when it is already computed.
 */
export const resolveGroupColor = (group: Group, progress?: { done: number, total: number }, now: Date = new Date()): string | null => {
    if (group.color === GROUP_COLOR_DUE) return dueGroupColor(group, now)
    if (group.color !== GROUP_COLOR_PROGRESS) return group.color ?? null
    const { done, total } = progress ?? getGroupProgress(group)
    if (done >= total) return PROGRESS_COLORS.done
    return done > 0 ? PROGRESS_COLORS.started : PROGRESS_COLORS.none
}
