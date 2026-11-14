// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOverlayFollower } from "./note-dnd-overlay"
import { NoteDragOverlay } from "./NoteDragOverlay"
import { NoteDndStoreContext, createNoteDndStore } from "./note-dnd-state"
import type { NoteDataTree } from "@/types/types"

const tree = { groups: [{ id: 1, position: 0, sections: [{ id: 10, name: "S", tasks: [{ id: 5, text: "Buy milk", subtasks: [], sectionID: 10 }] }] }] } as unknown as NoteDataTree
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: tree }) }))
vi.mock("@/contexts/use-color-alpha", () => ({ useColorAlpha: () => ({ header: () => 0.5 }) }))

let frames: FrameRequestCallback[] = []
const flushFrame = () => { const run = frames; frames = []; run.forEach(callback => callback(0)) }

beforeEach(() => {
    frames = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal("cancelAnimationFrame", () => { frames = [] })
})
afterEach(() => vi.unstubAllGlobals())

describe("the follower of the preview", () => {
    it("moves the box by the distance from where the pointer went down, once per frame", () => {
        const follower = createOverlayFollower()
        const node = document.createElement("div")
        follower.setNode(node)
        follower.begin({ left: 10, top: 20, width: 300, height: 40 }, { x: 100, y: 100 }, { x: 110, y: 100 })
        follower.follow({ x: 130, y: 90 })
        follower.follow({ x: 150, y: 80 })
        expect(frames).toHaveLength(1)
        flushFrame()
        expect(node.style.transform).toBe("translate3d(50px, -20px, 0)")
        expect(follower.rect()).toEqual({ left: 10, top: 20, width: 300, height: 40 })
    })

    it("puts the box where the pointer is as soon as it is mounted, and forgets the rect at the end", () => {
        const follower = createOverlayFollower()
        follower.begin(null, { x: 0, y: 0 }, { x: 7, y: 9 })
        const node = document.createElement("div")
        follower.setNode(node)
        expect(node.style.transform).toBe("translate3d(7px, 9px, 0)")
        follower.follow({ x: 8, y: 9 })
        follower.end()
        expect(frames).toHaveLength(0)
        expect(follower.rect()).toBeNull()
    })
})

describe("NoteDragOverlay", () => {
    it("shows the dragged task in a fixed box over the dragged element, only while dragging", () => {
        const follower = createOverlayFollower()
        const store = createNoteDndStore()
        render(<NoteDndStoreContext.Provider value={store}><NoteDragOverlay follower={follower} /></NoteDndStoreContext.Provider>)
        expect(document.querySelector("[data-note-drag-overlay]")).toBeNull()
        follower.begin({ left: 10, top: 20, width: 300, height: 40 }, { x: 15, y: 25 }, { x: 15, y: 25 })
        act(() => store.set({ active: { kind: "task", id: 5 } }))
        const box = document.querySelector<HTMLElement>("[data-note-drag-overlay]")!
        expect(box.textContent).toBe("Buy milk")
        expect(box.style.position).toBe("fixed")
        expect(box.style.left).toBe("10px")
        expect(box.style.width).toBe("300px")
        expect(box.style.pointerEvents).toBe("none")
        act(() => store.set({ active: null }))
        expect(document.querySelector("[data-note-drag-overlay]")).toBeNull()
    })
})
