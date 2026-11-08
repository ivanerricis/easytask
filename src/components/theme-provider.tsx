import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react"
import { ThemeProviderContext } from "./theme-context"
import { PreferencesContext } from "@/contexts/preferences-context-object"
import { applyTheme } from "@/lib/themes/apply"
import { BUILTIN_THEMES, defaultThemeIdForSystem } from "@/lib/themes/builtin"
import type { ThemeDefinition, ThemeId } from "@/lib/themes/types"
import { deleteCustomTheme, getCustomThemes, renameCustomTheme, saveCustomTheme } from "@/db/queries/themes"
import { saveThemeId } from "@/lib/store/preferences"
import { getThemeStartup, resolveActiveTheme, syncActiveThemeStorage, systemPrefersDark } from "@/lib/theme-startup"
import { reportError } from "@/lib/report-error"

type ThemeProviderProps = {
    children: React.ReactNode
}

/**
 * Holds the theme state: the chosen theme, the custom themes (database) and the accent override (preferences). The initial
 * state is the one loaded before the first render (`prepareTheme` in lib/theme-startup.ts), so the page never flashes;
 * the custom themes are then read from the database, which may not be ready at that moment.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
    const startup = getThemeStartup()
    const [themeId, setThemeId] = useState<ThemeId>(() => startup?.themeId ?? defaultThemeIdForSystem(systemPrefersDark()))
    const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>(() => startup?.customThemes ?? [])
    // Until the database answers, a custom theme that is not in the list yet is not "missing"
    const [customLoaded, setCustomLoaded] = useState(false)
    // The accent override lives in the preferences; before them (or without them) the one read at startup
    const accentOverride = useContext(PreferencesContext)?.accentOverride ?? startup?.accentOverride ?? null

    useEffect(() => {
        let cancelled = false
        getCustomThemes().then(themes => {
            if (cancelled) return
            setCustomThemes(themes)
            setCustomLoaded(true)
        }).catch(reportError)
        return () => { cancelled = true }
    }, [])

    const themes = useMemo(() => [...BUILTIN_THEMES, ...customThemes], [customThemes])
    const activeTheme = useMemo(
        () => resolveActiveTheme(themeId, customThemes, systemPrefersDark()),
        [themeId, customThemes],
    )

    // The chosen custom theme is not in the database any more (deleted, restored backup): back to the default of the system
    useEffect(() => {
        if (!customLoaded || themes.some(theme => theme.id === themeId)) return
        const fallback = defaultThemeIdForSystem(systemPrefersDark())
        setThemeId(fallback)
        saveThemeId(fallback).catch(reportError)
    }, [customLoaded, themes, themeId])

    // The only writer of the theme variables, `--primary` included (the PreferencesProvider no longer applies the accent)
    useLayoutEffect(() => {
        applyTheme(activeTheme, window.document.documentElement, accentOverride)
    }, [activeTheme, accentOverride])
    useEffect(() => syncActiveThemeStorage(activeTheme), [activeTheme])

    const setTheme = useCallback((id: ThemeId) => {
        if (!themes.some(theme => theme.id === id)) return
        setThemeId(id)
        saveThemeId(id).catch(reportError)
    }, [themes])

    const save = useCallback(async (theme: ThemeDefinition) => {
        const saved = await saveCustomTheme(theme)
        setCustomThemes(current => current.some(t => t.id === saved.id) ? current.map(t => t.id === saved.id ? saved : t) : [...current, saved])
        return saved
    }, [])

    const rename = useCallback(async (id: ThemeId, name: string) => {
        const saved = await renameCustomTheme(id, name)
        setCustomThemes(current => current.map(t => t.id === id ? { ...t, name: saved } : t))
        return saved
    }, [])

    const remove = useCallback(async (id: ThemeId) => {
        await deleteCustomTheme(id)
        setCustomThemes(current => current.filter(t => t.id !== id))
        if (id === themeId) {
            const fallback = defaultThemeIdForSystem(systemPrefersDark())
            setThemeId(fallback)
            saveThemeId(fallback).catch(reportError)
        }
    }, [themeId])

    const value = useMemo(() => ({
        theme: themeId,
        resolvedTheme: activeTheme.base,
        activeTheme,
        themes,
        setTheme,
        saveCustomTheme: save,
        renameCustomTheme: rename,
        deleteCustomTheme: remove,
    }), [themeId, activeTheme, themes, setTheme, save, rename, remove])

    return (
        <ThemeProviderContext.Provider value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}
