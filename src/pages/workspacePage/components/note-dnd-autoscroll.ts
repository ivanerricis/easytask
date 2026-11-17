import type { Point } from "./note-dnd-pointer"

/**
 * What scrolls by itself while a group, a section or a task is dragged near an edge: the row of the groups (sideways) and the list of a
 * group (up and down, to reach a far task). Everything else (the pane, the page, the other pane of a split view) stays still.
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

/** How far into the band of an edge the pointer is: 0 outside it, 1 at the edge (or beyond). */
const depth = (position: number, start: number, end: number): number => {
    const band = (end - start) * EDGE_BAND
    if (band <= 0) return 0
    if (position < start + band) return Math.min(1, (start + band - position) / band)
    if (position > end - band) return -Math.min(1, (position - (end - band)) / band)
    return 0
}

/** The step (px, signed) of a container for the pointer, per second of drag: 0 when it does not scroll that way. */
export const scrollStep = (element: HTMLElement, pointer: Point, axis: "x" | "y", rect: { left: number, right: number, top: number, bottom: number } = element.getBoundingClientRect()): number => {
    const horizontal = axis === "x"
    const cross = horizontal ? pointer.y : pointer.x
    if (cross < (horizontal ? rect.top : rect.left) || cross > (horizontal ? rect.bottom : rect.right)) return 0
    const near = depth(horizontal ? pointer.x : pointer.y, horizontal ? rect.left : rect.top, horizontal ? rect.right : rect.bottom)
    if (near === 0) return 0 // (nothing is read from the layout until the pointer is in a band: this runs every frame, in the middle of the live shifts)
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
 * @category Note DnD
 */
export function startAutoScroll(containers: HTMLElement[], getPointer: () => Point | null): () => void {
    if (containers.length === 0) return () => undefined
    // Measured once: the containers do not move while a drag goes on, and a rect read every frame would force a layout after the shifts written in it
    const rects = containers.map(container => container.getBoundingClientRect())
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
        frame = requestAnimationFrame(tick)
        // The distance follows the time of a normal frame (up to 17ms). A frame much longer than that means the page is busy: it scrolls a single
        // step (5ms), like dnd-kit, whose interval of 5ms ticked once after a long task, so a slow page does not jump over the groups
        const elapsed = now - last > 34 ? 5 : Math.min(now - last, 17)
        last = now
        const pointer = getPointer()
        if (!pointer || elapsed <= 0) return
        for (const [index, container] of containers.entries()) {
            const dy = scrollStep(container, pointer, "y", rects[index])
            const dx = scrollStep(container, pointer, "x", rects[index])
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
