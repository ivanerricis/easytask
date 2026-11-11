import { describe, expect, it } from "vitest"
import {
    barDndId, computeCrossPaneIndex, computeTabMove, computeTabZone, keepInBar, parseBarDndId, parseTabDndId, pickBarByPoint, pickTabByX, resolveTabDrop, tabDndId, tabLivePending,
} from "./tab-reorder"

describe("tabLivePending", () => {
    it("makes the place of a hover over a tab: its registry key, the side and the list of its bar", () => {
        expect(tabLivePending({ pane: 0, overId: 5, zone: "before" })).toEqual({ over: "tab-0-5", zone: "before", list: "b-0" })
        expect(tabLivePending({ pane: 1, overId: 5, zone: "after" })).toEqual({ over: "tab-1-5", zone: "after", list: "b-1" })
    })

    it("moves nothing over nothing, nor over an empty bar", () => {
        expect(tabLivePending(null)).toBeNull()
        expect(tabLivePending({ pane: 1, overId: null, zone: "after" })).toBeNull()
    })
})

describe("computeTabZone", () => {
    it("splits a tab in before / after", () => {
        expect(computeTabZone({ left: 100, width: 100 }, 120)).toBe("before")
        expect(computeTabZone({ left: 100, width: 100 }, 180)).toBe("after")
    })
})

describe("computeTabMove", () => {
    const ids = [1, 2, 3, 4]
    it("moves forward and backward with the final index", () => {
        expect(computeTabMove(ids, 1, 3, "after")).toEqual({ from: 0, to: 2 })
        expect(computeTabMove(ids, 1, 3, "before")).toEqual({ from: 0, to: 1 })
        expect(computeTabMove(ids, 4, 1, "before")).toEqual({ from: 3, to: 0 })
        expect(computeTabMove(ids, 4, 2, "after")).toEqual({ from: 3, to: 2 })
    })
    it("returns null for no-ops and unknown ids", () => {
        expect(computeTabMove(ids, 2, 2, "before")).toBeNull()
        expect(computeTabMove(ids, 2, 1, "after")).toBeNull()
        expect(computeTabMove(ids, 2, 3, "before")).toBeNull()
        expect(computeTabMove(ids, 9, 1, "before")).toBeNull()
        expect(computeTabMove(ids, 1, 9, "before")).toBeNull()
    })
})

describe("pickTabByX", () => {
    const tabs = [{ id: 1, left: 0, right: 100 }, { id: 2, left: 100, right: 200 }, { id: 3, left: 200, right: 300 }]
    it("picks the tab under the pointer", () => {
        expect(pickTabByX(tabs, 50)).toBe(1)
        expect(pickTabByX(tabs, 250)).toBe(3)
    })
    it("picks the last tab past the end of the bar, and the first one before its start", () => {
        expect(pickTabByX(tabs, 450)).toBe(3)
        expect(pickTabByX(tabs, -40)).toBe(1)
    })
    it("picks the last tab in the gap after the tabs even when they are not in order", () => {
        expect(pickTabByX([...tabs].reverse(), 301)).toBe(3)
    })
    it("picks nothing without tabs", () => {
        expect(pickTabByX([], 10)).toBeNull()
    })
})

describe("tab dnd ids", () => {
    it("builds and parses the namespaced ids", () => {
        expect(tabDndId(1, 42)).toBe("tab:1:42")
        expect(barDndId(0)).toBe("bar:0")
        expect(parseTabDndId("tab:1:42")).toEqual({ pane: 1, noteId: 42 })
        expect(parseTabDndId(tabDndId(0, 7))).toEqual({ pane: 0, noteId: 7 })
        expect(parseBarDndId("bar:1")).toBe(1)
        expect(parseBarDndId(barDndId(0))).toBe(0)
    })
    it("rejects every other id", () => {
        for (const id of ["tab:2:1", "tab:0:x", "tab:0:1:2", "bar:0", "42", 42, "xtab:0:1"]) expect(parseTabDndId(id)).toBeNull()
        for (const id of ["bar:2", "bar:", "tab:0:1", "bar:01", 0]) expect(parseBarDndId(id)).toBeNull()
    })
})

describe("pickBarByPoint", () => {
    const bars = [{ id: 0, left: 0, right: 300, top: 0, bottom: 42 }, { id: 1, left: 400, right: 700, top: 0, bottom: 42 }]
    it("picks the bar that contains the point, edges included", () => {
        expect(pickBarByPoint(bars, 10, 10)).toBe(0)
        expect(pickBarByPoint(bars, 500, 42)).toBe(1)
        expect(pickBarByPoint(bars, 300, 0)).toBe(0)
    })
    it("picks nothing between the bars, outside them or without bars", () => {
        expect(pickBarByPoint(bars, 350, 10)).toBeNull()
        expect(pickBarByPoint(bars, 10, 43)).toBeNull()
        expect(pickBarByPoint(bars, 10, -1)).toBeNull()
        expect(pickBarByPoint([], 1, 1)).toBeNull()
    })
})

describe("computeCrossPaneIndex", () => {
    it("inserts before or after the tab it is over", () => {
        expect(computeCrossPaneIndex([5, 6, 7], 6, "before")).toBe(1)
        expect(computeCrossPaneIndex([5, 6, 7], 6, "after")).toBe(2)
        expect(computeCrossPaneIndex([5, 6, 7], 5, "before")).toBe(0)
        expect(computeCrossPaneIndex([5, 6, 7], 7, "after")).toBe(3)
    })
    it("appends over the bar itself or over an unknown tab", () => {
        expect(computeCrossPaneIndex([], null, "after")).toBe(0)
        expect(computeCrossPaneIndex([5, 6], null, "before")).toBe(2)
        expect(computeCrossPaneIndex([5, 6], 9, "before")).toBe(2)
    })
})

describe("resolveTabDrop", () => {
    const ids = [[1, 2, 3], [10, 11]] as const
    it("does nothing without a target", () => {
        expect(resolveTabDrop(ids, 0, 1, null)).toBeNull()
    })
    it("reorders inside the same bar", () => {
        expect(resolveTabDrop(ids, 0, 1, { pane: 0, overId: 3, zone: "after" })).toEqual({ kind: "reorder", pane: 0, from: 0, to: 2 })
        expect(resolveTabDrop(ids, 1, 11, { pane: 1, overId: 10, zone: "before" })).toEqual({ kind: "reorder", pane: 1, from: 1, to: 0 })
    })
    it("moves to the end over the bar itself, and does nothing if the tab is already last", () => {
        expect(resolveTabDrop(ids, 0, 1, { pane: 0, overId: null, zone: "after" })).toEqual({ kind: "reorder", pane: 0, from: 0, to: 2 })
        expect(resolveTabDrop(ids, 0, 3, { pane: 0, overId: null, zone: "after" })).toBeNull()
        expect(resolveTabDrop([[], []], 0, 1, { pane: 0, overId: null, zone: "after" })).toBeNull()
    })
    it("does nothing when the tab would stay where it is", () => {
        expect(resolveTabDrop(ids, 0, 2, { pane: 0, overId: 3, zone: "before" })).toBeNull()
        expect(resolveTabDrop(ids, 0, 2, { pane: 0, overId: 2, zone: "before" })).toBeNull()
    })
    it("moves to the other pane at the drop position", () => {
        expect(resolveTabDrop(ids, 0, 2, { pane: 1, overId: 11, zone: "before" })).toEqual({ kind: "move", noteId: 2, fromPane: 0, toPane: 1, index: 1 })
        expect(resolveTabDrop(ids, 1, 10, { pane: 0, overId: 3, zone: "after" })).toEqual({ kind: "move", noteId: 10, fromPane: 1, toPane: 0, index: 3 })
    })
    it("moves to the end of an empty pane", () => {
        expect(resolveTabDrop([[1], []], 0, 1, { pane: 1, overId: null, zone: "after" })).toEqual({ kind: "move", noteId: 1, fromPane: 0, toPane: 1, index: 0 })
    })
})

describe("keepInBar", () => {
    const bar = { getBoundingClientRect: () => ({ left: 100, right: 400 }) } as HTMLElement
    const rect = { left: 150, right: 250 }
    const move = (x: number) => ({ x, y: 0, scaleX: 1, scaleY: 1 })

    it("leaves a move that stays inside the bar as it is", () => {
        expect(keepInBar(move(60), rect, bar)).toEqual(move(60))
    })

    it("stops the tab at the right edge of the bar, so it does not widen the scrollable area", () => {
        expect(keepInBar(move(900), rect, bar)?.x).toBe(150)
    })

    it("stops the tab at the left edge of the bar", () => {
        expect(keepInBar(move(-900), rect, bar)?.x).toBe(-50)
    })

    it("does nothing without a move, a measure or a bar", () => {
        expect(keepInBar(null, rect, bar)).toBeNull()
        expect(keepInBar(move(900), null, bar)).toEqual(move(900))
        expect(keepInBar(move(900), rect, null)).toEqual(move(900))
    })
})
