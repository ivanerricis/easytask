import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as prefs from "@/lib/store/preferences"
import { getBuiltinTheme } from "@/lib/themes/builtin"
import type { ThemeDefinition } from "@/lib/themes/types"
import { LEGACY_THEME_KEY, migrateLegacyThemeId, prepareTheme, resolveActiveTheme, syncActiveThemeStorage } from "./theme-startup"

vi.mock("@/lib/store/initStore", () => ({ store: {} }))
vi.mock("@/lib/store/preferences", () => ({
    getPref: vi.fn(),
    savePref: vi.fn().mockResolvedValue(undefined),
    getAccentOverride: vi.fn(),
}))
vi.mock("@/lib/report-error", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/report-error")>()),
    reportError: vi.fn(),
}))

const CUSTOM: ThemeDefinition = {
    id: "custom-" + "c".repeat(32), name: "Mine", base: "dark", builtin: false, accent: "#112233",
    colors: { ...getBuiltinTheme("dark")!.colors, background: "#101820" },
}

const stored = (values: Record<string, unknown>) =>
    vi.mocked(prefs.getPref).mockImplementation((async (name: string) => values[name] ?? null) as never)

describe("migrateLegacyThemeId", () => {
    it("keeps light and dark and resolves system (or anything else) with the operating system", () => {
        expect(migrateLegacyThemeId("light", true)).toBe("light")
        expect(migrateLegacyThemeId("dark", false)).toBe("dark")
        expect(migrateLegacyThemeId("system", true)).toBe("dark")
        expect(migrateLegacyThemeId("system", false)).toBe("light")
        expect(migrateLegacyThemeId(null, true)).toBe("dark")
        expect(migrateLegacyThemeId("nonsense", false)).toBe("light")
        expect(migrateLegacyThemeId("system", true, true)).toBe("high-contrast-dark")
        expect(migrateLegacyThemeId("dark", true, true)).toBe("dark")
    })
})

describe("resolveActiveTheme", () => {
    it("gives a built-in theme, the cached custom one, or the default of the system", () => {
        expect(resolveActiveTheme("nord", [], false).id).toBe("nord")
        expect(resolveActiveTheme(CUSTOM.id, [CUSTOM], false)).toBe(CUSTOM)
        expect(resolveActiveTheme(CUSTOM.id, [], true).id).toBe("dark")
        expect(resolveActiveTheme("gone", [], false).id).toBe("light")
    })
})

const mockSystem = ({ dark, contrast }: { dark: boolean, contrast: boolean }) =>
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("contrast") ? contrast : dark })))

describe("prepareTheme", () => {
    beforeEach(() => {
        mockSystem({ dark: true, contrast: false })
        vi.mocked(prefs.getAccentOverride).mockResolvedValue(null)
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.clearAllMocks()
        localStorage.clear()
        document.documentElement.classList.remove("light", "dark")
        document.documentElement.removeAttribute("data-theme")
        document.documentElement.style.removeProperty("--primary")
        document.getElementById("easytask-theme")?.remove()
    })

    it("at the first start chooses the theme from the operating system and saves it", async () => {
        stored({})
        const result = await prepareTheme()
        expect(result.themeId).toBe("dark")
        expect(prefs.savePref).toHaveBeenCalledWith("themeId", "dark")
        expect(document.documentElement.classList.contains("dark")).toBe(true)
    })

    it("at the first start chooses a high contrast theme when the system asks for more contrast", async () => {
        stored({})
        mockSystem({ dark: false, contrast: true })
        expect((await prepareTheme()).themeId).toBe("high-contrast-light")
        mockSystem({ dark: true, contrast: true })
        expect((await prepareTheme()).themeId).toBe("high-contrast-dark")
    })

    it("migrates the old localStorage choice once and removes the key", async () => {
        stored({})
        localStorage.setItem(LEGACY_THEME_KEY, "light")
        expect((await prepareTheme()).themeId).toBe("light")
        expect(prefs.savePref).toHaveBeenCalledWith("themeId", "light")
        expect(localStorage.getItem(LEGACY_THEME_KEY)).toBeNull()
    })

    it("resolves a legacy system choice with the operating system at that moment", async () => {
        stored({})
        localStorage.setItem(LEGACY_THEME_KEY, "system")
        expect((await prepareTheme()).themeId).toBe("dark")
        expect(localStorage.getItem(LEGACY_THEME_KEY)).toBeNull()
    })

    it("does not touch the saved choice when there is one, but still drops the old key", async () => {
        stored({ themeId: "nord" })
        localStorage.setItem(LEGACY_THEME_KEY, "light")
        const result = await prepareTheme()
        expect(result.themeId).toBe("nord")
        expect(prefs.savePref).not.toHaveBeenCalledWith("themeId", expect.anything())
        expect(localStorage.getItem(LEGACY_THEME_KEY)).toBeNull()
        expect(document.documentElement.getAttribute("data-theme")).toBe("nord")
    })

    it("shows the cached copy of a custom theme before the database is ready, and the accent override", async () => {
        stored({ themeId: CUSTOM.id, activeThemeCache: CUSTOM })
        vi.mocked(prefs.getAccentOverride).mockResolvedValue("#abcdef")
        const result = await prepareTheme()
        expect(result.activeTheme).toBe(CUSTOM)
        expect(result.customThemes).toEqual([CUSTOM])
        expect(document.documentElement.getAttribute("data-theme")).toBe(CUSTOM.id)
        expect(document.getElementById("easytask-theme")?.textContent).toContain("#abcdef")
    })

    it("never throws: a failing store gives the theme of the operating system", async () => {
        vi.mocked(prefs.getPref).mockRejectedValue(new Error("no store"))
        const result = await prepareTheme()
        expect(result.activeTheme.id).toBe("dark")
    })
})

describe("syncActiveThemeStorage", () => {
    afterEach(() => vi.clearAllMocks())

    it("writes the background and the copy, only when something changed", () => {
        syncActiveThemeStorage(CUSTOM)
        expect(prefs.savePref).toHaveBeenCalledWith("themeBackground", "#101820")
        expect(prefs.savePref).toHaveBeenCalledWith("activeThemeCache", CUSTOM)
        vi.mocked(prefs.savePref).mockClear()
        syncActiveThemeStorage(CUSTOM)
        expect(prefs.savePref).not.toHaveBeenCalled()
        syncActiveThemeStorage(getBuiltinTheme("nord")!)
        expect(prefs.savePref).toHaveBeenCalledWith("activeThemeCache", null)
    })
})
