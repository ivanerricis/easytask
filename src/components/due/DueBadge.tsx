import { useTranslation } from "react-i18next"
import { CalendarCheck, CalendarClock, CalendarDays, CalendarX2 } from "lucide-react"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"
import { dueLabel } from "./due-label"

type DueBadgeProps = {
    task: { due_date?: string | null, due_time?: string | null, completed?: boolean | number }
    className?: string
}

/**
 * The due date of a task on its row. Neutral normally; "soon" (today, tomorrow) and "overdue" are colored AND have their own
 * icon, and the status is in the accessible name, so the color is never the only signal. A completed task is neutral with a
 * check mark: it is never overdue.
 */
export function DueBadge({ task, className }: DueBadgeProps) {
    const { t, i18n } = useTranslation()
    const now = useNow()
    const label = dueLabel(task, t, i18n.language, now)
    if (!label) return null
    const done = !!task.completed
    const status = done ? "done" : label.status
    const Icon = status === "done" ? CalendarCheck : status === "overdue" ? CalendarX2 : status === "later" ? CalendarDays : CalendarClock
    const name = status === "overdue" ? t("tasks.due.overdueOn", { when: label.text }) : t("tasks.due.dueOn", { when: label.text })
    return (
        <TooltipCustom text={name}>
            <span
                data-testid="due-badge"
                data-due-status={status}
                role="img"
                aria-label={name}
                className={cn(
                    "flex shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums",
                    status === "overdue" ? "font-medium text-destructive" : status === "today" || status === "tomorrow" ? "font-medium text-warning" : "text-muted-foreground",
                    className,
                )}>
                <Icon className="size-3.5" aria-hidden />
                <span aria-hidden>{label.text}</span>
            </span>
        </TooltipCustom>
    )
}
