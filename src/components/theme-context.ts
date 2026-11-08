import { createContext } from "react"
import { BUILTIN_THEMES, getBuiltinTheme } from "@/lib/themes/builtin"
import type { ThemeBase, ThemeDefinition, ThemeId } from "@/lib/themes/types"

/** @deprecated Kept for the code that still imports it: a theme is identified by its `ThemeId`. */
export type Theme = ThemeId

export type ThemeProviderState = {
    /** The id of the chosen theme. */
    theme: ThemeId
    /** `light` or `dark`: the base of the active theme (decides the `light`/`dark` class of the root). */
    resolvedTheme: ThemeBase
    /** The definition of the active theme. */
    activeTheme: ThemeDefinition
    /** Every theme: the built-in ones, then the custom ones. */
    themes: readonly ThemeDefinition[]
    /** Chooses a theme (an id that is not in `themes` is ignored). */
    setTheme: (id: ThemeId) => void
    /** Adds a custom theme, or replaces the one with the same id (written to the database first). Resolves to the theme as saved (the name is made unique). */
    saveCustomTheme: (theme: ThemeDefinition) => Promise<ThemeDefinition>
    /** Resolves to the name as saved (trimmed, cut and made unique). */
    renameCustomTheme: (id: ThemeId, name: string) => Promise<string>
    /** Deletes a custom theme; deleting the active one switches to the default theme of the operating system. */
    deleteCustomTheme: (id: ThemeId) => Promise<void>
}

const light = getBuiltinTheme("light")!

const initialState: ThemeProviderState = {
    theme: light.id,
    resolvedTheme: light.base,
    activeTheme: light,
    themes: BUILTIN_THEMES,
    setTheme: () => null,
    saveCustomTheme: async theme => theme,
    renameCustomTheme: async (_id, name) => name,
    deleteCustomTheme: async () => {},
}

export const ThemeProviderContext = createContext<ThemeProviderState>(initialState)
