import { describe, expect, it } from "vitest"
import { effectiveTaskOrder, isTaskOrder, isTaskOrderLocked, TASK_ORDERS } from "./task-order"

describe("task order", () => {
    it("knows the three orders and nothing else", () => {
        expect([...TASK_ORDERS]).toEqual(["manual", "open-first", "done-first"])
        for (const order of TASK_ORDERS) expect(isTaskOrder(order)).toBe(true)
        for (const value of ["", "newest", null, undefined, 3, {}]) expect(isTaskOrder(value)).toBe(false)
    })

    it("uses the choice of the section, and the preference when it has none", () => {
        expect(effectiveTaskOrder(null, false)).toBe("manual")
        expect(effectiveTaskOrder(undefined, true)).toBe("open-first")
        expect(effectiveTaskOrder("manual", true)).toBe("manual")
        expect(effectiveTaskOrder("done-first", false)).toBe("done-first")
        expect(effectiveTaskOrder("open-first", false)).toBe("open-first")
        // A value this version does not know is the same as no choice
        expect(effectiveTaskOrder("newest", true)).toBe("open-first")
    })

    it("locks the drag only for an explicit order that is not the manual one", () => {
        expect(isTaskOrderLocked(null)).toBe(false)
        expect(isTaskOrderLocked(undefined)).toBe(false)
        expect(isTaskOrderLocked("manual")).toBe(false)
        expect(isTaskOrderLocked("open-first")).toBe(true)
        expect(isTaskOrderLocked("done-first")).toBe(true)
        expect(isTaskOrderLocked("newest")).toBe(false)
    })
})
