import { effectiveAccent } from "./builtin"
import { contrastRatio } from "./color"
import type { ThemeColorKey, ThemeDefinition } from "./types"

export type ThemeColorName = ThemeColorKey | "accent"

export type ContrastCheck = { fg: ThemeColorName, bg: ThemeColorName, min: number }

/** The pairs a theme has to keep readable and the minimum ratio of each (WCAG: 4.5 text, 3 for controls and icons). */
export const CONTRAST_CHECKS: readonly ContrastCheck[] = [
    { fg: "foreground", bg: "background", min: 4.5 },
    { fg: "foreground", bg: "card", min: 4.5 },
    { fg: "mutedForeground", bg: "background", min: 4.5 },
    { fg: "mutedForeground", bg: "muted", min: 4.5 },
    { fg: "foreground", bg: "accentSurface", min: 4.5 },
    { fg: "input", bg: "background", min: 3 },
    { fg: "destructive", bg: "background", min: 4.5 },
    { fg: "warning", bg: "background", min: 3 },
    { fg: "accent", bg: "background", min: 3 },
]

export type ContrastFailure = ContrastCheck & { ratio: number }

/** The checks a theme does not pass (empty when it is fine). `accentOverride` is checked instead of the theme's accent. */
export const checkThemeContrast = (def: ThemeDefinition, accentOverride?: string | null): ContrastFailure[] => {
    const pick = (name: ThemeColorName) => name === "accent" ? effectiveAccent(def, accentOverride) : def.colors[name]
    return CONTRAST_CHECKS
        .map(check => ({ ...check, ratio: contrastRatio(pick(check.fg), pick(check.bg)) }))
        .filter(result => result.ratio < result.min)
}
