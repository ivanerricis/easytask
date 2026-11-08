import { describe, expect, it } from "vitest"
import { applyTheme, THEME_STYLE_ID } from "./apply"
import { BUILTIN_THEMES, defaultThemeIdForSystem, effectiveAccent, getBuiltinTheme } from "./builtin"
import { composite, contrastRatio, isHex6, luminance, parseHex6, textColorOn } from "./color"
import { checkThemeContrast } from "./contrast-checks"
import { themeCssVars, themeStylesheet } from "./css"
import { THEME_COLOR_KEYS, type ThemeDefinition } from "./types"
import { normalizeStoredThemes, newCustomThemeId, themeToFile, uniqueThemeName, validateThemeFile } from "./validate"

const nord = getBuiltinTheme("nord") as ThemeDefinition
const goodFile = () => JSON.parse(JSON.stringify(themeToFile(nord))) as Record<string, unknown>

describe("color", () => {
    it("parses only #rrggbb", () => {
        expect(parseHex6("#ff8000")).toEqual([255, 128, 0])
        expect(parseHex6("#fff")).toBeNull()
        expect(isHex6("ff8000")).toBe(false)
        expect(isHex6("#ff8000aa")).toBe(false)
    })
    it("computes luminance and contrast", () => {
        expect(luminance("#ffffff")).toBeCloseTo(1)
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21)
        expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1)
        expect(() => luminance("red")).toThrow()
    })
    it("composites alpha over a background", () => {
        expect(composite("#ffffff", 0.5, "#000000")).toBe("#808080")
        expect(composite("#ff0000", 1, "#000000")).toBe("#ff0000")
    })
    it("picks the readable text color", () => {
        expect(textColorOn("#000000")).toBe("#ffffff")
        expect(textColorOn("#ffffff")).toBe("#171717")
        expect(textColorOn("#c2410c")).toBe("#ffffff")
        expect(textColorOn("#f97316")).toBe("#171717")
    })
})

describe("built-in themes", () => {
    it("have unique ids and valid colors", () => {
        expect(new Set(BUILTIN_THEMES.map(t => t.id)).size).toBe(BUILTIN_THEMES.length)
        for (const theme of BUILTIN_THEMES) {
            expect(theme.builtin).toBe(true)
            expect(isHex6(theme.accent)).toBe(true)
            for (const key of THEME_COLOR_KEYS) expect(isHex6(theme.colors[key]), `${theme.id}.${key}`).toBe(true)
        }
    })
    it.each(BUILTIN_THEMES.map(t => [t.id, t] as const))("%s passes every contrast check", (_id, theme) => {
        expect(checkThemeContrast(theme)).toEqual([])
    })
    it("reports a failing pair", () => {
        const bad = { ...nord, colors: { ...nord.colors, foreground: "#3b4252" } }
        expect(checkThemeContrast(bad).map(f => f.fg)).toContain("foreground")
    })
})

describe("default theme and accent", () => {
    it("follows the system once", () => {
        expect(defaultThemeIdForSystem(true)).toBe("dark")
        expect(defaultThemeIdForSystem(false)).toBe("light")
    })
    it("uses the override over the accent of the theme", () => {
        expect(effectiveAccent(nord, null)).toBe("#88c0d0")
        expect(effectiveAccent(nord, undefined)).toBe("#88c0d0")
        expect(effectiveAccent(nord, "#FF0000")).toBe("#ff0000")
        expect(effectiveAccent(nord, "red; }")).toBe("#88c0d0")
    })
})

describe("css", () => {
    it("generates only hex values, derived from the colors", () => {
        for (const theme of BUILTIN_THEMES) {
            const vars = themeCssVars(theme)
            for (const [name, value] of Object.entries(vars)) {
                expect(name).toMatch(/^--[a-z-]+$/)
                expect(value, `${theme.id} ${name}`).toMatch(/^#[0-9a-f]{6}$/)
            }
            expect(vars["--primary"]).toBe(theme.accent)
            expect(vars["--card"]).toBe(theme.colors.card)
            expect(vars["--accent"]).toBe(theme.colors.accentSurface)
        }
    })
    it("applies the accent override and its foreground", () => {
        const vars = themeCssVars(nord, "#000000")
        expect(vars["--primary"]).toBe("#000000")
        expect(vars["--primary-foreground"]).toBe("#ffffff")
    })
    it("wraps the variables in a rule on the theme id", () => {
        const css = themeStylesheet(nord)
        expect(css.startsWith(':root[data-theme="nord"] {')).toBe(true)
        expect(css).not.toMatch(/[<>@\\]/)
    })
    it("refuses a theme that is not valid", () => {
        expect(() => themeCssVars({ ...nord, colors: { ...nord.colors, border: "red; } body{display:none" } })).toThrow()
        expect(() => themeCssVars({ ...nord, id: 'x"] { } a[' })).toThrow()
        expect(() => themeCssVars(nord, null)).not.toThrow()
    })
})

describe("applyTheme", () => {
    it("sets the class, the attribute and one style for the other themes, and removes them for light and dark", () => {
        const root = document.documentElement
        applyTheme(nord, root)
        expect(root.classList.contains("dark")).toBe(true)
        expect(root.classList.contains("light")).toBe(false)
        expect(root.getAttribute("data-theme")).toBe("nord")
        applyTheme(getBuiltinTheme("dracula") as ThemeDefinition, root)
        expect(document.querySelectorAll(`#${THEME_STYLE_ID}`)).toHaveLength(1)
        expect(document.getElementById(THEME_STYLE_ID)?.textContent).toContain('data-theme="dracula"')
        applyTheme(getBuiltinTheme("sepia") as ThemeDefinition, root)
        expect(root.classList.contains("light")).toBe(true)
        expect(root.classList.contains("dark")).toBe(false)
        applyTheme(getBuiltinTheme("light") as ThemeDefinition, root)
        expect(root.hasAttribute("data-theme")).toBe(false)
        expect(document.getElementById(THEME_STYLE_ID)).toBeNull()
    })
    it("sets the override inline on light and dark only, and clears it", () => {
        const root = document.documentElement
        const light = getBuiltinTheme("light") as ThemeDefinition
        applyTheme(light, root, "#112233")
        expect(root.style.getPropertyValue("--primary")).toBe("#112233")
        applyTheme(light, root)
        expect(root.style.getPropertyValue("--primary")).toBe("")
        applyTheme(nord, root, "#112233")
        expect(root.style.getPropertyValue("--primary")).toBe("")
        expect(document.getElementById(THEME_STYLE_ID)?.textContent).toContain("--primary: #112233")
        applyTheme(light, root)
    })
})

describe("validateThemeFile", () => {
    it("accepts a good file, lowercases colors and generates a new id", () => {
        const file = goodFile()
        file.id = "nord"
        file.accent = "#88C0D0"
        const result = validateThemeFile(file)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.theme.id).toMatch(/^custom-[0-9a-f]{32}$/)
        expect(result.theme.builtin).toBe(false)
        expect(result.theme.accent).toBe("#88c0d0")
        expect(result.theme.colors).toEqual(nord.colors)
    })
    it("trims the name", () => {
        const result = validateThemeFile({ ...goodFile(), name: "  My theme  " })
        expect(result.ok && result.theme.name).toBe("My theme")
    })
    it.each([
        ["null", null], ["array", []], ["string", "x"], ["number", 3], ["empty", {}],
    ])("refuses %s", (_label, value) => {
        expect(validateThemeFile(value)).toEqual({ ok: false, error: "invalid" })
    })
    it("refuses a wrong format and a missing or bad version", () => {
        expect(validateThemeFile({ ...goodFile(), format: "other" })).toEqual({ ok: false, error: "invalid" })
        expect(validateThemeFile({ ...goodFile(), version: "1" })).toEqual({ ok: false, error: "invalid" })
        expect(validateThemeFile({ ...goodFile(), version: 0 })).toEqual({ ok: false, error: "invalid" })
        expect(validateThemeFile({ ...goodFile(), version: 1.5 })).toEqual({ ok: false, error: "invalid" })
    })
    it("refuses a newer version", () => {
        expect(validateThemeFile({ ...goodFile(), version: 2 })).toEqual({ ok: false, error: "newer-version" })
    })
    it("refuses bad names", () => {
        for (const name of ["", "   ", "x".repeat(61), "a\u0000b", "a\nb", "a‮b", "a​b", 5, null, undefined]) {
            expect(validateThemeFile({ ...goodFile(), name }), String(name)).toEqual({ ok: false, error: "name" })
        }
        expect(validateThemeFile({ ...goodFile(), name: "x".repeat(60) }).ok).toBe(true)
    })
    it("refuses a bad base", () => {
        expect(validateThemeFile({ ...goodFile(), base: "system" })).toEqual({ ok: false, error: "base" })
    })
    it("refuses hostile colors", () => {
        const file = goodFile()
        const colors = file.colors as Record<string, unknown>
        const bad = (patch: Record<string, unknown>) => validateThemeFile({ ...file, colors: { ...colors, ...patch } })
        expect(bad({ border: "red; } body{display:none" })).toEqual({ ok: false, error: "colors" })
        expect(bad({ border: "#fff" })).toEqual({ ok: false, error: "colors" })
        expect(bad({ border: "#12345678" })).toEqual({ ok: false, error: "colors" })
        expect(bad({ border: "#123456\n" })).toEqual({ ok: false, error: "colors" })
        expect(bad({ border: 5 })).toEqual({ ok: false, error: "colors" })
        expect(bad({ extra: "#000000" })).toEqual({ ok: false, error: "colors" })
        expect(validateThemeFile({ ...file, accent: "url(x)" })).toEqual({ ok: false, error: "colors" })
        const missing = { ...colors }
        delete missing.warning
        expect(validateThemeFile({ ...file, colors: missing })).toEqual({ ok: false, error: "colors" })
        // one key replaced by an inherited-looking name: the count is right but the known key is absent
        const swapped = { ...missing, toString: "#000000" }
        expect(validateThemeFile({ ...file, colors: swapped })).toEqual({ ok: false, error: "colors" })
    })
    it("refuses __proto__ tricks from JSON", () => {
        const text = JSON.stringify(goodFile()).replace('"colors":{', '"colors":{"__proto__":{"background":"#000000"},')
        expect(validateThemeFile(JSON.parse(text))).toEqual({ ok: false, error: "colors" })
        const onlyProto = JSON.parse('{"format":"easytask-theme","version":1,"name":"x","base":"dark","accent":"#000000","colors":{"__proto__":{}}}')
        expect(validateThemeFile(onlyProto)).toEqual({ ok: false, error: "colors" })
        // a polluted prototype does not provide the missing keys
        const inherited = Object.create({ name: "x", base: "dark" })
        expect(validateThemeFile(inherited).ok).toBe(false)
        expect(({} as Record<string, unknown>).background).toBeUndefined()
    })
    it("round-trips through themeToFile", () => {
        const result = validateThemeFile(themeToFile(nord))
        expect(result.ok && result.theme.colors).toEqual(nord.colors)
    })
})

describe("normalizeStoredThemes", () => {
    const stored = (n: number): ThemeDefinition => ({
        id: `custom-${n.toString(16).padStart(32, "0")}`, name: `T${n}`, base: nord.base, colors: nord.colors, accent: nord.accent, builtin: false,
    })
    it("returns [] for anything but an array", () => {
        expect(normalizeStoredThemes(null)).toEqual([])
        expect(normalizeStoredThemes({})).toEqual([])
    })
    it("keeps valid themes with their id and drops the invalid and duplicated ones", () => {
        const good = stored(1)
        const result = normalizeStoredThemes([good, good, { ...stored(2), id: "nord" }, { ...stored(3), name: "" }, null, "x", { ...stored(4), accent: "red" }, stored(5)])
        expect(result.map(t => t.id)).toEqual([good.id, stored(5).id])
        expect(result[0]).toEqual(good)
    })
    it("keeps at most 50", () => {
        expect(normalizeStoredThemes(Array.from({ length: 80 }, (_, i) => stored(i + 1)))).toHaveLength(50)
    })
    it("forces builtin to false", () => {
        expect(normalizeStoredThemes([{ ...stored(1), builtin: true }])[0].builtin).toBe(false)
    })
})

describe("names and ids", () => {
    it("makes a name unique", () => {
        expect(uniqueThemeName("Mine", [])).toBe("Mine")
        expect(uniqueThemeName("Mine", ["mine"])).toBe("Mine (2)")
        expect(uniqueThemeName("Mine", ["Mine", "Mine (2)"])).toBe("Mine (3)")
        expect(uniqueThemeName("  Mine ", ["Other"])).toBe("Mine")
    })
    it("keeps the unique name within 60 characters", () => {
        const long = "x".repeat(60)
        const result = uniqueThemeName(long, [long])
        expect(result).toHaveLength(60)
        expect(result.endsWith(" (2)")).toBe(true)
    })
    it("generates custom ids", () => {
        expect(newCustomThemeId()).toMatch(/^custom-[0-9a-f]{32}$/)
        expect(newCustomThemeId()).not.toBe(newCustomThemeId())
    })
})
