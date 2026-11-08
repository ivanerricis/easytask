import type { ThemeDefinition } from "./types"

/**
 * The built-in themes. "light" and "dark" mirror `:root` and `.dark` of index.css (which stay the fallback before the JS
 * runs), with the oklch values converted to opaque hex: keep them in sync with index.css.
 * The other palettes follow the well-known ones (Nord, Solarized, Dracula) with some tints adjusted until every pair of
 * `contrast-checks.ts` passes.
 */
export const BUILTIN_THEMES: readonly ThemeDefinition[] = [
    {
        id: "light", name: "Light", nameKey: "settings.themes.light", base: "light", builtin: true, accent: "#c2410c",
        colors: {
            background: "#ffffff", foreground: "#0a0a0a", card: "#ffffff", muted: "#f5f5f5", mutedForeground: "#6a6a6a",
            accentSurface: "#ebebeb", border: "#e5e5e5", input: "#8f8f8f", destructive: "#e7000b", warning: "#a8690a",
        },
    },
    {
        id: "dark", name: "Dark", nameKey: "settings.themes.dark", base: "dark", builtin: true, accent: "#c2410c",
        colors: {
            background: "#1b1b1b", foreground: "#fafafa", card: "#171717", muted: "#262626", mutedForeground: "#a3a3a3",
            accentSurface: "#3a3a3a", border: "#323232", input: "#7b7b7b", destructive: "#ff6568", warning: "#fbbf24",
        },
    },
    {
        id: "nord", name: "Nord", nameKey: "settings.themes.nord", base: "dark", builtin: true, accent: "#88c0d0",
        colors: {
            background: "#2e3440", foreground: "#eceff4", card: "#3b4252", muted: "#434c5e", mutedForeground: "#c0c9da",
            accentSurface: "#4c566a", border: "#4c566a", input: "#7b88a1", destructive: "#e0808a", warning: "#ebcb8b",
        },
    },
    {
        id: "solarized-light", name: "Solarized Light", nameKey: "settings.themes.solarizedLight", base: "light", builtin: true, accent: "#268bd2",
        colors: {
            background: "#fdf6e3", foreground: "#3b4f56", card: "#fdf6e3", muted: "#eee8d5", mutedForeground: "#52666d",
            accentSurface: "#e4ddc8", border: "#d6cfba", input: "#7a8c8e", destructive: "#c02a27", warning: "#a67c00",
        },
    },
    {
        id: "solarized-dark", name: "Solarized Dark", nameKey: "settings.themes.solarizedDark", base: "dark", builtin: true, accent: "#268bd2",
        colors: {
            background: "#002b36", foreground: "#b4c1c1", card: "#073642", muted: "#073642", mutedForeground: "#97a7a8",
            accentSurface: "#0d4553", border: "#17505e", input: "#6d8589", destructive: "#f0635d", warning: "#b58900",
        },
    },
    {
        id: "dracula", name: "Dracula", nameKey: "settings.themes.dracula", base: "dark", builtin: true, accent: "#bd93f9",
        colors: {
            background: "#282a36", foreground: "#f8f8f2", card: "#343746", muted: "#3d4052", mutedForeground: "#b4bad8",
            accentSurface: "#44475a", border: "#4b4f66", input: "#7a86b8", destructive: "#ff6e6e", warning: "#f1fa8c",
        },
    },
    {
        id: "sepia", name: "Sepia", nameKey: "settings.themes.sepia", base: "light", builtin: true, accent: "#8b5a2b",
        colors: {
            background: "#f4ecd8", foreground: "#433422", card: "#fbf5e6", muted: "#eadfc6", mutedForeground: "#6b5a42",
            accentSurface: "#e0d3b4", border: "#d8c9a8", input: "#948157", destructive: "#a8281e", warning: "#8a5a00",
        },
    },
]

export const DEFAULT_LIGHT_THEME_ID = "light"
export const DEFAULT_DARK_THEME_ID = "dark"

export const getBuiltinTheme = (id: string): ThemeDefinition | undefined => BUILTIN_THEMES.find(theme => theme.id === id)

/** The theme chosen once, at the first start, from the operating system (`prefers-color-scheme`). */
export const defaultThemeIdForSystem = (prefersDark: boolean): string =>
    prefersDark ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID

/** The accent in use: the user's override (a "#rrggbb") over the one of the theme, which is the fallback and the "restore". */
export const effectiveAccent = (def: Pick<ThemeDefinition, "accent">, override: string | null | undefined): string =>
    typeof override === "string" && /^#[0-9a-f]{6}$/i.test(override) ? override.toLowerCase() : def.accent
