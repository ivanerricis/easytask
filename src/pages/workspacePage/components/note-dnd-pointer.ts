import type { PointerEvent as ReactPointerEvent } from "react"
import type { NoteDragRef } from "./note-dnd"

/**
 * Pointer controller of the note drag, owned by the app instead of dnd-kit's `useDraggable` + `PointerSensor`: a `useDraggable` per row
 * re-renders the row every time dnd-kit's `active` changes (the whole note, twice per drag). Here a row only has a stable
 * `onPointerDown`; the rest is listeners on the window while a gesture is going on.
 *
 * It does what the PointerSensor did: only the primary button, a threshold of 5px before the drag starts (a click without moving stays a
 * click), the `click` that follows the release of a real drag is swallowed (dropping on a row must not open or tick it), no native
 * `dragstart` / text selection / context menu during the drag, Esc, a resize of the window, the window going to the background and a
 * `pointercancel` cancel it. The window losing the focus cancels it too.
 * It also follows Ctrl and Alt while the drag goes on (Ctrl: the drag may cross to the other note of the split view; Alt at the release:
 * a copy instead of a move): a change of either calls `move` again, so the target is worked out again with the pointer where it is.
 * @category Note DnD
 */

export type Point = { x: number, y: number }

/** The modifier keys that matter to a note drag. */
export type Modifiers = { ctrl: boolean, alt: boolean }

const NO_MODIFIERS: Modifiers = { ctrl: false, alt: false }

/** Distance the pointer has to travel (px) before a press becomes a drag. */
export const DRAG_DISTANCE = 5

export type PointerDragHandlers = {
    /** The drag begins: `pointer` is where the pointer is now, `press` where it went down, `node` the element that is dragged. */
    start: (ref: NoteDragRef, info: { pointer: Point, press: Point, node: HTMLElement | null }) => void
    /** The pointer moved (or the content scrolled under it). */
    move: (pointer: Point) => void
    /** The pointer was released: the drop, with the modifier keys at that moment. */
    end: (modifiers: Modifiers) => void
    /** The drag was abandoned. */
    cancel: () => void
}

/** Starts a gesture on the element that got the event (React's `onPointerDown`). */
export type NoteDragPress = (event: ReactPointerEvent<HTMLElement>, ref: NoteDragRef, node: HTMLElement | null) => void

export type PointerDrag = {
    press: NoteDragPress
    /** The pointer position of the last event of the current gesture. */
    getPointer: () => Point | null
    /** Ctrl and Alt as they are now (the last event of the gesture told). */
    getModifiers: () => Modifiers
    /** Whether a drag (not just a press) is going on. */
    isDragging: () => boolean
    /** Abandons the gesture, if any (a drag calls `cancel`). */
    cancel: () => void
    /** Sets who is told what happens (the latest render of the provider: it reads the note and the preferences of that render). */
    setHandlers: (next: PointerDragHandlers) => void
}

const NO_HANDLERS: PointerDragHandlers = { start: () => undefined, move: () => undefined, end: () => undefined, cancel: () => undefined }

type Session = { ref: NoteDragRef, node: HTMLElement | null, pointerId: number, press: Point, last: Point, active: boolean, modifiers: Modifiers }

/** Records the modifiers an event carries; true when they changed. */
const readModifiers = (session: Session, event: { ctrlKey: boolean, altKey: boolean }): boolean => {
    const changed = session.modifiers.ctrl !== !!event.ctrlKey || session.modifiers.alt !== !!event.altKey
    if (changed) session.modifiers = { ctrl: !!event.ctrlKey, alt: !!event.altKey }
    return changed
}

const swallow = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
}

export function createPointerDrag(): PointerDrag {
    let handlers: PointerDragHandlers = NO_HANDLERS
    const getHandlers = () => handlers
    let session: Session | null = null
    /** Removes the listeners of the gesture (not the ones that swallow the click). */
    let detach: (() => void) | null = null
    /** Removes what the drag installed on the document (swallowing of the click, selection, native drag). */
    let release: (() => void) | null = null
    let releaseTimer: ReturnType<typeof setTimeout> | null = null

    const listen = <K extends keyof WindowEventMap>(offs: (() => void)[], type: K, handler: (event: WindowEventMap[K]) => void) => {
        window.addEventListener(type, handler, true)
        offs.push(() => window.removeEventListener(type, handler, true))
    }

    const freeDocument = () => {
        if (releaseTimer !== null) clearTimeout(releaseTimer)
        releaseTimer = null
        release?.()
        release = null
    }

    /** The click that comes right after the pointer is released is swallowed; the listeners go away once it had its chance. */
    const freeDocumentSoon = () => {
        if (releaseTimer !== null) clearTimeout(releaseTimer)
        releaseTimer = setTimeout(freeDocument, 0)
    }

    /** After a cancel with the button still down (Esc): wait for the release before the swallowing of the click can end. */
    const freeDocumentAfterRelease = () => {
        const offs: (() => void)[] = []
        const done = () => { offs.forEach(off => off()); freeDocumentSoon() }
        listen(offs, "pointerup", done)
        listen(offs, "pointercancel", done)
        // A new press is a new gesture: nothing of the old one may linger
        listen(offs, "pointerdown", () => { offs.forEach(off => off()); freeDocument() })
        const before = release
        release = () => { offs.forEach(off => off()); before?.() }
    }

    const stop = (outcome: "end" | "cancel" | "none") => {
        const current = session
        session = null
        detach?.()
        detach = null
        if (!current?.active) return
        if (outcome === "end") freeDocumentSoon()
        else freeDocumentAfterRelease()
        const handlers = getHandlers()
        if (outcome === "end") handlers.end(current.modifiers)
        else handlers.cancel()
    }

    const activate = (current: Session) => {
        current.active = true
        freeDocument()
        const offs: (() => void)[] = []
        listen(offs, "click", swallow)
        listen(offs, "dragstart", swallow)
        listen(offs, "selectstart", swallow)
        listen(offs, "contextmenu", swallow)
        const clearSelection = () => document.getSelection()?.removeAllRanges()
        document.addEventListener("selectionchange", clearSelection)
        offs.push(() => document.removeEventListener("selectionchange", clearSelection))
        release = () => offs.forEach(off => off())
        clearSelection()
        const handlers = getHandlers()
        handlers.start(current.ref, { pointer: current.last, press: current.press, node: current.node })
        handlers.move(current.last)
    }

    const press: NoteDragPress = (event, ref, node) => {
        // The pointer events of a portal rendered inside the element (a dialog) bubble to it through React: not a drag
        if (!event.currentTarget.contains(event.target as Node)) return
        if (event.button !== 0 || event.isPrimary === false) return
        if (session?.active) return
        stop("none")
        const point = { x: event.clientX, y: event.clientY }
        const current: Session = { ref, node, pointerId: event.pointerId, press: point, last: point, active: false, modifiers: { ctrl: !!event.ctrlKey, alt: !!event.altKey } }
        session = current
        const offs: (() => void)[] = []
        detach = () => offs.forEach(off => off())
        listen(offs, "pointermove", move => {
            if (session !== current || move.pointerId !== current.pointerId) return
            current.last = { x: move.clientX, y: move.clientY }
            readModifiers(current, move)
            if (current.active) { getHandlers().move(current.last); return }
            if (Math.hypot(current.last.x - current.press.x, current.last.y - current.press.y) > DRAG_DISTANCE) activate(current)
        })
        listen(offs, "pointerup", up => {
            if (session !== current || up.pointerId !== current.pointerId) return
            readModifiers(current, up)
            stop("end")
        })
        listen(offs, "pointercancel", cancel => { if (session === current && cancel.pointerId === current.pointerId) stop("cancel") })
        listen(offs, "keydown", key => {
            if (session !== current) return
            if (key.key === "Escape") {
                key.preventDefault()
                stop("cancel")
                return
            }
            if (key.key !== "Control" && key.key !== "Alt") return
            // Alt alone would move the focus to the menu of the window
            if (current.active && key.key === "Alt") key.preventDefault()
            if (readModifiers(current, key) && current.active) getHandlers().move(current.last)
        })
        listen(offs, "keyup", key => {
            if (session !== current || (key.key !== "Control" && key.key !== "Alt")) return
            if (current.active && key.key === "Alt") key.preventDefault()
            if (readModifiers(current, key) && current.active) getHandlers().move(current.last)
        })
        // In capture the blur of every element reaches the window: only the one of the window itself counts
        listen(offs, "blur", blur => { if (blur.target === window) stop("cancel") })
        listen(offs, "resize", () => stop("cancel"))
        const hidden = () => { if (document.visibilityState === "hidden") stop("cancel") }
        document.addEventListener("visibilitychange", hidden)
        offs.push(() => document.removeEventListener("visibilitychange", hidden))
        // The content scrolled under a still pointer (autoscroll, the wheel): the target may be another one now
        listen(offs, "scroll", () => { if (session === current && current.active) getHandlers().move(current.last) })
    }

    return {
        press,
        getPointer: () => session?.last ?? null,
        getModifiers: () => session?.modifiers ?? NO_MODIFIERS,
        isDragging: () => session?.active === true,
        cancel: () => stop("cancel"),
        setHandlers: next => { handlers = next },
    }
}
