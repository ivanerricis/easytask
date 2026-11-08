const STRICT_HEX = /^#[0-9a-f]{6}$/i

/** True for exactly "#rrggbb" (the "#" required, no short form, no alpha). */
export const isHex6 = (value: unknown): value is string => typeof value === "string" && STRICT_HEX.test(value)

export type Rgb = [number, number, number]

/** "#rrggbb" into [r, g, b] (0-255); null when it is not one. */
export const parseHex6 = (hex: string): Rgb | null =>
    isHex6(hex) ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb : null

const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)))

export const toHex = ([r, g, b]: Rgb): string => `#${[r, g, b].map(v => clamp(v).toString(16).padStart(2, "0")).join("")}`

const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

const rgbOf = (hex: string): Rgb => {
    const rgb = parseHex6(hex)
    if (!rgb) throw new Error(`Not a #rrggbb color: ${hex}`)
    return rgb
}

/** WCAG relative luminance of a "#rrggbb" color. */
export const luminance = (hex: string): number => {
    const [r, g, b] = rgbOf(hex).map(channel)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1-21) between two "#rrggbb" colors. */
export const contrastRatio = (a: string, b: string): number => {
    const la = luminance(a)
    const lb = luminance(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The color `fg` painted with opacity `alpha` (0-1) over the opaque `bg`, as an opaque "#rrggbb". */
export const composite = (fg: string, alpha: number, bg: string): string => {
    const f = rgbOf(fg)
    const b = rgbOf(bg)
    return toHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)) as Rgb)
}

const DARK_TEXT = "#171717"
const LIGHT_TEXT = "#ffffff"

/** The text color for a surface: white or near-black, whichever has more contrast. */
export const textColorOn = (hex: string): string =>
    contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
