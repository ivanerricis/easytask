/** The colors an item can be given with one click (menus and creation dialogs). */
export const PALETTE_COLORS = [
    '#e6194b', '#3cb44b', '#d9bf01', '#4363d8',
    '#f58231', '#911eb4', '#13d7d7', '#f032e6',
    '#9dcf01', '#ebb0b0', '#008080', '#d7b0f0',
    '#9a6324', '#c4bf8f', '#000075',
] as const

/**
 * Value of `section_group.color` for the "Automatic" color of a group: not a color but a rule, the color follows the progress of the group
 * (see `resolveGroupColor`). Versions of the app before this one would read it as an invalid color.
 */
export const GROUP_COLOR_PROGRESS = "progress"

export const isPaletteColor = (color: string | null | undefined): boolean =>
    !!color && (PALETTE_COLORS as readonly string[]).includes(color.toLowerCase())

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Parses "#rgb" or "#rrggbb" (the "#" is optional, surrounding spaces are ignored) into [r, g, b] (0-255); null when it is not one. */
export const parseHex = (hex: string): [number, number, number] | null => {
    const match = HEX_COLOR.exec(hex.trim())
    if (!match) return null
    const digits = match[1].length === 3 ? match[1].split("").map(d => d + d).join("") : match[1]
    return [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number]
}

const STRICT_HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** True for exactly a "#rgb" or "#rrggbb" string (stricter than {@link parseHex}: "#" required, no spaces). */
export const isHexColor = (value: unknown): value is string => typeof value === "string" && STRICT_HEX_COLOR.test(value)
