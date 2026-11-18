// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react"
import { memo, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { NoteDndStoreContext, NoteDragPressContext, createNoteDndStore, useNoteDrag } from "./note-dnd-state"

const renders: Record<number, number> = {}
const Row = memo(({ id }: { id: number }) => {
    const { setNodeRef, dragProps, isDragging } = useNoteDrag("task", id)
    renders[id] = (renders[id] ?? 0) + 1
    return <div ref={setNodeRef} data-testid={`row-${id}`} data-dragging={isDragging} {...dragProps} />
})

describe("useNoteDrag", () => {
    it("re-renders only the dragged row when a drag starts and ends", () => {
        const store = createNoteDndStore()
        const press = vi.fn()
        const Rows = () => { const [ids] = useState([1, 2, 3]); return <>{ids.map(id => <Row key={id} id={id} />)}</> }
        const view = render(
            <NoteDndStoreContext.Provider value={store}>
                <NoteDragPressContext.Provider value={press}><Rows /></NoteDragPressContext.Provider>
            </NoteDndStoreContext.Provider>,
        )
        expect(renders).toEqual({ 1: 1, 2: 1, 3: 1 })
        act(() => store.set({ active: { kind: "task", id: 2 } }))
        expect(renders).toEqual({ 1: 1, 2: 2, 3: 1 })
        expect(view.getByTestId("row-2").getAttribute("data-dragging")).toBe("true")
        act(() => store.set({ hover: { overKey: "task-3", zone: "before" } }))
        act(() => store.set({ active: null }))
        expect(renders).toEqual({ 1: 1, 2: 3, 3: 1 })
    })

    it("hands the press to the provider with the item and the element that is dragged", () => {
        const press = vi.fn()
        const view = render(<NoteDragPressContext.Provider value={press}><Row id={9} /></NoteDragPressContext.Provider>)
        fireEvent.pointerDown(view.getByTestId("row-9"))
        expect(press).toHaveBeenCalledTimes(1)
        expect(press.mock.calls[0][1]).toEqual({ kind: "task", id: 9 })
        expect(press.mock.calls[0][2]).toBe(view.getByTestId("row-9"))
    })

    it("does nothing without a provider", () => {
        const view = render(<Row id={4} />)
        expect(() => fireEvent.pointerDown(view.getByTestId("row-4"))).not.toThrow()
    })
})
