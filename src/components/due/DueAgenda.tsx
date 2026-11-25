import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { getDBDueTasks, type DueTask } from "@/db/queries/due"
import { Button } from "@/components/ui/button"
import { reportError } from "@/lib/report-error"
import { addDays, dueStatus, formatDueTime, fromDueDate, type DueStatus } from "@/lib/due-date"
import { buildAgenda, todayOf, weekStartOf } from "@/lib/due-agenda"
import { useNow } from "@/hooks/use-now"
import { cn } from "@/lib/utils"

type DueAgendaProps = {
    workspaceId?: number
    /** A task was chosen (click or Enter). */
    onOpenTask: (task: DueTask) => void
    className?: string
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const BAR: Record<DueStatus, string> = {
    overdue: "bg-destructive",
    today: "bg-warning",
    tomorrow: "bg-warning",
    later: "bg-muted-foreground/50",
    none: "bg-muted-foreground/50",
}

/** "Note › Section" (or the group name for a task directly in a group). */
const pathOf = (task: DueTask) => [task.noteName, task.sectionTitle || task.groupName].filter(Boolean).join(" › ")

/**
 * The due tasks as an agenda by day: one week at a time (Monday to Sunday) with a day label on the left and its tasks on the
 * right, runs of days without tasks collapsed, and, on the current week, the older overdue tasks in a block on top.
 * Left and right arrows change the week, Home goes back to today's week; Enter on a task opens it.
 */
export function DueAgenda({ workspaceId, onOpenTask, className }: DueAgendaProps) {
    const { t, i18n } = useTranslation()
    const now = useNow()
    const today = todayOf(now)
    const currentWeek = weekStartOf(today)
    const [weekStart, setWeekStart] = useState(currentWeek)
    const weekEnd = addDays(weekStart, 6)
    const [tasks, setTasks] = useState<DueTask[] | null>(null)
    const minute = Math.floor(now.getTime() / 60_000)

    useEffect(() => {
        let cancelled = false
        getDBDueTasks(weekEnd, workspaceId)
            .then(list => { if (!cancelled) setTasks(list) })
            .catch(error => reportError(error))
        return () => { cancelled = true }
    }, [weekEnd, workspaceId, minute])

    const agenda = useMemo(() => buildAgenda(tasks ?? [], weekStart, today), [tasks, weekStart, today])
    const language = i18n.language
    const dayName = (date: string) => capitalize(new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric" }).format(fromDueDate(date)).replace(".", ""))
    const monthDay = (date: string) => new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(fromDueDate(date))
    const range = `${monthDay(agenda.weekStart)} – ${monthDay(agenda.weekEnd)} ${fromDueDate(agenda.weekEnd).getFullYear()}`
    const relative = (date: string) => date === addDays(today, -1) ? t("tasks.due.yesterday") : date === today ? t("tasks.due.today") : date === addDays(today, 1) ? t("tasks.due.tomorrow") : ""

    const go = (next: string) => setWeekStart(next)
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key === "ArrowLeft") { event.preventDefault(); go(addDays(weekStart, -7)) }
        else if (event.key === "ArrowRight") { event.preventDefault(); go(addDays(weekStart, 7)) }
        else if (event.key === "Home") { event.preventDefault(); go(currentWeek) }
    }

    const taskRow = (task: DueTask, status: DueStatus) => (
        <button
            key={task.id}
            type="button"
            data-testid="due-item"
            onClick={() => onOpenTask(task)}
            className="flex w-full items-stretch gap-2 rounded-xs px-1 py-1 text-left outline-hidden hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring">
            <span aria-hidden className={cn("w-1 shrink-0 rounded-full", BAR[status])} />
            <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{task.due_time ? formatDueTime(task.due_time, language) : ""}</span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{task.text}</span>
                <span className="truncate text-xs text-muted-foreground">{pathOf(task)}</span>
            </span>
            {status === "overdue" && <span className="sr-only">{t("tasks.dueView.overdue")}</span>}
        </button>
    )

    return (
        <div className={cn("flex min-h-0 flex-col gap-2", className)} onKeyDown={onKeyDown} data-testid="due-agenda">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon" aria-label={t("tasks.dueView.previousWeek")} onClick={() => go(addDays(weekStart, -7))}><ChevronLeft /></Button>
                    <span className="min-w-40 text-center text-sm font-medium tabular-nums" aria-live="polite" data-testid="due-range">{range}</span>
                    <Button type="button" variant="outline" size="icon" aria-label={t("tasks.dueView.nextWeek")} onClick={() => go(addDays(weekStart, 7))}><ChevronRight /></Button>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={weekStart === currentWeek} onClick={() => go(currentWeek)}>{t("tasks.due.today")}</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t">
                {agenda.overdue.length > 0 &&
                    <section data-due-section="overdue" aria-label={t("tasks.dueView.overdue")} className="grid grid-cols-[6rem_1fr] gap-2 border-b py-2">
                        <h3 className="px-1 text-sm font-semibold text-destructive">{t("tasks.dueView.overdue")} <span className="tabular-nums">({agenda.overdue.length})</span></h3>
                        <div className="flex flex-col">{agenda.overdue.map(task => taskRow(task, "overdue"))}</div>
                    </section>}
                {agenda.rows.map(row => row.type === "empty"
                    ? (
                        <div key={row.from} data-due-empty className="grid grid-cols-[6rem_1fr] items-baseline gap-2 border-b py-2 text-xs text-muted-foreground">
                            <span className="px-1">{row.from === row.to ? dayName(row.from) : `${dayName(row.from)} – ${dayName(row.to)}`}</span>
                            <span>{t("tasks.dueView.none")}</span>
                        </div>
                    )
                    : (
                        <section key={row.date} data-due-day={row.date} aria-label={dayName(row.date)} className="grid grid-cols-[6rem_1fr] gap-2 border-b py-2">
                            <h3 className={cn("px-1 text-sm font-semibold", row.date < today ? "text-destructive" : row.date === today ? "text-warning" : "")}>
                                {dayName(row.date)}
                                {relative(row.date) && <span className="block text-xs font-normal">{relative(row.date)}</span>}
                            </h3>
                            <div className="flex flex-col">{row.tasks.map(task => taskRow(task, dueStatus(task, now)))}</div>
                        </section>
                    ))}
            </div>
        </div>
    )
}
