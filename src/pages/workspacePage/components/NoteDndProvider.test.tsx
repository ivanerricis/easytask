import { act, render } from "@testing-library/react"
import { useContext, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NoteDndProvider } from "./NoteDndProvider"
import { createSelectionStore } from "./sidebar/selection"
import { TaskSelectionContext } from "./tasks/use-task-selection"
import { taskKey } from "./tasks/task-selection"
import { NoteDndStoreContext, type NoteDndStore } from "./note-dnd-state"
import { announce } from "./tasks/note-announcer-store"

// DndContext is replaced by a stub that hands its handlers to the test: the pointer sensor needs a real browser
type Handlers = { autoScroll: { canScroll: (element: Element) => boolean, threshold: { x: number, y: number } }, onDragStart: (event: unknown) => void, onDragCancel: () => void, sensors: unknown }
let handlers: Handlers
vi.mock("@dnd-kit/core", async importActual => ({
    ...await importActual<typeof import("@dnd-kit/core")>(),
    DndContext: (props: Handlers & { children: ReactNode }) => { handlers = props; return <>{props.children}</> },
    DragOverlay: () => null,
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
        expect(announce).not.toHaveBeenCalled()
    })

    it("leaves a selection of a single task alone, without announcing anything", () => {
        store.toggle(taskKey(1))
        setup()
        startDrag("task", 1)
        expect(store.getSelected().size).toBe(1)
        expect(announce).not.toHaveBeenCalled()
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

    it("keeps the same sensors across renders (new options would change the listeners of every draggable)", () => {
        const view = render(tree())
        const first = handlers.sensors
        view.rerender(tree())
        expect(handlers.sensors).toBe(first)
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

describe("NoteDndProvider drag mark", () => {
    it("marks the body while dragging (the insert lines hide by CSS), and clears it", () => {
        let dnd: NoteDndStore | undefined
        const Grab = () => { dnd = useContext(NoteDndStoreContext); return null }
        render(<NoteDndProvider><Grab /></NoteDndProvider>)
        startDrag("task", 1)
        expect(document.body.hasAttribute("data-note-dragging")).toBe(true)
        act(() => dnd?.set({ active: null }))
        expect(document.body.hasAttribute("data-note-dragging")).toBe(false)
    })
})

describe("NoteDndProvider auto scroll", () => {
    it("scrolls only the row of the groups and the list of a group, with explicit bands", () => {
        render(<NoteDndProvider>{null}</NoteDndProvider>)
        const el = (attrs: Record<string, string>) => Object.entries(attrs).reduce((node, [k, v]) => (node.setAttribute(k, v), node), document.createElement("div"))
        const { canScroll, threshold } = handlers.autoScroll
        expect(canScroll(el({ "data-testid": "group-scroll" }))).toBe(true)
        expect(canScroll(el({ "data-group-list": "" }))).toBe(true)
        expect(canScroll(el({ "data-pane": "0" }))).toBe(false)
        expect(canScroll(el({ role: "tablist" }))).toBe(false)
        expect(canScroll(document.body)).toBe(false)
        expect(threshold).toEqual({ x: 0.2, y: 0.2 })
    })
})
