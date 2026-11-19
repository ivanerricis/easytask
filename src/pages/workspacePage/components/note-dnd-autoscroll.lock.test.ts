// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { otherScrollers, startAutoScroll, startScrollLock } from "./note-dnd-autoscroll"

/** A box of 100x100 whose content is 300 tall. */
const box = (attrs: Record<string, string>) => {
    const node = document.createElement("div")
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
    node.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }) as DOMRect
    Object.defineProperty(node, "clientWidth", { value: 100 })
    Object.defineProperty(node, "clientHeight", { value: 100 })
    Object.defineProperty(node, "scrollWidth", { value: 100 })
    Object.defineProperty(node, "scrollHeight", { value: 300 })
    document.body.appendChild(node)
    return node
}

afterEach(() => {
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
})

describe("otherScrollers", () => {
    it("takes the containers that are not the source's, innermost first", () => {
        const sourceList = box({ "data-group-list": "" })
        const row = box({ "data-testid": "group-scroll" })
        const list = document.createElement("div")
        list.setAttribute("data-group-list", "")
        row.appendChild(list)
        expect(otherScrollers([sourceList])).toEqual([list, row])
        expect(otherScrollers([])).toHaveLength(3)
    })
})

describe("startAutoScroll with a set of containers that changes", () => {
    let frames: FrameRequestCallback[] = []
    beforeEach(() => {
        frames = []
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
        vi.stubGlobal("cancelAnimationFrame", () => { frames = [] })
    })
    const tick = (time: number) => { const run = frames; frames = []; run.forEach(callback => callback(time)) }

    it("asks for the containers every frame: only the ones of the moment scroll", () => {
        const here = box({ "data-group-list": "" })
        const there = box({ "data-group-list": "" })
        here.scrollTop = 50
        there.scrollTop = 50
        const hereBy = vi.fn()
        const thereBy = vi.fn()
        here.scrollBy = hereBy
        there.scrollBy = thereBy
        let current = [here]
        let pointer = { x: 50, y: 60 }
        const stop = startAutoScroll(() => current, () => pointer)
        tick(0)
        pointer = { x: 50, y: 98 } // towards the bottom edge: the intent is "forward"
        tick(16)
        expect(hereBy).toHaveBeenCalled()
        expect(thereBy).not.toHaveBeenCalled()
        current = [there]
        tick(32)
        expect(thereBy).toHaveBeenCalled()
        stop()
    })
})

describe("startScrollLock", () => {
    const wheel = (target: Element, init: WheelEventInit = {}) => {
        const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40, ...init })
        target.dispatchEvent(event)
        return event
    }

    it("does nothing while it is not locked", () => {
        const list = box({ "data-group-list": "" })
        const lock = startScrollLock(() => [list])
        expect(wheel(list).defaultPrevented).toBe(false)
        lock.stop()
    })

    it("blocks the wheel over the source containers and scrolls the one under the pointer elsewhere by hand", () => {
        const source = box({ "data-group-list": "" })
        const other = box({ "data-group-list": "" })
        const inner = document.createElement("span")
        other.appendChild(inner)
        const by = vi.fn()
        const sourceBy = vi.fn()
        other.scrollBy = by
        source.scrollBy = sourceBy
        const lock = startScrollLock(() => [source])
        lock.update(true)
        expect(wheel(source).defaultPrevented).toBe(true)
        expect(sourceBy).not.toHaveBeenCalled()
        // With Ctrl the browser would zoom the page: the wheel is taken and the container scrolls instead
        expect(wheel(inner).defaultPrevented).toBe(true)
        expect(by).toHaveBeenCalledWith({ left: 0, top: 40, behavior: "instant" })
        lock.update(false)
        expect(wheel(inner).defaultPrevented).toBe(false)
        lock.stop()
    })

    it("puts a source container back where it was when anything else moves it", () => {
        const source = box({ "data-group-list": "" })
        source.scrollTop = 30
        const scrollTo = vi.fn()
        source.scrollTo = scrollTo as unknown as typeof source.scrollTo
        const lock = startScrollLock(() => [source])
        lock.update(true)
        source.scrollTop = 80
        source.dispatchEvent(new Event("scroll"))
        expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 30, behavior: "instant" })
        lock.stop()
    })

    it("stops listening", () => {
        const list = box({ "data-group-list": "" })
        const lock = startScrollLock(() => [list])
        lock.update(true)
        lock.stop()
        expect(wheel(list).defaultPrevented).toBe(false)
    })
})

describe("otherScrollers leaves out everything inside the source root", () => {
    it("a sibling list of the source note is not an 'other' container", () => {
        const root = box({ "data-testid": "group-scroll" })
        const sibling = document.createElement("div")
        sibling.setAttribute("data-group-list", "")
        root.appendChild(sibling)
        const elsewhere = box({ "data-group-list": "" })
        expect(otherScrollers([root])).toEqual([elsewhere])
    })
})
