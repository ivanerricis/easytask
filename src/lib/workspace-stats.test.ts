import { describe, expect, it } from "vitest"
import type { DueTask } from "@/db/queries/due"
import { buildWorkspaceStats, daysBetween, statsWeekStarts, STATS_WEEKS } from "./workspace-stats"

const due = (id: number, due_date: string, due_time: string | null = null): DueTask => ({
    id, text: `T${id}`, due_date, due_time, noteID: 1, noteName: "N", sectionTitle: "S", groupName: null, workspaceID: 1, workspaceName: "W",
})

// Wednesday 2026-11-25; its week starts on Monday 2026-11-23
const TODAY = "2026-11-25"
const NOW = new Date(2026, 10, 25, 12, 0)

describe("workspace stats", () => {
    it("lists the Mondays of the last weeks, the current one last", () => {
        const starts = statsWeekStarts(TODAY)
        expect(starts).toHaveLength(STATS_WEEKS)
        expect(starts[STATS_WEEKS - 1]).toBe("2026-11-23")
        expect(starts[0]).toBe("2026-09-07")
    })

    it("counts the days between two dates", () => {
        expect(daysBetween("2026-11-01", "2026-11-25")).toBe(24)
        expect(daysBetween("2026-10-25", "2026-11-25")).toBe(31)
    })

    it("buckets the completions by week, ignoring those before the first week", () => {
        const stats = buildWorkspaceStats(TODAY, [], [], [
            { day: "2026-11-25", count: 2 }, { day: "2026-11-23", count: 1 }, { day: "2026-11-22", count: 4 }, { day: "2025-01-01", count: 9 },
        ], [], NOW)
        expect(stats.weeks[STATS_WEEKS - 1]).toEqual({ start: "2026-11-23", count: 3 })
        expect(stats.weeks[STATS_WEEKS - 2]).toEqual({ start: "2026-11-16", count: 4 })
        expect(stats.completedInRange).toBe(7)
    })

    it("orders the notes by progress and finds the stale ones from the last edit of the note or of its tasks", () => {
        const stats = buildWorkspaceStats(TODAY,
            [
                { id: 1, name: "Half", edit_date: "2026-11-24" }, { id: 2, name: "Empty", edit_date: "2026-11-24" },
                { id: 3, name: "Old", edit_date: "2026-08-01" }, { id: 4, name: "Old but tasks edited", edit_date: "2026-08-01" },
            ],
            [
                { noteID: 1, total: 4, done: 2, lastTaskEdit: "2026-11-20" }, { noteID: 3, total: 2, done: 2, lastTaskEdit: "2026-08-02" },
                { noteID: 4, total: 1, done: 0, lastTaskEdit: "2026-11-01" },
            ], [], [], NOW)
        expect(stats.notes.map(note => note.name)).toEqual(["Old but tasks edited", "Half", "Old", "Empty"])
        expect(stats.stale.map(note => [note.name, note.days])).toEqual([["Old", 115]])
        expect(stats.doneTotal).toBe(4)
        expect(stats.openTotal).toBe(3)
    })

    it("separates the overdue tasks from the ones due until the end of the week", () => {
        const stats = buildWorkspaceStats(TODAY, [], [], [], [due(1, "2026-11-10"), due(2, "2026-11-25", "09:00"), due(3, "2026-11-26"), due(4, "2026-11-29")], NOW)
        expect(stats.overdue.map(task => task.id)).toEqual([1, 2])
        expect(stats.dueThisWeek.map(task => task.id)).toEqual([3, 4])
    })
})
