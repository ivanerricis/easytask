// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearZones, hitTest, measureZones, registerZone } from "./note-dnd-hit"
import { ACCEPTS } from "./note-dnd"
import type { NoteOverKind } from "./note-dnd"
import { applyShifts, clearShifts, registerShiftNode, SHIFT_ATTR } from "./note-dnd-shift"

/** A ResizeObserver that tells what it watches and lets the test fire it (jsdom has none). */
class FakeObserver {
    static all: FakeObserver[] = []
    observed = new Set<Element>()
    disconnected = false
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) { this.callback = callback; FakeObserver.all.push(this) }
    observe(node: Element) { this.observed.add(node) }
    disconnect() { this.disconnected = true }
    fire() { this.callback([], this as unknown as ResizeObserver) }
}

let frames: FrameRequestCallback[] = []
const flushFrame = () => { const run = frames; frames = []; run.forEach(callback => callback(0)) }

beforeEach(() => {
    frames = []
    FakeObserver.all = []
    vi.stubGlobal("ResizeObserver", FakeObserver)
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal("cancelAnimationFrame", () => { frames = [] })
})

const nodes: string[] = []

/** A zone with a fixed rect (jsdom has no layout) that is registered like the rows do. */
const zone = (kind: NoteOverKind, id: number, box: { left: number, top: number, width: number, height: number }, parent: HTMLElement = document.body) => {
    const node = document.createElement("div")
    node.getBoundingClientRect = () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top }) as DOMRect
    parent.appendChild(node)
    const key = `${kind}-${id}`
    registerZone(key, kind, id, ACCEPTS[kind], node)
    nodes.push(key)
    return node
}

afterEach(() => {
    for (const key of nodes.splice(0)) registerZone(key, "task", 0, [], null)
    clearZones()
    clearShifts(false)
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
})

describe("note drag hit test", () => {
    it("finds the zone that contains the pointer, and nothing outside", () => {
        zone("task", 1, { left: 0, top: 0, width: 100, height: 20 })
        zone("task", 2, { left: 0, top: 20, width: 100, height: 20 })
        measureZones("task")
        expect(hitTest({ x: 50, y: 30 })?.ref).toEqual({ kind: "task", id: 2 })
        expect(hitTest({ x: 150, y: 30 })).toBeNull()
        expect(hitTest({ x: 50, y: 41 })).toBeNull()
    })

    it("the smallest zone wins: a task beats its section, a section beats its group", () => {
        zone("group", 1, { left: 0, top: 0, width: 300, height: 300 })
        zone("section", 5, { left: 0, top: 0, width: 200, height: 200 })
        zone("task", 9, { left: 0, top: 0, width: 100, height: 20 })
        measureZones("task")
        expect(hitTest({ x: 10, y: 10 })?.ref).toEqual({ kind: "task", id: 9 })
        expect(hitTest({ x: 10, y: 100 })?.ref).toEqual({ kind: "section", id: 5 })
        expect(hitTest({ x: 250, y: 250 })?.ref).toEqual({ kind: "group", id: 1 })
    })

    it("only the zones that accept the dragged kind take part", () => {
        zone("group", 1, { left: 0, top: 0, width: 300, height: 300 })
        zone("task", 9, { left: 0, top: 0, width: 100, height: 20 })
        zone("new-group", 0, { left: 0, top: 0, width: 50, height: 50 })
        measureZones("group") // a group is only dropped on a group
        expect(hitTest({ x: 10, y: 10 })?.ref).toEqual({ kind: "group", id: 1 })
        measureZones("section") // a section: the new group slot, not the task
        expect(hitTest({ x: 10, y: 10 })?.ref).toEqual({ kind: "new-group", id: 0 })
    })

    it("hands back the rect of the zone in the coordinates of the pointer", () => {
        zone("task", 1, { left: 10, top: 20, width: 100, height: 30 })
        measureZones("task")
        expect(hitTest({ x: 20, y: 30 })?.rect).toEqual({ left: 10, top: 20, width: 100, height: 30, right: 110, bottom: 50 })
    })

    it("follows the scroll of a scrollable ancestor since the measure", () => {
        const list = document.createElement("div")
        document.body.appendChild(list)
        // A list that scrolls: its content is bigger than it
        Object.defineProperty(list, "scrollHeight", { value: 500 })
        Object.defineProperty(list, "clientHeight", { value: 100 })
        zone("task", 1, { left: 0, top: 0, width: 100, height: 20 }, list)
        zone("task", 2, { left: 0, top: 20, width: 100, height: 20 }, list)
        measureZones("task")
        expect(hitTest({ x: 10, y: 5 })?.ref).toEqual({ kind: "task", id: 1 })
        list.scrollTop = 20 // the content moves up by 20: task 2 is now where task 1 was
        expect(hitTest({ x: 10, y: 5 })?.ref).toEqual({ kind: "task", id: 2 })
        expect(hitTest({ x: 10, y: 5 })?.rect.top).toBe(0)
        expect(hitTest({ x: 10, y: 25 })).toBeNull()
    })

    it("follows the horizontal scroll and any level of scrollable ancestors", () => {
        const outer = document.createElement("div")
        const inner = document.createElement("div")
        outer.appendChild(inner)
        document.body.appendChild(outer)
        for (const el of [outer, inner]) {
            Object.defineProperty(el, "scrollWidth", { value: 900 })
            Object.defineProperty(el, "clientWidth", { value: 100 })
        }
        zone("task", 1, { left: 300, top: 0, width: 100, height: 20 }, inner)
        measureZones("task")
        outer.scrollLeft = 100
        inner.scrollLeft = 150
        expect(hitTest({ x: 50, y: 5 })?.ref).toEqual({ kind: "task", id: 1 }) // 300 - 100 - 150
    })

    it("forgets the zones at the end of the drag", () => {
        zone("task", 1, { left: 0, top: 0, width: 100, height: 20 })
        measureZones("task")
        clearZones()
        expect(hitTest({ x: 10, y: 10 })).toBeNull()
    })

    it("a zone whose node left the document is not measured", () => {
        const node = zone("task", 1, { left: 0, top: 0, width: 100, height: 20 })
        node.remove()
        measureZones("task")
        expect(hitTest({ x: 10, y: 10 })).toBeNull()
    })

    describe("a row changes its size during the drag", () => {
        /** A zone whose box the test can change, like a row whose image finished loading. */
        const growing = (kind: NoteOverKind, id: number, box: { left: number, top: number, width: number, height: number }) => {
            const node = zone(kind, id, box)
            const set = (next: typeof box) => { node.getBoundingClientRect = () => ({ ...next, right: next.left + next.width, bottom: next.top + next.height, x: next.left, y: next.top }) as DOMRect }
            return { node, set }
        }
        const start = (onResize?: () => void) => {
            measureZones("task", onResize)
            flushFrame() // the first notification of the observer is over: changes count from here
            return FakeObserver.all[FakeObserver.all.length - 1]
        }

        it("watches the zones that take part and the wrappers that are shifted", () => {
            const row = growing("task", 1, { left: 0, top: 0, width: 100, height: 20 })
            const group = zone("group", 1, { left: 0, top: 0, width: 300, height: 300 })
            const wrap = document.createElement("div")
            wrap.setAttribute(SHIFT_ATTR.task, "1")
            document.body.appendChild(wrap)
            registerShiftNode("task-1", wrap)
            const observer = start()
            expect(observer.observed.has(row.node)).toBe(true)
            expect(observer.observed.has(group)).toBe(true)
            expect(observer.observed.has(wrap)).toBe(true)
            registerShiftNode("task-1", null)
        })

        it("measures again: the hit test follows the new size and the rows below", () => {
            const first = growing("task", 1, { left: 0, top: 0, width: 100, height: 20 })
            const second = growing("task", 2, { left: 0, top: 20, width: 100, height: 20 })
            const observer = start()
            expect(hitTest({ x: 50, y: 30 })?.ref).toEqual({ kind: "task", id: 2 })
            first.set({ left: 0, top: 0, width: 100, height: 50 })
            second.set({ left: 0, top: 50, width: 100, height: 20 })
            observer.fire()
            expect(hitTest({ x: 50, y: 30 })?.ref).toEqual({ kind: "task", id: 1 })
            expect(hitTest({ x: 50, y: 60 })?.ref).toEqual({ kind: "task", id: 2 })
        })

        it("takes the shift that is applied out of the new measure", () => {
            const first = growing("task", 1, { left: 0, top: 0, width: 100, height: 20 })
            const second = growing("task", 2, { left: 0, top: 20, width: 100, height: 20 })
            const wrap = document.createElement("div")
            wrap.appendChild(second.node)
            document.body.appendChild(wrap)
            registerShiftNode("task-2", wrap)
            const observer = start()
            applyShifts(new Map([["task-2", 20]]))
            flushFrame()
            // the first row grew by 30 and the second is shifted by 20 on top of it: 20 + 30 + 20 = 70 on screen
            first.set({ left: 0, top: 0, width: 100, height: 50 })
            second.set({ left: 0, top: 70, width: 100, height: 20 })
            observer.fire()
            expect(hitTest({ x: 50, y: 55 })?.ref).toEqual({ kind: "task", id: 2 }) // rest: 50..70
            expect(hitTest({ x: 50, y: 75 })).toBeNull()
            registerShiftNode("task-2", null)
        })

        it("calls onResize once per frame, however many changes came, and ignores the first notification", () => {
            growing("task", 1, { left: 0, top: 0, width: 100, height: 20 })
            const onResize = vi.fn()
            measureZones("task", onResize)
            const observer = FakeObserver.all[FakeObserver.all.length - 1]
            observer.fire() // the one of observe()
            flushFrame()
            expect(onResize).not.toHaveBeenCalled()
            observer.fire()
            observer.fire()
            window.dispatchEvent(new Event("resize"))
            flushFrame()
            expect(onResize).toHaveBeenCalledTimes(1)
        })

        it("stops watching at the end of the drag", () => {
            growing("task", 1, { left: 0, top: 0, width: 100, height: 20 })
            const onResize = vi.fn()
            const observer = start(onResize)
            observer.fire()
            clearZones()
            flushFrame()
            expect(observer.disconnected).toBe(true)
            expect(onResize).not.toHaveBeenCalled()
            window.dispatchEvent(new Event("resize"))
            flushFrame()
            expect(onResize).not.toHaveBeenCalled()
        })
    })
})
