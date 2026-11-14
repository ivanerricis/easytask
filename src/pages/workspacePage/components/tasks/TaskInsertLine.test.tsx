import { act, fireEvent, render, screen } from "@testing-library/react"
import { useEffect, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NoteDndStoreContext, createNoteDndStore } from "../note-dnd-state"
import { createSelectionStore } from "../sidebar/selection"
import { TaskSelectionContext } from "./use-task-selection"
import { TaskInsertProvider, useTaskInsertStore } from "./task-insert-state"
import { TaskInsertLine } from "./TaskInsertLine"

let prefs = { showTaskInsertLine: true }
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))

const dnd = createNoteDndStore()
let selection = createSelectionStore()

function Slot() {
    const slot = useTaskInsertStore().getState()
    return <output data-testid="slot">{JSON.stringify(slot)}</output>
}

const setup = (ui: ReactNode = <TaskInsertLine listKey="s1" afterTaskId={4} />) => {
    let store!: ReturnType<typeof useTaskInsertStore>
    function Grab() {
        const current = useTaskInsertStore()
        useEffect(() => { store = current }, [current])
        return null
    }
    render(
        <NoteDndStoreContext.Provider value={dnd}>
            <TaskSelectionContext.Provider value={selection}>
                <TaskInsertProvider><Grab />{ui}</TaskInsertProvider>
            </TaskSelectionContext.Provider>
        </NoteDndStoreContext.Provider>,
    )
    return () => store
}

describe("TaskInsertLine", () => {
    beforeEach(() => {
        prefs = { showTaskInsertLine: true }
        dnd.set({ active: null })
        selection = createSelectionStore()
    })

    it("renders a hidden, unfocusable zone with a '+' button", () => {
        setup()
        const zone = screen.getByTestId("task-insert-zone")
        expect(zone.parentElement).toHaveAttribute("aria-hidden", "true")
        const button = zone.querySelector("button")!
        expect(button).toHaveAttribute("tabindex", "-1")
        expect(button).toHaveAttribute("aria-hidden", "true")
    })

    it("the first line sits inside its container", () => {
        setup(<TaskInsertLine listKey="s1" afterTaskId={null} first />)
        expect(screen.getByTestId("task-insert-zone")).toHaveClass("top-0")
    })

    it("the \"+\" of the first line is centered on the border like the others", () => {
        setup(<TaskInsertLine listKey="s1" afterTaskId={null} first />)
        const firstButton = screen.getByTestId("task-insert-zone").querySelector("button")!
        expect(firstButton).toHaveClass("top-1/2", "-translate-y-1/2")
    })

    it("the \"+\" of a line between two tasks is centered on the border", () => {
        setup()
        const button = screen.getByTestId("task-insert-zone").querySelector("button")!
        expect(button).toHaveClass("top-1/2", "-translate-y-1/2")
    })

    it("renders nothing when the preference is off", () => {
        prefs = { showTaskInsertLine: false }
        setup()
        expect(screen.queryByTestId("task-insert-zone")).not.toBeInTheDocument()
    })

    it("is hidden during a drag by CSS (the provider marks the body), without re-rendering: it stays in the DOM", () => {
        setup()
        const line = screen.getByTestId("task-insert-zone").parentElement!
        expect(line.className).toContain("[body[data-note-dragging]_&]:hidden")
        act(() => dnd.set({ active: { kind: "task", id: 1 } }))
        expect(screen.getByTestId("task-insert-zone")).toBeInTheDocument()
    })

    it("disappears while tasks are selected", () => {
        setup()
        act(() => selection.toggle("task-1"))
        expect(screen.queryByTestId("task-insert-zone")).not.toBeInTheDocument()
        act(() => selection.reset())
        expect(screen.getByTestId("task-insert-zone")).toBeInTheDocument()
    })

    it("a click claims the slot, and its pointerdown does not reach the row (no drag)", () => {
        const onPointerDown = vi.fn()
        const getStore = setup(<div onPointerDown={onPointerDown}><TaskInsertLine listKey="s1" afterTaskId={4} /><Slot /></div>)
        const button = screen.getByTestId("task-insert-zone").querySelector("button")!

        fireEvent.pointerDown(button)
        expect(onPointerDown).not.toHaveBeenCalled()
        expect(fireEvent.mouseDown(button)).toBe(false)
        fireEvent.click(button)
        expect(getStore().getState()).toEqual({ listKey: "s1", afterTaskId: 4 })
    })
})

