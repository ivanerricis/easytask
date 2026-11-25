import { useState } from "react"
import { useTranslation } from "react-i18next"
import { LoadingDots } from "@/components/loading-dots"
import { Progress } from "@/components/ui/progress"
import { useWorkspace } from "@/contexts/use-workspace"
import { useTabsActions } from "@/contexts/use-tabs"
import { formatDueDate } from "@/lib/due-date"
import { requestOpenTask } from "@/lib/open-task-request"
import { cn } from "@/lib/utils"
import type { DueTask } from "@/db/queries/due"
import { STATS_WEEKS, STALE_DAYS, type NoteStat, type WorkspaceStats } from "@/lib/workspace-stats"
import { useWorkspaceStats } from "./use-workspace-stats"

const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-muted-foreground"
const rowButton = "flex w-full cursor-pointer items-center gap-2 rounded-xs px-1 py-0.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"

/** How many rows a list shows before "show all". */
export const STATS_LIST_LIMIT = 6

function Section({ title, hint, children }: { title: string, hint?: string, children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-1.5">
            <h3 className={sectionTitle} title={hint}>{title}</h3>
            {children}
        </section>
    )
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>

/** The rows of a list: the first ones, and a button that shows all of them (and goes back). */
function Expandable<T>({ items, render, limit = STATS_LIST_LIMIT, className }: { items: readonly T[], render: (item: T) => React.ReactNode, limit?: number, className?: string }) {
    const { t } = useTranslation()
    const [all, setAll] = useState(false)
    const shown = all ? items : items.slice(0, limit)
    return (
        <ul className={cn("flex flex-col gap-0.5", className)}>
            {shown.map(render)}
            {items.length > limit && (
                <li>
                    <button type="button" aria-expanded={all} onClick={() => setAll(value => !value)} className="cursor-pointer rounded-xs px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        {all ? t("tasks.stats.showLess") : t("tasks.stats.showAll", { count: items.length })}
                    </button>
                </li>
            )}
        </ul>
    )
}

/** The tasks completed in each of the last weeks, as bars (plain CSS: no animation, no library). */
function WeeklyChart({ stats }: { stats: WorkspaceStats }) {
    const { t, i18n } = useTranslation()
    const max = Math.max(1, ...stats.weeks.map(week => week.count))
    const shortDate = (date: string) => new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00`))
    return (
        <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{t("tasks.stats.completedInRange", { count: stats.completedInRange })}</p>
            <div role="list" aria-label={t("tasks.stats.chartLabel", { count: STATS_WEEKS })} className="flex h-36 items-end gap-1 border-b">
                {stats.weeks.map((week, index) => {
                    const current = index === stats.weeks.length - 1
                    const label = `${t("tasks.stats.weekOf", { date: shortDate(week.start) })}: ${t("tasks.stats.completedCount", { count: week.count })}`
                    return (
                        <div key={week.start} role="listitem" aria-label={label} title={label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                            <span aria-hidden className="mb-0.5 text-center text-xs leading-none tabular-nums text-muted-foreground">{week.count > 0 ? week.count : ""}</span>
                            <div
                                aria-hidden
                                className={cn("w-full rounded-t-xs", current ? "bg-primary" : "bg-primary/55", week.count === 0 && "min-h-px bg-muted-foreground/40")}
                                style={{ height: week.count === 0 ? undefined : `${Math.max(4, (week.count / max) * 88)}%` }}
                            />
                        </div>
                    )
                })}
            </div>
            <div aria-hidden className="flex gap-1">
                {stats.weeks.map((week, index) => (
                    <span key={week.start} className="relative h-4 min-w-0 flex-1">
                        {(index % 3 === 0 || index === stats.weeks.length - 1) && (
                            <span className={cn("absolute top-0 whitespace-nowrap text-xs leading-4 text-muted-foreground", index === stats.weeks.length - 1 ? "right-0" : "left-0")}>{shortDate(week.start)}</span>
                        )}
                    </span>
                ))}
            </div>
        </div>
    )
}

function NoteRow({ note, onOpen, detail }: { note: NoteStat, onOpen: (id: number) => void, detail?: string }) {
    const { t } = useTranslation()
    const percent = note.total === 0 ? 0 : Math.round((note.done / note.total) * 100)
    return (
        <li>
            <button type="button" onClick={() => onOpen(note.id)} className="flex w-full cursor-pointer flex-col gap-1 rounded-xs px-1 py-0.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{note.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{detail ?? (note.total === 0 ? t("tasks.stats.noTasks") : `${note.done}/${note.total}`)}</span>
                </span>
                {detail === undefined && note.total > 0 && <Progress value={percent} aria-label={`${note.name}: ${note.done}/${note.total}`} className="h-1.5" />}
            </button>
        </li>
    )
}

function DueRow({ task, tone }: { task: DueTask, tone: "overdue" | "week" }) {
    const { i18n } = useTranslation()
    // The task opens on its note, selected and scrolled into view
    const open = () => requestOpenTask({ workspaceId: task.workspaceID, noteId: task.noteID, taskId: task.id })
    return (
        <li>
            <button type="button" data-testid="stats-task" onClick={open} className={rowButton}>
                <span aria-hidden className={cn("h-4 w-1 shrink-0 rounded-full", tone === "overdue" ? "bg-destructive" : "bg-warning")} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate">{task.text}</span>
                    <span className="block truncate text-xs text-muted-foreground">{task.noteName}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDueDate(task.due_date, i18n.language)}</span>
            </button>
        </li>
    )
}

/**
 * The statistics of the current workspace: tasks completed per week, progress per note, notes not edited for a while, overdue tasks
 * and tasks due this week. A note opens in a tab; a task opens its note on it.
 */
export function StatsView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    const { openNote } = useTabsActions()
    const stats = useWorkspaceStats(currentWorkspace?.id)

    if (!stats) return <p role="status" className="p-3 text-sm text-muted-foreground">{t("tasks.stats.loading")}<LoadingDots /></p>

    const total = stats.doneTotal + stats.openTotal
    const count = (title: string, n: number) => n > 0 ? `${title} (${n})` : title
    return (
        <div className={cn("flex flex-col gap-6", className)}>
            <Section title={t("tasks.stats.completedPerWeek")}>
                <WeeklyChart stats={stats} />
            </Section>
            <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-6">
                    <Section title={t("tasks.stats.progress")}>
                        {stats.notes.length === 0
                            ? <Empty>{t("tasks.stats.noNotes")}</Empty>
                            : <>
                                <p className="text-sm text-muted-foreground">{t("tasks.stats.overall", { done: stats.doneTotal, total })}</p>
                                <Expandable items={stats.notes} limit={8} className="gap-1" render={note => <NoteRow key={note.id} note={note} onOpen={openNote} />} />
                            </>}
                    </Section>
                    <Section title={t("tasks.stats.stale")} hint={t("tasks.stats.staleHint", { days: STALE_DAYS })}>
                        {stats.stale.length === 0
                            ? <Empty>{t("tasks.stats.noStale")}</Empty>
                            : <Expandable items={stats.stale} render={note => <NoteRow key={note.id} note={note} onOpen={openNote} detail={t("tasks.stats.staleDays", { count: note.days })} />} />}
                    </Section>
                </div>
                <div className="flex flex-col gap-6">
                    <Section title={count(t("tasks.stats.overdue"), stats.overdue.length)}>
                        {stats.overdue.length === 0
                            ? <Empty>{t("tasks.stats.noOverdue")}</Empty>
                            : <Expandable items={stats.overdue} render={task => <DueRow key={task.id} task={task} tone="overdue" />} />}
                    </Section>
                    <Section title={count(t("tasks.stats.dueThisWeek"), stats.dueThisWeek.length)}>
                        {stats.dueThisWeek.length === 0
                            ? <Empty>{t("tasks.stats.noDueThisWeek")}</Empty>
                            : <Expandable items={stats.dueThisWeek} render={task => <DueRow key={task.id} task={task} tone="week" />} />}
                    </Section>
                </div>
            </div>
        </div>
    )
}
