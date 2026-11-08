import { describe, expect, it } from "vitest"
import { Moon, Palette, Sun } from "lucide-react"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import type { ThemeDefinition } from "@/lib/themes/types"
import { builtinThemeGroups, isTheme, themeIcon, themeLabel } from "./theme-options"

const t = ((key: string, options?: { defaultValue?: string }) => `T(${key}|${options?.defaultValue})`) as never
const withId = (id: string): ThemeDefinition => ({ ...BUILTIN_THEMES[0], id, name: id })

describe("builtinThemeGroups", () => {
    it("starts with light and dark, then the palettes, never lists a theme twice and offers no system entry", () => {
        const groups = builtinThemeGroups()
        expect(groups[0].map(theme => theme.id)).toEqual(["light", "dark"])
        expect(groups[1].map(theme => theme.id)).toEqual(expect.arrayContaining(["nord", "solarized-light", "solarized-dark", "dracula", "sepia"]))
        const ids = groups.flat().map(theme => theme.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).not.toContain("system")
    })

    it("puts the high contrast themes in their own last group and skips the custom ones", () => {
        const groups = builtinThemeGroups([...BUILTIN_THEMES, withId("high-contrast-dark"), { ...withId("custom-1"), builtin: false }])
        const last = groups[groups.length - 1].map(theme => theme.id)
        expect(last).toContain("high-contrast-dark")
        expect(last.every(id => id.startsWith("high-contrast"))).toBe(true)
        expect(groups.flat().some(theme => theme.id === "custom-1")).toBe(false)
    })
})

describe("themeIcon", () => {
    it("is a sun, a moon or a palette", () => {
        expect(themeIcon({ id: "light" })).toBe(Sun)
        expect(themeIcon({ id: "dark" })).toBe(Moon)
        expect(themeIcon({ id: "nord" })).toBe(Palette)
        expect(themeIcon({ id: "custom-abc" })).toBe(Palette)
    })
})

describe("themeLabel", () => {
    it("translates the built-in themes and shows the name of the custom ones", () => {
        expect(themeLabel(t, { name: "Nord", nameKey: "settings.themes.nord" })).toBe("T(settings.themes.nord|Nord)")
        expect(themeLabel(t, { name: "Mio tema" })).toBe("Mio tema")
    })
})

describe("isTheme", () => {
    it("accepts the id of a theme and rejects anything else", () => {
        expect(isTheme("light")).toBe(true)
        expect(isTheme("sepia")).toBe(true)
        expect(isTheme("system")).toBe(false)
        expect(isTheme("")).toBe(false)
        expect(isTheme("custom-1", [withId("custom-1")])).toBe(true)
    })
})
