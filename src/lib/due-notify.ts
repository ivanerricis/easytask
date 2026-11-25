import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import { getCurrentWindow } from "@tauri-apps/api/window"
import i18n from "@/i18n"
import { getDBDueTasks, type DueTask } from "@/db/queries/due"
import { formatDueTime, toDueDate } from "@/lib/due-date"
import { markNotified, planNotifications } from "@/lib/due-notifications"
import { requestOpenTask, type OpenTaskTarget } from "@/lib/open-task-request"
import { getDueNotifications, getDueNotified, saveDueNotified } from "@/lib/store/preferences"
import { reportError } from "@/lib/report-error"

/** How long after a notification a focus of the window counts as a click on it (the platforms give no click event on the desktop). */
const CLICK_WINDOW_MS = 60_000
/** How many task names a summary lists. */
const SUMMARY_NAMES = 3

let lastDay = ""
let started = false
/** The task of the last single notification sent while the window was not in front: coming to the front soon after opens it. */
let pending: { target: OpenTaskTarget, at: number } | null = null

const targetOf = (task: DueTask): OpenTaskTarget => ({ workspaceId: task.workspaceID, noteId: task.noteID, taskId: task.id })

async function allowed(): Promise<boolean> {
    if (await isPermissionGranted()) return true
    return (await requestPermission()) === "granted"
}

const pathOf = (task: DueTask) => [task.noteName, task.sectionTitle || task.groupName].filter(Boolean).join(" › ")

function sendOne(task: DueTask) {
    const time = task.due_time ? formatDueTime(task.due_time, i18n.language) : ""
    sendNotification({ title: i18n.t("tasks.dueNotify.title", { text: task.text }), body: [time, pathOf(task)].filter(Boolean).join(" · ") })
}

function sendSummary(tasks: readonly DueTask[]) {
    const names = tasks.slice(0, SUMMARY_NAMES).map(task => task.text)
    if (tasks.length > SUMMARY_NAMES) names.push(i18n.t("tasks.dueNotify.more", { count: tasks.length - SUMMARY_NAMES }))
    sendNotification({ title: i18n.t("tasks.dueNotify.summaryTitle", { count: tasks.length }), body: names.join("\n") })
}

/**
 * One pass of the due date notifications (called when the app starts and then every half minute, also while it only lives in
 * the tray): reads the open tasks that are overdue or due today, in every workspace, and sends what the plan says (see
 * planNotifications). What was sent is remembered in the store, so it is never sent twice, also after a restart.
 * Never rejects.
 * @param now The current time (tests pass their own).
 */
export async function runDueNotificationPass(now: Date = new Date()): Promise<void> {
    try {
        if (!await getDueNotifications()) return
        const today = toDueDate(now)
        const startup = !started
        const newDay = lastDay !== "" && lastDay !== today
        const tasks = await getDBDueTasks(today)
        const notified = await getDueNotified()
        const plan = planNotifications(tasks, notified, now, startup, newDay)
        started = true
        lastDay = today
        if (plan.individual.length === 0 && plan.summary.length === 0) return
        if (!await allowed()) return
        const windowFocused = await getCurrentWindow().isFocused().catch(() => false)
        for (const task of plan.individual) sendOne(task)
        if (plan.summary.length > 0) sendSummary(plan.summary)
        const total = plan.individual.length + plan.summary.length
        pending = !windowFocused && total === 1 ? { target: targetOf((plan.individual[0] ?? plan.summary[0])), at: now.getTime() } : null
        await saveDueNotified(markNotified(notified, [...plan.individual, ...plan.summary], now))
    } catch (error) {
        reportError(error)
    }
}

/** The window came to the front: right after a single notification that means the user clicked it, so its task opens. */
export function openPendingNotificationTask(now: number = Date.now()): void {
    const request = pending
    pending = null
    if (request && now - request.at <= CLICK_WINDOW_MS) requestOpenTask(request.target)
}

/** Remembers that a due date is already past when it is set (the user knows: no notification for it). */
export async function markDueSeen(task: { id: number, due_date: string, due_time: string | null }, now: Date = new Date()): Promise<void> {
    try {
        const isPast = task.due_time ? false : task.due_date < toDueDate(now)
        const timedPast = task.due_time ? new Date(`${task.due_date}T${task.due_time}:00`).getTime() <= now.getTime() : false
        if (!isPast && !timedPast) return
        await saveDueNotified(markNotified(await getDueNotified(), [task], now))
    } catch (error) {
        reportError(error)
    }
}

/** For tests: forgets what the passes remembered in memory. */
export function resetDueNotificationState() {
    lastDay = ""
    started = false
    pending = null
}
