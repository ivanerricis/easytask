import { describe, expect, it } from "vitest"
import { buildAgenda, weekStartOf } from "./due-agenda"

// Tuesday 25 November 2026 (the week is 23-29)
const TODAY = "2026-11-25"
const task = (id: number, due_date: string, due_time: string | null = null) => ({ id, due_date, due_time })

describe("weekStartOf", () => {
    it("is the Monday, also for a Sunday and across a month", () => {
        expect(weekStartOf("2026-11-25")).toBe("2026-11-23")
        expect(weekStartOf("2026-11-23")).toBe("2026-11-23")
        expect(weekStartOf("2026-11-29")).toBe("2026-11-23")
        expect(weekStartOf("2026-12-01")).toBe("2026-11-30")
    })
})

describe("buildAgenda", () => {
    it("lists the days with tasks (timed first) and collapses the runs of empty days", () => {
        const agenda = buildAgenda([task(1, "2026-11-25"), task(2, "2026-11-25", "09:00"), task(3, "2026-11-26"), task(4, "2026-11-29")], "2026-11-23", TODAY)
        expect(agenda.weekEnd).toBe("2026-11-29")
        expect(agenda.rows.map(row => row.type === "day" ? [row.date, row.tasks.map(t => t.id)] : [row.from, row.to])).toEqual([
            ["2026-11-23", "2026-11-24"], ["2026-11-25", [2, 1]], ["2026-11-26", [3]], ["2026-11-27", "2026-11-28"], ["2026-11-29", [4]],
        ])
    })

    it("puts the tasks older than the week in the overdue block, on the current week only", () => {
        const tasks = [task(1, "2026-11-10"), task(2, "2026-11-24"), task(3, "2026-12-01")]
        expect(buildAgenda(tasks, "2026-11-23", TODAY).overdue.map(t => t.id)).toEqual([1])
        expect(buildAgenda(tasks, "2026-11-30", TODAY).overdue).toEqual([])
        expect(buildAgenda(tasks, "2026-11-16", TODAY).overdue).toEqual([])
    })

    it("a week with nothing is one collapsed row", () => {
        expect(buildAgenda([], "2026-11-23", TODAY).rows).toEqual([{ type: "empty", from: "2026-11-23", to: "2026-11-29" }])
    })
})
