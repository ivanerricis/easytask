import type { Point } from "./note-dnd-pointer"

/**
 * Where the preview of a dragged item is: a `position: fixed` box that starts over the dragged element (as dnd-kit's DragOverlay did,
 * so the preview keeps the place it was grabbed at) and follows the pointer with a transform, written once per animation frame.
 * @category Note DnD
 */
export type OverlayFollower = {
    /** The box of the preview (null when it is not mounted). */
    setNode: (node: HTMLElement | null) => void
    /** A drag starts: the rect of the dragged element, where the pointer went down and where it is. */
    begin: (rect: { left: number, top: number, width: number, height: number } | null, press: Point, pointer: Point) => void
    /** The pointer moved. */
    follow: (pointer: Point) => void
    /** The drag is over. */
    end: () => void
    /** Where the box starts, for its style. */
    rect: () => { left: number, top: number, width: number, height: number } | null
}

export function createOverlayFollower(): OverlayFollower {
    let node: HTMLElement | null = null
    let rect: { left: number, top: number, width: number, height: number } | null = null
    let press: Point = { x: 0, y: 0 }
    let pointer: Point = { x: 0, y: 0 }
    let frame = 0

    const apply = () => {
        frame = 0
        if (node) node.style.transform = `translate3d(${pointer.x - press.x}px, ${pointer.y - press.y}px, 0)`
    }

    return {
        setNode: next => { node = next; if (next) apply() },
        begin: (nextRect, nextPress, nextPointer) => {
            rect = nextRect
            press = nextPress
            pointer = nextPointer
        },
        follow: next => {
            pointer = next
            if (!frame) frame = requestAnimationFrame(apply)
        },
        end: () => {
            if (frame) cancelAnimationFrame(frame)
            frame = 0
            rect = null
        },
        rect: () => rect,
    }
}
