// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EDGE_BAND, MAX_SPEED, scrollStep, scrollableAncestors, startAutoScroll } from "./note-dnd-autoscroll"

/** A box of 100x100 at the top left whose content is 100 wide and 300 tall (or as given). */
const box = (attrs: Record<string, string>, content: { w: number, h: number } = { w: 100, h: 300 }) => {
    const node = document.createElement("div")
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
    node.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }) as DOMRect
    Object.defineProperty(node, "clientWidth", { value: 100 })
    Object.defineProperty(node, "clientHeight", { value: 100 })
    Object.defineProperty(node, "scrollWidth", { value: content.w })
    Object.defineProperty(node, "scrollHeight", { value: content.h })
    document.body.appendChild(node)
    return node
}

describe("scrollableAncestors", () => {
    it("takes only the row of the groups and the lists of a group, the innermost first", () => {
        const scroll = box({ "data-testid": "group-scroll" })
        const list = document.createElement("div")
        list.setAttribute("data-group-list", "")
        const pane = document.createElement("div")
        pane.setAttribute("data-pane", "0")
        const row = document.createElement("div")
        scroll.appendChild(pane)
        pane.appendChild(list)
        list.appendChild(row)
        expect(scrollableAncestors(row)).toEqual([list, scroll])
        expect(scrollableAncestors(scroll)).toEqual([])
        expect(scrollableAncestors(null)).toEqual([])
    })
})

describe("scrollStep", () => {
    it("is zero in the middle and grows to the full speed at the edge, within a band of 20%", () => {
        const list = box({ "data-group-list": "" })
        list.scrollTop = 100
        expect(scrollStep(list, { x: 50, y: 50 }, "y")).toBe(0)
        expect(scrollStep(list, { x: 50, y: 100 * EDGE_BAND + 1 }, "y")).toBe(0)
        expect(scrollStep(list, { x: 50, y: 0 }, "y")).toBe(-MAX_SPEED)
        expect(scrollStep(list, { x: 50, y: 100 }, "y")).toBe(MAX_SPEED)
        // A direction the pointer has not moved in is not scrolled
        expect(scrollStep(list, { x: 50, y: 100 }, "y", undefined, { back: true, forward: false })).toBe(0)
        expect(scrollStep(list, { x: 50, y: 0 }, "y", undefined, { back: false, forward: true })).toBe(0)
        expect(scrollStep(list, { x: 50, y: 10 }, "y")).toBeCloseTo(-MAX_SPEED / 2)
    })

    it("does not scroll past the ends, nor when the pointer is beside the box, nor when there is nothing to scroll", () => {
        const list = box({ "data-group-list": "" })
        list.scrollTop = 0
        expect(scrollStep(list, { x: 50, y: 0 }, "y")).toBe(0) // already at the top
        list.scrollTop = 200
        expect(scrollStep(list, { x: 50, y: 100 }, "y")).toBe(0) // already at the bottom (300 - 100)
        list.scrollTop = 50
        expect(scrollStep(list, { x: 150, y: 0 }, "y")).toBe(0) // beside the list
        const row = box({ "data-testid": "group-scroll" }, { w: 400, h: 100 })
        row.scrollLeft = 100
        expect(scrollStep(row, { x: -20, y: 50 }, "x")).toBe(0) // past the end of the row, on the side: not over it
        expect(scrollStep(list, { x: 0, y: 50 }, "x")).toBe(0) // content as wide as the box
    })

    it("scrolls sideways the row of the groups", () => {
        const row = box({ "data-testid": "group-scroll" }, { w: 400, h: 100 })
        expect(scrollStep(row, { x: 100, y: 50 }, "x")).toBe(MAX_SPEED)
    })
})

describe("startAutoScroll", () => {
    let frames: FrameRequestCallback[] = []
    const frame = (time: number) => { const run = frames; frames = []; run.forEach(callback => callback(time)) }
    beforeEach(() => {
        frames = []
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
        vi.stubGlobal("cancelAnimationFrame", () => { frames = [] })
        vi.spyOn(performance, "now").mockReturnValue(0)
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        document.body.innerHTML = ""
    })

    it("scrolls by the time elapsed while the pointer is at the edge, and stops when asked", () => {
        const list = box({ "data-group-list": "" })
        list.scrollTop = 100
        const scrollBy = vi.fn()
        list.scrollBy = scrollBy as unknown as typeof list.scrollBy
        let pointer = { x: 50, y: 60 }
        const stop = startAutoScroll([list], () => pointer)
        pointer = { x: 50, y: 100 } // moved down to the edge
        frame(10) // 10ms at the full speed: 20px
        expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: 20, behavior: "instant" })
        stop()
        frame(20)
        expect(scrollBy).toHaveBeenCalledTimes(1)
    })

    it("scrolls a single small step after a long frame (a busy page does not jump), and at most a frame of 60 Hz otherwise", () => {
        const list = box({ "data-group-list": "" })
        list.scrollTop = 100
        const scrollBy = vi.fn()
        list.scrollBy = scrollBy as unknown as typeof list.scrollBy
        let pointer = { x: 50, y: 60 }
        startAutoScroll([list], () => pointer)
        pointer = { x: 50, y: 100 }
        frame(200) // 200ms since the last frame: 5ms worth, 10px
        expect(scrollBy).toHaveBeenLastCalledWith({ left: 0, top: 10, behavior: "instant" })
        frame(225) // 25ms: capped at 17ms, 34px
        expect(scrollBy).toHaveBeenLastCalledWith({ left: 0, top: 34, behavior: "instant" })
    })

    it("lets the innermost container that can scroll win, and does nothing away from the edges", () => {
        const outer = box({ "data-testid": "group-scroll" })
        const inner = box({ "data-group-list": "" })
        outer.scrollTop = 50
        inner.scrollTop = 0 // at the top: cannot go up
        const outerBy = vi.fn()
        const innerBy = vi.fn()
        outer.scrollBy = outerBy as unknown as typeof outer.scrollBy
        inner.scrollBy = innerBy as unknown as typeof inner.scrollBy
        let pointer = { x: 50, y: 30 }
        startAutoScroll([inner, outer], () => pointer)
        pointer = { x: 50, y: 0 } // moved up to the edge
        frame(10)
        expect(innerBy).not.toHaveBeenCalled()
        expect(outerBy).toHaveBeenCalledWith({ left: 0, top: -20, behavior: "instant" })
        pointer = { x: 50, y: 50 }
        frame(20)
        expect(outerBy).toHaveBeenCalledTimes(1)
    })

    it("does not scroll back to the start when the pointer is beside the container, however far it went left", () => {
        // The row of the groups at x 100..300 whose columns stick out on the left: the pointer is over a column outside of it
        const row = box({ "data-testid": "group-scroll" }, { w: 400, h: 100 })
        row.getBoundingClientRect = () => ({ left: 100, top: 0, right: 300, bottom: 100, width: 200, height: 100 }) as DOMRect
        row.scrollLeft = 150
        const scrollBy = vi.fn()
        row.scrollBy = scrollBy as unknown as typeof row.scrollBy
        let pointer = { x: 280, y: 50 }
        startAutoScroll([row], () => pointer)
        pointer = { x: 110, y: 50 } // moving left, into the left band of the row
        frame(10)
        expect(scrollBy).toHaveBeenCalledTimes(1)
        pointer = { x: 60, y: 50 } // beside the row now
        frame(20)
        expect(scrollBy).toHaveBeenCalledTimes(1)
    })

    it("scrolls a direction only once the pointer has moved that way (a press in a band does not scroll by itself)", () => {
        const list = box({ "data-group-list": "" })
        list.scrollTop = 100
        const scrollBy = vi.fn()
        list.scrollBy = scrollBy as unknown as typeof list.scrollBy
        let pointer = { x: 50, y: 95 } // already in the bottom band when the drag starts
        startAutoScroll([list], () => pointer)
        frame(10)
        frame(20)
        expect(scrollBy).not.toHaveBeenCalled() // never moved
        pointer = { x: 50, y: 96 } // moved down: the way to the end is allowed
        frame(30)
        expect(scrollBy).toHaveBeenCalledTimes(1)
        pointer = { x: 50, y: 5 } // moved up into the top band: the way to the start is allowed from now on too
        frame(40)
        expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ top: expect.any(Number) }))
        expect((scrollBy.mock.calls.at(-1)![0] as { top: number }).top).toBeLessThan(0)
    })

    it("does not even ask for frames without containers", () => {
        startAutoScroll([], () => null)
        expect(frames).toHaveLength(0)
    })
})
