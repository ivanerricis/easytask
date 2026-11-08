import { createError, toAppError } from "@/types/error"
import i18n from "@/i18n"
import { getErrorMessage } from "@/lib/utils"
import { MAX_CUSTOM_THEMES, type ThemeDefinition } from "@/lib/themes/types"
import { normalizeStoredThemes, normalizeThemeName, uniqueThemeName } from "@/lib/themes/validate"
import { getDB } from "../dbManager"

type ThemeRow = { id: string, name: string, base: string, colors: string, accent: string }

const parseColors = (json: string): unknown => {
    try { return JSON.parse(json) } catch { return null }
}

/**
 * The custom themes of the user, oldest first. A row that is not a valid theme is skipped.
 * @category Database Queries
 */
export async function getCustomThemes(): Promise<ThemeDefinition[]> {
    try {
        const db = await getDB()
        const rows = await db.select<ThemeRow[]>("SELECT id, name, base, colors, accent FROM custom_themes ORDER BY created_at, rowid")
        return normalizeStoredThemes(rows.map(r => ({ id: r.id, name: r.name, base: r.base, colors: parseColors(r.colors), accent: r.accent })))
    } catch (error: unknown) {
        throw toAppError(error, e => createError("THEME_READ_ERROR", `Could not read the custom themes: ${getErrorMessage(e)}`))
    }
}

/**
 * Creates or replaces (by id) a custom theme. The name is made unique among the other custom themes (ignoring case).
 * @param def The theme; its id must be `custom-<32 hex digits>`.
 * @returns The theme as saved (the name may have changed to be unique).
 * @category Database Queries
 */
export async function saveCustomTheme(def: ThemeDefinition): Promise<ThemeDefinition> {
    try {
        const stored = normalizeStoredThemes([{ ...def, builtin: false }])[0]
        if (!stored) throw new Error("Invalid theme")
        const db = await getDB()
        const others = await db.select<{ id: string, name: string }[]>("SELECT id, name FROM custom_themes WHERE id <> ?", [stored.id])
        const exists = (await db.select<{ id: string }[]>("SELECT id FROM custom_themes WHERE id = ?", [stored.id])).length > 0
        if (!exists && others.length >= MAX_CUSTOM_THEMES) throw new Error(`At most ${MAX_CUSTOM_THEMES} custom themes`)
        const saved = { ...stored, name: uniqueThemeName(stored.name, others.map(o => o.name)) }
        await db.execute(
            `INSERT INTO custom_themes (id, name, base, colors, accent) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, base = excluded.base, colors = excluded.colors, accent = excluded.accent, updated_at = datetime('now', 'localtime')`,
            [saved.id, saved.name, saved.base, JSON.stringify(saved.colors), saved.accent],
        )
        return saved
    } catch (error: unknown) {
        throw toAppError(error, e => createError("THEME_SAVE_ERROR", i18n.t("errors.themes.save", { message: getErrorMessage(e) })))
    }
}

/**
 * Deletes a custom theme (nothing happens if it does not exist).
 * @category Database Queries
 */
export async function deleteCustomTheme(id: string): Promise<void> {
    try {
        const db = await getDB()
        await db.execute("DELETE FROM custom_themes WHERE id = ?", [id])
    } catch (error: unknown) {
        throw toAppError(error, e => createError("THEME_DELETE_ERROR", `Could not delete the theme: ${getErrorMessage(e)}`))
    }
}

/**
 * Renames a custom theme; the name is trimmed, cut and made unique among the other custom themes.
 * @returns The name as saved.
 * @category Database Queries
 */
export async function renameCustomTheme(id: string, name: string): Promise<string> {
    try {
        const clean = normalizeThemeName(name)
        if (!clean) throw new Error("Invalid name")
        const db = await getDB()
        const others = await db.select<{ name: string }[]>("SELECT name FROM custom_themes WHERE id <> ?", [id])
        const unique = uniqueThemeName(clean, others.map(o => o.name))
        const result = await db.execute("UPDATE custom_themes SET name = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [unique, id])
        if (result?.rowsAffected === 0) throw createError("THEME_NOT_FOUND", i18n.t("errors.themes.notFound"))
        return unique
    } catch (error: unknown) {
        throw toAppError(error, e => createError("THEME_RENAME_ERROR", `Could not rename the theme: ${getErrorMessage(e)}`))
    }
}
