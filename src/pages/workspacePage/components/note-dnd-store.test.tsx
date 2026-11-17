import { act, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NO_HOVER, NoteDndStoreContext, createNoteDndStore, useNoteDndSelector } from "./note-dnd-state"

describe("note drag store", () => {
    it("tells its listeners only when something really changed", () => {
        const store = createNoteDndStore()
        const listener = vi.fn()
        const unsubscribe = store.subscribe(listener)

        store.set({ hover: NO_HOVER })
        expect(listener).not.toHaveBeenCalled()

        store.set({ active: { kind: "task", id: 1 } })
        expect(listener).toHaveBeenCalledTimes(1)
        expect(store.getState().active).toEqual({ kind: "task", id: 1 })
        // The part not given is kept
        expect(store.getState().hover).toBe(NO_HOVER)

        unsubscribe()
        store.set({ hover: { overKey: "task-2", zone: "after" } })
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it("wakes the listeners of a droppable only when the hover goes onto or off it, and the active ones only when the dragged item changes", () => {
        const store = createNoteDndStore()
        const first = vi.fn()
        const second = vi.fn()
        const other = vi.fn()
        const active = vi.fn()
        const offFirst = store.subscribeHover("task-1", first)
        store.subscribeHover("task-2", second)
        store.subscribeHover("task-3", other)
        store.subscribeActive(active)

        store.set({ active: { kind: "task", id: 1 } })
        expect(active).toHaveBeenCalledTimes(1)
        expect([first, second, other].map(fn => fn.mock.calls.length)).toEqual([0, 0, 0])

        store.set({ hover: { overKey: "task-1", zone: "before" } })
        expect([first, second, other].map(fn => fn.mock.calls.length)).toEqual([1, 0, 0])

        // The zone of the same droppable changed: it hears about it
        store.set({ hover: { overKey: "task-1", zone: "after" } })
        expect([first, second, other].map(fn => fn.mock.calls.length)).toEqual([2, 0, 0])

        // Moving to another one wakes the one left and the one entered, not the third
        store.set({ hover: { overKey: "task-2", zone: "after" } })
        expect([first, second, other].map(fn => fn.mock.calls.length)).toEqual([3, 1, 0])

        // Leaving every droppable wakes the one left
        store.set({ hover: NO_HOVER })
        expect([first, second, other].map(fn => fn.mock.calls.length)).toEqual([3, 2, 0])
        expect(active).toHaveBeenCalledTimes(1)

        offFirst()
        store.set({ hover: { overKey: "task-1", zone: "after" } })
        expect(first).toHaveBeenCalledTimes(3)
    })

    it("re-renders a row only when the part of the state it reads changes", () => {
        const store = createNoteDndStore()
        const renders: Record<string, number> = { first: 0, second: 0 }
        const Row = ({ id }: { id: "first" | "second" }) => {
            const zone = useNoteDndSelector(state => state.hover.overKey === `task-${id}` ? state.hover.zone : null)
            renders[id]++
            return <span>{zone ?? "-"}</span>
        }
        const { container } = render(
            <NoteDndStoreContext.Provider value={store}>
                <Row id="first" /><Row id="second" />
            </NoteDndStoreContext.Provider>,
        )
        expect(renders).toEqual({ first: 1, second: 1 })

        act(() => store.set({ hover: { overKey: "task-first", zone: "before" } }))
        expect(renders).toEqual({ first: 2, second: 1 })
        expect(container.textContent).toBe("before-")

        // Moving over the other row updates both (the one left and the one entered), nothing else
        act(() => store.set({ hover: { overKey: "task-second", zone: "after" } }))
        expect(renders).toEqual({ first: 3, second: 2 })
        expect(container.textContent).toBe("-after")

        // The same zone again (a new object) changes nothing for the rows
        act(() => store.set({ hover: { overKey: "task-second", zone: "after" } }))
        expect(renders).toEqual({ first: 3, second: 2 })
    })
})
