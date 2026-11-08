// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NoteDndProvider } from "./NoteDndProvider"
import { registerShiftNode } from "./note-dnd-shift"
import type { NoteDataTree } from "@/types/types"

type Handlers = {
    onDragStart: (event: unknown) => void
    onDragMove: (event: unknown) => void
    onDragEnd: () => void
    onDragCancel: () => void
    measuring?: unknown
}
let handlers: Handlers
vi.mock("@dnd-kit/core", async importActual => ({
    ...await importActual<typeof import("@dnd-kit/core")>(),
    DndContext: (props: Handlers & { children: ReactNode }) => { handlers = props; return <>{props.children}</> },
    DragOverlay: () => null,
}))
vi.mock("./tasks/note-announcer-store", () => ({ announce: vi.fn() }))

const task = (id: number) => ({ id, text: `Task ${id}`, subtasks: [], sectionID: 10 })
const makeTree = (ids: number[]) => ({ groups: [{ id: 1, position: 0, sections: [{ id: 10, tasks: ids.map(task) }] }] }) as unknown as NoteDataTree
let tree = makeTree([1, 2, 3])
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: tree }) }))
vi.mock("@/contexts/use-color-alpha", () => ({ useColorAlpha: () => ({ header: () => 0.5 }) }))
const moveTaskTo = vi.fn()
vi.mock("./note-dnd-state", async importActual => ({
    ...await importActual<typeof import("./note-dnd-state")>(),
    useNoteMoves: () => ({ moveSectionTo: vi.fn(), moveTaskTo }),
    useGroupMoves: () => ({ moveGroupTo: vi.fn() }),
}))
let liveDrag: boolean | undefined = true
vi.mock("@/contexts/use-preference", () => ({ usePreference: (selector: (p: { liveDrag?: boolean }) => unknown) => selector({ liveDrag }) }))

let frames: FrameRequestCallback[] = []
const flushFrame = () => { const run = frames; frames = []; run.forEach(callback => callback(0)) }
const wrappers = new Map<number, HTMLElement>()

beforeEach(() => {
    frames = []
    liveDrag = true
    tree = makeTree([1, 2, 3])
    moveTaskTo.mockReset()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal("cancelAnimationFrame", () => { frames = [] })
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia
    // Three rows of 20px, one under the other
    for (const id of [1, 2, 3]) {
        const node = document.createElement("div")
        node.setAttribute("data-task-wrap", String(id))
        node.setAttribute("data-task-section", "10")
        node.getBoundingClientRect = () => ({ top: (id - 1) * 20, height: 20 }) as DOMRect
        document.body.appendChild(node)
        registerShiftNode(`task-${id}`, node)
        wrappers.set(id, node)
    }
})

afterEach(() => {
    for (const id of [1, 2, 3]) registerShiftNode(`task-${id}`, null)
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
})

const start = (id: number) => act(() => handlers.onDragStart({ active: { data: { current: { kind: "task", id } } } }))
/** The pointer is 20% from the top of the row (before) or 90% (after). */
const moveOver = (activeId: number, overId: number, ratio: number) => act(() => {
    const top = (overId - 1) * 20
    handlers.onDragMove({
        active: { data: { current: { kind: "task", id: activeId } }, rect: { current: { translated: null } } },
        over: { data: { current: { kind: "task", id: overId } }, rect: { top, height: 20 } },
        activatorEvent: { clientX: 5, clientY: top + 20 * ratio },
        delta: { x: 0, y: 0 },
    })
    flushFrame()
})
const transforms = () => [1, 2, 3].map(id => wrappers.get(id)!.style.transform)

describe("NoteDndProvider live drag of the tasks", () => {
    it("shifts the rows between the dragged task and the place, and hides the dragged one", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.9) // after task 3
        expect(transforms()).toEqual(["", "translate3d(0, -20px, 0)", "translate3d(0, -20px, 0)"])
        expect(wrappers.get(1)!.style.opacity).toBe("0")
    })

    it("follows the pointer: another place moves other rows", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(3)
        moveOver(3, 1, 0.1) // before task 1
        expect(transforms()).toEqual(["translate3d(0, 20px, 0)", "translate3d(0, 20px, 0)", ""])
        moveOver(3, 2, 0.1) // before task 2
        expect(transforms()).toEqual(["", "translate3d(0, 20px, 0)", ""])
    })

    it("moves nothing in the middle of a row (it becomes a subtask), nor over the task itself", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.5)
        expect(transforms()).toEqual(["", "", ""])
        moveOver(1, 1, 0.9)
        expect(transforms()).toEqual(["", "", ""])
        expect(wrappers.get(1)!.style.opacity).toBe("")
    })

    it("moves nothing when the live drag is off, and measures the droppables the usual way", () => {
        liveDrag = false
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.9)
        expect(transforms()).toEqual(["", "", ""])
        expect(handlers.measuring).toBeUndefined()
    })

    it("measures the droppables without the shift when the live drag is on", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        expect(handlers.measuring).toBeDefined()
    })

    it("treats a missing preference as on", () => {
        liveDrag = undefined
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.9)
        expect(transforms()[1]).toBe("translate3d(0, -20px, 0)")
    })

    it("a cancelled drag brings the rows back", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.9)
        act(() => handlers.onDragCancel())
        expect(transforms()).toEqual(["", "", ""])
        expect(wrappers.get(1)!.style.opacity).toBe("")
    })

    it("a drag that leaves every droppable brings the rows back", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.9)
        act(() => handlers.onDragMove({ active: { data: { current: { kind: "task", id: 1 } } }, over: null, delta: { x: 0, y: 0 } }))
        flushFrame()
        expect(transforms()).toEqual(["", "", ""])
    })

    it("a drop keeps the rows where they are until the tree has the new order, then puts them back at once", async () => {
        const { rerender } = render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.9)
        await act(async () => { await handlers.onDragEnd() })
        expect(moveTaskTo).toHaveBeenCalledWith(1, { sectionId: 10, parentTaskId: null, index: 2 })
        expect(transforms()[1]).toBe("translate3d(0, -20px, 0)")

        tree = makeTree([2, 3, 1])
        rerender(<NoteDndProvider>{null}</NoteDndProvider>)
        expect(transforms()).toEqual(["", "", ""])
        expect(wrappers.get(1)!.style.opacity).toBe("")
        expect(wrappers.get(2)!.style.transition).toBe("")
    })

    it("puts the rows back after a while when the tree does not change", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        try {
            render(<NoteDndProvider>{null}</NoteDndProvider>)
            start(1)
            moveOver(1, 3, 0.9)
            await act(async () => { await handlers.onDragEnd() })
            expect(transforms()[1]).not.toBe("")
            await act(async () => { vi.advanceTimersByTime(600) })
            expect(transforms()).toEqual(["", "", ""])
        } finally {
            vi.useRealTimers()
        }
    })

    it("a drop with no valid place just puts the rows back", async () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.9)
        act(() => handlers.onDragMove({ active: { data: { current: { kind: "task", id: 1 } } }, over: null, delta: { x: 0, y: 0 } }))
        await act(async () => { await handlers.onDragEnd() })
        flushFrame()
        expect(moveTaskTo).not.toHaveBeenCalled()
        expect(transforms()).toEqual(["", "", ""])
    })

    it("does not move anything when a section is dragged", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        act(() => handlers.onDragStart({ active: { data: { current: { kind: "section", id: 10 } } } }))
        act(() => handlers.onDragMove({
            active: { data: { current: { kind: "section", id: 10 } } },
            over: { data: { current: { kind: "task", id: 3 } }, rect: { top: 40, height: 20 } },
            activatorEvent: { clientX: 0, clientY: 58 }, delta: { x: 0, y: 0 },
        }))
        flushFrame()
        expect(transforms()).toEqual(["", "", ""])
    })

    it("puts the rows back when the provider unmounts in the middle of a drag", () => {
        const { unmount } = render(<NoteDndProvider>{null}</NoteDndProvider>)
        start(1)
        moveOver(1, 3, 0.9)
        unmount()
        expect(transforms()).toEqual(["", "", ""])
    })
})
