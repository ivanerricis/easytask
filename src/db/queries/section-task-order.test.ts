// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"

// These tests run the real query SQL against a real SQLite database
let sqlite: DatabaseSync

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    return { invoke: createSqliteInvoke(() => sqlite) }
})

import { setDBSectionTaskOrder } from "./section"
import { duplicateDBNote, duplicateDBSection } from "./duplicate"
import { getDBNoteData } from "./note"
import { buildContentFromRows, createDBNoteFromTemplate, createDBTemplateFromNote } from "./template"
import { buildDBWorkspaceExport, importDBWorkspace, validateWorkspaceExport } from "./transfer"

const rows = sqliteRows(() => sqlite)
const orderOf = (id: number) => rows(`SELECT task_order FROM section WHERE id = ${id}`)[0].task_order
const wsEdit = () => rows("SELECT edit_date, edit_time FROM workspace WHERE id = 1")[0]
const titledOrders = (noteId: number) =>
    rows(`SELECT s.title, s.task_order FROM section s JOIN section_group g ON g.id = s.groupID
        WHERE g.noteID = ${noteId} AND s.is_default = 0 AND s.deleted_at IS NULL ORDER BY g.position, s.position`).map(r => `${String(r.title).replace(/ \(.*\)$/, "")}:${r.task_order}`)

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS');
        INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'N');
        INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0);
        INSERT INTO section (id, groupID, title, position) VALUES (10, 1, 'Default', 0);
        UPDATE section SET is_default = 1 WHERE id = 10;
        INSERT INTO section (id, groupID, title, position, task_order) VALUES (11, 1, 'Sorted', 1, 'done-first'), (12, 1, 'Free', 2, NULL), (13, 1, 'Manual', 3, 'manual');
        INSERT INTO task (id, sectionID, text, position, completed) VALUES (1, 11, 'a', 0, 1), (2, 11, 'b', 1, 0);
    `)
})

describe("setDBSectionTaskOrder", () => {
    it("saves each order and null for one section only, and it is loaded with the note data", async () => {
        await setDBSectionTaskOrder(12, "open-first")
        expect([orderOf(11), orderOf(12), orderOf(13)]).toEqual(["done-first", "open-first", "manual"])
        await setDBSectionTaskOrder(11, null)
        expect(orderOf(11)).toBeNull()
        const { sections } = await getDBNoteData(1)
        expect(sections.filter(s => !s.is_default).map(s => s.task_order ?? null)).toEqual([null, "open-first", "manual"])
    })

    it("leaves the edit dates of the section and of the workspace alone", async () => {
        sqlite.exec(`UPDATE section SET edit_date = '2000-01-01', edit_time = '00:00'`)
        sqlite.exec(`UPDATE workspace SET edit_date = '2000-01-01', edit_time = '00:00'`)
        await setDBSectionTaskOrder(11, "manual")
        expect(wsEdit()).toEqual({ edit_date: "2000-01-01", edit_time: "00:00" })
        expect(rows("SELECT edit_date FROM section WHERE id = 11")[0].edit_date).toBe("2000-01-01")
    })

    it("rejects an unknown order and wraps a failure", async () => {
        await expect(setDBSectionTaskOrder(11, "newest" as never)).rejects.toMatchObject({ code: "SECTION_UPDATE_ERROR" })
        expect(orderOf(11)).toBe("done-first")
        sqlite.close()
        await expect(setDBSectionTaskOrder(11, "manual")).rejects.toMatchObject({ code: "SECTION_UPDATE_ERROR" })
    })
})

describe("the order of a section is copied", () => {
    it("by a duplicated section and by a duplicated note", async () => {
        const copy = await duplicateDBSection(11)
        expect(orderOf(copy)).toBe("done-first")
        const noteCopy = await duplicateDBNote(1)
        expect(titledOrders(noteCopy)).toEqual(["Sorted:done-first", "Sorted:done-first", "Free:null", "Manual:manual"])
        expect(titledOrders(1)).toEqual(["Sorted:done-first", "Sorted:done-first", "Free:null", "Manual:manual"])
    })

    it("by a template made from a note (only the choices that exist are in the content) and by the note made from it", async () => {
        const content = buildContentFromRows(await getDBNoteData(1)).content
        expect(content.groups[0].sections.map(s => s.task_order)).toEqual(["done-first", undefined, "manual"])
        const templateId = await createDBTemplateFromNote(1, "Tpl")
        const noteId = await createDBNoteFromTemplate(templateId, 1, null, "From template")
        expect(titledOrders(noteId)).toEqual(["Sorted:done-first", "Free:null", "Manual:manual"])
    })

    it("by an export file and its import, and a value this version does not know is dropped", async () => {
        const data = JSON.parse(JSON.stringify(await buildDBWorkspaceExport(1)))
        expect(data.notes[0].content.groups[0].sections.map((s: { task_order?: string }) => s.task_order)).toEqual(["done-first", undefined, "manual"])
        data.notes[0].content.groups[0].sections[1].task_order = "newest"
        data.notes[0].content.groups[0].sections[2].task_order = 7
        expect(() => validateWorkspaceExport(data)).not.toThrow()
        const { workspaceId } = await importDBWorkspace(data)
        const imported = rows(`SELECT s.title, s.task_order FROM section s JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID
            WHERE n.workspaceID = ${workspaceId} AND s.is_default = 0 ORDER BY s.position`).map(r => `${r.title}:${r.task_order}`)
        expect(imported).toEqual(["Sorted:done-first", "Free:null", "Manual:null"])
    })

    it("an old file or template without the field imports with no choice", async () => {
        const data = JSON.parse(JSON.stringify(await buildDBWorkspaceExport(1)))
        for (const section of data.notes[0].content.groups[0].sections) delete section.task_order
        const { workspaceId } = await importDBWorkspace(data)
        expect(rows(`SELECT DISTINCT s.task_order FROM section s JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID
            WHERE n.workspaceID = ${workspaceId}`)).toEqual([{ task_order: null }])
    })
})
