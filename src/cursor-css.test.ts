import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const css = readFileSync("src/index.css", "utf8")
const baseLayer = css.slice(css.indexOf("@layer base")).replace(/\/\*[\s\S]*?\*\//g, "")

/** The declarations of the first rule of the base layer whose selector list contains `selector`. */
function declarationsFor(selector: string): string | undefined {
    for (const m of baseLayer.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1].split(",").map((s) => s.trim()).includes(selector) && /cursor:/.test(m[2])) return m[2]
    }
    return undefined
}

describe("cursor rules (index.css)", () => {
    it.each(["button:not(:disabled)", "[role=\"tab\"]", "[role=\"radio\"]", "[role=\"checkbox\"]", "[role=\"switch\"]", "[role=\"slider\"]", "[role=\"button\"]", "a[href]"])(
        "gives the hand to %s",
        (selector) => {
            expect(declarationsFor(selector)).toMatch(/cursor:\s*pointer/)
        },
    )

    it.each(["[role=\"menuitem\"]", "[role=\"menuitemcheckbox\"]", "[role=\"menuitemradio\"]", "[role=\"option\"]"])("keeps the arrow on %s", (selector) => {
        expect(declarationsFor(selector)).toMatch(/cursor:\s*default/)
    })

    it("says not-allowed on disabled controls", () => {
        expect(declarationsFor("[aria-disabled=\"true\"]")).toMatch(/cursor:\s*not-allowed/)
    })

    it("puts the menu rule after the pointer and disabled rules so a menu item that is a button keeps the arrow", () => {
        const pointer = baseLayer.indexOf("cursor: pointer")
        const disabled = baseLayer.indexOf("cursor: not-allowed")
        const menu = baseLayer.indexOf("[role=\"menuitem\"]")
        expect(pointer).toBeLessThan(disabled)
        expect(disabled).toBeLessThan(menu)
    })

    it("is inside the base layer (utilities such as cursor-grab must win)", () => {
        expect(css.indexOf("cursor: pointer")).toBeGreaterThan(css.indexOf("@layer base"))
    })
})
