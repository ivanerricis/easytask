import type { Point } from "./note-dnd-pointer"

/**
 * What scrolls by itself while a group, a section or a task is dragged near an edge: the row of the groups (sideways) and the list of a
 * group (up and down, to reach a far task). Everything else (the pane, the page, the other pane of a split view) stays still.
 * While Ctrl is held (the drag may cross to the other note) it is the other way round: the note the drag started in must not scroll at
 * all (see {@link startScrollLock}) and the containers of the other note scroll instead (see {@link otherScrollers}).
 * @category Note DnD
 */
export const SCROLLABLE = '[data-testid="group-scroll"], [data-group-list]'

/** The band at the edge, as a share of the container, on both axes. */
export const EDGE_BAND = 0.2

/** Speed at the very edge (px per second): dnd-kit's default, 10px every 5ms. */
export const MAX_SPEED = 2000

/** The containers that can scroll for a drag that started on `node`: its ancestors that are the row of the groups or a list of a group. */
export const scrollableAncestors = (node: HTMLElement | null): HTMLElement[] => {
    const found: HTMLElement[] = []
    for (let element = node?.parentElement ?? null; element; element = element.parentElement) if (element.matches(SCROLLABLE)) found.push(element)
    return found
}

/** The containers that can scroll in the rest of the window: the ones of the other note of the split view, innermost first. */
export const otherScrollers = (source: readonly HTMLElement[]): HTMLElement[] =>
    [...document.querySelectorAll<HTMLElement>(SCROLLABLE)]
        .filter(element => !source.includes(element))
        .sort((a, b) => a.contains(b) ? 1 : b.contains(a) ? -1 : 0)

/** How far into the band of an edge the pointer is: 0 outside it, 1 at the edge (or beyond). */
const depth = (position: number, start: number, end: number): number => {
    const band = (end - start) * EDGE_BAND
    if (band <= 0) return 0
    if (position < start + band) return Math.min(1, (start + band - position) / band)
    if (position > end - band) return -Math.min(1, (position - (end - band)) / band)
    return 0
}

/** The directions the pointer has moved in since the drag began, on one axis (toward the start of the container, toward its end). */
export type Intent = { back: boolean, forward: boolean }

/**
 * The step (px, signed) of a container for the pointer, per second of drag: 0 when it does not scroll that way.
 * Like dnd-kit's: the pointer has to be over the container (a pointer beside it, e.g. over the columns that stick out of the row of the
 * groups, does not scroll it back to the start), and a direction scrolls only once the pointer has moved that way (`intent`; all by default).
 */
export const scrollStep = (
    element: HTMLElement, pointer: Point, axis: "x" | "y", rect: { left: number, right: number, top: number, bottom: number } = element.getBoundingClientRect(),
    intent: Intent = { back: true, forward: true },
): number => {
    const horizontal = axis === "x"
    const cross = horizontal ? pointer.y : pointer.x
    if (cross < (horizontal ? rect.top : rect.left) || cross > (horizontal ? rect.bottom : rect.right)) return 0
    const along = horizontal ? pointer.x : pointer.y
    if (along < (horizontal ? rect.left : rect.top) || along > (horizontal ? rect.right : rect.bottom)) return 0
    const near = depth(along, horizontal ? rect.left : rect.top, horizontal ? rect.right : rect.bottom)
    if (near === 0 || (near > 0 ? !intent.back : !intent.forward)) return 0 // (nothing is read from the layout until the pointer is in a band: this runs every frame, in the middle of the live shifts)
    const position = horizontal ? element.scrollLeft : element.scrollTop
    const room = horizontal ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight
    // Towards the start (positive depth) the scroll goes back; it needs something to scroll in that direction
    if (near > 0 ? position <= 0 : position >= room - 1) return 0
    return -near * MAX_SPEED
}

/**
 * Scrolls the containers while the pointer is in their edge bands, one step per animation frame (the elapsed time sets the distance).
 * The innermost container that has something to scroll wins, like dnd-kit's. Returns the function that stops it.
 * The scroll itself is noticed by the drag (the `scroll` listener of the pointer controller), which hit-tests again.
 * `containers` can be a function, asked every frame: the set changes while the drag goes on (with Ctrl held the containers of the
 * other note take the place of the ones of the note the drag started in).
 * @category Note DnD
 */
export function startAutoScroll(source: HTMLElement[] | (() => HTMLElement[]), getPointer: () => Point | null): () => void {
    const containersNow = typeof source === "function" ? source : () => source
    if (typeof source !== "function" && source.length === 0) return () => undefined
    // Measured once each: the containers do not move while a drag goes on, and a rect read every frame would force a layout after the shifts written in it
    const measured = new Map<HTMLElement, DOMRect>()
    const rectOf = (container: HTMLElement): DOMRect => {
        let rect = measured.get(container)
        if (!rect) measured.set(container, rect = container.getBoundingClientRect())
        return rect
    }
    let frame = 0
    let last = performance.now()
    let previous: Point | null = getPointer()
    const intent = { x: { back: false, forward: false }, y: { back: false, forward: false } }
    const tick = (now: number) => {
        frame = requestAnimationFrame(tick)
        // The distance follows the time of a normal frame (up to 17ms). A frame much longer than that means the page is busy: it scrolls a single
        // step (5ms), like dnd-kit, whose interval of 5ms ticked once after a long task, so a slow page does not jump over the groups
        const elapsed = now - last > 34 ? 5 : Math.min(now - last, 17)
        last = now
        const pointer = getPointer()
        if (!pointer || elapsed <= 0) return
        if (previous) {
            if (pointer.x !== previous.x) intent.x[pointer.x < previous.x ? "back" : "forward"] = true
            if (pointer.y !== previous.y) intent.y[pointer.y < previous.y ? "back" : "forward"] = true
        }
        previous = pointer
        for (const container of containersNow()) {
            const dy = scrollStep(container, pointer, "y", rectOf(container), intent.y)
            const dx = scrollStep(container, pointer, "x", rectOf(container), intent.x)
            if (dx === 0 && dy === 0) continue
            // At least a pixel: a smaller step would be lost by the rounding of the scroll position
            const by = (speed: number) => speed === 0 ? 0 : Math.sign(speed) * Math.max(1, Math.round(Math.abs(speed) * elapsed / 1000))
            container.scrollBy({ left: by(dx), top: by(dy), behavior: "instant" })
            break
        }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
}

/** Pixels of a wheel "line" (a mouse wheel reports lines in some browsers). */
const LINE_PX = 16

export type ScrollLock = {
    /** Ctrl is held (true) or not: while it is, the source containers stay where they are. */
    update: (locked: boolean) => void
    stop: () => void
}

/**
 * Keeps the containers of the note the drag started in (`getSource`) from scrolling while the lock is on (Ctrl held, the drag may be
 * heading for the other note): the wheel over them does nothing, and anything else that moves them (the keyboard, a scrollbar) is put
 * back where they were. The wheel over the rest of the window scrolls the innermost container under the pointer by hand, because with
 * Ctrl the browser would zoom the page instead. Returns the controls; `stop` removes the listeners.
 * @category Note DnD
 */
export function startScrollLock(getSource: () => readonly HTMLElement[]): ScrollLock {
    let locked = false
    let pinned = new Map<HTMLElement, { left: number, top: number }>()

    const onWheel = (event: WheelEvent) => {
        if (!locked) return
        event.preventDefault()
        const target = event.target instanceof Node ? event.target : null
        const source = getSource()
        if (!target || source.some(container => container.contains(target))) return
        const scale = event.deltaMode === 1 ? LINE_PX : 1
        const dx = event.deltaX * scale
        const dy = event.deltaY * scale
        // The innermost container under the pointer that has room to scroll that way
        for (let element: Element | null = target instanceof Element ? target : target.parentElement; element; element = element.parentElement) {
            if (!(element instanceof HTMLElement) || !element.matches(SCROLLABLE)) continue
            const room = (position: number, size: number, view: number, delta: number) => delta < 0 ? position > 0 : delta > 0 && position < size - view - 1
            if (room(element.scrollTop, element.scrollHeight, element.clientHeight, dy) || room(element.scrollLeft, element.scrollWidth, element.clientWidth, dx)) {
                element.scrollBy({ left: dx, top: dy, behavior: "instant" })
                return
            }
        }
    }
    const onScroll = (event: Event) => {
        if (!locked) return
        const element = event.target
        if (!(element instanceof HTMLElement)) return
        const place = pinned.get(element)
        if (place && (element.scrollLeft !== place.left || element.scrollTop !== place.top)) element.scrollTo({ left: place.left, top: place.top, behavior: "instant" })
    }
    window.addEventListener("wheel", onWheel, { capture: true, passive: false })
    window.addEventListener("scroll", onScroll, true)

    return {
        update: next => {
            if (next === locked) return
            locked = next
            pinned = new Map(next ? getSource().map(container => [container, { left: container.scrollLeft, top: container.scrollTop }] as const) : [])
        },
        stop: () => {
            window.removeEventListener("wheel", onWheel, true)
            window.removeEventListener("scroll", onScroll, true)
        },
    }
}
