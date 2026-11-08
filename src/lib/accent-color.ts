import { parseHex } from "@/lib/colors"
import { contrastRatio, textColorOn as textColorOnHex6, toHex } from "@/lib/themes/color"
import type { ThemeBase } from "@/lib/themes/types"

/**
 * The accent color of the light and dark themes and of the old installs: a deep orange (Tailwind orange-700) that carries white
 * text at about 5.2:1. Keep it in sync with `--primary` in index.css and with the accent of the "light" and "dark" built-in themes.
 */
export const DEFAULT_PRIMARY_COLOR = "#c2410c"

/** "#rgb" or "#rrggbb" (the "#" optional) into "#rrggbb"; null when it is not a color. */
const normalizeHex = (hex: string): string | null => {
    const rgb = parseHex(hex)
    return rgb ? toHex(rgb) : null
}

/**
 * The color of the text and icons on the accent color: white or near-black, whichever reads better on it.
 * @param hex The accent color, "#rgb" or "#rrggbb".
 * @returns A "#rrggbb"; the dark one when `hex` is not a valid color.
 * @category Theme
 */
export const textColorOn = (hex: string): string => {
    const color = normalizeHex(hex)
    return color === null ? textColorOnHex6("#ffffff") : textColorOnHex6(color)
}

/**
 * Previews the accent color on the page (`--primary` and the matching `--primary-foreground`) while it is being chosen; the
 * theme provider applies the stored one for good.
 * @param hex The accent color.
 * @param root The element that holds the theme variables (the document element).
 * @category Theme
 */
export const applyAccentColor = (hex: string, root: HTMLElement = document.documentElement): void => {
    root.style.setProperty("--primary", hex)
    root.style.setProperty("--primary-foreground", textColorOn(hex))
}

/** Minimum contrast of the accent with the background for borders, selections and focus rings (WCAG 1.4.11, non-text: 3:1). */
export const ACCENT_MIN_CONTRAST = 3

export type AccentTheme = ThemeBase

/**
 * Contrast ratio of the accent color with the background of a theme.
 * @param background The "#rrggbb" background of the theme.
 * @returns The ratio (1-21), or null when `hex` is not a valid color.
 * @category Theme
 */
export const accentContrast = (hex: string, background: string): number | null => {
    const color = normalizeHex(hex)
    return color === null ? null : contrastRatio(color, background)
}

const toHsl = (hex: string): [number, number, number] | null => {
    const rgb = parseHex(hex)
    if (!rgb) return null
    const [r, g, b] = rgb.map(v => v / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    if (d === 0) return [0, 0, l]
    const s = d / (1 - Math.abs(2 * l - 1))
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return [(h * 60 + 360) % 360, s, l]
}

const fromHsl = (h: number, s: number, l: number): string => {
    const k = (n: number) => (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const channel = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
    return `#${[0, 8, 4].map(n => channel(n).toString(16).padStart(2, "0")).join("")}`
}

/**
 * A color close to the accent with enough contrast with the background of a theme: same hue and saturation, with the
 * lightness moved the least that is needed (darker on a light theme, lighter on a dark one).
 * @param background The "#rrggbb" background of the theme.
 * @param base The base of the theme: decides the direction of the change.
 * @returns The suggested "#rrggbb", or null when the accent already has enough contrast (or is not a valid color).
 * @category Theme
 */
export const suggestAccentColor = (hex: string, background: string, base: AccentTheme): string | null => {
    const current = accentContrast(hex, background)
    const hsl = toHsl(hex)
    if (current === null || hsl === null || current >= ACCENT_MIN_CONTRAST) return null
    const [h, s, l] = hsl
    const step = base === "light" ? -0.005 : 0.005
    for (let lightness = l + step; lightness >= 0 && lightness <= 1; lightness += step) {
        const candidate = fromHsl(h, s, lightness)
        // A little margin over the minimum, so that rounding to 8 bits per channel cannot bring it below
        if ((accentContrast(candidate, background) ?? 0) >= ACCENT_MIN_CONTRAST + 0.1) return candidate
    }
    return base === "light" ? "#000000" : "#ffffff"
}
