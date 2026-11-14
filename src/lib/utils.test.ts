import { afterEach, describe, expect, it } from "vitest"
import { applyLanguagePreference } from "@/i18n"
import { cn, formatDate, formatDateTime, getErrorMessage, hexToRgba } from "./utils"

describe("getErrorMessage", () => {
    it("returns the message of an Error", () => {
        expect(getErrorMessage(new Error("bad"))).toBe("bad")
    })

    it("returns the message of a plain object", () => {
        expect(getErrorMessage({ code: "X", message: "obj" })).toBe("obj")
    })

    it("stringifies a non-string message", () => {
        expect(getErrorMessage({ message: 42 })).toBe("42")
    })

    it("stringifies primitives and null", () => {
        expect(getErrorMessage("oops")).toBe("oops")
        expect(getErrorMessage(null)).toBe("null")
        expect(getErrorMessage(undefined)).toBe("undefined")
        expect(getErrorMessage(7)).toBe("7")
    })

    it("falls back to String for objects without message", () => {
        expect(getErrorMessage({ a: 1 })).toBe("[object Object]")
    })
})

describe("cn", () => {
    it("joins class names and drops falsy values", () => {
        expect(cn("a", false, null, undefined, "b")).toBe("a b")
    })

    it("supports conditional object syntax", () => {
        expect(cn({ a: true, b: false })).toBe("a")
    })

    it("resolves tailwind conflicts keeping the last one", () => {
        expect(cn("p-2", "p-4")).toBe("p-4")
        expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500")
    })
})

describe("formatDate", () => {
    afterEach(async () => { await applyLanguagePreference("it") })

    it("uses DD/MM/YYYY in Italian and MM/DD/YYYY in English", async () => {
        await applyLanguagePreference("it")
        expect(formatDate("2024-03-15")).toBe("15/03/2024")
        await applyLanguagePreference("en")
        expect(formatDate("2024-03-15")).toBe("03/15/2024")
        expect(formatDate("")).toBe("")
    })

    it("parses the date as a local one (no day shift) and gives back what is not a date", async () => {
        await applyLanguagePreference("it")
        expect(formatDate("2024-01-01")).toBe("01/01/2024")
        expect(formatDate("2024-12-31")).toBe("31/12/2024")
        expect(formatDate("not a date")).toBe("not a date")
    })
})

describe("formatDateTime", () => {
    afterEach(async () => { await applyLanguagePreference("it") })

    it("formats a timestamp, a Date and a stored local date-time in both languages", async () => {
        const local = new Date(2026, 2, 4, 9, 30, 15)
        await applyLanguagePreference("it")
        expect(formatDateTime(local.getTime())).toBe("04/03/2026, 09:30:15")
        expect(formatDateTime(local)).toBe("04/03/2026, 09:30:15")
        expect(formatDateTime("2026-03-04 09:30:15")).toBe("04/03/2026, 09:30:15")
        expect(formatDateTime("2026-03-04 09:30")).toBe("04/03/2026, 09:30:00")
        await applyLanguagePreference("en")
        expect(formatDateTime("2026-03-04 21:30:15")).toBe("03/04/2026, 09:30:15 PM")
        expect(formatDateTime("garbage")).toBe("garbage")
    })
})

describe("hexToRgba", () => {
    it("converts #rrggbb and #rgb", () => {
        expect(hexToRgba(0.5, "#c2410c")).toBe("rgba(194, 65, 12, 0.5)")
        expect(hexToRgba(0.3, "#fff")).toBe("rgba(255, 255, 255, 0.3)")
    })

    it("gives back a missing or empty color and undefined (no NaN) for an invalid one", () => {
        expect(hexToRgba(0.5, undefined)).toBeUndefined()
        expect(hexToRgba(0.5, "")).toBe("")
        expect(hexToRgba(0.5, "red")).toBeUndefined()
    })
})
