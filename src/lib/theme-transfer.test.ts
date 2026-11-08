import { beforeEach, describe, expect, it, vi } from "vitest"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import { MAX_CUSTOM_THEMES, MAX_THEME_FILE_BYTES, type ThemeDefinition } from "@/lib/themes/types"
import { themeToFile } from "@/lib/themes/validate"

const files = new Map<string, string>()
const sizes = new Map<string, number>()
const open = vi.fn()
const save = vi.fn()
const writeTextFile = vi.fn()

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...a: unknown[]) => open(...a), save: (...a: unknown[]) => save(...a) }))
vi.mock("@tauri-apps/plugin-fs", () => ({
    readTextFile: async (path: string) => files.get(path) ?? "",
    writeTextFile: (...a: unknown[]) => writeTextFile(...a),
    stat: async (path: string) => ({ size: sizes.get(path) ?? 10 }),
}))

import { describeThemeImport, exportTheme, importThemes } from "./theme-transfer"

const nord = BUILTIN_THEMES.find(theme => theme.id === "nord")!
const validFile = (name: string) => JSON.stringify(themeToFile({ ...nord, name }))
const saveTheme = vi.fn(async (theme: ThemeDefinition) => theme)

beforeEach(() => {
    files.clear()
    sizes.clear()
    open.mockReset()
    save.mockReset().mockResolvedValue("/x/out.json")
    writeTextFile.mockReset()
    saveTheme.mockClear()
})

describe("importThemes", () => {
    it("returns null when the dialog is cancelled", async () => {
        open.mockResolvedValue(null)
        expect(await importThemes([], saveTheme)).toBeNull()
    })

    it("imports every valid file with a new custom id and a unique name", async () => {
        files.set("/a.json", validFile("Mine"))
        files.set("/b.json", validFile("Mine"))
        open.mockResolvedValue(["/a.json", "/b.json"])
        const summary = await importThemes([nord], saveTheme)
        expect(summary).toEqual({ imported: 2, discarded: 0, errors: [] })
        const saved = saveTheme.mock.calls.map(call => call[0])
        expect(saved.map(theme => theme.name)).toEqual(["Mine", "Mine (2)"])
        expect(saved[0].id).toMatch(/^custom-[0-9a-f]{32}$/)
        expect(saved[0].builtin).toBe(false)
    })

    it("validates each file on its own: a bad one does not stop the others", async () => {
        files.set("/ok.json", validFile("Ok"))
        files.set("/bad.json", "not json")
        files.set("/other.json", JSON.stringify({ format: "other" }))
        files.set("/big.json", validFile("Big"))
        sizes.set("/big.json", MAX_THEME_FILE_BYTES + 1)
        open.mockResolvedValue(["/bad.json", "/ok.json", "/other.json", "/big.json"])
        const summary = await importThemes([], saveTheme)
        expect(summary?.imported).toBe(1)
        expect(summary?.discarded).toBe(3)
        expect(summary?.errors).toHaveLength(3)
        expect(saveTheme).toHaveBeenCalledTimes(1)
    })

    it("accepts a single path", async () => {
        files.set("/a.json", validFile("One"))
        open.mockResolvedValue("/a.json")
        expect((await importThemes([], saveTheme))?.imported).toBe(1)
    })

    it("stops at the limit of custom themes", async () => {
        const custom = Array.from({ length: MAX_CUSTOM_THEMES - 1 }, (_, i) => ({ ...nord, id: `custom-${i}`, name: `T${i}`, builtin: false }))
        files.set("/a.json", validFile("A"))
        files.set("/b.json", validFile("B"))
        open.mockResolvedValue(["/a.json", "/b.json"])
        const summary = await importThemes(custom, saveTheme)
        expect(summary).toMatchObject({ imported: 1, discarded: 1 })
        expect(summary?.errors[0]).toContain(String(MAX_CUSTOM_THEMES))
    })

    it("counts a failing save as discarded", async () => {
        files.set("/a.json", validFile("A"))
        open.mockResolvedValue(["/a.json"])
        saveTheme.mockRejectedValueOnce(new Error("disk"))
        expect(await importThemes([], saveTheme)).toEqual({ imported: 0, discarded: 1, errors: ["disk"] })
    })
})

describe("describeThemeImport", () => {
    it("reports the imported ones, and the discarded ones", () => {
        expect(describeThemeImport({ imported: 1, discarded: 0, errors: [] })).toEqual({ text: "Importato 1 tema", error: false })
        const mixed = describeThemeImport({ imported: 2, discarded: 1, errors: ["x"] })
        expect(mixed.error).toBe(false)
        expect(mixed.text).toContain("Importati 2 temi")
        const none = describeThemeImport({ imported: 0, discarded: 1, errors: ["motivo"] })
        expect(none.error).toBe(true)
        expect(none.text).toContain("motivo")
    })
})

describe("exportTheme", () => {
    it("writes the theme file without the id, named after the theme", async () => {
        expect(await exportTheme({ ...nord, nameKey: undefined, id: "custom-" + "a".repeat(32), name: "A/B\\C", builtin: false })).toBe(true)
        expect(save.mock.calls[0][0].defaultPath).toBe("A_B_C.easytask-theme.json")
        const [path, text] = writeTextFile.mock.calls[0]
        expect(path).toBe("/x/out.json")
        const data = JSON.parse(text as string)
        expect(data).toMatchObject({ format: "easytask-theme", name: "A/B\\C", base: "dark" })
        expect(data).not.toHaveProperty("id")
    })

    it("exports a built-in theme with its translated name", async () => {
        await exportTheme(BUILTIN_THEMES[0])
        expect(save.mock.calls[0][0].defaultPath).toBe("Chiaro.easytask-theme.json")
    })

    it("returns false when cancelled", async () => {
        save.mockResolvedValue(null)
        expect(await exportTheme(nord)).toBe(false)
        expect(writeTextFile).not.toHaveBeenCalled()
    })

    it("wraps a write failure", async () => {
        writeTextFile.mockRejectedValue(new Error("denied"))
        await expect(exportTheme(nord)).rejects.toMatchObject({ code: "THEME_EXPORT_FAILED" })
    })
})
