// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applyShifts, clearShifts, hasShifts, readLiveSnapshot, registerShiftNode, shiftOf, SHIFT_ATTR, SHIFT_DURATION } from "./note-dnd-shift"

let frames: FrameRequestCallback[] = []
const flushFrame = () => { const run = frames; frames = []; run.forEach(callback => callback(0)) }

const wrapper = (id: number, section: number, parent?: HTMLElement) => {
    const node = document.createElement("div")
    node.setAttribute(SHIFT_ATTR.task, String(id))
    node.setAttribute(SHIFT_ATTR.section, String(section))
    ;(parent ?? document.body).appendChild(node)
    registerShiftNode(`task-${id}`, node)
    return node
}

const mockReducedMotion = (reduced: boolean) => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), media: query }))
    window.matchMedia = globalThis.matchMedia
}

beforeEach(() => {
    frames = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal("cancelAnimationFrame", () => { frames = [] })
    mockReducedMotion(false)
})

afterEach(() => {
    clearShifts(false)
    for (const id of [1, 2, 3, 4]) registerShiftNode(`task-${id}`, null)
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe("applyShifts", () => {
    it("moves the wrappers only in the animation frame, with a transition", () => {
        const a = wrapper(1, 1)
        applyShifts(new Map([["task-1", 20]]))
        expect(a.style.transform).toBe("")
        flushFrame()
        expect(a.style.transform).toBe("translate3d(0, 20px, 0)")
        expect(a.style.transition).toBe(`transform ${SHIFT_DURATION}ms ease-out`)
        expect(hasShifts()).toBe(true)
    })

    it("a later call before the frame replaces the earlier one (one frame, one write)", () => {
        const a = wrapper(1, 1)
        const b = wrapper(2, 1)
        applyShifts(new Map([["task-1", 20]]))
        applyShifts(new Map([["task-2", -10]]))
        expect(frames).toHaveLength(1)
        flushFrame()
        expect(a.style.transform).toBe("")
        expect(b.style.transform).toBe("translate3d(0, -10px, 0)")
    })

    it("sends back the wrappers that are no longer shifted and leaves the others alone", () => {
        const a = wrapper(1, 1)
        const b = wrapper(2, 1)
        applyShifts(new Map([["task-1", 20], ["task-2", 20]]))
        flushFrame()
        applyShifts(new Map([["task-2", 20]]))
        flushFrame()
        expect(a.style.transform).toBe("")
        expect(b.style.transform).toBe("translate3d(0, 20px, 0)")
    })

    it("drops the transition of a wrapper that went back once the way is over", () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        const a = wrapper(1, 1)
        applyShifts(new Map([["task-1", 20]]))
        flushFrame()
        applyShifts(new Map())
        flushFrame()
        expect(a.style.transition).toContain("transform")
        vi.advanceTimersByTime(SHIFT_DURATION + 60)
        expect(a.style.transition).toBe("")
    })

    it("ignores keys that are not registered and zero shifts", () => {
        const a = wrapper(1, 1)
        applyShifts(new Map([["task-9", 5], ["task-1", 0]]))
        flushFrame()
        expect(a.style.transform).toBe("")
    })

    it("hides the given wrapper and shows it again when it is no longer the one", () => {
        const a = wrapper(1, 1)
        const b = wrapper(2, 1)
        applyShifts(new Map([["task-2", 5]]), "task-1")
        flushFrame()
        expect(a.style.opacity).toBe("0")
        applyShifts(new Map([["task-2", 5]]), "task-2")
        flushFrame()
        expect(a.style.opacity).toBe("")
        expect(b.style.opacity).toBe("0")
    })

    it("uses no transition with prefers-reduced-motion", () => {
        mockReducedMotion(true)
        const a = wrapper(1, 1)
        applyShifts(new Map([["task-1", 20]]))
        flushFrame()
        expect(a.style.transform).toBe("translate3d(0, 20px, 0)")
        expect(a.style.transition).toBe("none")
    })

    it("copes with a browser without matchMedia", () => {
        vi.stubGlobal("matchMedia", undefined)
        window.matchMedia = undefined as unknown as typeof window.matchMedia
        const a = wrapper(1, 1)
        applyShifts(new Map([["task-1", 20]]))
        flushFrame()
        expect(a.style.transition).toContain("150ms")
    })
})

describe("clearShifts", () => {
    it("resets at once and without transition, also the frame still to come", () => {
        const a = wrapper(1, 1)
        const b = wrapper(2, 1)
        applyShifts(new Map([["task-1", 20]]), "task-2")
        flushFrame()
        applyShifts(new Map([["task-1", 30]]))
        clearShifts(false)
        expect(a.style.transform).toBe("")
        expect(a.style.transition).toBe("")
        expect(b.style.opacity).toBe("")
        expect(frames).toHaveLength(0)
        expect(hasShifts()).toBe(false)
    })

    it("with animation the wrappers glide back, unless the motion is reduced", () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        const a = wrapper(1, 1)
        applyShifts(new Map([["task-1", 20]]))
        flushFrame()
        clearShifts(true)
        expect(a.style.transform).toBe("")
        expect(a.style.transition).toBe(`transform ${SHIFT_DURATION}ms ease-out`)

        applyShifts(new Map([["task-1", 20]]))
        flushFrame()
        mockReducedMotion(true)
        clearShifts(true)
        expect(a.style.transition).toBe("")
    })

    it("is harmless when nothing was shifted", () => {
        expect(() => clearShifts(true)).not.toThrow()
        expect(hasShifts()).toBe(false)
    })
})

describe("registerShiftNode", () => {
    it("forgets a wrapper that unmounts: it is no longer moved or hidden", () => {
        const a = wrapper(1, 1)
        applyShifts(new Map([["task-1", 20]]), "task-1")
        flushFrame()
        registerShiftNode("task-1", null)
        applyShifts(new Map([["task-1", 40]]))
        flushFrame()
        expect(a.style.transform).toBe("translate3d(0, 20px, 0)")
        expect(shiftOf(a)).toBe(0)
    })
})

describe("shiftOf", () => {
    it("adds the shift of the wrapper and of the wrappers around the element", () => {
        const parent = wrapper(1, 1)
        const child = wrapper(2, 1, parent)
        const inner = document.createElement("span")
        child.appendChild(inner)
        const other = wrapper(3, 1)
        applyShifts(new Map([["task-1", -10], ["task-2", 30]]))
        flushFrame()
        expect(shiftOf(inner)).toBe(20)
        expect(shiftOf(child)).toBe(20)
        expect(shiftOf(parent)).toBe(-10)
        expect(shiftOf(other)).toBe(0)
    })

    it("reads a matrix from the computed style (an animation in progress)", () => {
        const a = wrapper(1, 1)
        applyShifts(new Map([["task-1", 20]]))
        flushFrame()
        const real = window.getComputedStyle
        const spy = vi.spyOn(window, "getComputedStyle")
        spy.mockReturnValue({ transform: "matrix(1, 0, 0, 1, 0, 7)" } as CSSStyleDeclaration)
        expect(shiftOf(a)).toBe(7)
        spy.mockReturnValue({ transform: "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,9,0,1)" } as CSSStyleDeclaration)
        expect(shiftOf(a)).toBe(9)
        spy.mockRestore()
        expect(window.getComputedStyle).toBe(real)
    })
})

describe("readLiveSnapshot", () => {
    it("reads lists, parents and sizes in document order", () => {
        const first = wrapper(1, 5)
        const sub = wrapper(2, 5, first)
        const second = wrapper(3, 5)
        const elsewhere = wrapper(4, 8)
        first.getBoundingClientRect = () => ({ top: 0, height: 60 }) as DOMRect
        sub.getBoundingClientRect = () => ({ top: 20, height: 20 }) as DOMRect
        second.getBoundingClientRect = () => ({ top: 60, height: 20 }) as DOMRect
        elsewhere.getBoundingClientRect = () => ({ top: 200, height: 20 }) as DOMRect
        const { items, lists } = readLiveSnapshot()
        expect([...lists.keys()].sort()).toEqual(["s-5", "s-8", "t-1"])
        expect(lists.get("s-5")).toEqual(["task-1", "task-3"])
        expect(items.get("task-2")).toMatchObject({ list: "t-1", parent: "task-1", top: 20, height: 20 })
        expect(items.get("task-1")).toMatchObject({ list: "s-5", parent: null, ord: 0, end: 1 })
        expect(items.get("task-4")?.list).toBe("s-8")
    })

    it("skips the wrappers that are no longer in the page", () => {
        const a = wrapper(1, 1)
        wrapper(2, 1)
        a.remove()
        expect([...readLiveSnapshot().items.keys()]).toEqual(["task-2"])
    })

    it("orders a wrapper registered late by its place in the page", () => {
        const a = wrapper(1, 1)
        const b = wrapper(2, 1)
        a.before(b)
        expect([...readLiveSnapshot().items.keys()]).toEqual(["task-2", "task-1"])
    })
})
