import i18n from "@/i18n"
import { open, save } from "@tauri-apps/plugin-dialog"
import { readTextFile, stat, writeTextFile } from "@tauri-apps/plugin-fs"
import { MAX_CUSTOM_THEMES, MAX_THEME_FILE_BYTES, MAX_THEME_NAME_LENGTH, type ThemeDefinition } from "@/lib/themes/types"
import { themeToFile, uniqueThemeName, validateThemeFile, type ThemeFileError } from "@/lib/themes/validate"
import { createError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"

const FILTERS = [{ name: "EasyTask theme", extensions: ["json"] }]

/** What an import did: the themes saved, the files left out and why (one message per different reason). */
export type ThemeImportSummary = { imported: number, discarded: number, errors: string[] }

/** The name to show for a theme: the translation of a built-in one, otherwise its own name. */
export const themeDisplayName = (theme: Pick<ThemeDefinition, "name" | "nameKey">): string =>
    theme.nameKey ? i18n.t(theme.nameKey, { defaultValue: theme.name }) : theme.name

// Characters not allowed in a Windows file name
const sanitizeFileName = (name: string) => name.replace(/[<>:"/\\|?*]/g, "_").trim() || "theme"

const fileErrorMessage = (error: ThemeFileError): string => {
    switch (error) {
        case "invalid": return i18n.t("errors.themes.invalid")
        case "newer-version": return i18n.t("errors.themes.newerVersion")
        case "name": return i18n.t("errors.themes.name", { max: MAX_THEME_NAME_LENGTH })
        case "base": return i18n.t("errors.themes.base")
        case "colors": return i18n.t("errors.themes.colors")
    }
}

/** Reads and validates one file; throws the message to show when it is not a usable theme. */
async function readThemeFile(path: string): Promise<ThemeDefinition> {
    // A failing stat is ignored: the read below reports the real problem
    const size = await stat(path).then(info => info.size, () => 0)
    if (size > MAX_THEME_FILE_BYTES) throw new Error(i18n.t("errors.themes.fileTooLarge", { max: MAX_THEME_FILE_BYTES / 1024 }))

    let parsed: unknown
    try {
        parsed = JSON.parse(await readTextFile(path))
    } catch {
        throw new Error(i18n.t("errors.themes.invalidJson"))
    }
    const result = validateThemeFile(parsed)
    if (!result.ok) throw new Error(fileErrorMessage(result.error))
    return result.theme
}

/**
 * Asks for theme files (more than one allowed) and imports each: every file is validated on its own, so a bad one does not
 * stop the others. A name already taken gets " (2)", " (3)"..., and at most 50 custom themes are kept.
 * @param existing The themes the app already has (their names must not be repeated, custom ones count toward the limit).
 * @param saveTheme Saves one theme (`saveCustomTheme` of the theme context); resolves to the theme as saved.
 * @returns null when the user cancelled the dialog.
 * @category Utilities
 */
export async function importThemes(
    existing: readonly ThemeDefinition[],
    saveTheme: (theme: ThemeDefinition) => Promise<ThemeDefinition>,
): Promise<ThemeImportSummary | null> {
    let picked: string | string[] | null
    try {
        picked = await open({ filters: FILTERS, multiple: true, directory: false })
    } catch (error) {
        throw toAppError(error, e => createError("THEME_IMPORT_FAILED", i18n.t("errors.themes.import", { message: getErrorMessage(e) })))
    }
    if (!picked) return null
    const paths = Array.isArray(picked) ? picked : [picked]

    const names = existing.map(theme => theme.name)
    let customCount = existing.filter(theme => !theme.builtin).length
    const summary: ThemeImportSummary = { imported: 0, discarded: 0, errors: [] }
    const fail = (message: string) => {
        summary.discarded++
        if (!summary.errors.includes(message)) summary.errors.push(message)
    }

    for (const path of paths) {
        try {
            if (customCount >= MAX_CUSTOM_THEMES) {
                fail(i18n.t("errors.themes.limit", { max: MAX_CUSTOM_THEMES }))
                continue
            }
            const theme = await readThemeFile(path)
            const saved = await saveTheme({ ...theme, name: uniqueThemeName(theme.name, names) })
            names.push(saved.name)
            customCount++
            summary.imported++
        } catch (error) {
            fail(getErrorMessage(error))
        }
    }
    return summary
}

/**
 * The text of the toast after an import: how many themes were imported and how many discarded; `error` when nothing was imported.
 * The reasons (`summary.errors`) are for the caller to add.
 */
export function describeThemeImport(summary: ThemeImportSummary): { text: string, error: boolean } {
    const imported = i18n.t("errors.themes.imported", { count: summary.imported })
    if (summary.discarded === 0) return { text: imported, error: false }
    const discarded = i18n.t("errors.themes.discarded", { count: summary.discarded })
    if (summary.imported === 0) return { text: [discarded, ...summary.errors].join(" "), error: true }
    return { text: i18n.t("errors.themes.importedWithDiscarded", { imported, discarded }), error: false }
}

/**
 * Asks where to save and writes a theme as `<name>.easytask-theme.json` (pretty printed, without its id). Built-in themes can be
 * exported too, as a model to start from.
 * @returns false when the user cancelled the dialog.
 * @category Utilities
 */
export async function exportTheme(theme: ThemeDefinition): Promise<boolean> {
    try {
        const named = { ...theme, name: themeDisplayName(theme) }
        const path = await save({ filters: FILTERS, defaultPath: `${sanitizeFileName(named.name)}.easytask-theme.json` })
        if (!path) return false
        await writeTextFile(path, JSON.stringify(themeToFile(named), null, 2))
        return true
    } catch (error) {
        throw toAppError(error, e => createError("THEME_EXPORT_FAILED", i18n.t("errors.themes.export", { message: getErrorMessage(e) })))
    }
}
