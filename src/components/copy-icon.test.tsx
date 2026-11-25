import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CopyIcon } from "./copy-icon"
import { useCopiedFlash } from "@/hooks/use-copied-flash"

const Probe = () => {
    const [copied, flash] = useCopiedFlash()
    return <button type="button" onClick={flash}><CopyIcon copied={copied} /></button>
}

describe("CopyIcon", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("turns into a check after the copy and back after a moment", () => {
        const { container } = render(<Probe />)
        expect(container.querySelector("[data-copied]")).toBeNull()
        act(() => screen.getByRole("button").click())
        const check = container.querySelector("[data-copied]")
        expect(check).not.toBeNull()
        expect(check).toHaveClass("animate-in", "zoom-in-50")
        act(() => { vi.advanceTimersByTime(1600) })
        expect(container.querySelector("[data-copied]")).toBeNull()
    })
})
