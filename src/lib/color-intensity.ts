import { clampNumber } from "@/lib/number"

/** Multiplier applied to the opacity of the colors of folders, notes, groups and sections (1 = 100%). */
export const MIN_COLOR_INTENSITY = 0.25
export const MAX_COLOR_INTENSITY = 1.75
export const DEFAULT_COLOR_INTENSITY = 1
export const COLOR_INTENSITY_STEP = 0.05

/** Alpha limits that keep the text readable (contrast of at least 4.5:1 on the lightest colors) while the color stays visible. */
const MIN_COLOR_ALPHA = 0.05
const MAX_COLOR_ALPHA = 0.85

/** Base alphas used by the colored elements at 100% intensity. */
export const COLOR_ALPHA_BASE = {
    item: 0.3,
    itemHover: 0.5,
    header: 0.4,
    /** Background of a colored task: much lighter than the side bar, which keeps the full color. */
    task: 0.05,
    /** Background of the whole note area (the user's choice from the note menu): light, so the groups on it stay readable. */
    noteBackground: 0.12,
} as const

/** Brings an intensity into 0.25-1.75, rounded to 1% (non-numbers give the default 1). */
export const clampColorIntensity = (value: unknown): number => {
    return clampNumber(value, MIN_COLOR_INTENSITY, MAX_COLOR_INTENSITY, DEFAULT_COLOR_INTENSITY, 0.01)
}

/**
 * Scales a base alpha by the intensity chosen by the user.
 * @param base The base alpha (0-1) of the element.
 * @param intensity The multiplier (invalid values count as 1).
 * @returns The alpha, limited to 0.05-0.85 and rounded to 3 decimals.
 */
export const scaleAlpha = (base: number, intensity: unknown = DEFAULT_COLOR_INTENSITY): number => {
    const alpha = base * clampColorIntensity(intensity)
    return Math.round(Math.min(MAX_COLOR_ALPHA, Math.max(MIN_COLOR_ALPHA, alpha)) * 1000) / 1000
}
