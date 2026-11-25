import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeRule, makeTree, taskOf } from "@/test/automation-fixtures"
import { patchTask } from "@/contexts/note-tree-ops"
import { runAutomations } from "@/lib/automations/engine"
import { newlyOverdueTasks } from "@/lib/automations/overdue"
import { isAutomationTrigger } from "@/lib/automations/types"
import { markNotified, planNotifications, RECENT_MS } from "@/lib/due-notifications"
import { dueGroupColor } from "@/pages/workspacePage/components/groups/group-progress"
import { PROGRESS_COLORS } from "@/pages/workspacePage/components/groups/group-progress"
import type { Group } from "@/types/types"

// Tuesday 25 November 2026, 12:00
const NOW = new Date(2026, 10, 25, 12, 0)

const withDue = (tree: ReturnType<typeof makeTree>, id: number, due_date: string | null, due_time: string | null = null) =>
    patchTask(tree, id, { due_date, due_time })

describe("the task.overdue trigger", () => {
    const rule = (sectionId: number | null = null) => makeRule(1, { type: "task.overdue", sectionId }, [{ type: "setColor", color: "#ff0000" }])

    it("is a valid trigger", () => {
        expect(isAutomationTrigger({ type: "task.overdue", sectionId: null })).toBe(true)
        expect(isAutomationTrigger({ type: "task.overdue", sectionId: 3 })).toBe(true)
    })

    it("acts on the overdue task of the event, not on one that is not overdue or is completed", () => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
        const tree = withDue(withDue(makeTree({ 1: [{ id: 10 }, { id: 11 }, { id: 12, completed: true }] }), 10, "2026-11-20"), 12, "2026-11-20")
        const late = runAutomations(withDue(tree, 11, "2026-12-30"), [rule()], { type: "task.overdue", taskId: 10 })
        expect(taskOf(late.tree, 10).color).toBe("#ff0000")
        const notYet = withDue(tree, 11, "2026-12-30")
        expect(runAutomations(notYet, [rule()], { type: "task.overdue", taskId: 11 }).tree).toBe(notYet)
        expect(runAutomations(tree, [rule()], { type: "task.overdue", taskId: 12 }).tree).toBe(tree)
        vi.useRealTimers()
    })

    it("applies the section filter and also reaches subtasks", () => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
        const tree = withDue(makeTree({ 1: [{ id: 10, subs: [{ id: 11 }] }], 2: [{ id: 20 }] }), 11, "2026-11-01")
        expect(taskOf(runAutomations(tree, [rule(1)], { type: "task.overdue", taskId: 11 }).tree, 11).color).toBe("#ff0000")
        expect(runAutomations(tree, [rule(2)], { type: "task.overdue", taskId: 11 }).tree).toBe(tree)
        vi.useRealTimers()
    })
})

describe("newlyOverdueTasks", () => {
    it("lists the overdue open tasks not handled for that due date, and again when the date changes", () => {
        const tree = withDue(withDue(makeTree({ 1: [{ id: 10, subs: [{ id: 11 }] }, { id: 12 }] }), 11, "2026-11-01"), 12, "2026-11-24")
        expect(newlyOverdueTasks(tree, {}, NOW).map(task => task.id)).toEqual([11, 12])
        const handled = markNotified({}, [{ id: 11, due_date: "2026-11-01", due_time: null }], NOW)
        expect(newlyOverdueTasks(tree, handled, NOW).map(task => task.id)).toEqual([12])
        expect(newlyOverdueTasks(withDue(tree, 11, "2026-11-02"), handled, NOW).map(task => task.id)).toEqual([11, 12])
    })
})

describe("planNotifications", () => {
    const task = (id: number, due_date: string, due_time: string | null) => ({ id, due_date, due_time })
    const at = (minutesAgo: number) => {
        const date = new Date(NOW.getTime() - minutesAgo * 60_000)
        return task(1, "2026-11-25", `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`)
    }

    it("notifies a timed due date at its time, on its own", () => {
        expect(planNotifications([at(1)], {}, NOW, false, false)).toEqual({ individual: [at(1)], summary: [] })
        expect(planNotifications([task(1, "2026-11-25", "13:00")], {}, NOW, false, false)).toEqual({ individual: [], summary: [] })
    })

    it("puts the dates without a time in the summary of the startup and of a new day only", () => {
        const untimed = [task(2, "2026-11-25", null), task(3, "2026-11-20", null)]
        expect(planNotifications(untimed, {}, NOW, true, false).summary).toHaveLength(2)
        expect(planNotifications(untimed, {}, NOW, false, true).summary).toHaveLength(2)
        expect(planNotifications(untimed, {}, NOW, false, false)).toEqual({ individual: [], summary: [] })
    })

    it("puts a missed timed due date in the summary (at startup, or when it is older than the recent window)", () => {
        expect(planNotifications([at(1)], {}, NOW, true, false)).toEqual({ individual: [], summary: [at(1)] })
        const old = at(RECENT_MS / 60_000 + 5)
        expect(planNotifications([old], {}, NOW, false, false)).toEqual({ individual: [], summary: [old] })
    })

    it("never notifies a due date twice, and notifies it again when its date or time changed", () => {
        const first = at(1)
        const notified = markNotified({}, [first], NOW)
        expect(planNotifications([first], notified, NOW, false, false)).toEqual({ individual: [], summary: [] })
        expect(planNotifications([{ ...first, due_date: "2026-11-24", due_time: "09:00" }], notified, NOW, true, false).summary).toHaveLength(1)
    })

    it("leaves out the dates in the future", () => {
        expect(planNotifications([task(1, "2026-11-26", null)], {}, NOW, true, false)).toEqual({ individual: [], summary: [] })
    })

    it("markNotified drops the entries that are more than a month old", () => {
        const next = markNotified({ "1": "2026-09-01|", "2": "2026-11-20|" }, [task(3, "2026-11-25", null)], NOW)
        expect(Object.keys(next).sort()).toEqual(["2", "3"])
    })
})

describe("dueGroupColor", () => {
    const group = (...tasks: { completed?: boolean, due_date?: string | null, due_time?: string | null, subtasks?: unknown[] }[]) => ({
        sections: [{ is_default: false, tasks: tasks.map(task => ({ subtasks: [], ...task })) }],
    } as unknown as Group)

    beforeEach(() => { vi.useRealTimers() })

    it("is red when a task is overdue, yellow for today or tomorrow, green later, none without dates", () => {
        expect(dueGroupColor(group({ due_date: "2026-11-20" }, { due_date: "2026-11-30" }), NOW)).toBe(PROGRESS_COLORS.none)
        expect(dueGroupColor(group({ due_date: "2026-11-26" }, { due_date: "2027-01-01" }), NOW)).toBe(PROGRESS_COLORS.started)
        expect(dueGroupColor(group({ due_date: "2026-12-30" }), NOW)).toBe(PROGRESS_COLORS.done)
        expect(dueGroupColor(group({ due_date: null }), NOW)).toBeNull()
    })

    it("ignores completed tasks and looks into subtasks", () => {
        expect(dueGroupColor(group({ due_date: "2026-11-20", completed: true }), NOW)).toBeNull()
        expect(dueGroupColor(group({ subtasks: [{ due_date: "2026-11-01", subtasks: [] }] }), NOW)).toBe(PROGRESS_COLORS.none)
    })
})
