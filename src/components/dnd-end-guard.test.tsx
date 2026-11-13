import { act, render } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DragEndGuard, LOST_DRAG_DELAY } from "./dnd-end-guard"

describe("DragEndGuard", () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it("closes a drag the provider still has once dnd-kit has none (the end that dnd-kit did not report)", () => {
        const onLost = vi.fn()
        render(<DndContext><DragEndGuard dragging onLost={onLost} /></DndContext>)
        act(() => { vi.advanceTimersByTime(LOST_DRAG_DELAY - 1) })
        expect(onLost).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(1) })
        expect(onLost).toHaveBeenCalledTimes(1)
    })

    it("does nothing while the provider is not dragging", () => {
        const onLost = vi.fn()
        render(<DndContext><DragEndGuard dragging={false} onLost={onLost} /></DndContext>)
        act(() => { vi.advanceTimersByTime(LOST_DRAG_DELAY * 4) })
        expect(onLost).not.toHaveBeenCalled()
    })

    it("does nothing when the provider ends the drag itself before the wait is over", () => {
        const onLost = vi.fn()
        const { rerender } = render(<DndContext><DragEndGuard dragging onLost={onLost} /></DndContext>)
        rerender(<DndContext><DragEndGuard dragging={false} onLost={onLost} /></DndContext>)
        act(() => { vi.advanceTimersByTime(LOST_DRAG_DELAY * 4) })
        expect(onLost).not.toHaveBeenCalled()
    })
})
