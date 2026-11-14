import { act, render } from "@testing-library/react"
import { useContext } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NoteDndProvider } from "./NoteDndProvider"
import { createSelectionStore } from "./sidebar/selection"
import { TaskSelectionContext } from "./tasks/use-task-selection"
import { taskKey } from "./tasks/task-selection"
import { NoteDndStoreContext, NoteDragPressContext, type NoteDndStore } from "./note-dnd-state"
import { announce } from "./tasks/note-announcer-store"
import type { NoteDragRef } from "./note-dnd"
import type { PointerDragHandlers } from "./note-dnd-pointer"

// The controller of the pointer is replaced by one that hands the provider's handlers to the test (the real one is tested in
// note-dnd-pointer.test.ts); the tests speak the shape of the old dnd-kit events, turned here into the pointer the provider gets now
let latest: PointerDragHandlers
const driver = () => latest
const handlers = {
    onDragStart: (event: unknown) => {
        const ref = (event as { active: { data: { current: NoteDragRef } } }).active.data.current
        driver().start(ref, { pointer: { x: 0, y: 0 }, press: { x: 0, y: 0 }, node: null })
    },
    onDragMove: (event: unknown) => {
        const { activatorEvent, delta } = event as { activatorEvent?: { clientX: number, clientY: number }, delta?: { x: number, y: number } }
        driver().move(activatorEvent ? { x: activatorEvent.clientX + (delta?.x ?? 0), y: activatorEvent.clientY + (delta?.y ?? 0) } : { x: -1, y: -1 })
    },
    onDragEnd: () => driver().end(),
    onDragCancel: () => driver().cancel(),
}
vi.mock("./note-dnd-pointer", async importActual => ({
    ...await importActual<typeof import("./note-dnd-pointer")>(),
    createPointerDrag: () => {
        return { press: () => undefined, getPointer: () => null, isDragging: () => false, cancel: () => driver().cancel(), setHandlers: (next: PointerDragHandlers) => { latest = next } }
    },
}))
vi.mock("./tasks/note-announcer-store", () => ({ announce: vi.fn() }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: null }) }))
vi.mock("@/contexts/use-color-alpha", () => ({ useColorAlpha: () => ({ header: () => 0.5 }) }))
vi.mock("./note-dnd-state", async importActual => ({
    ...await importActual<typeof import("./note-dnd-state")>(),
    useNoteMoves: () => ({ moveSectionTo: vi.fn(), moveTaskTo: vi.fn() }),
    useGroupMoves: () => ({ moveGroupTo: vi.fn() }),
}))

const startDrag = (kind: "task" | "section", id: number) =>
    act(() => handlers.onDragStart({ active: { data: { current: { kind, id } } } }))

describe("NoteDndProvider drag of a selected task", () => {
    const store = createSelectionStore()

    const setup = () => render(
        <TaskSelectionContext.Provider value={store}>
            <NoteDndProvider>{null}</NoteDndProvider>
        </TaskSelectionContext.Provider>,
    )

    beforeEach(() => {
        store.sync([taskKey(1), taskKey(2), taskKey(3)])
        store.reset()
        vi.mocked(announce).mockClear()
    })

    it("clears the multi-selection when a task of it is dragged, and tells it to the screen readers", () => {
        store.toggle(taskKey(1)); store.toggle(taskKey(2))
        setup()
        startDrag("task", 1)
        expect(store.getSelected().size).toBe(0)
        expect(announce).toHaveBeenCalledWith("Viene spostato solo questo task")
    })

    it("leaves the selection alone when the dragged task is not part of it", () => {
        store.toggle(taskKey(1)); store.toggle(taskKey(2))
        setup()
        startDrag("task", 3)
        expect([...store.getSelected()]).toEqual([taskKey(1), taskKey(2)])
        expect(announce).not.toHaveBeenCalledWith("Viene spostato solo questo task")
    })

    it("leaves a selection of a single task alone, without announcing anything", () => {
        store.toggle(taskKey(1))
        setup()
        startDrag("task", 1)
        expect(store.getSelected().size).toBe(1)
        expect(announce).not.toHaveBeenCalledWith("Viene spostato solo questo task")
    })

    it("does not touch the selection when a section is dragged", () => {
        store.toggle(taskKey(1)); store.toggle(taskKey(2))
        setup()
        startDrag("section", 1)
        expect(store.getSelected().size).toBe(2)
    })
})

describe("NoteDndProvider renders", () => {
    const store = createSelectionStore()
    let dnd: NoteDndStore
    const Grab = () => { dnd = useContext(NoteDndStoreContext); return null }
    const tree = () => (
        <TaskSelectionContext.Provider value={store}>
            <NoteDndProvider><Grab /></NoteDndProvider>
        </TaskSelectionContext.Provider>
    )

    it("keeps the same press function across renders (a new one would change the props of every draggable)", () => {
        let press: unknown
        const Grab = () => { press = useContext(NoteDragPressContext); return null }
        const view = render(<NoteDndProvider><Grab /></NoteDndProvider>)
        const first = press
        view.rerender(<NoteDndProvider><Grab /></NoteDndProvider>)
        expect(press).toBe(first)
    })

    it("does not render again when the target of the drag changes, and the cursor follows it", () => {
        render(tree())
        startDrag("task", 1)
        const rendered = handlers.onDragStart
        act(() => dnd.set({ hover: { overKey: "task-2", zone: "inside", targetSectionId: null } }))
        act(() => dnd.set({ hover: { overKey: null, zone: null, targetSectionId: null } }))
        expect(handlers.onDragStart).toBe(rendered)
        expect(document.body.querySelector<HTMLElement>("[data-drag-cursor]")?.style.cursor).toBe("not-allowed")
    })
})

describe("NoteDndProvider drag state and announcements", () => {
    let dnd: NoteDndStore
    const Grab = () => { dnd = useContext(NoteDndStoreContext); return null }
    const setup = () => render(<NoteDndProvider><Grab /></NoteDndProvider>)
    const api = () => handlers as unknown as { onDragMove: (event: unknown) => void, onDragEnd: () => Promise<void> }

    beforeEach(() => vi.mocked(announce).mockClear())

    it("marks the body while dragging (the insert lines hide by CSS), and clears it", () => {
        setup()
        startDrag("task", 1)
        expect(document.body.hasAttribute("data-note-dragging")).toBe(true)
        act(() => dnd.set({ active: null }))
        expect(document.body.hasAttribute("data-note-dragging")).toBe(false)
    })

    it("announces the start, the target and the result from the hit test", async () => {
        setup()
        startDrag("task", 1)
        vi.mocked(announce).mockClear() // the start of the drag is announced too
        act(() => api().onDragMove({ active: { data: { current: { kind: "task", id: 1 } } }, over: null, delta: { x: 0, y: 0 } }))
        expect(announce).not.toHaveBeenCalled() // still no target: nothing new to say
        act(() => api().onDragMove({ active: { data: { current: { kind: "task", id: 1 } } }, over: null, delta: { x: 0, y: 0 } }))
        expect(announce).not.toHaveBeenCalled()
        await act(async () => { await api().onDragEnd() })
        expect(announce).toHaveBeenCalledTimes(1) // the result
    })

    it("announces the start of the drag and its cancel", () => {
        setup()
        startDrag("task", 1)
        expect(announce).toHaveBeenCalledTimes(1)
        act(() => handlers.onDragCancel())
        expect(announce).toHaveBeenCalledTimes(2)
        expect(dnd.getState().active).toBeNull()
    })
})

describe("NoteDndProvider drag overlay", () => {
    it("shows no preview while nothing is dragged", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        expect(document.querySelector("[data-note-drag-overlay]")).toBeNull()
    })
})
