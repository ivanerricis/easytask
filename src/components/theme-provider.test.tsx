import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "./theme-provider"
import { useTheme } from "./use-theme"
import { PreferencesContext, type PreferencesContextType } from "@/contexts/preferences-context-object"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import type { ThemeDefinition } from "@/lib/themes/types"
import * as db from "@/db/queries/themes"
import * as prefs from "@/lib/store/preferences"

vi.mock("@/lib/store/initStore", () => ({ store: {} }))
vi.mock("@/lib/store/preferences", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/store/preferences")>()),
    savePref: vi.fn().mockResolvedValue(undefined),
    saveThemeId: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/db/queries/themes", () => ({
    getCustomThemes: vi.fn(),
    saveCustomTheme: vi.fn(),
    renameCustomTheme: vi.fn(),
    deleteCustomTheme: vi.fn(),
}))
vi.mock("@/lib/report-error", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/report-error")>()),
    reportError: vi.fn(),
}))

const CUSTOM: ThemeDefinition = {
    id: "custom-" + "a".repeat(32), name: "Mine", base: "dark", builtin: false, accent: "#112233",
    colors: { ...BUILTIN_THEMES[1].colors, background: "#101820" },
}

let ctx: ReturnType<typeof useTheme>
const Probe = () => {
    ctx = useTheme()
    return <span data-testid="state">{ctx.theme}:{ctx.resolvedTheme}</span>
}

const renderProvider = (accentOverride: string | null = null) => render(
    <PreferencesContext.Provider value={{ accentOverride } as PreferencesContextType}>
        <ThemeProvider><Probe /></ThemeProvider>
    </PreferencesContext.Provider>,
)

describe("ThemeProvider", () => {
    beforeEach(() => {
        vi.mocked(db.getCustomThemes).mockResolvedValue([CUSTOM])
        vi.mocked(db.saveCustomTheme).mockImplementation(async theme => theme)
        vi.mocked(db.renameCustomTheme).mockImplementation(async (_id, name) => name)
        vi.mocked(db.deleteCustomTheme).mockResolvedValue(undefined)
        vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })))
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.clearAllMocks()
        const root = document.documentElement
        root.classList.remove("light", "dark")
        root.removeAttribute("data-theme")
        root.style.removeProperty("--primary")
        document.getElementById("easytask-theme")?.remove()
    })

    it("starts with the theme of the operating system and the custom themes from the database", async () => {
        renderProvider()
        expect(screen.getByTestId("state").textContent).toBe("light:light")
        expect(document.documentElement.classList.contains("light")).toBe(true)
        await waitFor(() => expect(ctx.themes).toHaveLength(BUILTIN_THEMES.length + 1))
        expect(ctx.themes.at(-1)).toEqual(CUSTOM)
    })

    it("chooses a theme, applies it and saves the choice", async () => {
        renderProvider()
        await waitFor(() => expect(ctx.themes).toHaveLength(BUILTIN_THEMES.length + 1))
        act(() => ctx.setTheme("nord"))
        expect(screen.getByTestId("state").textContent).toBe("nord:dark")
        expect(document.documentElement.classList.contains("dark")).toBe(true)
        expect(document.documentElement.classList.contains("light")).toBe(false)
        expect(document.documentElement.getAttribute("data-theme")).toBe("nord")
        expect(prefs.saveThemeId).toHaveBeenCalledWith("nord")
        act(() => ctx.setTheme("does-not-exist"))
        expect(ctx.theme).toBe("nord")
    })

    it("applies the accent override over the accent of the theme", () => {
        renderProvider("#abcdef")
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#abcdef")
    })

    it("keeps the copy of a custom theme for the first frame and the background of the window", async () => {
        renderProvider()
        await waitFor(() => expect(ctx.themes).toHaveLength(BUILTIN_THEMES.length + 1))
        act(() => ctx.setTheme(CUSTOM.id))
        await waitFor(() => expect(prefs.savePref).toHaveBeenCalledWith("activeThemeCache", CUSTOM))
        expect(prefs.savePref).toHaveBeenCalledWith("themeBackground", "#101820")
    })

    it("saves, renames and deletes custom themes", async () => {
        renderProvider()
        await waitFor(() => expect(ctx.themes).toHaveLength(BUILTIN_THEMES.length + 1))
        const other = { ...CUSTOM, id: "custom-" + "b".repeat(32), name: "Other" }
        await act(() => ctx.saveCustomTheme(other))
        expect(ctx.themes).toHaveLength(BUILTIN_THEMES.length + 2)
        await act(() => ctx.renameCustomTheme(other.id, "Renamed"))
        expect(ctx.themes.find(t => t.id === other.id)?.name).toBe("Renamed")
        await act(() => ctx.deleteCustomTheme(other.id))
        expect(ctx.themes.find(t => t.id === other.id)).toBeUndefined()
    })

    it("deleting the active theme switches to the default one of the operating system", async () => {
        renderProvider()
        await waitFor(() => expect(ctx.themes).toHaveLength(BUILTIN_THEMES.length + 1))
        act(() => ctx.setTheme(CUSTOM.id))
        expect(ctx.theme).toBe(CUSTOM.id)
        await act(() => ctx.deleteCustomTheme(CUSTOM.id))
        expect(ctx.theme).toBe("light")
        expect(document.documentElement.classList.contains("light")).toBe(true)
        expect(prefs.saveThemeId).toHaveBeenLastCalledWith("light")
    })
})
