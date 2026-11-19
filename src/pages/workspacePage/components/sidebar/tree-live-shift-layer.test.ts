// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applyTreeShifts, clearTreeShifts, readTreeRest, registerTreeRow, SHIFT_LAYER_ATTR, treeShiftOf } from "./tree-live-shift"
import type { TreeShifts } from "./tree-dnd-live"

let frames: FrameRequestCallback[] = []
const flushFrame = () => { const run = frames; frames = []; run.forEach(callback => callback(0)) }

const KEYS = ["note-1", "note-2"]

const tree = () => {
    const root = document.createElement("div")
    root.setAttribute("role", "tree")
    document.body.appendChild(root)
    return root
}

/** A shift layer registered by row key, like the one of VirtualTree. */
const layer = (key: string, parent: HTMLElement) => {
    const node = document.createElement("div")
    node.setAttribute(SHIFT_LAYER_ATTR, "")
    parent.appendChild(node)
    registerTreeRow(key, node)
    return node
}

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
})

describe("the shift layer of a row", () => {
    it("moves what is inside it together (guides and item) and the droppable inside reads the shift of the layer", () => {
        const root = tree()
        const node = layer("note-1", root)
        const guide = document.createElement("span")
        const item = document.createElement("div")
        item.setAttribute("role", "treeitem")
        node.append(guide, item)
        applyTreeShifts(shifts({ "note-1": 32 }))
        flushFrame()
        expect(node.style.transform).toBe("translate3d(0, 32px, 0)")
        // Only the layer carries the transform: the item and the guide follow it, they are not shifted again
        expect(item.style.transform).toBe("")
        expect(guide.style.transform).toBe("")
        expect(treeShiftOf(item)).toBe(32)
        expect(treeShiftOf(guide)).toBe(32)
    })

    it("hides the guides with the dragged row (opacity on the layer)", () => {
        const node = layer("note-1", tree())
        applyTreeShifts(shifts({}, ["note-1"]))
        flushFrame()
        expect(node.style.opacity).toBe("0")
    })

    it("is zero for an element that is in no layer", () => {
        const root = tree()
        layer("note-1", root)
        const stray = document.createElement("div")
        root.appendChild(stray)
        applyTreeShifts(shifts({ "note-1": 32 }))
        flushFrame()
        expect(treeShiftOf(stray)).toBe(0)
    })
})

describe("the skeleton", () => {
    it("draws one guide per level of the place, and none for the root", () => {
        const root = tree()
        const first = layer("note-1", root)
        layer("note-2", root)
        vi.spyOn(root, "getBoundingClientRect").mockReturnValue({ top: 0 } as DOMRect)
        vi.spyOn(first, "getBoundingClientRect").mockReturnValue({ top: 0 } as DOMRect)
        readTreeRest(key => (key === "note-1" ? 0 : 1), 32, 4, 20, 12)
        applyTreeShifts(shifts({ "note-2": 32 }), { index: 1, count: 1, depth: 2 })
        flushFrame()
        const slot = root.querySelector<HTMLElement>(".live-drag-slot")!
        const guides = slot.querySelectorAll<HTMLElement>("[data-testid='tree-slot-guide']")
        expect(guides).toHaveLength(2)
        // The x of the guide of a level in the tree, relative to the padding box of the skeleton (at 2 * 20px, 1px border)
        expect(guides[0].style.left).toBe(`${12 - 40 - 1}px`)
        expect(guides[1].style.left).toBe(`${20 + 12 - 40 - 1}px`)
        applyTreeShifts(shifts({ "note-2": 32 }), { index: 1, count: 1, depth: 0 })
        flushFrame()
        expect(root.querySelector(".live-drag-slot")?.querySelectorAll("[data-testid='tree-slot-guide']")).toHaveLength(0)
    })
})
