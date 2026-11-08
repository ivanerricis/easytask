import { describe, expect, it } from "vitest"
import { ACCENT_MIN_CONTRAST, DEFAULT_PRIMARY_COLOR, accentContrast, applyAccentColor, suggestAccentColor, textColorOn } from "./accent-color"
import { contrastRatio } from "@/lib/themes/color"

const DARK = "#171717"
const LIGHT = "#ffffff"
const WHITE_BG = "#ffffff"
const DARK_BG = "#1b1b1b"

describe("textColorOn", () => {
    it("is dark on the default light orange (white would give 1.8:1)", () => {
        expect(textColorOn("#ffb375")).toBe(DARK)
    })

    it("is white on dark accents", () => {
        for (const hex of ["#1e3a8a", "#3366ff", "#000000", "#7c2d12", DEFAULT_PRIMARY_COLOR]) expect(textColorOn(hex)).toBe(LIGHT)
    })

    it("is dark on light accents", () => {
        for (const hex of ["#ffffff", "#facc15", "#86efac"]) expect(textColorOn(hex)).toBe(DARK)
    })

    it("understands the short form and ignores the case and the #", () => {
        expect(textColorOn("#fff")).toBe(DARK)
        expect(textColorOn("#000")).toBe(LIGHT)
        expect(textColorOn("FFB375")).toBe(DARK)
        expect(textColorOn("#FFB375")).toBe(DARK)
    })

    it("falls back to the dark text for a value that is not a color", () => {
        for (const value of ["", "orange", "#12345"]) expect(textColorOn(value)).toBe(DARK)
    })

    it("always picks the better of the two", () => {
        for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#808080", "#777777", "#999999", "#ffa500", "#800080", "#40e0d0", "#a52a2a"]) {
            const chosen = textColorOn(hex)
            const other = chosen === LIGHT ? DARK : LIGHT
            expect(contrastRatio(hex, chosen)).toBeGreaterThanOrEqual(contrastRatio(hex, other))
        }
    })
})

describe("applyAccentColor", () => {
    it("sets the accent and the text color on it", () => {
        const root = document.createElement("div")
        applyAccentColor("#ffb375", root)
        expect(root.style.getPropertyValue("--primary")).toBe("#ffb375")
        expect(root.style.getPropertyValue("--primary-foreground")).toBe(DARK)

        applyAccentColor("#1e3a8a", root)
        expect(root.style.getPropertyValue("--primary")).toBe("#1e3a8a")
        expect(root.style.getPropertyValue("--primary-foreground")).toBe(LIGHT)
    })

    it("applies to the page by default", () => {
        applyAccentColor("#ffb375")
        expect(document.documentElement.style.getPropertyValue("--primary-foreground")).toBe(DARK)
    })
})

describe("accent contrast with the background", () => {
    it("measures it against the background given", () => {
        expect(accentContrast("#ffffff", WHITE_BG)).toBeCloseTo(1, 1)
        expect(accentContrast("#000000", WHITE_BG)).toBeCloseTo(21, 0)
        expect(accentContrast("#c2410c", WHITE_BG)!).toBeGreaterThan(5)
        expect(accentContrast("#c2410c", DARK_BG)!).toBeGreaterThan(ACCENT_MIN_CONTRAST)
        expect(accentContrast("#fff", WHITE_BG)).toBeCloseTo(1, 1)
        expect(accentContrast("nope", WHITE_BG)).toBeNull()
    })

    it("suggests nothing when the contrast is enough, or the color is not valid", () => {
        expect(suggestAccentColor(DEFAULT_PRIMARY_COLOR, WHITE_BG, "light")).toBeNull()
        expect(suggestAccentColor(DEFAULT_PRIMARY_COLOR, DARK_BG, "dark")).toBeNull()
        expect(suggestAccentColor("zzz", WHITE_BG, "light")).toBeNull()
    })

    it("suggests a darker color of the same hue on a light theme", () => {
        const suggestion = suggestAccentColor("#ffe119", WHITE_BG, "light")!
        expect(accentContrast("#ffe119", WHITE_BG)!).toBeLessThan(ACCENT_MIN_CONTRAST)
        expect(accentContrast(suggestion, WHITE_BG)!).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST)
        // Still a yellow-ish color (red and green channels well above blue), not a gray
        const [r, g, b] = [1, 3, 5].map(i => parseInt(suggestion.slice(i, i + 2), 16))
        expect(r).toBeGreaterThan(b + 40)
        expect(g).toBeGreaterThan(b + 40)
    })

    it("suggests a lighter color on a dark theme", () => {
        const suggestion = suggestAccentColor("#1e3a8a", DARK_BG, "dark")!
        expect(accentContrast("#1e3a8a", DARK_BG)!).toBeLessThan(ACCENT_MIN_CONTRAST)
        expect(accentContrast(suggestion, DARK_BG)!).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST)
        expect(parseInt(suggestion.slice(5, 7), 16)).toBeGreaterThan(parseInt("8a", 16))
    })

    it("works on the background of a theme that is not plain white or black", () => {
        // Solarized light: a pale yellow is hard to see on its cream background
        const cream = "#fdf6e3"
        const suggestion = suggestAccentColor("#ffe119", cream, "light")!
        expect(accentContrast(suggestion, cream)!).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST)
    })

    it("falls back to black or white for the extremes", () => {
        expect(accentContrast(suggestAccentColor("#ffffff", WHITE_BG, "light")!, WHITE_BG)!).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST)
        expect(accentContrast(suggestAccentColor("#000000", DARK_BG, "dark")!, DARK_BG)!).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST)
    })
})
