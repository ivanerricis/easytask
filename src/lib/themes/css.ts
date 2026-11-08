import { effectiveAccent } from "./builtin"
import { composite, contrastRatio, isHex6, textColorOn } from "./color"
import { THEME_COLOR_KEYS, type ThemeDefinition } from "./types"

const ID_PATTERN = /^[a-z0-9-]{1,64}$/

/** Mixes `a` toward `b` by `t` (0-1). */
const mix = (a: string, b: string, t: number) => composite(b, t, a)

/** The accent as text: itself, moved toward the foreground until it reads (4.5:1) on the background. */
const accentText = (accent: string, background: string, foreground: string) => {
    for (let step = 0; step <= 20; step++) {
        const color = mix(accent, foreground, step / 20)
        if (contrastRatio(color, background) >= 4.5) return color
    }
    return foreground
}

const assertValid = (def: ThemeDefinition, accent: string) => {
    if (!ID_PATTERN.test(def.id)) throw new Error("Invalid theme id")
    for (const key of THEME_COLOR_KEYS) if (!isHex6(def.colors[key])) throw new Error(`Invalid theme color: ${key}`)
    if (!isHex6(accent)) throw new Error("Invalid theme accent")
}

/**
 * The CSS variables of a theme (name with the leading "--" to "#rrggbb"). Everything is built from validated hex colors.
 * @param accentOverride The accent chosen apart from the theme, if any.
 * @throws When the id or a color is not valid.
 */
export function themeCssVars(def: ThemeDefinition, accentOverride?: string | null): Record<string, string> {
    const accent = effectiveAccent(def, accentOverride)
    assertValid(def, accent)
    const c = def.colors
    const dark = def.base === "dark"
    return {
        "--background": c.background,
        "--foreground": c.foreground,
        "--card": c.card,
        "--card-foreground": c.foreground,
        "--popover": c.card,
        "--popover-foreground": c.foreground,
        "--primary": accent,
        "--primary-text": accentText(accent, c.background, c.foreground),
        "--primary-foreground": textColorOn(accent),
        "--secondary": c.muted,
        "--secondary-foreground": c.foreground,
        "--muted": c.muted,
        "--muted-foreground": c.mutedForeground,
        "--accent": c.accentSurface,
        "--accent-foreground": c.foreground,
        "--tooltip": dark ? mix(c.background, c.foreground, 0.2) : c.foreground,
        "--tooltip-foreground": dark ? c.foreground : c.background,
        "--tooltip-border": dark ? mix(c.background, c.foreground, 0.35) : c.foreground,
        "--destructive": c.destructive,
        "--destructive-foreground": textColorOn(c.destructive),
        "--warning": c.warning,
        "--warning-foreground": textColorOn(c.warning),
        "--priority": c.destructive,
        "--border": c.border,
        "--input": c.input,
        "--ring": accent,
    }
}

/** The style rule of a theme: `:root[data-theme="<id>"] { ... }`. */
export function themeStylesheet(def: ThemeDefinition, accentOverride?: string | null): string {
    const lines = Object.entries(themeCssVars(def, accentOverride)).map(([name, value]) => `  ${name}: ${value.toLowerCase()};`)
    return `:root[data-theme="${def.id}"] {\n${lines.join("\n")}\n}\n`
}
