import { isHex6 } from "./color"
import {
    MAX_CUSTOM_THEMES, MAX_THEME_NAME_LENGTH, THEME_COLOR_KEYS, THEME_FILE_FORMAT, THEME_FILE_VERSION,
    type ThemeBase, type ThemeColors, type ThemeDefinition,
} from "./types"

/** Why a theme file was refused (the UI maps each code to a message). */
export type ThemeFileError = "invalid" | "newer-version" | "name" | "base" | "colors"

export type ThemeFileResult = { ok: true, theme: ThemeDefinition } | { ok: false, error: ThemeFileError }

/** The file of an exported theme (the id is not in it: an import always gets a new one). */
export type ThemeFile = {
    format: typeof THEME_FILE_FORMAT
    version: typeof THEME_FILE_VERSION
    name: string
    base: ThemeBase
    colors: ThemeColors
    accent: string
}

const CUSTOM_ID = /^custom-[0-9a-f]{32}$/
// Control characters, and format ones (zero width, bidi marks and overrides), and the line/paragraph separators
const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

/** A new id for a custom theme: `custom-` and a UUID without dashes. */
export const newCustomThemeId = (): string => `custom-${crypto.randomUUID().replaceAll("-", "")}`

/** The trimmed name when it is valid (1-60 characters, no control or bidi characters), otherwise null. */
export const normalizeThemeName = (value: unknown): string | null => {
    if (typeof value !== "string") return null
    const name = value.trim()
    if (name.length < 1 || name.length > MAX_THEME_NAME_LENGTH || FORBIDDEN_IN_NAME.test(name)) return null
    return name
}

const readColors = (value: unknown): ThemeColors | null => {
    if (!isPlainObject(value)) return null
    if (Object.keys(value).length !== THEME_COLOR_KEYS.length) return null
    const colors: Partial<ThemeColors> = {}
    for (const key of THEME_COLOR_KEYS) {
        if (!Object.hasOwn(value, key)) return null
        const color = value[key]
        if (!isHex6(color)) return null
        colors[key] = color.toLowerCase()
    }
    return colors as ThemeColors
}

type Parts = { name: string, base: ThemeBase, colors: ThemeColors, accent: string }

const readParts = (data: Record<string, unknown>): Parts | ThemeFileError => {
    const name = normalizeThemeName(Object.hasOwn(data, "name") ? data.name : undefined)
    if (name === null) return "name"
    const base = Object.hasOwn(data, "base") ? data.base : undefined
    if (base !== "light" && base !== "dark") return "base"
    const colors = readColors(Object.hasOwn(data, "colors") ? data.colors : undefined)
    const accent = Object.hasOwn(data, "accent") ? data.accent : undefined
    if (!colors || !isHex6(accent)) return "colors"
    return { name, base, colors, accent: accent.toLowerCase() }
}

/**
 * Validates the content of a theme file (already parsed from JSON; the caller limits the file size, see
 * `MAX_THEME_FILE_BYTES`). The id of the file is ignored: the theme gets a new `custom-` id.
 */
export function validateThemeFile(data: unknown): ThemeFileResult {
    if (!isPlainObject(data)) return { ok: false, error: "invalid" }
    if (!Object.hasOwn(data, "format") || data.format !== THEME_FILE_FORMAT) return { ok: false, error: "invalid" }
    const version = Object.hasOwn(data, "version") ? data.version : undefined
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return { ok: false, error: "invalid" }
    if (version > THEME_FILE_VERSION) return { ok: false, error: "newer-version" }
    const parts = readParts(data)
    if (typeof parts === "string") return { ok: false, error: parts }
    return { ok: true, theme: { id: newCustomThemeId(), ...parts, builtin: false } }
}

/** The file content to save for a theme. */
export const themeToFile = (theme: ThemeDefinition): ThemeFile => ({
    format: THEME_FILE_FORMAT, version: THEME_FILE_VERSION, name: theme.name, base: theme.base, colors: { ...theme.colors }, accent: theme.accent,
})

/**
 * The custom themes read back from the stored preference: at most 50, the invalid or duplicated ones dropped.
 * Unlike a file, a stored theme keeps its id (it must be `custom-` and 32 hex digits).
 */
export function normalizeStoredThemes(raw: unknown): ThemeDefinition[] {
    if (!Array.isArray(raw)) return []
    const themes: ThemeDefinition[] = []
    const ids = new Set<string>()
    for (const entry of raw) {
        if (themes.length >= MAX_CUSTOM_THEMES) break
        if (!isPlainObject(entry)) continue
        const id = Object.hasOwn(entry, "id") ? entry.id : undefined
        if (typeof id !== "string" || !CUSTOM_ID.test(id) || ids.has(id)) continue
        const parts = readParts(entry)
        if (typeof parts === "string") continue
        ids.add(id)
        themes.push({ id, ...parts, builtin: false })
    }
    return themes
}

/** The name, or the name with " (2)", " (3)"... when another one (compared ignoring case) already has it; at most 60 characters. */
export function uniqueThemeName(name: string, existing: readonly string[]): string {
    const taken = new Set(existing.map(n => n.trim().toLowerCase()))
    const base = name.trim().slice(0, MAX_THEME_NAME_LENGTH)
    if (!taken.has(base.toLowerCase())) return base
    for (let n = 2; ; n++) {
        const suffix = ` (${n})`
        const candidate = base.slice(0, MAX_THEME_NAME_LENGTH - suffix.length).trimEnd() + suffix
        if (!taken.has(candidate.toLowerCase())) return candidate
    }
}
