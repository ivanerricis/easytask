// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { clearZones, hitTest, measureZones, registerZone } from "./note-dnd-hit"
import { ACCEPTS } from "./note-dnd"
import type { NoteOverKind } from "./note-dnd"

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
    document.body.innerHTML = ""
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
})
