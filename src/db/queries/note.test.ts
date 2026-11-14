// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { latestSchema } from "../schema/initial"

let sqlite: DatabaseSync

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

import { getDBNoteData, getDBNotesData, noteHasContent, updateDBNoteBackground } from "./note"

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS');
        INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'Empty'), (2, 1, 'Full'), (3, 1, 'Only deleted');
        INSERT INTO section_group (id, noteID, position) VALUES (1, 2, 0), (2, 3, 0);
        UPDATE section_group SET deleted_at = '2026-01-01 00:00:00' WHERE id = 2;
    `)
})

describe("noteHasContent", () => {
    it("is false for a note without groups", async () => {
        expect(await noteHasContent(1)).toBe(false)
    })

    it("is true for a note with a live group", async () => {
        expect(await noteHasContent(2)).toBe(true)
    })

    it("ignores deleted groups", async () => {
        expect(await noteHasContent(3)).toBe(false)
    })

    it("is false for an unknown note", async () => {
        expect(await noteHasContent(99)).toBe(false)
    })
})

describe("getDBNoteData vs getDBNotesData", () => {
    beforeEach(() => {
        sqlite.exec(`
            INSERT INTO note (id, workspaceID, name) VALUES (10, 1, 'Ties'), (11, 1, 'Other');
            INSERT INTO section_group (id, noteID, position, archived_at) VALUES (25, 10, 0, NULL), (21, 10, 0, NULL), (23, 10, 1, NULL), (22, 10, 0, '2026-01-01 00:00:00'), (30, 11, 0, NULL);
            INSERT INTO section (id, groupID, title, position, is_default, archived_at) VALUES
                (50, 25, NULL, 0, 0, NULL), (40, 25, 'B', 0, 0, NULL), (45, 21, 'C', 0, 0, NULL), (41, 23, 'D', 1, 0, '2026-01-01 00:00:00'), (60, 30, 'E', 0, 0, NULL);
            INSERT INTO task (id, sectionID, text, position, archived_at) VALUES
                (9, 50, 'a', 0, NULL), (3, 40, 'b', 0, NULL), (7, 45, 'c', 0, NULL), (5, 41, 'd', 0, NULL), (4, 40, 'e', 0, '2026-01-01 00:00:00'), (8, 60, 'f', 0, NULL);
        `)
    })

    for (const includeArchived of [false, true]) {
        it(`return the same data when positions tie (includeArchived=${includeArchived})`, async () => {
            const bulk = await getDBNotesData([10, 11, 99], includeArchived)
            for (const id of [10, 11]) expect(bulk.get(id)).toEqual(await getDBNoteData(id, includeArchived))
            expect(bulk.get(99)).toEqual({ groups: [], sections: [], tasks: [], tags: [] })
        })
    }

    it("maps a NULL section title to an empty string", async () => {
        const { sections } = await getDBNoteData(10)
        expect(sections.find(section => section.id === 50)?.title).toBe("")
    })
})

describe("updateDBNoteBackground", () => {
    it("sets and clears the background without touching the edit date, and refuses an empty one", async () => {
        sqlite.exec("UPDATE note SET edit_date = '2020-01-01', edit_time = '10:00' WHERE id = 1")
        await updateDBNoteBackground(1, "#e6194b")
        expect(sqlite.prepare("SELECT bg_color, edit_date, edit_time FROM note WHERE id = 1").get()).toEqual({ bg_color: "#e6194b", edit_date: "2020-01-01", edit_time: "10:00" })
        await updateDBNoteBackground(1)
        expect(sqlite.prepare("SELECT bg_color FROM note WHERE id = 1").get()).toEqual({ bg_color: null })
        await expect(updateDBNoteBackground(1, "")).rejects.toBeDefined()
    })

    it("is returned with the other columns by the plain select of the notes", async () => {
        await updateDBNoteBackground(2, "#3cb44b")
        expect(sqlite.prepare("SELECT * FROM note WHERE id = 2").get()).toMatchObject({ bg_color: "#3cb44b" })
    })
})
