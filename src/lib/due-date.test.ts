import { describe, expect, it } from "vitest"
import { addDays, dueStatus, formatDueDate, isValidDueDate, isValidDueTime, normalizeDue, toDueDate } from "./due-date"

const NOW = new Date(2030, 4, 6, 12, 0) // 6 May 2030, 12:00

describe("validation", () => {
    it("accepts real dates only", () => {
        expect(isValidDueDate("2030-05-06")).toBe(true)
        expect(isValidDueDate("2030-02-30")).toBe(false)
        expect(isValidDueDate("2030-5-6")).toBe(false)
        expect(isValidDueDate(null)).toBe(false)
        expect(isValidDueDate("")).toBe(false)
    })

    it("accepts HH:MM times only", () => {
        expect(isValidDueTime("00:00")).toBe(true)
        expect(isValidDueTime("23:59")).toBe(true)
        expect(isValidDueTime("24:00")).toBe(false)
        expect(isValidDueTime("9:30")).toBe(false)
    })

    it("normalizeDue drops a time without a date and a bad time", () => {
        expect(normalizeDue("2030-05-06", "09:30")).toEqual({ date: "2030-05-06", time: "09:30" })
        expect(normalizeDue(null, "09:30")).toEqual({ date: null, time: null })
        expect(normalizeDue("2030-05-06", "99:99")).toEqual({ date: "2030-05-06", time: null })
        expect(normalizeDue("nope", null)).toEqual({ date: null, time: null })
    })
})

describe("dates", () => {
    it("adds days across months and years, in the local calendar", () => {
        expect(addDays("2030-12-31", 1)).toBe("2031-01-01")
        expect(addDays("2030-03-01", -1)).toBe("2030-02-28")
        expect(toDueDate(new Date(2030, 0, 5, 23, 59))).toBe("2030-01-05")
    })

    it("formats the year only when it is not the current one", () => {
        expect(formatDueDate("2030-12-24", "en", NOW)).toBe("Dec 24")
        expect(formatDueDate("2031-12-24", "en", NOW)).toBe("Dec 24, 2031")
    })
})

describe("dueStatus", () => {
    it("has none without a date, and a completed task is never overdue", () => {
        expect(dueStatus({ due_date: null }, NOW)).toBe("none")
        expect(dueStatus({ due_date: "2030-05-01", completed: true }, NOW)).toBe("none")
        expect(dueStatus({ due_date: "2030-05-01", completed: 1 }, NOW)).toBe("none")
    })

    it("a date without a time is overdue from the next day", () => {
        expect(dueStatus({ due_date: "2030-05-05" }, NOW)).toBe("overdue")
        expect(dueStatus({ due_date: "2030-05-06" }, NOW)).toBe("today")
        expect(dueStatus({ due_date: "2030-05-07" }, NOW)).toBe("tomorrow")
        expect(dueStatus({ due_date: "2030-05-08" }, NOW)).toBe("later")
    })

    it("a date with a time is overdue once the time has passed", () => {
        expect(dueStatus({ due_date: "2030-05-06", due_time: "11:59" }, NOW)).toBe("overdue")
        expect(dueStatus({ due_date: "2030-05-06", due_time: "12:01" }, NOW)).toBe("today")
    })
})
