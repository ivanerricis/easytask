import { Moon, Palette, Sun, type LucideIcon } from "lucide-react"
import type { TFunction } from "i18next"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import type { ThemeDefinition } from "@/lib/themes/types"

/** The label of a theme: the translation of a built-in one, the name given by the user for a custom one. */
export const themeLabel = (t: TFunction, theme: Pick<ThemeDefinition, "name" | "nameKey">): string =>
    theme.nameKey ? t(theme.nameKey, { defaultValue: theme.name }) : theme.name

/** The icon of a theme in the menus: sun and moon for the two basic themes, a palette for every other one. */
export const themeIcon = (theme: Pick<ThemeDefinition, "id">): LucideIcon =>
    theme.id === "light" ? Sun : theme.id === "dark" ? Moon : Palette

const isHighContrast = (theme: ThemeDefinition) => theme.id.startsWith("high-contrast")

/**
 * The built-in themes in the groups of the menu: Light and Dark, then the palettes, then the high contrast ones.
 * Empty groups are left out.
 */
export const builtinThemeGroups = (themes: readonly ThemeDefinition[] = BUILTIN_THEMES): ThemeDefinition[][] => {
    const builtin = themes.filter(theme => theme.builtin)
    const basic = builtin.filter(theme => theme.id === "light" || theme.id === "dark")
    const contrast = builtin.filter(isHighContrast)
    const palettes = builtin.filter(theme => !basic.includes(theme) && !contrast.includes(theme))
    return [basic, palettes, contrast].filter(group => group.length > 0)
}

/** Type guard for the value of a theme menu (the radio groups hand over a plain string): the id of one of the themes. */
export const isTheme = (value: string, themes: readonly ThemeDefinition[] = BUILTIN_THEMES): boolean =>
    themes.some(theme => theme.id === value)
