import { useEffect } from "react"

/** Attribute of the cover, to find it (tests, e2e). */
export const GRAB_COVER_ATTR = "data-drag-cursor"

/**
 * Switches the cursor of the cover between the closed hand and "not allowed" without a render: for the drags whose state lives in a
 * ref / a store (the tree of the sidebar), where a React state would re-render the whole tree each time the pointer crosses a border.
 * Does nothing when no cover is shown (no drag in progress).
 */
export const setGrabCursorNotAllowed = (notAllowed: boolean) => {
    const cover = document.querySelector<HTMLElement>(`[${GRAB_COVER_ATTR}]`)
    if (cover) cover.style.cursor = notAllowed ? "not-allowed" : "grabbing"
}

/**
 * While `active` (an item is being dragged) the whole window shows the closed hand, whatever is under the pointer.
 * With `notAllowed` too (the pointer is over nothing the item can be dropped on) it shows the "not allowed" cursor instead.
 *
 * The cursor comes from a transparent cover over the window, not from a `* { cursor: ... !important }` rule: a rule on every element
 * invalidates the style of the whole document (hundreds of rows) when the drag starts, when it ends and each time the cursor flips,
 * while the cover is one element whose cursor changes. The drags of dnd-kit read the pointer events of the document, which the cover
 * does not stop, and the targets are hit-tested by their rectangles, not by the element under the pointer.
 */
export const useGrabbingCursor = (active: boolean, notAllowed = false) => {
    useEffect(() => {
        if (!active) return
        const cover = document.createElement("div")
        cover.setAttribute(GRAB_COVER_ATTR, "")
        cover.setAttribute("aria-hidden", "true")
        cover.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:transparent;"
        document.body.appendChild(cover)
        return () => { cover.remove() }
    }, [active])

    useEffect(() => {
        if (!active) return
        const cover = document.querySelector<HTMLElement>(`[${GRAB_COVER_ATTR}]`)
        if (cover) cover.style.cursor = notAllowed ? "not-allowed" : "grabbing"
    }, [active, notAllowed])
}
