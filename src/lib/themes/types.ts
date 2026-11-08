/** Id of a theme: a fixed word for the built-in ones ("light", "dark", "nord", ...) or `custom-<32 hex digits>` for the user's. */
export type ThemeId = string

export type ThemeBase = "light" | "dark"

/** The editable colors of a theme (besides the accent), all "#rrggbb". */
export const THEME_COLOR_KEYS = [
    "background", "foreground", "card", "muted", "mutedForeground", "accentSurface", "border", "input", "destructive", "warning",
] as const

export type ThemeColorKey = typeof THEME_COLOR_KEYS[number]

export type ThemeColors = Record<ThemeColorKey, string>

/**
 * A theme. `accentSurface` is the shadcn "accent" (hover and selection background, `--accent`); `accent` is the brand color
 * (`--primary`), the 11th editable color.
 */
export type ThemeDefinition = {
    id: ThemeId
    name: string
    /** Translation key of the name (built-in themes only); `name` is the fallback. */
    nameKey?: string
    /** Decides the `light`/`dark` class of the root (Tailwind `dark:` variants, native controls). */
    base: ThemeBase
    colors: ThemeColors
    /** Default accent of the theme, "#rrggbb". */
    accent: string
    builtin: boolean
}

export const THEME_FILE_FORMAT = "easytask-theme"
export const THEME_FILE_VERSION = 1
export const MAX_CUSTOM_THEMES = 50
export const MAX_THEME_NAME_LENGTH = 60
/** Largest theme file the caller should read (the library does not check the size). */
export const MAX_THEME_FILE_BYTES = 64 * 1024
