// @vitest-environment jsdom
import type { PointerEvent as ReactPointerEvent } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPointerDrag, DRAG_DISTANCE, type PointerDragHandlers } from "./note-dnd-pointer"

const ref = { kind: "task", id: 7 } as const

let handlers: { [K in keyof PointerDragHandlers]: ReturnType<typeof vi.fn> }
let drag: ReturnType<typeof createPointerDrag>
let row: HTMLElement
let inner: HTMLElement
let clicks: Event[]
let onDocumentClick: (event: Event) => void

type PointerInit = { button?: number, pointerId?: number }
const fire = (type: string, x = 0, y = 0, init: PointerInit = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: init.button ?? 0 })
    Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 })
    inner.dispatchEvent(event)
    return event
}
/** What React hands to `onPointerDown`. */
const down = (x = 0, y = 0, extra: Partial<{ button: number, isPrimary: boolean, pointerId: number, target: Element }> = {}) =>
    drag.press({
        currentTarget: row, target: extra.target ?? inner, button: extra.button ?? 0, isPrimary: extra.isPrimary ?? true,
        pointerId: extra.pointerId ?? 1, clientX: x, clientY: y,
    } as unknown as ReactPointerEvent<HTMLElement>, ref, row)
const click = () => document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
const far = DRAG_DISTANCE + 1

beforeEach(() => {
    vi.useFakeTimers()
    handlers = { start: vi.fn(), move: vi.fn(), end: vi.fn(), cancel: vi.fn() }
    drag = createPointerDrag()
    drag.setHandlers(handlers as unknown as PointerDragHandlers)
    row = document.createElement("div")
    inner = document.createElement("span")
    row.appendChild(inner)
    document.body.appendChild(row)
    clicks = []
    onDocumentClick = event => { clicks.push(event) }
    document.addEventListener("click", onDocumentClick)
})

afterEach(() => {
    drag.cancel()
    vi.runAllTimers()
    vi.useRealTimers()
    document.removeEventListener("click", onDocumentClick)
    document.body.innerHTML = ""
})

describe("note pointer drag: the threshold", () => {
    it("does not start before the pointer has moved more than the distance, and a click stays a click", () => {
        down(10, 10)
        fire("pointermove", 10 + DRAG_DISTANCE, 10)
        expect(handlers.start).not.toHaveBeenCalled()
        fire("pointerup", 10 + DRAG_DISTANCE, 10)
        click()
        expect(handlers.start).not.toHaveBeenCalled()
        expect(handlers.end).not.toHaveBeenCalled()
        expect(handlers.cancel).not.toHaveBeenCalled()
        expect(clicks).toHaveLength(1)
        expect(clicks[0].defaultPrevented).toBe(false)
    })

    it("starts past the distance with the item, where it went down and where it is, then moves", () => {
        down(10, 10)
        fire("pointermove", 10 + far, 10)
        expect(handlers.start).toHaveBeenCalledWith(ref, { pointer: { x: 10 + far, y: 10 }, press: { x: 10, y: 10 }, node: row })
        expect(handlers.move).toHaveBeenCalledWith({ x: 10 + far, y: 10 })
        fire("pointermove", 50, 60)
        expect(handlers.move).toHaveBeenLastCalledWith({ x: 50, y: 60 })
        expect(drag.isDragging()).toBe(true)
        expect(drag.getPointer()).toEqual({ x: 50, y: 60 })
    })

    it("drops on the release", () => {
        down(0, 0)
        fire("pointermove", far, 0)
        fire("pointerup", far, 0)
        expect(handlers.end).toHaveBeenCalledTimes(1)
        expect(handlers.cancel).not.toHaveBeenCalled()
        expect(drag.isDragging()).toBe(false)
        fire("pointermove", 100, 100)
        expect(handlers.move).toHaveBeenCalledTimes(1) // nothing listens any more
    })
})

describe("note pointer drag: the click after a drag", () => {
    it("is swallowed (dropping on a row must not open it), and the next one is not", () => {
        down(0, 0)
        fire("pointermove", far, 0)
        fire("pointerup", far, 0)
        const target = document.createElement("button")
        const onClick = vi.fn()
        target.addEventListener("click", onClick)
        document.body.appendChild(target)
        const swallowed = new MouseEvent("click", { bubbles: true, cancelable: true })
        target.dispatchEvent(swallowed)
        expect(onClick).not.toHaveBeenCalled()
        expect(swallowed.defaultPrevented).toBe(true)
        vi.runAllTimers()
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it("is swallowed also after a cancel with the button still down (Esc), once released", () => {
        down(0, 0)
        fire("pointermove", far, 0)
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
        vi.runAllTimers() // time passes while the button is down
        fire("pointerup", far, 0)
        click()
        expect(clicks).toHaveLength(0)
        vi.runAllTimers()
        click()
        expect(clicks).toHaveLength(1)
    })
})

describe("note pointer drag: what ends it", () => {
    const dragging = () => { down(0, 0); fire("pointermove", far, 0) }

    it("Esc cancels, and the release afterwards drops nothing", () => {
        dragging()
        const esc = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true })
        window.dispatchEvent(esc)
        expect(handlers.cancel).toHaveBeenCalledTimes(1)
        expect(esc.defaultPrevented).toBe(true)
        fire("pointerup", far, 0)
        expect(handlers.end).not.toHaveBeenCalled()
    })

    it("another key does not", () => {
        dragging()
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
        expect(handlers.cancel).not.toHaveBeenCalled()
    })

    it("the window losing the focus cancels, the blur of an element does not", () => {
        dragging()
        const input = document.createElement("input")
        row.appendChild(input)
        input.dispatchEvent(new FocusEvent("blur"))
        expect(handlers.cancel).not.toHaveBeenCalled()
        window.dispatchEvent(new Event("blur"))
        expect(handlers.cancel).toHaveBeenCalledTimes(1)
    })

    it("pointercancel cancels", () => {
        dragging()
        fire("pointercancel")
        expect(handlers.cancel).toHaveBeenCalledTimes(1)
        expect(handlers.end).not.toHaveBeenCalled()
    })

    it("the window going to the background cancels, a visible change does not", () => {
        dragging()
        let state: DocumentVisibilityState = "visible"
        vi.spyOn(document, "visibilityState", "get").mockImplementation(() => state)
        document.dispatchEvent(new Event("visibilitychange"))
        expect(handlers.cancel).not.toHaveBeenCalled()
        state = "hidden"
        document.dispatchEvent(new Event("visibilitychange"))
        expect(handlers.cancel).toHaveBeenCalledTimes(1)
    })

    it("a resize of the window cancels (like the sensor of dnd-kit)", () => {
        dragging()
        window.dispatchEvent(new Event("resize"))
        expect(handlers.cancel).toHaveBeenCalledTimes(1)
    })

    it("a press that never became a drag is forgotten quietly by Esc", () => {
        down(0, 0)
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
        expect(handlers.cancel).not.toHaveBeenCalled()
        fire("pointermove", far, 0)
        expect(handlers.start).not.toHaveBeenCalled()
    })

    it("cancel() from outside abandons the drag", () => {
        dragging()
        drag.cancel()
        expect(handlers.cancel).toHaveBeenCalledTimes(1)
    })
})

describe("note pointer drag: what does not start it", () => {
    it("ignores the other buttons and the non primary pointers", () => {
        down(0, 0, { button: 2 })
        fire("pointermove", far, 0)
        down(0, 0, { isPrimary: false })
        fire("pointermove", far, 0)
        expect(handlers.start).not.toHaveBeenCalled()
    })

    it("ignores the events of a portal rendered inside the element (they bubble through React, not through the DOM)", () => {
        const portal = document.createElement("div")
        document.body.appendChild(portal)
        down(0, 0, { target: portal })
        fire("pointermove", far, 0)
        expect(handlers.start).not.toHaveBeenCalled()
    })

    it("ignores a press while a drag is going on, and the events of another pointer", () => {
        down(0, 0)
        fire("pointermove", far, 0)
        down(100, 100, { pointerId: 2 })
        fire("pointermove", 200, 200, { pointerId: 2 })
        expect(handlers.start).toHaveBeenCalledTimes(1)
        expect(handlers.move).toHaveBeenCalledTimes(1)
        fire("pointerup", 0, 0, { pointerId: 2 })
        expect(handlers.end).not.toHaveBeenCalled()
        expect(drag.isDragging()).toBe(true)
    })
})

describe("note pointer drag: during the drag", () => {
    const dragging = () => { down(0, 0); fire("pointermove", far, 0) }

    it("prevents the native drag, the selection of text and the context menu, and only then", () => {
        down(0, 0)
        const before = new Event("dragstart", { bubbles: true, cancelable: true })
        document.body.dispatchEvent(before)
        expect(before.defaultPrevented).toBe(false)
        fire("pointermove", far, 0)
        for (const type of ["dragstart", "selectstart", "contextmenu"]) {
            const event = new Event(type, { bubbles: true, cancelable: true })
            document.body.dispatchEvent(event)
            expect(event.defaultPrevented).toBe(true)
        }
        fire("pointerup", far, 0)
        vi.runAllTimers()
        const after = new Event("selectstart", { bubbles: true, cancelable: true })
        document.body.dispatchEvent(after)
        expect(after.defaultPrevented).toBe(false)
    })

    it("clears the selection that was made before the start", () => {
        const text = document.createElement("p")
        text.textContent = "hello"
        document.body.appendChild(text)
        window.getSelection()?.selectAllChildren(text)
        expect(window.getSelection()?.toString()).toBe("hello")
        dragging()
        expect(window.getSelection()?.toString()).toBe("")
    })

    it("hit-tests again when something scrolls under the still pointer", () => {
        dragging()
        handlers.move.mockClear()
        const list = document.createElement("div")
        document.body.appendChild(list)
        list.dispatchEvent(new Event("scroll"))
        expect(handlers.move).toHaveBeenCalledWith({ x: far, y: 0 })
    })

    it("a new press after a drag is a new gesture", () => {
        dragging()
        fire("pointerup", far, 0)
        vi.runAllTimers()
        down(0, 0)
        fire("pointermove", far, 0)
        expect(handlers.start).toHaveBeenCalledTimes(2)
    })
})
