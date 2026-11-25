// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"

let sqlite: DatabaseSync

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    const sqliteInvoke = createSqliteInvoke(() => sqlite)
    return {
        invoke: vi.fn(async (command: string, args?: { path?: string, paths?: string[], statements?: never }) => {
            if (command === "audio_file_exists") return true
            if (command === "files_exist") return (args?.paths ?? []).map(() => true)
            return sqliteInvoke(command, args)
        }),
    }
})

import { createDBNoteInFolder, createDBWorkspaceNote, getDBPageBody, updateDBPageBody } from "./note"
import { getDBWorkspaceData } from "./workspace"
import { duplicateDBNote } from "./duplicate"
import { moveDBTreeItem } from "./tree"
import { buildDBItemExport, buildDBWorkspaceExport, importDBItems, importDBWorkspace, validateWorkspaceExport } from "./transfer"
import { archiveDBItem, unarchiveDBItem } from "./archive"
import { deleteDBItem } from "./shared_queries"
import { restoreDBItem } from "./trash"

const rows = sqliteRows(() => sqlite)

const BODY = "# Title\n\n- [ ] one\n- two with **bold** and a <script>alert(1)</script>\n\n```\ncode  \n```\n  trailing spaces  \n"

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS');
        INSERT INTO folder (id, workspaceID, name) VALUES (1, 1, 'Folder');
    `)
})

describe("creating and saving a page", () => {
    it("creates a page in the root and in a folder, with no text", async () => {
        const root = await createDBWorkspaceNote(1, "Root page", null, "page")
        const inFolder = await createDBNoteInFolder(1, 1, "Folder page", "page")
        const note = await createDBWorkspaceNote(1, "Plain note")
        expect(rows(`SELECT id, kind, body FROM note ORDER BY id`)).toEqual([
            { id: root, kind: "page", body: null }, { id: inFolder, kind: "page", body: null }, { id: note, kind: "note", body: null },
        ])
        expect(await getDBPageBody(root)).toBe("")
    })

    it("saves the text exactly as typed (spaces, newlines, HTML-looking text) and reads it back", async () => {
        const id = await createDBWorkspaceNote(1, "P", null, "page")
        await updateDBPageBody(id, BODY)
        expect(await getDBPageBody(id)).toBe(BODY)
        await updateDBPageBody(id, "")
        expect(await getDBPageBody(id)).toBe("")
    })

    it("never writes the text of a note that is not a page", async () => {
        const id = await createDBWorkspaceNote(1, "Plain note")
        await updateDBPageBody(id, "text")
        expect(rows(`SELECT body FROM note WHERE id = ${id}`)).toEqual([{ body: null }])
        expect(await getDBPageBody(id)).toBe("")
    })

    it("keeps the text out of the sidebar tree data but keeps the kind", async () => {
        const id = await createDBWorkspaceNote(1, "P", null, "page")
        await updateDBPageBody(id, BODY)
        const { notes } = await getDBWorkspaceData(1)
        expect(notes).toHaveLength(1)
        expect(notes[0]).toMatchObject({ id, kind: "page" })
        expect(notes[0]).not.toHaveProperty("body")
    })

    it("refreshes the edit date of the page when the text is saved", async () => {
        const id = await createDBWorkspaceNote(1, "P", null, "page")
        sqlite.exec(`UPDATE note SET edit_date = '2000-01-01', edit_time = '00:00' WHERE id = ${id}`)
        await updateDBPageBody(id, "x")
        expect(rows(`SELECT edit_date FROM note WHERE id = ${id}`)).not.toEqual([{ edit_date: "2000-01-01" }])
    })
})

describe("a page lives in the tree like a note", () => {
    it("moves between folders and the root", async () => {
        const id = await createDBWorkspaceNote(1, "P", null, "page")
        await moveDBTreeItem("note", id, 1, 0)
        expect(rows(`SELECT folderID, kind FROM note WHERE id = ${id}`)).toEqual([{ folderID: 1, kind: "page" }])
        await moveDBTreeItem("note", id, null, 0)
        expect(rows(`SELECT folderID FROM note WHERE id = ${id}`)).toEqual([{ folderID: null }])
    })

    it("goes to the trash and comes back with its text", async () => {
        const id = await createDBWorkspaceNote(1, "P", null, "page")
        await updateDBPageBody(id, BODY)
        await deleteDBItem("note", id)
        expect((await getDBWorkspaceData(1)).notes).toHaveLength(0)
        await restoreDBItem("note", id)
        expect((await getDBWorkspaceData(1)).notes.map(note => note.id)).toEqual([id])
        expect(await getDBPageBody(id)).toBe(BODY)
    })

    it("is archived and restored with its text", async () => {
        const id = await createDBWorkspaceNote(1, "P", null, "page")
        await updateDBPageBody(id, BODY)
        await archiveDBItem("note", id)
        expect((await getDBWorkspaceData(1)).notes).toHaveLength(0)
        await unarchiveDBItem("note", id)
        expect((await getDBWorkspaceData(1)).notes[0]).toMatchObject({ id, kind: "page" })
        expect(await getDBPageBody(id)).toBe(BODY)
    })

    it("is duplicated with its kind and its text", async () => {
        const id = await createDBWorkspaceNote(1, "P", null, "page")
        await updateDBPageBody(id, BODY)
        const copy = await duplicateDBNote(id)
        expect(rows(`SELECT kind, name FROM note WHERE id = ${copy}`)).toEqual([{ kind: "page", name: expect.stringMatching(/^P (/) }])
        expect(await getDBPageBody(copy)).toBe(BODY)
    })
})

describe("export and import of a page", () => {
    it("round trips the kind and the text of a workspace, and a plain note stays a note", async () => {
        const page = await createDBWorkspaceNote(1, "P", null, "page")
        const inFolder = await createDBNoteInFolder(1, 1, "Q", "page")
        await createDBWorkspaceNote(1, "Plain")
        await updateDBPageBody(page, BODY)
        await updateDBPageBody(inFolder, "second")
        const exported = await buildDBWorkspaceExport(1)
        expect(exported.notes.find(note => note.name === "P")).toMatchObject({ kind: "page", body: BODY })
        expect(exported.notes.find(note => note.name === "Plain")).not.toHaveProperty("kind")

        const { workspaceId: id } = await importDBWorkspace(validateWorkspaceExport(JSON.parse(JSON.stringify(exported))), { name: "Copy" })
        expect(rows(`SELECT name, kind, body FROM note WHERE workspaceID = ${id} ORDER BY name`)).toEqual([
            { name: "P", kind: "page", body: BODY },
            { name: "Plain", kind: "note", body: null },
            { name: "Q", kind: "page", body: "second" },
        ])
    })

    it("exports one page and imports it under a folder", async () => {
        const page = await createDBWorkspaceNote(1, "P", null, "page")
        await updateDBPageBody(page, BODY)
        const exported = await buildDBItemExport("note", page)
        await importDBItems(validateWorkspaceExport(JSON.parse(JSON.stringify(exported))), 1, 1)
        expect(rows(`SELECT kind, body FROM note WHERE folderID = 1`)).toEqual([{ kind: "page", body: BODY }])
    })

    it("imports a file written before the pages existed as plain notes, and refuses a wrong kind or text", async () => {
        const note = await createDBWorkspaceNote(1, "Old")
        const exported = JSON.parse(JSON.stringify(await buildDBItemExport("note", note)))
        expect(exported.notes[0]).not.toHaveProperty("kind")
        expect(() => validateWorkspaceExport(exported)).not.toThrow()
        expect(() => validateWorkspaceExport({ ...exported, notes: [{ ...exported.notes[0], kind: "book" }] })).toThrow()
        expect(() => validateWorkspaceExport({ ...exported, notes: [{ ...exported.notes[0], kind: "page", body: 5 }] })).toThrow()
    })
})
