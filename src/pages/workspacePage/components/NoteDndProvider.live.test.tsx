// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NoteDndProvider } from "./NoteDndProvider"
import { groupNodeKey, registerShiftNode, sectionNodeKey } from "./note-dnd-shift"
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
const moveSectionTo = vi.fn()
const moveGroupMock = vi.fn()
vi.mock("./note-dnd-state", async importActual => ({
    ...await importActual<typeof import("./note-dnd-state")>(),
    useNoteMoves: () => ({ moveSectionTo, moveTaskTo }),
    useGroupMoves: () => ({ moveGroupTo: (...args: unknown[]) => moveGroupMock(...args) }),
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
    moveSectionTo.mockReset()
    moveGroupMock.mockReset()
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

describe("NoteDndProvider live drag of the sections", () => {
    // Group 1: A (40), B (100), C (60); group 2: X (80), Y (20). Sections are 4px apart. Each section carries a task.
    const layout: [id: number, group: number, top: number, height: number][] = [
        [10, 1, 0, 40], [11, 1, 44, 100], [12, 1, 148, 60], [20, 2, 0, 80], [21, 2, 84, 20],
    ]
    const cards = new Map<number, HTMLElement>()
    const sectionTree = () => ({
        groups: [
            { id: 1, position: 0, sections: [10, 11, 12].map(id => ({ id, groupID: 1, tasks: [task(id)] })) },
            { id: 2, position: 1, sections: [20, 21].map(id => ({ id, groupID: 2, tasks: [task(id)] })) },
        ],
    }) as unknown as NoteDataTree
    const heightOf = (id: number) => layout.find(row => row[0] === id)![3]
    const topOf = (id: number) => layout.find(row => row[0] === id)![2]

    beforeEach(() => {
        tree = sectionTree()
        for (const [id, group, top, height] of layout) {
            const node = document.createElement("div")
            node.setAttribute("data-section-wrap", String(id))
            node.setAttribute("data-section-group", String(group))
            node.getBoundingClientRect = () => ({ top, height }) as DOMRect
            document.body.appendChild(node)
            registerShiftNode(sectionNodeKey(id), node)
            cards.set(id, node)
        }
    })
    afterEach(() => {
        for (const [id] of layout) registerShiftNode(sectionNodeKey(id), null)
    })

    const startSection = (id: number) => act(() => handlers.onDragStart({ active: { data: { current: { kind: "section", id } } } }))
    const moveTo = (activeId: number, kind: string, id: number, box: { top: number, height: number }, pointerY: number) => act(() => {
        handlers.onDragMove({
            active: { data: { current: { kind: "section", id: activeId } }, rect: { current: { translated: null } } },
            over: { data: { current: { kind, id } }, rect: { ...box, bottom: box.top + box.height } },
            activatorEvent: { clientX: 5, clientY: pointerY },
            delta: { x: 0, y: 0 },
        })
        flushFrame()
    })
    /** The pointer is at `ratio` of the section (0.1 = before, 0.9 = after). */
    const over = (activeId: number, overId: number, ratio: number) =>
        moveTo(activeId, "section", overId, { top: topOf(overId), height: heightOf(overId) }, topOf(overId) + heightOf(overId) * ratio)
    const shiftsOfCards = () => Object.fromEntries(layout.map(([id]) => [id, cards.get(id)!.style.transform]).filter(([, transform]) => transform))

    it("same group: the sections it passes step up by its room and the dragged one collapses", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(10)
        over(10, 12, 0.9) // after C
        expect(shiftsOfCards()).toEqual({ 11: "translate3d(0, -44px, 0)", 12: "translate3d(0, -44px, 0)" })
        expect(cards.get(10)!.style.opacity).toBe("0")
    })

    it("another group: closes the room it leaves and opens the one it takes", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(11)
        over(11, 20, 0.1) // before X
        expect(shiftsOfCards()).toEqual({
            12: "translate3d(0, -104px, 0)", 20: "translate3d(0, 104px, 0)", 21: "translate3d(0, 104px, 0)",
        })
    })

    it("the last place of another group: only the group it leaves closes", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(10)
        over(10, 21, 0.9) // after Y
        expect(shiftsOfCards()).toEqual({ 11: "translate3d(0, -44px, 0)", 12: "translate3d(0, -44px, 0)" })
    })

    it("follows the pointer from a section to another one", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(12)
        over(12, 10, 0.1) // before A
        expect(Object.keys(shiftsOfCards())).toEqual(["10", "11"])
        over(12, 11, 0.9) // after B: it is where it is
        expect(shiftsOfCards()).toEqual({})
        expect(cards.get(12)!.style.opacity).toBe("")
    })

    it("on the empty area of a group the section goes last: the sections it leaves close, none opens", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(10)
        moveTo(10, "group", 2, { top: 0, height: 400 }, 300)
        expect(shiftsOfCards()).toEqual({ 11: "translate3d(0, -44px, 0)", 12: "translate3d(0, -44px, 0)" })
        moveTo(10, "group", 1, { top: 0, height: 400 }, 300)
        expect(shiftsOfCards()).toEqual({ 11: "translate3d(0, -44px, 0)", 12: "translate3d(0, -44px, 0)" })
    })

    it("in the gap between two sections (over the group) the rows keep the place of the section left behind", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(10)
        over(10, 11, 0.9) // after B
        const shown = shiftsOfCards()
        expect(shown).toEqual({ 11: "translate3d(0, -44px, 0)" })
        // 4px under B, over the group: not the end of the group
        moveTo(10, "group", 1, { top: 0, height: 400 }, 148)
        expect(shiftsOfCards()).toEqual(shown)
        // far from any section: the end of the group
        moveTo(10, "group", 1, { top: 0, height: 400 }, 300)
        expect(Object.keys(shiftsOfCards())).toEqual(["11", "12"])
    })

    it("keeps the side of a section a few px past the middle (hysteresis)", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(10)
        over(10, 11, 0.9) // after B
        const after = shiftsOfCards()
        over(10, 11, 0.51) // 1 px past the middle: still after
        expect(shiftsOfCards()).toEqual(after)
        over(10, 11, 0.3) // clearly before: where it is
        expect(shiftsOfCards()).toEqual({})
    })

    it("moves nothing over a slot of a new group, over the section itself, or where the order does not change", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(11)
        over(11, 12, 0.1) // before C: B is already there
        expect(shiftsOfCards()).toEqual({})
        over(11, 11, 0.9)
        expect(shiftsOfCards()).toEqual({})
        over(11, 20, 0.1)
        expect(Object.keys(shiftsOfCards()).length).toBeGreaterThan(0)
        moveTo(11, "new-group", 1, { top: 0, height: 20 }, 10)
        expect(shiftsOfCards()).toEqual({})
        expect(cards.get(11)!.style.opacity).toBe("")
    })

    it("moves nothing when the live drag is off", () => {
        liveDrag = false
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(10)
        over(10, 12, 0.9)
        expect(shiftsOfCards()).toEqual({})
        expect(cards.get(10)!.style.opacity).toBe("")
    })

    it("does not move the tasks inside the sections", () => {
        const row = document.createElement("div")
        row.setAttribute("data-task-wrap", "10")
        row.setAttribute("data-task-section", "11")
        cards.get(11)!.appendChild(row)
        registerShiftNode("task-10", row)
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(10)
        over(10, 12, 0.9)
        expect(row.style.transform).toBe("")
        registerShiftNode("task-10", null)
    })

    it("a drop to another group keeps the cards where they are until the tree has the move, then puts them back at once", async () => {
        const { rerender } = render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(11)
        over(11, 20, 0.1)
        await act(async () => { await handlers.onDragEnd() })
        expect(moveSectionTo).toHaveBeenCalledWith(11, { type: "group", groupId: 2, index: 0 })
        expect(shiftsOfCards()[20]).toBe("translate3d(0, 104px, 0)")

        tree = sectionTree()
        rerender(<NoteDndProvider>{null}</NoteDndProvider>)
        expect(shiftsOfCards()).toEqual({})
        expect(cards.get(11)!.style.opacity).toBe("")
    })

    it("a cancelled drag brings the cards back", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startSection(10)
        over(10, 12, 0.9)
        act(() => handlers.onDragCancel())
        expect(shiftsOfCards()).toEqual({})
        expect(cards.get(10)!.style.opacity).toBe("")
    })
})

describe("NoteDndProvider live drag of the groups", () => {
    // Three columns 100, 60 and 80 wide, 8px apart: g1 at 0, g2 at 108, g3 at 176
    const layout: [id: number, left: number, width: number][] = [[1, 0, 100], [2, 108, 60], [3, 176, 80]]
    const columns = new Map<number, HTMLElement>()
    const groupTree = () => ({
        groups: layout.map(([id], position) => ({ id, position, sections: [] })),
    }) as unknown as NoteDataTree

    beforeEach(() => {
        tree = groupTree()
        for (const [id, left, width] of layout) {
            const node = document.createElement("div")
            node.setAttribute("data-group-wrap", String(id))
            node.getBoundingClientRect = () => ({ left, width, top: 0, height: 500 }) as DOMRect
            document.body.appendChild(node)
            registerShiftNode(groupNodeKey(id), node)
            columns.set(id, node)
        }
    })
    afterEach(() => {
        for (const [id] of layout) registerShiftNode(groupNodeKey(id), null)
    })

    const startGroup = (id: number) => act(() => handlers.onDragStart({ active: { data: { current: { kind: "group", id } } } }))
    const moveTo = (activeId: number, overId: number | null, pointerX: number, pointerY = 100) => act(() => {
        const [, left, width] = layout.find(row => row[0] === overId) ?? [0, 0, 0]
        handlers.onDragMove({
            active: { data: { current: { kind: "group", id: activeId } }, rect: { current: { translated: null } } },
            over: overId === null ? null : { data: { current: { kind: "group", id: overId } }, rect: { left, width, right: left + width, top: 0, bottom: 500, height: 500 } },
            activatorEvent: { clientX: pointerX, clientY: pointerY },
            delta: { x: 0, y: 0 },
        })
        flushFrame()
    })
    const shiftsOfColumns = () => Object.fromEntries(layout.map(([id]) => [id, columns.get(id)!.style.transform]).filter(([, transform]) => transform))

    it("the columns it passes step aside by its width and the dragged one collapses", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startGroup(1)
        moveTo(1, 3, 250) // right half of g3: after it
        expect(shiftsOfColumns()).toEqual({ 2: "translate3d(-108px, 0, 0)", 3: "translate3d(-108px, 0, 0)" })
        expect(columns.get(1)!.style.opacity).toBe("0")
    })

    it("going left opens the room before the column", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startGroup(3)
        moveTo(3, 1, 10) // left half of g1: before it
        expect(shiftsOfColumns()).toEqual({ 1: "translate3d(88px, 0, 0)", 2: "translate3d(88px, 0, 0)" })
    })

    it("keeps the side a few px past the middle (hysteresis) and moves nothing where the order does not change", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startGroup(1)
        moveTo(1, 3, 250)
        const after = shiftsOfColumns()
        moveTo(1, 3, 214) // 2px left of the middle of g3: still after
        expect(shiftsOfColumns()).toEqual(after)
        moveTo(1, 3, 180) // clearly before g3: the dragged one goes between g2 and g3
        expect(shiftsOfColumns()).toEqual({ 2: "translate3d(-108px, 0, 0)" })
        moveTo(1, 1, 90)
        expect(shiftsOfColumns()).toEqual({})
        expect(columns.get(1)!.style.opacity).toBe("")
    })

    it("in the gap around the column the columns keep the place, farther away they go back", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startGroup(1)
        moveTo(1, 3, 250)
        const shown = shiftsOfColumns()
        moveTo(1, null, 260) // 4px right of g3, over no group
        expect(shiftsOfColumns()).toEqual(shown)
        moveTo(1, null, 300)
        expect(shiftsOfColumns()).toEqual({})
    })

    it("moves nothing when the live drag is off", () => {
        liveDrag = false
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startGroup(1)
        moveTo(1, 3, 250)
        expect(shiftsOfColumns()).toEqual({})
    })

    it("a drop keeps the columns where they are until the tree has the move, then puts them back at once", async () => {
        const { rerender } = render(<NoteDndProvider>{null}</NoteDndProvider>)
        startGroup(1)
        moveTo(1, 3, 250)
        await act(async () => { await handlers.onDragEnd() })
        expect(moveGroupMock).toHaveBeenCalledWith(1, 2)
        expect(shiftsOfColumns()[3]).toBe("translate3d(-108px, 0, 0)")
        tree = groupTree()
        rerender(<NoteDndProvider>{null}</NoteDndProvider>)
        expect(shiftsOfColumns()).toEqual({})
        expect(columns.get(1)!.style.opacity).toBe("")
    })

    it("a cancelled drag brings the columns back", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        startGroup(1)
        moveTo(1, 3, 250)
        act(() => handlers.onDragCancel())
        expect(shiftsOfColumns()).toEqual({})
    })
})
