// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SHIFT_DURATION } from "../note-dnd-shift"
import { applyTreeShifts, clearTreeShifts, hasTreeShifts, registerTreeRow, SHIFTING_ATTR, treeShiftOf } from "./tree-live-shift"
import type { TreeShifts } from "./tree-dnd-live"

let frames: FrameRequestCallback[] = []
const flushFrame = () => { const run = frames; frames = []; run.forEach(callback => callback(0)) }

const KEYS = ["note-1", "note-2", "note-3", "folder-4"]

const tree = () => {
    const root = document.createElement("div")
    root.setAttribute("role", "tree")
    document.body.appendChild(root)
    return root
}

const row = (key: string, parent: HTMLElement) => {
    const node = document.createElement("div")
    parent.appendChild(node)
    registerTreeRow(key, node)
    return node
}

/** Shifts by key; `hidden` rows collapse. */
const shifts = (dy: Record<string, number>, hidden: string[] = []): TreeShifts => ({
    dyOf: key => dy[key] ?? 0,
    isHidden: key => hidden.includes(key),
})

beforeEach(() => {
    frames = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal("cancelAnimationFrame", () => { frames = [] })
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }))
    window.matchMedia = globalThis.matchMedia
})

afterEach(() => {
    clearTreeShifts(false)
    for (const key of KEYS) registerTreeRow(key, null)
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe("applyTreeShifts", () => {
    it("moves the rows only in the animation frame, with a transition, and hides the dragged one", () => {
        const root = tree()
        const a = row("note-1", root)
        const b = row("note-2", root)
        applyTreeShifts(shifts({ "note-2": 32 }, ["note-1"]))
        expect(b.style.transform).toBe("")
        flushFrame()
        expect(b.style.transform).toBe("translate3d(0, 32px, 0)")
        expect(b.style.transition).toBe(`transform ${SHIFT_DURATION}ms ease-out, opacity ${SHIFT_DURATION}ms ease-out`)
        expect(a.style.opacity).toBe("0")
        expect(hasTreeShifts()).toBe(true)
        expect(root.hasAttribute(SHIFTING_ATTR)).toBe(true)
    })

    it("a later call before the frame replaces the earlier one (one frame, one write)", () => {
        const root = tree()
        const a = row("note-1", root)
        const b = row("note-2", root)
        applyTreeShifts(shifts({ "note-1": 20 }))
        applyTreeShifts(shifts({ "note-2": -10 }))
        expect(frames).toHaveLength(1)
        flushFrame()
        expect(a.style.transform).toBe("")
        expect(b.style.transform).toBe("translate3d(0, -10px, 0)")
    })

    it("sends back the rows that are no longer shifted and shows the source again", () => {
        const root = tree()
        const a = row("note-1", root)
        const b = row("note-2", root)
        applyTreeShifts(shifts({ "note-2": 32 }, ["note-1"]))
        flushFrame()
        applyTreeShifts(null)
        flushFrame()
        expect(b.style.transform).toBe("")
        expect(a.style.opacity).toBe("")
        expect(hasTreeShifts()).toBe(false)
    })

    it("moves nothing in the same frame with reduced motion (no transition)", () => {
        vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }))
        window.matchMedia = globalThis.matchMedia
        const a = row("note-1", tree())
        applyTreeShifts(shifts({ "note-1": 32 }))
        flushFrame()
        expect(a.style.transform).toBe("translate3d(0, 32px, 0)")
        expect(a.style.transition).toBe("none")
    })
})

describe("a row that mounts while rows are shifted", () => {
    it("is born with its shift, without gliding to it, and a hidden one is born hidden", () => {
        const root = tree()
        row("note-1", root)
        applyTreeShifts(shifts({ "note-2": 64 }, ["note-3"]))
        flushFrame()
        const born = row("note-2", root)
        expect(born.style.transform).toBe("translate3d(0, 64px, 0)")
        expect(born.style.transition).toBe("none")
        expect(row("note-3", root).style.opacity).toBe("0")
    })

    it("a row that unmounts is forgotten: it keeps no shift in the way", () => {
        const root = tree()
        const a = row("note-1", root)
        applyTreeShifts(shifts({ "note-1": 32 }))
        flushFrame()
        expect(treeShiftOf(a)).toBe(32)
        registerTreeRow("note-1", null)
        expect(treeShiftOf(a)).toBe(0)
        applyTreeShifts(null)
        expect(() => flushFrame()).not.toThrow()
    })

    it("a row mounted after the drag is over is not shifted", () => {
        const root = tree()
        applyTreeShifts(shifts({ "note-1": 32 }))
        flushFrame()
        clearTreeShifts(false)
        expect(row("note-1", root).style.transform).toBe("")
    })
})

describe("clearTreeShifts", () => {
    it("puts every row back at once, with no transition and no pending frame", () => {
        const root = tree()
        const a = row("note-1", root)
        applyTreeShifts(shifts({ "note-1": 32 }, ["note-2"]))
        flushFrame()
        clearTreeShifts(false)
        expect(a.style.transform).toBe("")
        expect(a.style.transition).toBe("")
        expect(root.hasAttribute(SHIFTING_ATTR)).toBe(false)
        expect(hasTreeShifts()).toBe(false)
    })

    it("glides back, then drops the transition and the attribute", () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        const root = tree()
        const a = row("note-1", root)
        applyTreeShifts(shifts({ "note-1": 32 }))
        flushFrame()
        clearTreeShifts(true)
        expect(a.style.transform).toBe("")
        expect(a.style.transition).toContain("transform")
        vi.advanceTimersByTime(SHIFT_DURATION + 60)
        expect(a.style.transition).toBe("")
        expect(root.hasAttribute(SHIFTING_ATTR)).toBe(false)
    })
})

describe("treeShiftOf", () => {
    it("is the shift applied to the row, zero on the other axis and for a row that is not moved", () => {
        const root = tree()
        const a = row("note-1", root)
        const b = row("note-2", root)
        applyTreeShifts(shifts({ "note-1": -32 }))
        flushFrame()
        expect(treeShiftOf(a)).toBe(-32)
        expect(treeShiftOf(a, "x")).toBe(0)
        expect(treeShiftOf(b)).toBe(0)
    })
})
