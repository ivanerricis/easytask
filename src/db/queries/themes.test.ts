// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import { MAX_CUSTOM_THEMES, type ThemeDefinition } from "@/lib/themes/types"
import { newCustomThemeId } from "@/lib/themes/validate"

let sqlite: DatabaseSync

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

import { deleteCustomTheme, getCustomThemes, renameCustomTheme, saveCustomTheme } from "./themes"

const rows = sqliteRows(() => sqlite)
const make = (name: string, id = newCustomThemeId()): ThemeDefinition => {
    const src = BUILTIN_THEMES.find(t => t.base === "dark")!
    return { id, name, base: "dark", colors: { ...src.colors }, accent: src.accent, builtin: false }
}

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
})

describe("custom themes queries", () => {
    it("saves and reads back a theme, in creation order", async () => {
        const a = make("A"), b = make("B")
        await saveCustomTheme(a)
        await saveCustomTheme(b)
        expect(await getCustomThemes()).toEqual([a, b])
    })

    it("replaces a theme with the same id", async () => {
        const a = make("A")
        await saveCustomTheme(a)
        await saveCustomTheme({ ...a, name: "A2", accent: "#010203" })
        const all = await getCustomThemes()
        expect(all).toHaveLength(1)
        expect(all[0]).toMatchObject({ name: "A2", accent: "#010203" })
    })

    it("makes the name unique ignoring case", async () => {
        await saveCustomTheme(make("Mine"))
        const saved = await saveCustomTheme(make("mine"))
        expect(saved.name).toBe("mine (2)")
        expect((await getCustomThemes()).map(t => t.name)).toEqual(["Mine", "mine (2)"])
        // saving a theme again does not clash with itself
        expect((await saveCustomTheme(saved)).name).toBe("mine (2)")
    })

    it("refuses an invalid theme and a new one over the limit", async () => {
        await expect(saveCustomTheme({ ...make("X"), id: "dark" })).rejects.toMatchObject({ code: "THEME_SAVE_ERROR" })
        await expect(saveCustomTheme({ ...make("X"), accent: "red" })).rejects.toMatchObject({ code: "THEME_SAVE_ERROR" })
        for (let i = 0; i < MAX_CUSTOM_THEMES; i++) await saveCustomTheme(make(`T${i}`))
        await expect(saveCustomTheme(make("One more"))).rejects.toMatchObject({ code: "THEME_SAVE_ERROR" })
        const first = (await getCustomThemes())[0]
        await expect(saveCustomTheme({ ...first, name: "Renamed" })).resolves.toMatchObject({ name: "Renamed" })
        expect(rows("SELECT COUNT(*) AS n FROM custom_themes")[0].n).toBe(MAX_CUSTOM_THEMES)
    })

    it("deletes a theme and ignores an unknown id", async () => {
        const a = make("A"), b = make("B")
        await saveCustomTheme(a)
        await saveCustomTheme(b)
        await deleteCustomTheme(a.id)
        await deleteCustomTheme("custom-unknown")
        expect((await getCustomThemes()).map(t => t.id)).toEqual([b.id])
    })

    it("renames a theme, keeping the name unique and valid", async () => {
        const a = make("A"), b = make("B")
        await saveCustomTheme(a)
        await saveCustomTheme(b)
        expect(await renameCustomTheme(b.id, "  Nice  ")).toBe("Nice")
        expect(await renameCustomTheme(b.id, "a")).toBe("a (2)")
        await expect(renameCustomTheme(b.id, "   ")).rejects.toMatchObject({ code: "THEME_RENAME_ERROR" })
        expect((await getCustomThemes()).map(t => t.name)).toEqual(["A", "a (2)"])
    })

    it("skips a stored row that is not a valid theme", async () => {
        await saveCustomTheme(make("Ok"))
        sqlite.exec("INSERT INTO custom_themes (id, name, base, colors, accent) VALUES ('custom-bad', 'Bad', 'dark', '{}', '#000000')")
        expect((await getCustomThemes()).map(t => t.name)).toEqual(["Ok"])
    })
})
