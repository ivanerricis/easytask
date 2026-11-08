import { effectiveAccent } from "./builtin"
import { composite, contrastRatio, isHex6, textColorOn } from "./color"
import { THEME_COLOR_KEYS, type ThemeDefinition } from "./types"

const ID_PATTERN = /^[a-z0-9-]{1,64}$/

/** Mixes `a` toward `b` by `t` (0-1). */
const mix = (a: string, b: string, t: number) => composite(b, t, a)

/** `color` moved toward `toward` until it reads (`min`:1) on every one of the surfaces. */
const readable = (color: string, surfaces: readonly string[], toward: string, min: number) => {
    for (let step = 0; step <= 20; step++) {
        const candidate = mix(color, toward, step / 20)
        if (surfaces.every(surface => contrastRatio(candidate, surface) >= min)) return candidate
    }
    return toward
}

/** The accent as text: itself, moved toward the foreground until it reads (4.5:1) on the background. */
const accentText = (accent: string, background: string, foreground: string) => readable(accent, [background], foreground, 4.5)

/** A tint (`color` at `alpha` over the background) made stronger until the best text color on it reads `min`:1. */
const tintWithText = (color: string, alpha: number, background: string, min: number) => {
    for (let a = alpha; a < 1; a += 0.05) {
        const tint = composite(color, a, background)
        if (contrastRatio(tint, textColorOn(tint)) >= min) return tint
    }
    return color
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
    const hc = def.highContrast === true
    const min = hc ? 7 : 4.5
    const toward = c.foreground
    // Search highlight (yellow, like the one of a browser) and its current match
    const highlight = tintWithText(dark ? "#eab308" : "#fde047", dark ? 0.5 : 0.7, c.background, min)
    const highlightActive = hc ? (dark ? "#00e5ff" : "#ff8c00") : "#fb923c"
    // Status colors: emerald/sky moved toward the foreground until they read on the background and on their own 15% tint
    const status = (hue: string) => {
        const surfaces = [c.background, c.card]
        let color = readable(hue, surfaces, toward, min)
        for (let i = 0; i < 20 && !surfaces.every(surface => contrastRatio(color, composite(color, 0.15, surface)) >= min); i++) color = mix(color, toward, 0.1)
        return color
    }
    const success = status(dark ? "#34d399" : "#059669")
    const info = status(dark ? "#38bdf8" : "#0284c7")
    // Hover of the form controls: dark themes use the input color at half strength, the others (and when it would not read) the accent surface
    const inputHover = composite(c.input, 0.5, c.background)
    const controlHover = dark && !hc && contrastRatio(c.foreground, inputHover) >= min ? inputHover : c.accentSurface
    // Close button of the window: the destructive color darkened until white text reads on it
    const windowClose = readable(c.destructive, ["#ffffff"], "#000000", min)
    // Priority: the destructive color pulled a little toward the warning one, kept readable on the background
    const priority = readable(mix(c.destructive, c.warning, 0.2), [c.background], toward, min)
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
        "--body-surface": dark ? c.muted : c.background,
        "--secondary": c.muted,
        "--secondary-foreground": c.foreground,
        "--muted": c.muted,
        "--muted-foreground": c.mutedForeground,
        "--accent": c.accentSurface,
        "--accent-foreground": c.foreground,
        "--tooltip": dark ? (hc ? c.background : mix(c.background, c.foreground, 0.2)) : c.foreground,
        "--tooltip-foreground": dark ? c.foreground : c.background,
        "--tooltip-border": dark ? (hc ? c.foreground : mix(c.background, c.foreground, 0.35)) : c.foreground,
        "--destructive": c.destructive,
        "--destructive-foreground": textColorOn(c.destructive),
        "--warning": c.warning,
        "--warning-foreground": textColorOn(c.warning),
        "--priority": priority,
        "--highlight": highlight,
        "--highlight-foreground": textColorOn(highlight),
        "--highlight-active": highlightActive,
        "--success": success,
        "--success-foreground": textColorOn(success),
        "--info": info,
        "--info-foreground": textColorOn(info),
        "--control-hover": controlHover,
        // Backdrop of the dialogs: the only value with an alpha channel (#rrggbbaa)
        "--overlay": hc ? "#000000cc" : "#00000080",
        "--window-close": windowClose,
        "--window-close-foreground": "#ffffff",
        "--thumb": dark ? c.foreground : "#ffffff",
        "--border": c.border,
        "--input": c.input,
        "--ring": accent,
    }
}

/** The style rule of a theme: `:root[data-theme="<id>"] { ... }`. */
export function themeStylesheet(def: ThemeDefinition, accentOverride?: string | null): string {
    const lines = Object.entries(themeCssVars(def, accentOverride)).map(([name, value]) => `  ${name}: ${value.toLowerCase()};`)
    lines.unshift(`  color-scheme: ${def.base};`)
    return `:root[data-theme="${def.id}"] {\n${lines.join("\n")}\n}\n`
}
