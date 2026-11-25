import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DueTask } from "@/db/queries/due"

const mocks = vi.hoisted(() => ({
    isPermissionGranted: vi.fn(),
    requestPermission: vi.fn(),
    sendNotification: vi.fn(),
    isFocused: vi.fn(),
    getDBDueTasks: vi.fn(),
    getDueNotifications: vi.fn(),
    getDueNotified: vi.fn(),
    saveDueNotified: vi.fn(),
}))
vi.mock("@tauri-apps/plugin-notification", () => ({ isPermissionGranted: mocks.isPermissionGranted, requestPermission: mocks.requestPermission, sendNotification: mocks.sendNotification }))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ isFocused: mocks.isFocused }) }))
vi.mock("@/db/queries/due", () => ({ getDBDueTasks: mocks.getDBDueTasks }))
vi.mock("@/lib/store/preferences", () => ({ getDueNotifications: mocks.getDueNotifications, getDueNotified: mocks.getDueNotified, saveDueNotified: mocks.saveDueNotified }))
vi.mock("@/lib/report-error", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/report-error")>(), reportError: vi.fn() }))

import { markDueSeen, openPendingNotificationTask, resetDueNotificationState, runDueNotificationPass } from "./due-notify"
import { openTaskStore, finishOpenTask } from "./open-task-request"

const NOW = new Date(2026, 10, 25, 12, 0)
const task = (id: number, due_date: string, due_time: string | null, text = `Task ${id}`): DueTask => ({
    id, text, due_date, due_time, noteID: 5, noteName: "Roadmap", sectionTitle: "To do", groupName: null, workspaceID: 2, workspaceName: "WS",
})

beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset())
    mocks.isPermissionGranted.mockResolvedValue(true)
    mocks.isFocused.mockResolvedValue(false)
    mocks.getDueNotifications.mockResolvedValue(true)
    mocks.getDueNotified.mockResolvedValue({})
    mocks.saveDueNotified.mockResolvedValue(undefined)
    resetDueNotificationState()
    finishOpenTask()
})

describe("runDueNotificationPass", () => {
    it("sends one summary at startup for the overdue and today's dates without a time, and remembers them", async () => {
        mocks.getDBDueTasks.mockResolvedValue([task(1, "2026-11-20", null), task(2, "2026-11-25", null), task(3, "2026-11-25", null), task(4, "2026-11-25", null), task(5, "2026-11-25", null)])
        await runDueNotificationPass(NOW)
        expect(mocks.sendNotification).toHaveBeenCalledTimes(1)
        expect(mocks.sendNotification.mock.calls[0][0].title).toContain("5")
        expect(mocks.sendNotification.mock.calls[0][0].body).toContain("+2")
        expect(Object.keys(mocks.saveDueNotified.mock.calls[0][0]).sort()).toEqual(["1", "2", "3", "4", "5"])
    })

    it("sends a timed due date on its own when its time has just come, and not again on the next pass", async () => {
        mocks.getDBDueTasks.mockResolvedValue([])
        await runDueNotificationPass(NOW)
        mocks.getDBDueTasks.mockResolvedValue([task(7, "2026-11-25", "12:00", "Call Ann")])
        await runDueNotificationPass(new Date(2026, 10, 25, 12, 0, 30))
        expect(mocks.sendNotification).toHaveBeenCalledTimes(1)
        expect(mocks.sendNotification.mock.calls[0][0]).toMatchObject({ title: "Scadenza: Call Ann" })
        mocks.getDueNotified.mockResolvedValue(mocks.saveDueNotified.mock.calls[0][0])
        await runDueNotificationPass(new Date(2026, 10, 25, 12, 1))
        expect(mocks.sendNotification).toHaveBeenCalledTimes(1)
    })

    it("does nothing when the setting is off or the permission is refused", async () => {
        mocks.getDBDueTasks.mockResolvedValue([task(1, "2026-11-20", null)])
        mocks.getDueNotifications.mockResolvedValue(false)
        await runDueNotificationPass(NOW)
        mocks.getDueNotifications.mockResolvedValue(true)
        mocks.isPermissionGranted.mockResolvedValue(false)
        mocks.requestPermission.mockResolvedValue("denied")
        await runDueNotificationPass(NOW)
        expect(mocks.sendNotification).not.toHaveBeenCalled()
        expect(mocks.saveDueNotified).not.toHaveBeenCalled()
    })

    it("opens the task when the window comes to the front soon after a single notification sent while it was in the background", async () => {
        mocks.getDBDueTasks.mockResolvedValue([task(9, "2026-11-25", null)])
        await runDueNotificationPass(NOW)
        openPendingNotificationTask(NOW.getTime() + 5_000)
        expect(openTaskStore.getState()).toMatchObject({ workspaceId: 2, noteId: 5, taskId: 9 })
        finishOpenTask()
        openPendingNotificationTask(NOW.getTime() + 6_000)
        expect(openTaskStore.getState()).toBeNull()
    })

    it("does not open anything when the focus comes long after the notification", async () => {
        mocks.getDBDueTasks.mockResolvedValue([task(9, "2026-11-25", null)])
        await runDueNotificationPass(NOW)
        openPendingNotificationTask(NOW.getTime() + 5 * 60_000)
        expect(openTaskStore.getState()).toBeNull()
    })
})

describe("markDueSeen", () => {
    it("remembers a due date that is already past when it is set, and ignores a future one", async () => {
        await markDueSeen({ id: 1, due_date: "2020-01-01", due_time: null }, NOW)
        expect(mocks.saveDueNotified).toHaveBeenCalledWith({ "1": "2020-01-01|" })
        mocks.saveDueNotified.mockClear()
        await markDueSeen({ id: 2, due_date: "2030-01-01", due_time: "10:00" }, NOW)
        await markDueSeen({ id: 3, due_date: "2026-11-25", due_time: null }, NOW)
        expect(mocks.saveDueNotified).not.toHaveBeenCalled()
        await markDueSeen({ id: 4, due_date: "2026-11-25", due_time: "08:00" }, NOW)
        expect(mocks.saveDueNotified).toHaveBeenCalledTimes(1)
    })
})
