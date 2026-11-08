import { applyTheme } from "@/lib/themes/apply"
import { defaultThemeIdForSystem, getBuiltinTheme } from "@/lib/themes/builtin"
import type { ThemeDefinition, ThemeId } from "@/lib/themes/types"
import { getAccentOverride, getPref, savePref } from "@/lib/store/preferences"
import { reportError } from "@/lib/report-error"

/** The key of the old theme choice ("light", "dark" or "system"), migrated once into the `themeId` preference. */
export const LEGACY_THEME_KEY = "vite-ui-theme"

/** What is known about the theme before the first render. */
export type ThemeStartup = {
    themeId: ThemeId
    /** The accent chosen apart from the theme, null when there is none. */
    accentOverride: string | null
    /** The theme to show (the cached copy when the chosen one is a custom theme, since the database is not read yet). */
    activeTheme: ThemeDefinition
    /** The custom themes known without the database: the cached one, if the chosen theme is custom. */
    customThemes: ThemeDefinition[]
}

const DARK_QUERY = "(prefers-color-scheme: dark)"

/** True when the operating system asks for a dark theme. */
export const systemPrefersDark = (): boolean =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches

const CONTRAST_QUERY = "(prefers-contrast: more)"

/** True when the operating system asks for more contrast. */
export const systemPrefersMoreContrast = (): boolean =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(CONTRAST_QUERY).matches

/**
 * The theme id to use at the first start: the old choice (light/dark) when there is one, otherwise the one of the
 * operating system (a high contrast theme when it asks for more contrast). "system" (and anything unknown) is resolved
 * with the operating system at this moment.
 */
export const migrateLegacyThemeId = (legacy: string | null, prefersDark: boolean, prefersMoreContrast = false): ThemeId =>
    legacy === "light" || legacy === "dark" ? legacy : defaultThemeIdForSystem(prefersDark, prefersMoreContrast)

const readLegacy = (): string | null => {
    try { return localStorage.getItem(LEGACY_THEME_KEY) } catch { return null }
}
const removeLegacy = () => {
    try { localStorage.removeItem(LEGACY_THEME_KEY) } catch { /* storage not available: nothing to remove */ }
}

/** The theme to show for an id: a built-in one, the cached custom one, or the default of the system. */
export const resolveActiveTheme = (id: ThemeId, customThemes: readonly ThemeDefinition[], prefersDark: boolean): ThemeDefinition =>
    getBuiltinTheme(id) ?? customThemes.find(theme => theme.id === id) ?? getBuiltinTheme(defaultThemeIdForSystem(prefersDark))!

let lastSynced = ""

/**
 * Keeps the copies of the active theme the next start needs: the background (for the window, read by the Rust side) and,
 * for a custom theme, its definition (for the first frame, before the database is ready). Writes only what changed.
 */
export function syncActiveThemeStorage(theme: ThemeDefinition): void {
    const signature = JSON.stringify([theme.id, theme.builtin ? null : theme, theme.colors.background])
    if (signature === lastSynced) return
    lastSynced = signature
    void savePref("themeBackground", theme.colors.background).catch(reportError)
    void savePref("activeThemeCache", theme.builtin ? null : theme).catch(reportError)
}

let startup: ThemeStartup | null = null

/** The result of `prepareTheme()` (null before it ran, e.g. in tests). */
export const getThemeStartup = (): ThemeStartup | null => startup

/**
 * Loads the theme state and applies it to the page, to run before the first render so there is no flash.
 * At the very first start the theme is chosen from the operating system (or from the old `vite-ui-theme` choice) and saved.
 * Never throws: on failure the theme of the operating system is applied.
 */
export async function prepareTheme(): Promise<ThemeStartup> {
    const prefersDark = systemPrefersDark()
    try {
        let themeId = await getPref("themeId")
        if (themeId === null) {
            themeId = migrateLegacyThemeId(readLegacy(), prefersDark, systemPrefersMoreContrast())
            await savePref("themeId", themeId)
        }
        removeLegacy()
        const [accentOverride, cached] = await Promise.all([getAccentOverride(), getPref("activeThemeCache")])
        const customThemes = cached ? [cached] : []
        startup = { themeId, accentOverride, activeTheme: resolveActiveTheme(themeId, customThemes, prefersDark), customThemes }
    } catch (error) {
        reportError(error)
        const activeTheme = resolveActiveTheme("", [], prefersDark)
        startup = { themeId: activeTheme.id, accentOverride: null, activeTheme, customThemes: [] }
    }
    applyTheme(startup.activeTheme, document.documentElement, startup.accentOverride)
    syncActiveThemeStorage(startup.activeTheme)
    return startup
}
