// @vitest-environment jsdom
import type { PointerEvent as ReactPointerEvent } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPointerDrag, DRAG_DISTANCE, type PointerDragHandlers } from "./note-dnd-pointer"

/** Ctrl and Alt during the drag: what the other note of the split view and the copy depend on. */
const ref = { kind: "task", id: 7 } as const
const far = DRAG_DISTANCE + 1

let handlers: { [K in keyof PointerDragHandlers]: ReturnType<typeof vi.fn> }
let drag: ReturnType<typeof createPointerDrag>
let row: HTMLElement
let inner: HTMLElement

const pointer = (type: string, x: number, init: { ctrlKey?: boolean, altKey?: boolean } = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 0, ...init })
    Object.defineProperty(event, "pointerId", { value: 1 })
    inner.dispatchEvent(event)
}
const key = (type: "keydown" | "keyup", name: string, init: { ctrlKey?: boolean, altKey?: boolean } = {}) => {
    const event = new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true, ...init })
    window.dispatchEvent(event)
    return event
}
const down = (init: { ctrlKey?: boolean, altKey?: boolean } = {}) =>
    drag.press({ currentTarget: row, target: inner, button: 0, isPrimary: true, pointerId: 1, clientX: 0, clientY: 0, ...init } as unknown as ReactPointerEvent<HTMLElement>, ref, row)

beforeEach(() => {
    vi.useFakeTimers()
    handlers = { start: vi.fn(), move: vi.fn(), end: vi.fn(), cancel: vi.fn() }
    drag = createPointerDrag()
    drag.setHandlers(handlers as unknown as PointerDragHandlers)
    row = document.createElement("div")
    inner = document.createElement("span")
    row.appendChild(inner)
    document.body.appendChild(row)
})

afterEach(() => {
    drag.cancel()
    vi.runAllTimers()
    vi.useRealTimers()
    document.body.innerHTML = ""
})

describe("modifier keys of a note drag", () => {
    it("has none before a gesture and takes them from the press and from every move", () => {
        expect(drag.getModifiers()).toEqual({ ctrl: false, alt: false })
        down({ ctrlKey: true })
        expect(drag.getModifiers()).toEqual({ ctrl: true, alt: false })
        pointer("pointermove", far, { ctrlKey: true, altKey: true })
        expect(drag.getModifiers()).toEqual({ ctrl: true, alt: true })
    })

    it("hands the modifiers of the release to `end`", () => {
        down()
        pointer("pointermove", far, { ctrlKey: true })
        pointer("pointerup", far, { ctrlKey: true, altKey: true })
        expect(handlers.end).toHaveBeenCalledWith({ ctrl: true, alt: true })
    })

    it("hit-tests again when Ctrl is pressed or released with the pointer still, and not for other keys", () => {
        down()
        pointer("pointermove", far)
        handlers.move.mockClear()
        key("keydown", "Control", { ctrlKey: true })
        expect(handlers.move).toHaveBeenCalledWith({ x: far, y: 0 })
        expect(drag.getModifiers().ctrl).toBe(true)
        handlers.move.mockClear()
        key("keyup", "Control", { ctrlKey: false })
        expect(handlers.move).toHaveBeenCalledTimes(1)
        expect(drag.getModifiers().ctrl).toBe(false)
        handlers.move.mockClear()
        key("keydown", "a")
        expect(handlers.move).not.toHaveBeenCalled()
    })

    it("only records a modifier pressed before the drag started", () => {
        down()
        key("keydown", "Control", { ctrlKey: true })
        expect(handlers.move).not.toHaveBeenCalled()
        expect(drag.getModifiers().ctrl).toBe(true)
    })

    it("keeps Alt from reaching the menu of the window while a drag goes on", () => {
        down()
        pointer("pointermove", far)
        expect(key("keydown", "Alt", { altKey: true }).defaultPrevented).toBe(true)
        expect(key("keyup", "Alt").defaultPrevented).toBe(true)
    })

    it("Ctrl+click without moving is still a plain click: no drag starts", () => {
        down({ ctrlKey: true })
        pointer("pointerup", 0, { ctrlKey: true })
        expect(handlers.start).not.toHaveBeenCalled()
        expect(handlers.end).not.toHaveBeenCalled()
    })
})
