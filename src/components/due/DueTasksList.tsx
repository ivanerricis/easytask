import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import type { DueTask } from "@/db/queries/due"
import { dueStatus } from "@/lib/due-date"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"
import { DueBadge } from "./DueBadge"
import { useDueTasks } from "./use-due-tasks"

type DueTasksListProps = {
    /** Only the tasks of this workspace (default: every workspace). */
    workspaceId?: number
    /** Names the workspace of each task (the view across workspaces). */
    showWorkspace?: boolean
    className?: string
}

/** The tasks that are overdue, due today and due in the next 7 days, grouped; each row names its note (and workspace). */
export function DueTasksList({ workspaceId, showWorkspace = false, className }: DueTasksListProps) {
    const { t } = useTranslation()
    const now = useNow()
    const tasks = useDueTasks(workspaceId)
    const groups = useMemo(() => {
        const result = { overdue: [] as DueTask[], today: [] as DueTask[], week: [] as DueTask[] }
        for (const task of tasks ?? []) {
            const status = dueStatus(task, now)
            if (status === "overdue") result.overdue.push(task)
            else if (status === "today") result.today.push(task)
            else result.week.push(task)
        }
        return result
    }, [tasks, now])

    if (tasks === null) return null
    if (tasks.length === 0) return <p className={cn("p-3 text-sm text-muted-foreground", className)}>{t("tasks.dueView.empty")}</p>

    const sections = [
        { key: "overdue", title: t("tasks.dueView.overdue"), tasks: groups.overdue },
        { key: "today", title: t("tasks.dueView.today"), tasks: groups.today },
        { key: "week", title: t("tasks.dueView.week"), tasks: groups.week },
    ].filter(section => section.tasks.length > 0)

    return (
        <div className={cn("flex flex-col gap-3", className)} data-testid="due-list">
            {sections.map(section => (
                <section key={section.key} aria-label={section.title} data-due-section={section.key} className="flex flex-col gap-1">
                    <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.title} <span className="tabular-nums">({section.tasks.length})</span>
                    </h3>
                    <ul className="flex flex-col">
                        {section.tasks.map(task => (
                            <li key={task.id} data-testid="due-item" className="flex items-start justify-between gap-2 rounded-xs px-2 py-1 hover:bg-accent">
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm">{task.text}</span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        {showWorkspace ? `${task.workspaceName} › ${task.noteName}` : task.noteName}
                                    </span>
                                </div>
                                <DueBadge task={task} className="mt-0.5" />
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    )
}
