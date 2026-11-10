import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { GroupResizeHandle } from "./GroupResizeHandle"

function setup(width: number | null = 400) {
    const onResize = vi.fn()
    const onCommit = vi.fn()
    const parentPointerDown = vi.fn()
    const parentMouseDown = vi.fn()
    const view = render(
        <div onPointerDown={parentPointerDown} onMouseDown={parentMouseDown}>
            <GroupResizeHandle getWidth={() => 400} width={width} onResize={onResize} onCommit={onCommit} />
        </div>)
    const handle = screen.getByRole("separator", { name: "Ridimensiona il gruppo" })
    return { handle, onResize, onCommit, parentPointerDown, parentMouseDown, ...view }
}

afterEach(() => { vi.useRealTimers() })

describe("GroupResizeHandle", () => {
    it("exposes the width to assistive technologies", () => {
        const { handle } = setup(400)
        expect(handle).toHaveAttribute("aria-orientation", "vertical")
        expect(handle).toHaveAttribute("aria-valuemin", "250")
        expect(handle).toHaveAttribute("aria-valuemax", "960")
        expect(handle).toHaveAttribute("aria-valuenow", "400")
        expect(handle).toHaveAttribute("tabindex", "0")
    })

    it("falls back to the rendered width when no width is set", () => {
        const { handle } = setup(null)
        expect(handle).toHaveAttribute("aria-valuenow", "400")
    })

    it("reports the live width while dragging and commits only on mouseup", () => {
        const { handle, onResize, onCommit } = setup(400)
        fireEvent.mouseDown(handle, { clientX: 100 })
        fireEvent.mouseMove(window, { clientX: 150 })
        expect(onResize).toHaveBeenLastCalledWith(450)
        fireEvent.mouseMove(window, { clientX: 20 })
        expect(onResize).toHaveBeenLastCalledWith(320)
        expect(onCommit).not.toHaveBeenCalled()
        fireEvent.mouseUp(window)
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith(320)
        // The drag is over: further moves do nothing
        fireEvent.mouseMove(window, { clientX: 500 })
        expect(onResize).toHaveBeenCalledTimes(2)
    })

    it("clamps the dragged width", () => {
        const { handle, onResize, onCommit } = setup(400)
        fireEvent.mouseDown(handle, { clientX: 0 })
        fireEvent.mouseMove(window, { clientX: 5000 })
        expect(onResize).toHaveBeenLastCalledWith(960)
        fireEvent.mouseMove(window, { clientX: -5000 })
        expect(onResize).toHaveBeenLastCalledWith(250)
        fireEvent.mouseUp(window)
        expect(onCommit).toHaveBeenCalledWith(250)
    })

    it("does not let a press reach the group drag", () => {
        const { handle, parentPointerDown, parentMouseDown } = setup()
        fireEvent.pointerDown(handle)
        fireEvent.mouseDown(handle)
        expect(parentPointerDown).not.toHaveBeenCalled()
        expect(parentMouseDown).not.toHaveBeenCalled()
        fireEvent.mouseUp(window)
    })

    it("resizes with the arrows and Home/End, saving once after a pause", () => {
        vi.useFakeTimers()
        const { handle, onResize, onCommit } = setup(400)
        fireEvent.keyDown(handle, { key: "ArrowRight" })
        expect(onResize).toHaveBeenLastCalledWith(416)
        fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true })
        expect(onResize).toHaveBeenLastCalledWith(336)
        expect(onCommit).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(399) })
        expect(onCommit).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(1) })
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith(336)

        fireEvent.keyDown(handle, { key: "Home" })
        expect(onResize).toHaveBeenLastCalledWith(250)
        fireEvent.keyDown(handle, { key: "End" })
        expect(onResize).toHaveBeenLastCalledWith(960)
        act(() => { vi.advanceTimersByTime(400) })
        expect(onCommit).toHaveBeenLastCalledWith(960)
    })

    it("ignores other keys", () => {
        const { handle, onResize } = setup()
        fireEvent.keyDown(handle, { key: "a" })
        expect(onResize).not.toHaveBeenCalled()
    })

    it("goes back to the automatic width on double-click", () => {
        const { handle, onResize, onCommit } = setup(400)
        fireEvent.doubleClick(handle)
        expect(onResize).toHaveBeenCalledWith(null)
        expect(onCommit).toHaveBeenCalledWith(null)
    })

    it("saves a pending key press when the group goes away", () => {
        vi.useFakeTimers()
        const { handle, onCommit, unmount } = setup(400)
        fireEvent.keyDown(handle, { key: "ArrowRight" })
        unmount()
        expect(onCommit).toHaveBeenCalledWith(416)
    })
})

describe("GroupResizeHandle with the automatic width", () => {
    it("starts the arrows from the width measured when the key is pressed, not from the last render", () => {
        vi.useFakeTimers()
        let measured = 250
        const onResize = vi.fn()
        render(<GroupResizeHandle getWidth={() => measured} width={null} onResize={onResize} onCommit={vi.fn()} />)
        const handle = screen.getByRole("separator", { name: "Ridimensiona il gruppo" })
        // The content widened the group after the last render of the handle
        measured = 273
        fireEvent.keyDown(handle, { key: "ArrowRight" })
        expect(onResize).toHaveBeenLastCalledWith(289)
    })
})
describe("GroupResizeHandle measuring", () => {
    it("measures the automatic width after the render, once, and again when it gets the focus", () => {
        let measured = 300
        const getWidth = vi.fn(() => measured)
        render(<GroupResizeHandle getWidth={getWidth} width={null} onResize={vi.fn()} onCommit={vi.fn()} />)
        const handle = screen.getByRole("separator", { name: "Ridimensiona il gruppo" })
        expect(getWidth).toHaveBeenCalledTimes(1)
        expect(handle).toHaveAttribute("aria-valuenow", "300")
        measured = 320
        act(() => handle.focus())
        expect(handle).toHaveAttribute("aria-valuenow", "320")
    })
})
