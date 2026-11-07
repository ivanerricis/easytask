// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { MAX_IMPORT_ITEMS } from "@/types/transfer"
import { latestSchema } from "../schema/initial"

// These tests run the real query SQL against a real SQLite database (schema migrated to v8)
let sqlite: DatabaseSync
// Set to a substring to make the next matching statement fail (simulates a failure in the middle of the creation)
let failOn: string | null = null
// Answer of the Rust audio_file_exists command (used by the default existence check)
let audioFileExists: (path: string) => boolean = () => true

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

// db_transaction runs on the same in-memory database, with real BEGIN/COMMIT/ROLLBACK
vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    const sqliteInvoke = createSqliteInvoke(() => sqlite, { shouldFail: sql => failOn !== null && sql.includes(failOn) })
    return {
        invoke: vi.fn(async (command: string, args?: { path?: string, statements?: never }) =>
            command === "audio_file_exists" ? audioFileExists(args?.path ?? "") : sqliteInvoke(command, args)),
    }
})

import { getDBNoteData } from "./note"
import { getDBAutomations } from "./automation"
import { buildDBItemExport, buildDBItemsExport, buildDBWorkspaceExport, importDBItems, importDBWorkspace, suggestDBItemNames, suggestDBWorkspaceImportName, validateWorkspaceExport } from "./transfer"

const rows = sqliteRows(() => sqlite)

async function thrown(p: Promise<unknown>): Promise<unknown> {
    try {
        await p
    } catch (e) {
        return e
    }
    throw new Error("expected rejection")
}

beforeEach(() => {
    failOn = null
    audioFileExists = () => true
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS'), (2, 'Other');
        INSERT INTO folder (id, workspaceID, name) VALUES (1, 1, 'Cartella');
        INSERT INTO note (id, workspaceID, name, color) VALUES (1, 1, 'Sorgente', '#ff0000');
        INSERT INTO note (id, workspaceID, folderID, name, position) VALUES (2, 1, 1, 'Nella cartella', 0);

        INSERT INTO section_group (id, noteID, position, name, color) VALUES (1, 1, 0, 'Sprint', '#abcdef'), (2, 1, 1, NULL, NULL), (3, 1, 2, 'Eliminato', NULL);
        INSERT INTO section (id, groupID, title, color, position) VALUES
            (1, 1, 'Da fare', '#00ff00', 1),
            (2, 1, 'Archivio', NULL, 2),
            (3, 2, 'Idee', NULL, 1),
            (4, 3, 'Nel gruppo eliminato', NULL, 1),
            (5, 1, 'Sezione eliminata', NULL, 3);
        INSERT INTO section (id, groupID, title, position, is_default) VALUES (20, 1, NULL, 0, 1), (21, 2, NULL, 0, 1), (22, 3, NULL, 0, 1);
        UPDATE section_group SET width = 400 WHERE id = 1;
        INSERT INTO task (id, sectionID, taskID, text, description, completed, priority, color, position) VALUES
            (1, 1, NULL, 'Radice B', 'descrizione', 1, 1, '#0000ff', 1),
            (2, 1, NULL, 'Radice A', NULL, 0, 0, NULL, 0),
            (3, 1, 1, 'Figlio 2', NULL, 0, 0, NULL, 1),
            (4, 1, 1, 'Figlio 1', 'd', 1, 0, '#111111', 0),
            (5, 1, 4, 'Nipote', NULL, 1, 1, '#222222', 0),
            (6, 1, NULL, 'Eliminato', NULL, 0, 0, NULL, 2),
            (7, 1, 6, 'Figlio di eliminato', NULL, 0, 0, NULL, 0),
            (8, 1, 1, 'Figlio eliminato', NULL, 0, 0, NULL, 2),
            (9, 3, NULL, 'Idea', NULL, 0, 0, NULL, 0),
            (10, 4, NULL, 'Nel gruppo eliminato', NULL, 0, 0, NULL, 0),
            (11, 5, NULL, 'Nella sezione eliminata', NULL, 0, 0, NULL, 0),
            (12, 20, NULL, 'Diretto', NULL, 0, 1, NULL, 0),
            (13, 20, 12, 'Figlio diretto', NULL, 0, 0, NULL, 0);
        UPDATE task SET deleted_at = datetime('now') WHERE id IN (6, 8);
        UPDATE section SET deleted_at = datetime('now') WHERE id = 5;
        UPDATE section_group SET deleted_at = datetime('now') WHERE id = 3;

        INSERT INTO audio_file (name, path, section_groupID) VALUES ('song.mp3', '/x/song.mp3', 1);
    `)
})


const exportOf = () => buildDBWorkspaceExport(1)

describe("buildDBWorkspaceExport", () => {
    it("exports folders, notes, audio and templates without trashed items", async () => {
        sqlite.exec(`
            INSERT INTO folder (id, workspaceID, name) VALUES (2, 1, 'Cestinata');
            INSERT INTO note (id, workspaceID, folderID, name) VALUES (3, 1, 2, 'In cartella cestinata');
            INSERT INTO note (id, workspaceID, name) VALUES (4, 1, 'Cestinata');
            UPDATE folder SET deleted_at = datetime('now') WHERE id = 2;
            UPDATE note SET deleted_at = datetime('now') WHERE id = 4;
            INSERT INTO audio_file (name, path, section_groupID, position) VALUES ('gone.mp3', '/x/gone.mp3', 3, 0);
            INSERT INTO note_template (workspaceID, name, content) VALUES (1, 'T', '{"version":1,"groups":[]}');
            INSERT INTO note_template (workspaceID, name, content, deleted_at) VALUES (1, 'T2', '{"version":1,"groups":[]}', datetime('now'));
        `)
        const data = await exportOf()
        expect(data).toMatchObject({ format: "easytask-workspace", version: 2, workspace: { name: "WS", color: null } })
        expect(data.folders.map(f => f.name)).toEqual(["Cartella"])
        expect(data.folders[0].parentRef).toBeNull()
        expect(data.notes.map(n => n.name).sort()).toEqual(["Nella cartella", "Sorgente"])
        const source = data.notes.find(n => n.name === "Sorgente")!
        expect(source.folderRef).toBeNull()
        expect(source.content.groups.map(g => g.name)).toEqual(["Sprint", null])
        expect(source.audio).toEqual([{ groupIndex: 0, name: "song.mp3", path: "/x/song.mp3", position: 0 }])
        expect(data.notes.find(n => n.name === "Nella cartella")!.folderRef).toBe(data.folders[0].ref)
        expect(data.templates.map(t => t.name)).toEqual(["T"])
    })

    it("keeps the groups, archived items and audio of every note apart (bulk loading)", async () => {
        sqlite.exec(`
            INSERT INTO note (id, workspaceID, name, position) VALUES (7, 1, 'Seconda', 5);
            INSERT INTO section_group (id, noteID, position, name, archived_at) VALUES
                (10, 7, 1, 'Archiviato', datetime('now')), (11, 7, 0, 'Primo', NULL);
            INSERT INTO section (id, groupID, title, position, archived_at) VALUES
                (10, 10, 'In archiviato', 0, NULL), (11, 11, 'S2', 1, NULL), (12, 11, 'S1', 0, datetime('now'));
            INSERT INTO task (id, sectionID, taskID, text, position, archived_at) VALUES
                (20, 11, NULL, 'T2', 1, NULL), (21, 11, NULL, 'T1', 0, datetime('now')), (22, 12, NULL, 'In archiviata', 0, NULL),
                (23, 11, 20, 'Sub', 0, NULL);
            INSERT INTO audio_file (name, path, section_groupID, position) VALUES
                ('a.mp3', '/x/a.mp3', 10, 1), ('b.mp3', '/x/b.mp3', 11, 0), ('c.mp3', '/x/c.mp3', 10, 0);
        `)
        const data = await exportOf()
        expect(data.notes.map(n => n.name).sort()).toEqual(["Nella cartella", "Seconda", "Sorgente"])
        const second = data.notes.find(n => n.name === "Seconda")!
        expect(second.content.groups.map(g => g.name)).toEqual(["Primo", "Archiviato"])
        expect(second.content.groups[1].archived_at).toBeTruthy()
        expect(second.content.groups[0].sections.map(s => s.title)).toEqual(["S1", "S2"])
        expect(second.content.groups[0].sections[0].archived_at).toBeTruthy()
        expect(second.content.groups[0].sections[1].tasks.map(t => [t.text, t.subtasks.map(s => s.text)])).toEqual([["T1", []], ["T2", ["Sub"]]])
        expect(second.audio.map(a => [a.groupIndex, a.name])).toEqual([[0, "b.mp3"], [1, "c.mp3"], [1, "a.mp3"]])
        // The first note is untouched by the other one
        const source = data.notes.find(n => n.name === "Sorgente")!
        expect(source.audio).toEqual([{ groupIndex: 0, name: "song.mp3", path: "/x/song.mp3", position: 0 }])
        expect(source.content.groups.map(g => g.name)).toEqual(["Sprint", null])
    })

    it("exports an items selection of several notes and folders with the same content", async () => {
        const data = await buildDBItemsExport([{ type: "note", id: 1 }, { type: "folder", id: 1 }, { type: "note", id: 1 }])
        expect(data.notes.map(n => [n.name, n.folderRef])).toEqual([["Sorgente", null], ["Nella cartella", "f1"]])
        expect(data.notes[0].audio).toHaveLength(1)
        expect(data.folders.map(f => f.name)).toEqual(["Cartella"])
    })

    it("fails for a missing workspace", async () => {
        expect(await thrown(buildDBWorkspaceExport(99))).toMatchObject({ code: "TRANSFER_WORKSPACE_MISSING" })
    })
})

describe("validateWorkspaceExport", () => {
    it("accepts an exported file", async () => {
        const data = JSON.parse(JSON.stringify(await exportOf()))
        expect(validateWorkspaceExport(data)).toEqual(data)
    })

    it("rejects a wrong format, version and malformed structures", async () => {
        const good = JSON.parse(JSON.stringify(await exportOf()))
        expect(() => validateWorkspaceExport(null)).toThrow(expect.objectContaining({ message: "Il file non è un export di EasyTask." }))
        expect(() => validateWorkspaceExport({ format: "x" })).toThrow(expect.objectContaining({ message: "Il file non è un export di EasyTask." }))
        // Only the current version (2) is accepted: files of the version without direct tasks are not
        expect(good.version).toBe(2)
        expect(() => validateWorkspaceExport({ ...good, version: 1 })).toThrow(expect.objectContaining({ code: "TRANSFER_UNSUPPORTED_VERSION" }))
        expect(() => validateWorkspaceExport({ ...good, version: 3 })).toThrow(expect.objectContaining({ code: "TRANSFER_UNSUPPORTED_VERSION" }))
        expect(() => validateWorkspaceExport({ ...good, folders: {} })).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        expect(() => validateWorkspaceExport({ ...good, workspace: { name: "" } })).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        const badRef = { ...good, notes: [{ ...good.notes[0], folderRef: "nope" }] }
        expect(() => validateWorkspaceExport(badRef)).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        const badAudio = { ...good, notes: [{ ...good.notes[0], audio: [{ groupIndex: 9, name: "a", path: "/a", position: 0 }] }] }
        expect(() => validateWorkspaceExport(badAudio)).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        const badContent = { ...good, notes: [{ ...good.notes[0], content: { version: 1 } }] }
        expect(() => validateWorkspaceExport(badContent)).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
    })
})

describe("direct tasks and width of a group in the export", () => {
    it("exports the direct tasks (with their subtasks) and the width, and imports them again", async () => {
        const data = JSON.parse(JSON.stringify(await exportOf()))
        const note = data.notes.find((n: { name: string }) => n.name === "Sorgente")
        expect(note.content.groups[0]).toMatchObject({ width: 400, tasks: [{ text: "Diretto", subtasks: [{ text: "Figlio diretto", subtasks: [] }] }] })
        // A group without direct tasks or width has neither field
        expect(note.content.groups[1]).not.toHaveProperty("tasks")
        expect(note.content.groups[1]).not.toHaveProperty("width")

        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(data))
        const noteId = rows(`SELECT id FROM note WHERE workspaceID = ${workspaceId} AND name = 'Sorgente'`)[0].id as number
        const groups = rows(`SELECT id, width FROM section_group WHERE noteID = ${noteId} AND deleted_at IS NULL ORDER BY position`)
        expect(groups.map(g => g.width)).toEqual([400, null])
        // Every group of the import has exactly one default section; the direct tasks live in the first one
        expect(rows(`SELECT groupID, COUNT(*) AS n FROM section WHERE is_default = 1 AND groupID IN (${groups.map(g => g.id).join(",")}) GROUP BY groupID`).map(r => r.n)).toEqual([1, 1])
        expect(rows(`SELECT t.text, t.taskID IS NULL AS top FROM task t JOIN section s ON s.id = t.sectionID
            WHERE s.is_default = 1 AND s.groupID = ${groups[0].id} ORDER BY t.id`)).toEqual([{ text: "Diretto", top: 1 }, { text: "Figlio diretto", top: 0 }])
    })

    it("rejects a malformed width or direct tasks", async () => {
        const good = JSON.parse(JSON.stringify(await exportOf()))
        const withGroup = (patch: object) => ({
            ...good,
            notes: good.notes.map((n: { name: string, content: { groups: object[] } }) => n.name === "Sorgente"
                ? { ...n, content: { ...n.content, groups: [{ ...n.content.groups[0], ...patch }, ...n.content.groups.slice(1)] } } : n),
        })
        expect(() => validateWorkspaceExport(withGroup({ width: 300 }))).not.toThrow()
        for (const patch of [{ width: 0 }, { width: -5 }, { width: 12.5 }, { width: "300" }, { tasks: {} }, { tasks: [{ text: 1 }] }])
            expect(() => validateWorkspaceExport(withGroup(patch))).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
    })

    it("fixes the blank texts and colors of the direct tasks", () => {
        const base = {
            format: "easytask-workspace", version: 2, workspace: { name: "W", color: null }, folders: [], templates: [],
            notes: [{
                ref: "n1", folderRef: null, name: "N", color: null, position: 0, audio: [],
                content: { version: 1, groups: [{ name: null, position: 0, sections: [], tasks: [
                    { text: "  ", description: null, completed: false, priority: false, color: "", position: 0, subtasks: [] },
                ] }] },
            }],
        }
        const checked = validateWorkspaceExport(base)
        expect(checked.notes[0].content.groups[0].tasks![0]).toMatchObject({ color: null })
        expect(checked.notes[0].content.groups[0].tasks![0].text.trim()).not.toBe("")
    })
})

describe("the place of the list of the direct tasks in the export", () => {
    const withGroup = (good: { notes: { name: string, content: { groups: object[] } }[] }, patch: object) => ({
        ...good,
        notes: good.notes.map(n => n.name === "Sorgente"
            ? { ...n, content: { ...n.content, groups: [{ ...n.content.groups[0], ...patch }, ...n.content.groups.slice(1)] } } : n),
    })

    it("round trips the directIndex of a group and leaves the groups with the list on top without it", async () => {
        // [Da fare, (list), Archivio]
        sqlite.exec("UPDATE section SET position = 3 WHERE id = 2; UPDATE section SET position = 2 WHERE id = 20")
        const data = JSON.parse(JSON.stringify(await exportOf()))
        const note = data.notes.find((n: { name: string }) => n.name === "Sorgente")
        expect(note.content.groups[0]).toMatchObject({ directIndex: 1 })
        expect(note.content.groups[1]).not.toHaveProperty("directIndex")

        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(data))
        const noteId = rows(`SELECT id FROM note WHERE workspaceID = ${workspaceId} AND name = 'Sorgente'`)[0].id as number
        const order = rows(`SELECT s.title, s.is_default FROM section s JOIN section_group g ON g.id = s.groupID
            WHERE g.noteID = ${noteId} AND g.position = 0 AND s.deleted_at IS NULL ORDER BY s.position, s.id`).map(r => r.is_default ? "(list)" : r.title)
        expect(order).toEqual(["Da fare", "(list)", "Archivio"])
    })

    it("accepts a directIndex from 0 to the number of sections and rejects anything else", async () => {
        const good = JSON.parse(JSON.stringify(await exportOf()))
        const sections = good.notes.find((n: { name: string }) => n.name === "Sorgente").content.groups[0].sections.length
        for (const directIndex of [0, 1, sections])
            expect(() => validateWorkspaceExport(withGroup(good, { directIndex }))).not.toThrow()
        for (const directIndex of [-1, sections + 1, 1.5, "1", null, Number.NaN])
            expect(() => validateWorkspaceExport(withGroup(good, { directIndex }))).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
    })
})
describe("importDBWorkspace", () => {
    it("round trips a workspace into a new one with a unique name", async () => {
        sqlite.exec(`
            INSERT INTO folder (id, workspaceID, folderID, name, position) VALUES (5, 1, 1, 'Sotto', 0);
            INSERT INTO note (id, workspaceID, folderID, name) VALUES (6, 1, 5, 'Profonda');
            INSERT INTO note_template (workspaceID, name, color, content) VALUES (1, 'T', '#123456', '{"version":1,"groups":[]}');
        `)
        const data = await exportOf()
        const first = await importDBWorkspace(data)
        const second = await importDBWorkspace(data)
        expect(rows(`SELECT name FROM workspace WHERE id IN (${first.workspaceId}, ${second.workspaceId}) ORDER BY id`))
            .toEqual([{ name: "WS (importato)" }, { name: "WS (importato 2)" }])
        expect(first.skippedAudio).toBe(0)

        const again = await buildDBWorkspaceExport(first.workspaceId)
        const strip = (d: typeof data) => ({
            folders: d.folders.map(f => ({ name: f.name, parent: d.folders.find(p => p.ref === f.parentRef)?.name ?? null, position: f.position })),
            notes: d.notes.map(n => ({
                name: n.name, folder: d.folders.find(f => f.ref === n.folderRef)?.name ?? null,
                color: n.color, position: n.position, content: n.content, audio: n.audio,
            })).sort((a, b) => a.name.localeCompare(b.name)),
            templates: d.templates,
        })
        expect(strip(again)).toEqual(strip(data))
        expect(rows(`SELECT sourceNoteID FROM note_template WHERE workspaceID = ${first.workspaceId}`)).toEqual([{ sourceNoteID: null }])
    })

    it("skips audio files that do not exist or whose check throws", async () => {
        const data = await exportOf()
        const note = data.notes.find(n => n.name === "Sorgente")!
        note.audio.push({ groupIndex: 0, name: "b.mp3", path: "/x/b.mp3", position: 1 }, { groupIndex: 1, name: "c.mp3", path: "/x/c.mp3", position: 0 })
        const { workspaceId, skippedAudio } = await importDBWorkspace(data, {
            audioExists: async path => {
                if (path.endsWith("b.mp3")) return false
                if (path.endsWith("c.mp3")) throw new Error("denied")
                return true
            },
        })
        expect(skippedAudio).toBe(2)
        const files = rows(`SELECT a.name FROM audio_file a JOIN section_group g ON g.id = a.section_groupID
            JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ${workspaceId}`)
        expect(files).toEqual([{ name: "song.mp3" }])
    })

    it("checks each distinct audio path once, at most 20 at a time", async () => {
        const data = await exportOf()
        const note = data.notes.find(n => n.name === "Sorgente")!
        note.audio = Array.from({ length: 45 }, (_, i) => ({ groupIndex: 0, name: `t${i}.mp3`, path: `/x/${i % 30}.mp3`, position: i }))
        let running = 0, peak = 0
        const calls: string[] = []
        const { skippedAudio } = await importDBWorkspace(data, {
            audioExists: async path => {
                calls.push(path)
                running += 1; peak = Math.max(peak, running)
                await new Promise(resolve => setTimeout(resolve, 1))
                running -= 1
                return true
            },
        })
        expect(skippedAudio).toBe(0)
        expect(new Set(calls).size).toBe(30)
        expect(calls).toHaveLength(30)
        expect(peak).toBeGreaterThan(1)
        expect(peak).toBeLessThanOrEqual(20)
    })

    it("rolls the whole import back when a statement fails (nothing is created)", async () => {
        const data = await exportOf()
        const counts = () => ["workspace", "folder", "note", "section_group", "section", "task", "audio_file", "note_template"]
            .map(table => rows(`SELECT COUNT(*) AS c FROM ${table}`)[0].c)
        const before = counts()
        // The workspace is the first statement: fail at later stages
        for (const stage of ["INSERT INTO folder", "INSERT INTO task", "INSERT INTO audio_file"]) {
            failOn = stage
            expect(await thrown(importDBWorkspace(data))).toMatchObject({ code: "TRANSFER_IMPORT_FAILED" })
            expect(counts()).toEqual(before)
        }
        failOn = null
        // The database is still usable
        await expect(importDBWorkspace(data)).resolves.toMatchObject({ workspaceId: expect.any(Number) })
    })
})

describe("group color in export/import", () => {
    const groupColors = (workspaceId: number) => rows(`SELECT g.name, g.color FROM section_group g JOIN note n ON n.id = g.noteID
        WHERE n.workspaceID = ${workspaceId} AND n.name = 'Sorgente' ORDER BY g.position`)

    it("exports the color of the groups and imports it back", async () => {
        const data = await exportOf()
        const source = data.notes.find(n => n.name === "Sorgente")!
        expect(source.content.groups.map(g => g.color)).toEqual(["#abcdef", null])
        const { workspaceId } = await importDBWorkspace(JSON.parse(JSON.stringify(data)))
        expect(groupColors(workspaceId)).toEqual([{ name: "Sprint", color: "#abcdef" }, { name: null, color: null }])
    })

    it("still imports files created before groups had a color", async () => {
        const data = JSON.parse(JSON.stringify(await exportOf()))
        for (const note of data.notes) for (const group of note.content.groups) delete group.color
        expect(() => validateWorkspaceExport(data)).not.toThrow()
        const { workspaceId } = await importDBWorkspace(data)
        expect(groupColors(workspaceId)).toEqual([{ name: "Sprint", color: null }, { name: null, color: null }])
    })

    it("rejects a color that is not a string", async () => {
        const data = JSON.parse(JSON.stringify(await exportOf()))
        data.notes[0].content.groups[0].color = 5
        expect(() => validateWorkspaceExport(data)).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
    })
})

describe("background of the notes in export/import", () => {
    const bgs = (workspaceId: number) => rows(`SELECT name, bg_color FROM note WHERE workspaceID = ${workspaceId} ORDER BY name`)
    const templateBgs = (workspaceId: number) => rows(`SELECT name, bg_color FROM note_template WHERE workspaceID = ${workspaceId}`)

    it("exports the background of notes and templates and imports it back", async () => {
        sqlite.exec(`UPDATE note SET bg_color = '#e6194b' WHERE id = 1;
            INSERT INTO note_template (workspaceID, name, bg_color, content) VALUES (1, 'T', '#3cb44b', '{"version":1,"groups":[]}'), (1, 'Senza', NULL, '{"version":1,"groups":[]}')`)
        const data = await exportOf()
        expect(data.notes.find(n => n.name === "Sorgente")!.bg_color).toBe("#e6194b")
        // A note without background does not carry the field
        expect(data.notes.find(n => n.name === "Nella cartella")).not.toHaveProperty("bg_color")
        const { workspaceId } = await importDBWorkspace(JSON.parse(JSON.stringify(data)))
        expect(bgs(workspaceId)).toEqual([{ name: "Nella cartella", bg_color: null }, { name: "Sorgente", bg_color: "#e6194b" }])
        expect(templateBgs(workspaceId)).toEqual(expect.arrayContaining([{ name: "T", bg_color: "#3cb44b" }, { name: "Senza", bg_color: null }]))
    })

    it("exports the background of a single note", async () => {
        sqlite.exec("UPDATE note SET bg_color = '#e6194b' WHERE id = 1")
        const data = await buildDBItemExport("note", 1)
        expect(data.notes[0].bg_color).toBe("#e6194b")
    })

    it("still imports files created before the background existed, and turns an empty one into none", async () => {
        const data = JSON.parse(JSON.stringify(await exportOf()))
        for (const note of data.notes) delete note.bg_color
        expect(() => validateWorkspaceExport(data)).not.toThrow()
        data.notes[0].bg_color = ""
        const { workspaceId } = await importDBWorkspace(data)
        expect(bgs(workspaceId).every(row => row.bg_color === null)).toBe(true)
    })

    it("rejects a background that is not a string", async () => {
        const data = JSON.parse(JSON.stringify(await exportOf()))
        data.notes[0].bg_color = 5
        expect(() => validateWorkspaceExport(data)).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
    })
})

describe("import hardening", () => {
    const clone = async () => JSON.parse(JSON.stringify(await exportOf()))

    it("replaces blank task texts with a placeholder, keeps a blank section title blank and empty colors null", async () => {
        const data = await clone()
        const section = data.notes.find((n: { name: string }) => n.name === "Sorgente").content.groups[0].sections[0]
        section.title = "   "
        section.color = ""
        section.tasks[0].text = " "
        section.tasks[0].color = ""
        data.folders[0].color = ""
        data.notes[0].color = ""
        data.workspace.color = ""
        const valid = validateWorkspaceExport(data)
        const { workspaceId } = await importDBWorkspace(valid)
        expect(rows(`SELECT title, color FROM section WHERE title IS NULL AND color IS NULL AND id IN (SELECT id FROM section WHERE groupID IN (SELECT id FROM section_group WHERE noteID IN (SELECT id FROM note WHERE workspaceID = ${workspaceId})))`).length).toBeGreaterThan(0)
        expect(rows(`SELECT COUNT(*) AS c FROM task WHERE text = '(senza titolo)' AND color IS NULL`)[0].c).toBe(1)
        expect(rows(`SELECT color FROM workspace WHERE id = ${workspaceId}`)).toEqual([{ color: null }])
        expect(rows(`SELECT COUNT(*) AS c FROM folder WHERE color = ''`)[0].c).toBe(0)
        expect(rows(`SELECT COUNT(*) AS c FROM note WHERE color = ''`)[0].c).toBe(0)
    })

    it("suffixes duplicate sibling folders, notes and sections instead of failing", async () => {
        const data = await clone()
        data.folders.push({ ...data.folders[0], ref: "dup" })
        data.notes.push({ ...data.notes[1], ref: "dupNote" })
        const group = data.notes.find((n: { name: string }) => n.name === "Sorgente").content.groups[0]
        group.sections.push({ ...group.sections[0], tasks: [] })
        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(data))
        const names = (table: string) => rows(`SELECT name FROM ${table} WHERE workspaceID = ${workspaceId}`).map(r => r.name).sort()
        expect(names("folder")).toEqual(["Cartella", "Cartella (2)"])
        expect(names("note")).toEqual(["Nella cartella", "Nella cartella (2)", "Sorgente"])
        expect(rows(`SELECT COUNT(*) AS c FROM section WHERE title = 'Da fare (2)'`)[0].c).toBe(1)
    })

    it("skips audio with a disallowed extension and uses the audio_file_exists command by default", async () => {
        const data = await clone()
        const note = data.notes.find((n: { name: string }) => n.name === "Sorgente")
        note.audio.push(
            { groupIndex: 0, name: "evil.exe", path: "/x/evil.exe", position: 1 },
            { groupIndex: 0, name: "gone.mp3", path: "/x/gone.mp3", position: 2 },
            { groupIndex: 0, name: "UP.MP3", path: "/x/UP.MP3", position: 3 })
        audioFileExists = path => !path.endsWith("gone.mp3")
        const { workspaceId, skippedAudio } = await importDBWorkspace(validateWorkspaceExport(data))
        expect(skippedAudio).toBe(2)
        const files = rows(`SELECT a.name FROM audio_file a JOIN section_group g ON g.id = a.section_groupID
            JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ${workspaceId} ORDER BY a.position`)
        expect(files).toEqual([{ name: "song.mp3" }, { name: "UP.MP3" }])
    })

    it("treats an error of audio_file_exists as present", async () => {
        const data = await clone()
        audioFileExists = () => { throw new Error("denied") }
        expect((await importDBWorkspace(validateWorkspaceExport(data))).skippedAudio).toBe(0)
    })

    it("rejects files with more than the maximum number of items", async () => {
        const data = await clone()
        data.notes[0].content.groups[0].sections[0].tasks = Array.from({ length: MAX_IMPORT_ITEMS + 1 }, (_, i) =>
            ({ text: "t", position: i, subtasks: [] }))
        expect(() => validateWorkspaceExport(data)).toThrow(expect.objectContaining({ code: "TRANSFER_TOO_MANY_ITEMS" }))
    })
})

describe("items export and import", () => {
    const json = async (type: "note" | "folder", id: number) => JSON.parse(JSON.stringify(await buildDBItemExport(type, id)))
    const counts = () => ["folder", "note", "section_group", "section", "task", "audio_file"]
        .map(table => rows(`SELECT COUNT(*) AS c FROM ${table}`)[0].c)

    beforeEach(() => {
        sqlite.exec(`
            INSERT INTO folder (id, workspaceID, folderID, name, position, color) VALUES (5, 1, 1, 'Sotto', 0, '#112233');
            INSERT INTO folder (id, workspaceID, folderID, name, position) VALUES (6, 1, 1, 'Cestinata', 1);
            INSERT INTO note (id, workspaceID, folderID, name) VALUES (6, 1, 5, 'Profonda');
            INSERT INTO note (id, workspaceID, folderID, name) VALUES (7, 1, 6, 'Dentro la cestinata');
            UPDATE folder SET deleted_at = datetime('now') WHERE id = 6;
        `)
    })

    it("exports a note as an items file with the note at the top", async () => {
        const data = await json("note", 1)
        expect(data).toMatchObject({ format: "easytask-workspace", version: 2, scope: "items", workspace: { name: "Sorgente", color: "#ff0000" }, folders: [], templates: [] })
        expect(data.notes).toHaveLength(1)
        expect(data.notes[0]).toMatchObject({ name: "Sorgente", folderRef: null })
        expect(data.notes[0].content.groups.map((g: { name: string | null }) => g.name)).toEqual(["Sprint", null])
        expect(data.notes[0].audio).toEqual([{ groupIndex: 0, name: "song.mp3", path: "/x/song.mp3", position: 0 }])
        expect(() => validateWorkspaceExport(data)).not.toThrow()
    })

    it("exports a folder with its subtree, without trashed items and without anything outside", async () => {
        const data = await json("folder", 1)
        expect(data.scope).toBe("items")
        expect(data.workspace.name).toBe("Cartella")
        expect(data.folders.map((f: { name: string }) => f.name)).toEqual(["Cartella", "Sotto"])
        expect(data.folders[0].parentRef).toBeNull()
        expect(data.folders[1].parentRef).toBe(data.folders[0].ref)
        expect(data.notes.map((n: { name: string }) => n.name).sort()).toEqual(["Nella cartella", "Profonda"])
        expect(data.notes.find((n: { name: string }) => n.name === "Profonda").folderRef).toBe(data.folders[1].ref)
        expect(data.notes.find((n: { name: string }) => n.name === "Nella cartella").folderRef).toBe(data.folders[0].ref)
        expect(data.notes.find((n: { name: string }) => n.name === "Sorgente")).toBeUndefined()
        // A subfolder exported alone becomes the top of the file
        const sub = await json("folder", 5)
        expect(sub.folders).toMatchObject([{ name: "Sotto", parentRef: null, color: "#112233" }])
        expect(sub.notes.map((n: { name: string }) => n.name)).toEqual(["Profonda"])
    })

    it("fails for a missing or trashed item", async () => {
        expect(await thrown(buildDBItemExport("note", 99))).toMatchObject({ code: "TRANSFER_ITEM_MISSING" })
        expect(await thrown(buildDBItemExport("folder", 6))).toMatchObject({ code: "TRANSFER_ITEM_MISSING" })
    })

    it("validates the scope", async () => {
        const data = await json("note", 1)
        expect(() => validateWorkspaceExport({ ...data, scope: "other" })).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        expect(() => validateWorkspaceExport({ ...data, notes: [] })).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        expect(() => validateWorkspaceExport({ ...data, templates: [{ name: "T", color: null, content: { version: 1, groups: [] } }] }))
            .toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        // Old workspace files (no scope) and an explicit "workspace" scope still validate
        const ws = JSON.parse(JSON.stringify(await exportOf()))
        expect(ws.scope).toBeUndefined()
        expect(() => validateWorkspaceExport(ws)).not.toThrow()
        expect(() => validateWorkspaceExport({ ...ws, scope: "workspace" })).not.toThrow()
    })

    it("does not mutate the export it imports", async () => {
        const data = validateWorkspaceExport(await json("folder", 1))
        data.notes[0].archived_at = "2020-01-01 00:00:00"
        const before = JSON.stringify(data)
        await importDBItems(data, 1, null)
        expect(JSON.stringify(data)).toBe(before)
    })

    it("imports a note at the root with a free name, appended after the siblings", async () => {
        const data = validateWorkspaceExport(await json("note", 1))
        const result = await importDBItems(data, 1, null)
        expect(result.skippedAudio).toBe(0)
        expect(result.items).toHaveLength(1)
        expect(result.items[0]).toMatchObject({ type: "note", name: "Sorgente (2)" })
        const created = rows(`SELECT * FROM note WHERE id = ${result.items[0].id}`)[0]
        expect(created).toMatchObject({ workspaceID: 1, folderID: null, name: "Sorgente (2)", color: "#ff0000" })
        expect(created.position).toBe(1)
        expect(created.id).not.toBe(1)
        // Content is a copy with new ids
        expect(rows(`SELECT COUNT(*) AS c FROM section_group WHERE noteID = ${result.items[0].id}`)[0].c).toBe(2)
        expect(rows(`SELECT COUNT(*) AS c FROM audio_file a JOIN section_group g ON g.id = a.section_groupID WHERE g.noteID = ${result.items[0].id}`)[0].c).toBe(1)
        expect(rows(`SELECT COUNT(*) AS c FROM workspace`)[0].c).toBe(2)
    })

    it("imports a folder subtree into a folder, remapping ids and deduping names", async () => {
        const data = validateWorkspaceExport(await json("folder", 1))
        const result = await importDBItems(data, 1, 1)
        expect(result.items).toEqual([{ type: "folder", id: expect.any(Number), name: "Cartella" }])
        const top = result.items[0].id
        expect(rows(`SELECT folderID, workspaceID FROM folder WHERE id = ${top}`)).toEqual([{ folderID: 1, workspaceID: 1 }])
        const sub = rows(`SELECT id, name, color FROM folder WHERE folderID = ${top}`)
        expect(sub).toMatchObject([{ name: "Sotto", color: "#112233" }])
        expect(rows(`SELECT name FROM note WHERE folderID = ${top}`)).toEqual([{ name: "Nella cartella" }])
        expect(rows(`SELECT name FROM note WHERE folderID = ${sub[0].id}`)).toEqual([{ name: "Profonda" }])
        // A second import into the same place clashes on the top folder only
        const again = await importDBItems(validateWorkspaceExport(await json("folder", 1)), 1, 1)
        expect(again.items[0].name).toBe("Cartella (2)")
        expect(rows(`SELECT COUNT(*) AS c FROM folder WHERE workspaceID = 2`)[0].c).toBe(0)
    })

    it("proposes the free names of the top items and imports with the names the user chose", async () => {
        const data = validateWorkspaceExport(await json("note", 1))
        expect(await suggestDBItemNames(data, 1, null)).toEqual([{ type: "note", name: "Sorgente (2)" }])
        const result = await importDBItems(data, 1, null, { names: ["  Mia nota  "] })
        expect(result.items[0]).toMatchObject({ type: "note", name: "Mia nota" })
        expect(rows(`SELECT name FROM note WHERE id = ${result.items[0].id}`)).toEqual([{ name: "Mia nota" }])
    })

    it("refuses a chosen name that is empty or already taken, importing nothing", async () => {
        const count = () => rows("SELECT COUNT(*) AS c FROM note")[0].c
        const before = count()
        await expect(importDBItems(validateWorkspaceExport(await json("note", 1)), 1, null, { names: ["Sorgente"] }))
            .rejects.toMatchObject({ code: "TRANSFER_NAME_TAKEN" })
        await expect(importDBItems(validateWorkspaceExport(await json("note", 1)), 1, null, { names: ["   "] }))
            .rejects.toMatchObject({ code: "TRANSFER_NAME_EMPTY" })
        expect(count()).toBe(before)
    })

    it("imports a folder into the root and a note into a folder", async () => {
        const root = await importDBItems(validateWorkspaceExport(await json("folder", 5)), 1, null)
        expect(rows(`SELECT folderID, name FROM folder WHERE id = ${root.items[0].id}`)).toEqual([{ folderID: null, name: "Sotto" }])
        const inFolder = await importDBItems(validateWorkspaceExport(await json("note", 6)), 1, 1)
        expect(rows(`SELECT folderID, name FROM note WHERE id = ${inFolder.items[0].id}`)).toEqual([{ folderID: 1, name: "Profonda" }])
    })

    it("skips missing audio and reports it", async () => {
        const data = validateWorkspaceExport(await json("note", 1))
        const { skippedAudio, items } = await importDBItems(data, 1, null, { audioExists: async () => false })
        expect(skippedAudio).toBe(1)
        expect(rows(`SELECT COUNT(*) AS c FROM audio_file a JOIN section_group g ON g.id = a.section_groupID WHERE g.noteID = ${items[0].id}`)[0].c).toBe(0)
    })

    it("is one transaction: a failure creates nothing", async () => {
        const before = counts()
        for (const [type, id, stage] of [["folder", 1, "INSERT INTO note"], ["note", 1, "INSERT INTO task"], ["note", 1, "INSERT INTO audio_file"]] as const) {
            failOn = stage
            const data = validateWorkspaceExport(await json(type, id))
            expect(await thrown(importDBItems(data, 1, null))).toMatchObject({ code: "TRANSFER_IMPORT_FAILED" })
            expect(counts()).toEqual(before)
        }
    })

    it("rejects a missing destination folder, a trashed one and one of another workspace", async () => {
        const data = validateWorkspaceExport(await json("note", 1))
        sqlite.exec("INSERT INTO folder (id, workspaceID, name) VALUES (50, 2, 'Altrove')")
        for (const id of [99, 6, 50])
            expect(await thrown(importDBItems(data, 1, id))).toMatchObject({ code: "TRANSFER_PARENT_MISSING" })
    })

    describe("several items in one file", () => {
        const jsonMany = async (items: { type: "note" | "folder", id: number }[], name?: string) =>
            JSON.parse(JSON.stringify(await buildDBItemsExport(items, name)))
        const top = (data: { folders: { parentRef: string | null, name: string }[], notes: { folderRef: string | null, name: string }[] }) =>
            [...data.folders.filter(f => f.parentRef === null), ...data.notes.filter(n => n.folderRef === null)].map(item => item.name)

        it("puts every selected item at the top of one items file", async () => {
            const data = await jsonMany([{ type: "note", id: 1 }, { type: "folder", id: 5 }, { type: "folder", id: 1 }], "3 elementi")
            expect(data).toMatchObject({ scope: "items", workspace: { name: "3 elementi", color: null }, templates: [] })
            // Sotto is selected on its own AND is inside the selected Cartella: it is exported once, with Cartella
            expect(top(data).sort()).toEqual(["Cartella", "Sorgente"])
            expect(data.folders.map((f: { name: string }) => f.name)).toEqual(["Cartella", "Sotto"])
            expect(data.folders.find((f: { name: string }) => f.name === "Sotto").parentRef).not.toBeNull()
            expect(data.notes.map((n: { name: string }) => n.name).sort()).toEqual(["Nella cartella", "Profonda", "Sorgente"])
            expect(() => validateWorkspaceExport(data)).not.toThrow()
        })

        it("keeps the format of the single item export (name and color of the only item)", async () => {
            const one = await jsonMany([{ type: "note", id: 1 }])
            const old = await json("note", 1)
            expect({ ...one, exportedAt: "" }).toEqual({ ...old, exportedAt: "" })
            expect(one.workspace).toEqual({ name: "Sorgente", color: "#ff0000" })
            // The same item twice, or a note that comes with its selected folder, still counts as one item
            const twice = await jsonMany([{ type: "note", id: 1 }, { type: "note", id: 1 }])
            expect(twice.notes).toHaveLength(1)
            const withFolder = await jsonMany([{ type: "note", id: 2 }, { type: "folder", id: 1 }])
            expect(top(withFolder)).toEqual(["Cartella"])
            expect(withFolder.notes.filter((n: { name: string }) => n.name === "Nella cartella")).toHaveLength(1)
        })

        it("fails when an item is missing or trashed, or nothing is selected", async () => {
            expect(await thrown(buildDBItemsExport([{ type: "note", id: 1 }, { type: "note", id: 99 }]))).toMatchObject({ code: "TRANSFER_ITEM_MISSING" })
            expect(await thrown(buildDBItemsExport([{ type: "note", id: 1 }, { type: "folder", id: 6 }]))).toMatchObject({ code: "TRANSFER_ITEM_MISSING" })
            expect(await thrown(buildDBItemsExport([]))).toMatchObject({ code: "TRANSFER_ITEM_MISSING" })
        })

        it("imports every top item, deduping names among the siblings of the destination", async () => {
            // Two top notes with the same name coming from different folders
            sqlite.exec("INSERT INTO folder (id, workspaceID, name) VALUES (9, 1, 'Altro'); INSERT INTO note (id, workspaceID, folderID, name) VALUES (8, 1, 9, 'Sorgente')")
            const data = validateWorkspaceExport(await jsonMany([{ type: "note", id: 1 }, { type: "note", id: 8 }, { type: "folder", id: 5 }]))
            const result = await importDBItems(data, 1, 1)
            expect(result.items.map(item => `${item.type}:${item.name}`)).toEqual(["folder:Sotto (2)", "note:Sorgente", "note:Sorgente (2)"])
            for (const item of result.items)
                expect(rows(`SELECT folderID FROM ${item.type} WHERE id = ${item.id}`)).toEqual([{ folderID: 1 }])
            // The folder came with its note
            const folder = result.items.find(item => item.type === "folder")!
            expect(rows(`SELECT name FROM note WHERE folderID = ${folder.id} ORDER BY name`)).toEqual([{ name: "Profonda" }])
        })

        it("is still one transaction", async () => {
            const before = counts()
            failOn = "INSERT INTO task"
            const data = validateWorkspaceExport(await jsonMany([{ type: "note", id: 1 }, { type: "folder", id: 1 }]))
            expect(await thrown(importDBItems(data, 1, null))).toMatchObject({ code: "TRANSFER_IMPORT_FAILED" })
            expect(counts()).toEqual(before)
        })
    })

    it("keeps whole-workspace and items files apart", async () => {
        const items = validateWorkspaceExport(await json("note", 1))
        const workspace = validateWorkspaceExport(JSON.parse(JSON.stringify(await exportOf())))
        expect(await thrown(importDBWorkspace(items))).toMatchObject({ code: "TRANSFER_ITEMS_FILE" })
        expect(await thrown(importDBItems(workspace, 1, null))).toMatchObject({ code: "TRANSFER_WORKSPACE_FILE" })
        expect(rows(`SELECT COUNT(*) AS c FROM workspace`)[0].c).toBe(2)
    })
})

describe("automations in export/import", () => {
    const addRules = () => {
        sqlite.exec(`
            UPDATE section SET archived_at = datetime('now') WHERE id = 2;
            INSERT INTO automation (noteID, name, enabled, trigger, actions, position) VALUES
                (1, 'Sposta', 1, '{"type":"task.movedInto","sectionId":1}', '[{"type":"setCompleted","value":true},{"type":"moveTo","sectionId":3,"at":"top"}]', 0),
                (1, NULL, 0, '{"type":"task.completed","sectionId":2}', '[{"type":"setPriority","value":false}]', 1),
                (1, 'Ovunque', 1, '{"type":"task.created","sectionId":null}', '[{"type":"setColor","color":null}]', 2);
        `)
    }
    // Sections in content order: by group, then by position
    const sectionsOf = async (noteId: number) => {
        const { groups, sections } = await getDBNoteData(noteId, true)
        return groups.flatMap(g => sections.filter(s => s.groupID === g.id && !s.is_default)).map(s => ({ id: s.id, title: s.title }))
    }
    // The default section (the direct area) of every group of a note, in group order
    const directsOf = async (noteId: number) => {
        const { groups, sections } = await getDBNoteData(noteId, true)
        return groups.map(g => sections.find(s => s.groupID === g.id && s.is_default)!.id)
    }
    const ruleView = (rules: Awaited<ReturnType<typeof getDBAutomations>>) => rules.map(r => ({
        name: r.name, enabled: r.enabled, position: r.position, trigger: r.trigger, actions: r.actions,
    }))

    it("exports the rules with positions in the content, including those on archived sections", async () => {
        addRules()
        const data = await exportOf()
        const note = data.notes.find(n => n.name === "Sorgente")!
        expect(note.content.groups.map(g => g.sections.map(s => s.title))).toEqual([["Da fare", "Archivio"], ["Idee"]])
        expect(note.automations).toEqual([
            {
                name: "Sposta", enabled: true, trigger: { type: "task.movedInto", sectionId: { group: 0, section: 0 } },
                actions: [{ type: "setCompleted", value: true }, { type: "moveTo", sectionId: { group: 1, section: 0 }, at: "top" }],
            },
            {
                name: null, enabled: false, trigger: { type: "task.completed", sectionId: { group: 0, section: 1 } },
                actions: [{ type: "setPriority", value: false }],
            },
            { name: "Ovunque", enabled: true, trigger: { type: "task.created", sectionId: null }, actions: [{ type: "setColor", color: null }] },
        ])
        // a note without rules has no field
        expect(data.notes.find(n => n.name === "Nella cartella")).not.toHaveProperty("automations")
    })

    it("round trips a workspace: the rules point to the sections of the imported note", async () => {
        addRules()
        const data = JSON.parse(JSON.stringify(await exportOf()))
        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(data))
        const noteId = rows(`SELECT id FROM note WHERE workspaceID = ${workspaceId} AND name = 'Sorgente'`)[0].id as number
        const [a, b, c] = await sectionsOf(noteId)
        expect([a.title, b.title, c.title]).toEqual(["Da fare", "Archivio", "Idee"])
        expect(ruleView(await getDBAutomations(noteId))).toEqual([
            {
                name: "Sposta", enabled: true, position: 0, trigger: { type: "task.movedInto", sectionId: a.id },
                actions: [{ type: "setCompleted", value: true }, { type: "moveTo", sectionId: c.id, at: "top" }],
            },
            { name: null, enabled: false, position: 1, trigger: { type: "task.completed", sectionId: b.id }, actions: [{ type: "setPriority", value: false }] },
            { name: "Ovunque", enabled: true, position: 2, trigger: { type: "task.created", sectionId: null }, actions: [{ type: "setColor", color: null }] },
        ])
        expect([a.id, b.id, c.id]).not.toContain(1)
    })

    it("round trips a single note through an items import", async () => {
        addRules()
        const data = validateWorkspaceExport(JSON.parse(JSON.stringify(await buildDBItemExport("note", 1))))
        const { items } = await importDBItems(data, 1, null)
        const [a, , c] = await sectionsOf(items[0].id)
        const rules = await getDBAutomations(items[0].id)
        expect(rules).toHaveLength(3)
        expect(rules[0].trigger).toEqual({ type: "task.movedInto", sectionId: a.id })
        expect(rules[0].actions[1]).toEqual({ type: "moveTo", sectionId: c.id, at: "top" })
        // the source rules are untouched
        expect((await getDBAutomations(1))[0].trigger).toEqual({ type: "task.movedInto", sectionId: 1 })
    })

    it("exports and imports the rules that use the direct area of a group", async () => {
        sqlite.exec(`
            INSERT INTO automation (noteID, name, enabled, trigger, actions, position) VALUES
                (1, 'Diretti', 1, '{"type":"task.completed","sectionId":20}', '[{"type":"moveTo","sectionId":21,"at":"bottom"}]', 0),
                (1, 'Arriva', 1, '{"type":"task.movedInto","sectionId":21}', '[{"type":"moveTo","sectionId":3,"at":"top"}]', 1);
        `)
        const data = JSON.parse(JSON.stringify(await exportOf()))
        const note = data.notes.find((n: { name: string }) => n.name === "Sorgente")
        expect(note.automations).toEqual([
            {
                name: "Diretti", enabled: true, trigger: { type: "task.completed", sectionId: { group: 0, direct: true } },
                actions: [{ type: "moveTo", sectionId: { group: 1, direct: true }, at: "bottom" }],
            },
            {
                name: "Arriva", enabled: true, trigger: { type: "task.movedInto", sectionId: { group: 1, direct: true } },
                actions: [{ type: "moveTo", sectionId: { group: 1, section: 0 }, at: "top" }],
            },
        ])
        // The default sections are not among the sections of the content
        expect(note.content.groups.map((g: { sections: unknown[] }) => g.sections.length)).toEqual([2, 1])

        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(data))
        const noteId = rows(`SELECT id FROM note WHERE workspaceID = ${workspaceId} AND name = 'Sorgente'`)[0].id as number
        const [d0, d1] = await directsOf(noteId)
        const [, , idee] = await sectionsOf(noteId)
        expect(ruleView(await getDBAutomations(noteId)).map(r => [r.trigger, r.actions])).toEqual([
            [{ type: "task.completed", sectionId: d0 }, [{ type: "moveTo", sectionId: d1, at: "bottom" }]],
            [{ type: "task.movedInto", sectionId: d1 }, [{ type: "moveTo", sectionId: idee.id, at: "top" }]],
        ])
        expect([d0, d1]).not.toContain(20)
        expect(rows(`SELECT COUNT(*) AS n FROM task WHERE sectionID = ${d0}`)[0].n).toBe(2)
    })

    it("rejects a malformed reference to a direct area", async () => {
        const rule = {
            name: null, enabled: true, trigger: { type: "task.completed", sectionId: { group: 0, direct: true } },
            actions: [{ type: "moveTo", sectionId: { group: 0, direct: true }, at: "top" }],
        }
        const good = JSON.parse(JSON.stringify(await exportOf()))
        const withRule = (next: unknown) => ({
            ...good, notes: good.notes.map((n: { name: string }) => n.name === "Sorgente" ? { ...n, automations: [next] } : n),
        })
        expect(() => validateWorkspaceExport(withRule(rule))).not.toThrow()
        for (const ref of [{ group: 0, direct: false }, { group: 9, direct: true }, { group: 0, section: 0, direct: true }, { direct: true }]) {
            expect(() => validateWorkspaceExport(withRule({ ...rule, trigger: { ...rule.trigger, sectionId: ref } }))).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
            expect(() => validateWorkspaceExport(withRule({ ...rule, actions: [{ type: "moveTo", sectionId: ref, at: "top" }] }))).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        }
    })

    it("keeps the group rules, archived groups included, pointing to the imported groups", async () => {
        sqlite.exec(`
            UPDATE section_group SET archived_at = datetime('now') WHERE id = 2;
            INSERT INTO automation (noteID, name, enabled, trigger, actions, position) VALUES
                (1, 'Sprint', 1, '{"type":"group.completed","groupId":1}', '[{"type":"archiveGroup"}]', 0),
                (1, 'Archiviato', 1, '{"type":"group.completed","groupId":2}', '[{"type":"moveGroup","at":"top"},{"type":"setColor","color":"#112233"}]', 1),
                (1, 'Qualsiasi', 1, '{"type":"group.completed","groupId":null}', '[{"type":"setColor","color":null}]', 2),
                (1, 'Eliminato', 1, '{"type":"group.completed","groupId":3}', '[{"type":"archiveGroup"}]', 3);
        `)
        const data = JSON.parse(JSON.stringify(await exportOf()))
        const note = data.notes.find((n: { name: string }) => n.name === "Sorgente")
        expect(note.automations.map((r: { trigger: unknown }) => r.trigger)).toEqual([
            { type: "group.completed", groupId: 0 }, { type: "group.completed", groupId: 1 }, { type: "group.completed", groupId: null },
        ])

        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(data))
        const noteId = rows(`SELECT id FROM note WHERE workspaceID = ${workspaceId} AND name = 'Sorgente'`)[0].id as number
        const groups = rows(`SELECT id, archived_at FROM section_group WHERE noteID = ${noteId} AND deleted_at IS NULL ORDER BY position`)
        expect(groups).toHaveLength(2)
        expect(groups[1].archived_at).not.toBeNull()
        expect(ruleView(await getDBAutomations(noteId)).map(r => r.trigger)).toEqual([
            { type: "group.completed", groupId: groups[0].id },
            { type: "group.completed", groupId: groups[1].id },
            { type: "group.completed", groupId: null },
        ])
        expect(groups.map(g => g.id)).not.toContain(1)
    })

    it("still imports a file without automations", async () => {
        const data = JSON.parse(JSON.stringify(await exportOf()))
        for (const note of data.notes) expect(note.automations).toBeUndefined()
        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(data))
        expect(rows("SELECT COUNT(*) AS c FROM automation")[0].c).toBe(0)
        expect(workspaceId).toBeGreaterThan(2)
    })

    it("rejects malformed automations", async () => {
        addRules()
        const good = JSON.parse(JSON.stringify(await exportOf()))
        const withRules = (automations: unknown) => ({
            ...good, notes: good.notes.map((n: { name: string }) => n.name === "Sorgente" ? { ...n, automations } : n),
        })
        const rule = good.notes.find((n: { name: string }) => n.name === "Sorgente").automations[0]
        const bad: unknown[] = [
            {},
            [null],
            [{ ...rule, enabled: "yes" }],
            [{ ...rule, name: 3 }],
            [{ ...rule, trigger: { type: "nope", sectionId: null } }],
            [{ ...rule, trigger: { type: "task.movedInto", sectionId: null } }],
            [{ ...rule, trigger: { type: "task.completed", sectionId: 1 } }],
            [{ ...rule, trigger: { type: "task.completed", sectionId: { group: 5, section: 0 } } }],
            [{ ...rule, trigger: { type: "task.completed", sectionId: { group: 0, section: 9 } } }],
            [{ ...rule, actions: [{ type: "moveTo", sectionId: { group: 0, section: 0 } }] }],
            [{ ...rule, actions: [{ type: "moveTo", sectionId: 3, at: "top" }] }],
            [{ ...rule, actions: [{ type: "explode" }] }],
            [{ ...rule, actions: "x" }],
        ]
        for (const automations of bad)
            expect(() => validateWorkspaceExport(withRules(automations))).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        expect(() => validateWorkspaceExport(withRules([rule]))).not.toThrow()
    })

    it("counts the automations toward the maximum number of items", async () => {
        addRules()
        const good = JSON.parse(JSON.stringify(await exportOf()))
        const rule = good.notes.find((n: { name: string }) => n.name === "Sorgente").automations[0]
        good.notes[0].automations = Array.from({ length: MAX_IMPORT_ITEMS }, () => rule)
        expect(() => validateWorkspaceExport(good)).toThrow(expect.objectContaining({ code: "TRANSFER_TOO_MANY_ITEMS" }))
    })
})

describe("workspace import with a chosen name", () => {
    it("proposes a free name and uses the chosen one as is, refusing a taken one", async () => {
        const data = validateWorkspaceExport(JSON.parse(JSON.stringify(await exportOf())))
        const proposed = await suggestDBWorkspaceImportName(data)
        expect(proposed).not.toBe(data.workspace.name)
        const { workspaceId } = await importDBWorkspace(data, { name: " Copia mia " })
        expect(rows(`SELECT name FROM workspace WHERE id = ${workspaceId}`)).toEqual([{ name: "Copia mia" }])
        await expect(importDBWorkspace(data, { name: "Copia mia" })).rejects.toMatchObject({ message: "Esiste già un workspace con questo nome." })
    })
})
