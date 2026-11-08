import { browser, $, expect } from "@wdio/globals"
import { backgroundOf, chooseTheme, contrastRatio, cssColor, currentThemeId, tr, waitForApp } from "../helpers"

/**
 * Themes: chosen from the gallery of Settings -> Appearance, applied to the whole window (colors, `data-theme`, light/dark
 * class) and remembered across a reload. The two high contrast themes keep the text at 7:1 or more.
 */
const NORD_BACKGROUND = { r: 0x2e, g: 0x34, b: 0x40 }

const rootBackground = () => backgroundOf($("body"))

describe("Themes", () => {
    before(async () => {
        await waitForApp()
    })

    after(async () => {
        await chooseTheme("light")
    })

    it("applies a palette theme to the window", async () => {
        await chooseTheme("nord")
        expect(await currentThemeId()).toBe("nord")
        expect(await browser.execute(() => document.documentElement.classList.contains("dark"))).toBe(true)
        const background = await rootBackground()
        expect([background.r, background.g, background.b]).toEqual([NORD_BACKGROUND.r, NORD_BACKGROUND.g, NORD_BACKGROUND.b])
    })

    it("keeps the chosen theme after a reload", async () => {
        await browser.refresh()
        await waitForApp()
        expect(await currentThemeId()).toBe("nord")
    })

    for (const key of ["highContrastLight", "highContrastDark"]) {
        it(`reads the text at 7:1 in ${key}`, async () => {
            await chooseTheme(key)
            const body = $("body")
            const ratio = contrastRatio(await cssColor(body, "color"), await backgroundOf(body))
            expect(ratio).toBeGreaterThanOrEqual(7)
        })
    }

    it("goes back to the light theme", async () => {
        await chooseTheme("light")
        expect(await currentThemeId()).toBe("light")
        expect(await browser.execute(() => document.documentElement.classList.contains("dark"))).toBe(false)
        expect(await tr("settings.themes.light")).toBeTruthy()
    })
})
