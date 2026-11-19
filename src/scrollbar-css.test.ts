import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const css = readFileSync("src/index.css", "utf8")

describe("scrollbar utilities (index.css)", () => {
    it("scroll-inset shortens the track by the padding of the scroll area", () => {
        expect(css).toMatch(/\.scroll-inset::-webkit-scrollbar-track\s*\{[^}]*margin-block:\s*var\(--scroll-inset,\s*4px\)/)
    })

    it("scroll-gap widens the scrollbar and starts the thumb with a transparent border of the same size", () => {
        expect(css).toMatch(/\.scroll-gap::-webkit-scrollbar\s*\{[^}]*width:\s*calc\(9px \+ var\(--scroll-gap,\s*6px\)\)/)
        expect(css).toMatch(/\.scroll-gap::-webkit-scrollbar-thumb\s*\{[^}]*border-left:\s*var\(--scroll-gap,\s*6px\) solid transparent[^}]*background-clip:\s*padding-box/)
    })

    it("does not set the standard scrollbar-width / scrollbar-color (they switch the ::-webkit-scrollbar styling off in Chromium)", () => {
        expect(css).not.toMatch(/scrollbar-(width|color)\s*:/)
    })
})
