import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GRAB_COVER_ATTR, useGrabbingCursor } from "./use-grabbing-cursor"

const covers = () => [...document.body.querySelectorAll<HTMLElement>(`[${GRAB_COVER_ATTR}]`)]
const cursor = () => covers()[0]?.style.cursor ?? ""

describe("useGrabbingCursor", () => {
    it("adds nothing while nothing is dragged", () => {
        renderHook(() => useGrabbingCursor(false))
        expect(covers()).toHaveLength(0)
    })

    it("shows the closed hand while dragging and removes the cover at the end", () => {
        const { unmount } = renderHook(() => useGrabbingCursor(true))
        expect(cursor()).toBe("grabbing")
        unmount()
        expect(covers()).toHaveLength(0)
    })

    it("does not add a global style rule (it would invalidate the style of the whole document)", () => {
        const before = document.head.querySelectorAll("style").length
        const { unmount } = renderHook(() => useGrabbingCursor(true))
        expect(document.head.querySelectorAll("style")).toHaveLength(before)
        unmount()
    })

    it("shows the not allowed cursor over an invalid target and goes back to the hand, on the same cover", () => {
        const { rerender, unmount } = renderHook(({ notAllowed }) => useGrabbingCursor(true, notAllowed), { initialProps: { notAllowed: true } })
        expect(cursor()).toBe("not-allowed")
        const cover = covers()[0]
        rerender({ notAllowed: false })
        expect(cursor()).toBe("grabbing")
        expect(covers()).toEqual([cover])
        unmount()
    })

    it("shows nothing special for an invalid target when nothing is dragged", () => {
        renderHook(() => useGrabbingCursor(false, true))
        expect(covers()).toHaveLength(0)
    })
})
