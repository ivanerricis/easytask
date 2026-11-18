// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"

// These tests run the real query SQL against a real SQLite database (schema migrated to v8)
let sqlite: DatabaseSync
// Set to a substring to make the next matching statement fail (simulates a failure in the middle of the creation)
let failOn: string | null = null

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

// db_transaction runs on the same in-memory database, with real BEGIN/COMMIT/ROLLBACK
vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    return { invoke: createSqliteInvoke(() => sqlite, { shouldFail: sql => failOn !== null && sql.includes(failOn) }) }
})

import {
    countDBTemplates, createDBEmptyTemplate, createDBNoteFromTemplate, createDBTemplateFromNote, getDBTemplates, parseTemplateContent, renameDBTemplate, updateDBTemplateFromNote,
} from "./template"
import { getDBNoteData } from "./note"
import { deleteDBItem, renameDBItem, updateDBColor } from "./shared_queries"
import { emptyDBTrash, getDBTrash, purgeDBItem, restoreDBItem } from "./trash"
import { countTemplateContent } from "@/types/template"

const rows = sqliteRows(() => sqlite)

async function thrown(p: Promise<unknown>): Promise<unknown> {
    try {
        await p
    } catch (e) {
        return e
    }
    throw new Error("expected rejection")
}

// Normalized tree of a note (no ids), to compare a note with its copy
type TreeTask = Record<string, unknown> & { subtasks: TreeTask[] }
async function noteTree(noteId: number) {
    const { groups, sections, tasks } = await getDBNoteData(noteId)
    const taskNode = (t: (typeof tasks)[number]): TreeTask => ({
        text: t.text, description: t.description ?? null, completed: !!t.completed, priority: !!t.priority,
        color: t.color ?? null, position: t.position,
        subtasks: tasks.filter(c => c.taskID === t.id).map(taskNode),
    })
    return groups.map(g => ({
        name: g.name ?? null, color: g.color ?? null, position: g.position, width: g.width ?? null,
        // The direct tasks live in the default section, which is not one of the sections
        direct: tasks.filter(t => sections.some(s => s.groupID === g.id && s.is_default && s.id === t.sectionID) && t.taskID === null).map(taskNode),
        sections: sections.filter(s => s.groupID === g.id && !s.is_default).map(s => ({
            title: s.title, color: s.color ?? null, position: s.position,
            tasks: tasks.filter(t => t.sectionID === s.id && t.taskID === null).map(taskNode),
        })),
    }))
}

beforeEach(() => {
    failOn = null
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
        UPDATE section_group SET width = 420 WHERE id = 1;
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
            (12, 20, NULL, 'Diretto', 'd', 1, 1, '#333333', 0),
            (13, 20, 12, 'Sotto-diretto', NULL, 0, 0, NULL, 0),
            (14, 22, NULL, 'Diretto nel gruppo eliminato', NULL, 0, 0, NULL, 0);
        UPDATE task SET deleted_at = datetime('now') WHERE id IN (6, 8);
        UPDATE section SET deleted_at = datetime('now') WHERE id = 5;
        UPDATE section_group SET deleted_at = datetime('now') WHERE id = 3;

        INSERT INTO audio_file (name, path, section_groupID) VALUES ('song.mp3', '/x/song.mp3', 1);
    `)
})

describe("createDBTemplateFromNote", () => {
    it("stores an exact snapshot of the non deleted tree with the note color", async () => {
        const id = await createDBTemplateFromNote(1, "  Mio template ")
        const [row] = await getDBTemplates(1)
        expect(row).toMatchObject({ id, workspaceID: 1, sourceNoteID: 1, sourceNoteName: "Sorgente", name: "Mio template", color: "#ff0000" })
        expect(row.content).toEqual({
            version: 1,
            groups: [
                {
                    name: "Sprint", color: "#abcdef", position: 0, width: 420,
                    // The tasks directly in the group (its default section), which is not listed among the sections
                    tasks: [
                        {
                            text: "Diretto", description: "d", completed: true, priority: true, color: "#333333", position: 0, subtasks: [
                                { text: "Sotto-diretto", description: null, completed: false, priority: false, color: null, position: 0, subtasks: [] },
                            ],
                        },
                    ],
                    sections: [
                        {
                            title: "Da fare", color: "#00ff00", position: 1, tasks: [
                                {
                                    text: "Radice A", description: null, completed: false, priority: false, color: null, position: 0, subtasks: [],
                                },
                                {
                                    text: "Radice B", description: "descrizione", completed: true, priority: true, color: "#0000ff", position: 1, subtasks: [
                                        {
                                            text: "Figlio 1", description: "d", completed: true, priority: false, color: "#111111", position: 0, subtasks: [
                                                { text: "Nipote", description: null, completed: true, priority: true, color: "#222222", position: 0, subtasks: [] },
                                            ],
                                        },
                                        { text: "Figlio 2", description: null, completed: false, priority: false, color: null, position: 1, subtasks: [] },
                                    ],
                                },
                            ],
                        },
                        { title: "Archivio", color: null, position: 2, tasks: [] },
                    ],
                },
                {
                    name: null, color: null, position: 1, sections: [
                        {
                            title: "Idee", color: null, position: 1, tasks: [
                                { text: "Idea", description: null, completed: false, priority: false, color: null, position: 0, subtasks: [] },
                            ],
                        },
                    ],
                },
            ],
        })
        expect(countTemplateContent(row.content)).toEqual({ groups: 2, sections: 3, tasks: 8 })
    })

    it("excludes soft deleted items (and their subtasks) and the audio files", async () => {
        await createDBTemplateFromNote(1, "T")
        const json = (rows("SELECT content FROM note_template")[0].content as string)
        for (const excluded of ["Eliminato", "Figlio di eliminato", "Figlio eliminato", "Sezione eliminata", "Nel gruppo eliminato", "Nella sezione eliminata", "song.mp3"])
            expect(json).not.toContain(excluded)
        expect(json).not.toContain("audio")
    })

    it("is an independent snapshot: editing or deleting the note does not change it", async () => {
        await createDBTemplateFromNote(1, "T")
        const before = rows("SELECT content FROM note_template")[0].content
        sqlite.exec("UPDATE task SET text = 'Cambiato', completed = 0; DELETE FROM section WHERE id = 1")
        expect(rows("SELECT content FROM note_template")[0].content).toBe(before)
        sqlite.exec("DELETE FROM note WHERE id = 1")
        const [row] = await getDBTemplates(1)
        expect(row).toMatchObject({ sourceNoteID: null, sourceNoteName: null })
        expect(JSON.stringify(row.content)).toBe(before)
    })

    it("maps a name clash, an empty name and a missing note", async () => {
        await createDBTemplateFromNote(1, "T")
        expect(await thrown(createDBTemplateFromNote(2, "T"))).toEqual({ code: "TEMPLATE_EXISTS", message: "Esiste già un template con questo nome." })
        expect(await thrown(createDBTemplateFromNote(2, "  "))).toMatchObject({ code: "TEMPLATE_CHECK_FAILED" })
        expect(await thrown(createDBTemplateFromNote(99, "X"))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
        sqlite.exec("UPDATE note SET deleted_at = datetime('now') WHERE id = 2")
        expect(await thrown(createDBTemplateFromNote(2, "Y"))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
    })

    it("allows the same name in another workspace and after the template is deleted", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        sqlite.exec("INSERT INTO note (id, workspaceID, name) VALUES (3, 2, 'Altro')")
        await createDBTemplateFromNote(3, "T")
        await deleteDBItem("note_template", id)
        await createDBTemplateFromNote(1, "T")
        expect((await getDBTemplates(1)).map(t => t.name)).toEqual(["T"])
        expect((await getDBTemplates(2)).map(t => t.name)).toEqual(["T"])
    })
})

describe("createDBEmptyTemplate", () => {
    it("creates a template with no source note, no color and no groups", async () => {
        const id = await createDBEmptyTemplate(1, "  Vuoto ")
        const [row] = await getDBTemplates(1)
        expect(row).toMatchObject({ id, workspaceID: 1, sourceNoteID: null, sourceNoteName: null, name: "Vuoto", color: null, content: { version: 1, groups: [] } })
        expect(countTemplateContent(row.content)).toEqual({ groups: 0, sections: 0, tasks: 0 })
        expect(await countDBTemplates(1)).toBe(1)
    })

    it("maps a name clash and an empty name, and allows the name in another workspace", async () => {
        await createDBEmptyTemplate(1, "T")
        expect(await thrown(createDBEmptyTemplate(1, "T"))).toEqual({ code: "TEMPLATE_EXISTS", message: "Esiste già un template con questo nome." })
        expect(await thrown(createDBEmptyTemplate(1, "  "))).toMatchObject({ code: "TEMPLATE_CHECK_FAILED" })
        await createDBEmptyTemplate(2, "T")
        expect((await getDBTemplates(2)).map(t => t.name)).toEqual(["T"])
    })

    it("cannot be refreshed from a source note (it has none)", async () => {
        const id = await createDBEmptyTemplate(1, "T")
        expect(await thrown(updateDBTemplateFromNote(id))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
    })
})

describe("getDBTemplates, countDBTemplates, renameDBTemplate", () => {
    it("lists per workspace ordered by name, hides deleted ones, and counts", async () => {
        await createDBTemplateFromNote(1, "b")
        const a = await createDBTemplateFromNote(2, "A")
        await createDBTemplateFromNote(1, "c")
        expect((await getDBTemplates(1)).map(t => t.name)).toEqual(["A", "b", "c"])
        expect(await countDBTemplates(1)).toBe(3)
        expect(await countDBTemplates(2)).toBe(0)
        await deleteDBItem("note_template", a)
        expect((await getDBTemplates(1)).map(t => t.name)).toEqual(["b", "c"])
        expect(await countDBTemplates(1)).toBe(2)
    })

    it("shows no source name while the source note is in the trash", async () => {
        await createDBTemplateFromNote(2, "T")
        expect((await getDBTemplates(1))[0].sourceNoteName).toBe("Nella cartella")
        await deleteDBItem("note", 2)
        expect((await getDBTemplates(1))[0]).toMatchObject({ sourceNoteID: 2, sourceNoteName: null })
        await restoreDBItem("note", 2)
        expect((await getDBTemplates(1))[0].sourceNoteName).toBe("Nella cartella")
    })

    it("renames, with the Italian error on a clash, also through renameDBItem", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        await createDBTemplateFromNote(2, "U")
        await renameDBTemplate(id, " Nuovo ")
        expect((await getDBTemplates(1)).map(t => t.name)).toEqual(["Nuovo", "U"])
        expect(await thrown(renameDBTemplate(id, "U"))).toEqual({ code: "TEMPLATE_EXISTS", message: "Esiste già un template con questo nome." })
        expect(await thrown(renameDBItem("note_template", id, "U"))).toMatchObject({ code: "TEMPLATE_EXISTS" })
        await renameDBItem("note_template", id, "Via renameDBItem")
        expect((await getDBTemplates(1)).map(t => t.name)).toContain("Via renameDBItem")
        expect(await thrown(renameDBTemplate(id, ""))).toMatchObject({ code: "TEMPLATE_CHECK_FAILED" })
    })
})

describe("updateDBTemplateFromNote", () => {
    it("refreshes content and color from the source note, keeping the name", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        sqlite.exec("UPDATE task SET completed = 1 WHERE id = 2; UPDATE note SET color = '#abcdef' WHERE id = 1")
        await updateDBTemplateFromNote(id)
        const [row] = await getDBTemplates(1)
        expect(row).toMatchObject({ name: "T", color: "#abcdef" })
        // The template keeps `width` and the direct tasks only when there are some
        const asContent = (await noteTree(1)).map(({ direct, width, ...group }) => ({
            ...group, ...(width ? { width } : {}), ...(direct.length > 0 ? { tasks: direct } : {}),
        }))
        expect(row.content).toEqual({ version: 1, groups: asContent })
        expect(row.content.groups[0].sections[0].tasks[0]).toMatchObject({ text: "Radice A", completed: true })
    })

    it("fails when the source note is gone or in the trash and leaves the template untouched", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const before = rows("SELECT content FROM note_template")[0].content
        await deleteDBItem("note", 1)
        expect(await thrown(updateDBTemplateFromNote(id))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
        sqlite.exec("DELETE FROM note WHERE id = 1")
        expect(await thrown(updateDBTemplateFromNote(id))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
        expect(rows("SELECT content FROM note_template")[0].content).toBe(before)
    })
})

describe("createDBNoteFromTemplate", () => {
    it("reproduces the tree exactly (groups, sections, nested tasks, flags, colors, positions)", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBNoteFromTemplate(id, 1, null, "Copia")
        expect(noteId).not.toBe(1)
        expect(await noteTree(noteId)).toEqual(await noteTree(1))
        expect(rows(`SELECT name, color, workspaceID, folderID, deleted_at FROM note WHERE id = ${noteId}`)).toEqual([
            { name: "Copia", color: "#ff0000", workspaceID: 1, folderID: null, deleted_at: null },
        ])
        // The soft deleted items of the source were not copied
        expect(rows(`SELECT COUNT(*) AS c FROM task WHERE sectionID IN (SELECT id FROM section WHERE groupID IN (SELECT id FROM section_group WHERE noteID = ${noteId}))`)[0].c).toBe(8)
        expect(rows(`SELECT COUNT(*) AS c FROM audio_file WHERE section_groupID IN (SELECT id FROM section_group WHERE noteID = ${noteId})`)[0].c).toBe(0)
        // The source is untouched: 12 non deleted tasks + the 8 of the copy
        expect(rows("SELECT COUNT(*) AS c FROM task WHERE deleted_at IS NULL")[0].c).toBe(20)
        // Every group of the copy has its default section, with the direct tasks and the width
        expect(rows(`SELECT g.position, g.width, s.title, s.position AS spos,
                (SELECT COUNT(*) FROM task t WHERE t.sectionID = s.id) AS tasks
            FROM section s JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ${noteId} AND s.is_default = 1 ORDER BY g.position`)).toEqual([
            { position: 0, width: 420, title: null, spos: 0, tasks: 2 },
            { position: 1, width: null, title: null, spos: 0, tasks: 0 },
        ])
    })

    it("sets the subtasks section and parent so they show up in the note data", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBNoteFromTemplate(id, 1, null, "Copia")
        const { tasks, sections } = await getDBNoteData(noteId)
        const sectionIds = new Set(sections.map(s => s.id))
        for (const t of tasks) expect(sectionIds.has(t.sectionID as number)).toBe(true)
        const grandchild = tasks.find(t => t.text === "Nipote")!
        const parent = tasks.find(t => t.id === grandchild.taskID)!
        expect(parent.text).toBe("Figlio 1")
        expect(tasks.find(t => t.id === parent.taskID)!.text).toBe("Radice B")
    })

    it("appends the note at the end of the workspace root or of the folder", async () => {
        sqlite.exec("INSERT INTO note (workspaceID, name, position) VALUES (1, 'Ultima', 4)")
        const id = await createDBTemplateFromNote(1, "T")
        const inRoot = await createDBNoteFromTemplate(id, 1, null, "Copia root")
        expect(rows(`SELECT position FROM note WHERE id = ${inRoot}`)[0].position).toBe(5)
        const inFolder = await createDBNoteFromTemplate(id, 1, 1, "Copia cartella")
        expect(rows(`SELECT folderID, workspaceID, position FROM note WHERE id = ${inFolder}`)[0]).toEqual({ folderID: 1, workspaceID: 1, position: 1 })
        const second = await createDBNoteFromTemplate(id, 1, 1, "Seconda")
        expect(rows(`SELECT position FROM note WHERE id = ${second}`)[0].position).toBe(2)
    })

    it("can be applied several times, the copies are independent", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const a = await createDBNoteFromTemplate(id, 1, null, "A")
        const b = await createDBNoteFromTemplate(id, 1, null, "B")
        sqlite.exec(`UPDATE task SET text = 'X' WHERE text = 'Idea' AND sectionID IN (SELECT id FROM section WHERE groupID IN (SELECT id FROM section_group WHERE noteID = ${a}))`)
        expect(await noteTree(b)).toEqual(await noteTree(1))
        expect(await noteTree(a)).not.toEqual(await noteTree(1))
    })

    it("handles an empty note and reports a name clash without leaving anything behind", async () => {
        sqlite.exec("INSERT INTO note (id, workspaceID, name) VALUES (5, 1, 'Vuota')")
        const empty = await createDBTemplateFromNote(5, "Vuoto")
        const created = await createDBNoteFromTemplate(empty, 1, null, "Da vuoto")
        expect(await noteTree(created)).toEqual([])

        const id = await createDBTemplateFromNote(1, "T")
        const notes = rows("SELECT COUNT(*) AS c FROM note")[0].c
        const groups = rows("SELECT COUNT(*) AS c FROM section_group")[0].c
        expect(await thrown(createDBNoteFromTemplate(id, 1, null, "Sorgente"))).toEqual({
            code: "NOTE_EXISTS", message: "Esiste già una nota con questo nome nella cartella di destinazione.",
        })
        expect(await thrown(createDBNoteFromTemplate(id, 1, 1, "Nella cartella"))).toMatchObject({ code: "NOTE_EXISTS" })
        expect(await thrown(createDBNoteFromTemplate(id, 1, null, "  "))).toMatchObject({ code: "NOTE_CHECK_FAILED" })
        expect(rows("SELECT COUNT(*) AS c FROM note")[0].c).toBe(notes)
        expect(rows("SELECT COUNT(*) AS c FROM section_group")[0].c).toBe(groups)
    })

    it("allows a note with the same name in another folder", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        await expect(createDBNoteFromTemplate(id, 1, 1, "Sorgente")).resolves.toBeTypeOf("number")
    })

    it("rolls back the whole creation (note and all its children) when an insert fails midway", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const counts = () => ["note", "section_group", "section", "task"].map(t => rows(`SELECT COUNT(*) AS c FROM ${t}`)[0].c)
        const before = counts()

        for (const stage of ["INSERT INTO section (", "INSERT INTO task ("]) {
            failOn = stage
            expect(await thrown(createDBNoteFromTemplate(id, 1, null, "Copia"))).toMatchObject({ code: "TEMPLATE_APPLY_FAILED" })
            failOn = null
            expect(counts()).toEqual(before)
        }
        // The next attempt works
        await expect(createDBNoteFromTemplate(id, 1, null, "Copia")).resolves.toBeTypeOf("number")
    })

    it("fails on a failure of the task level insert of the subtasks too", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const before = rows("SELECT COUNT(*) AS c FROM task")[0].c
        let calls = 0
        const original = sqlite.prepare.bind(sqlite)
        vi.spyOn(sqlite, "prepare").mockImplementation((sql: string) => {
            if (sql.startsWith("INSERT INTO task (") && ++calls === 2) throw new Error("boom")
            return original(sql)
        })
        expect(await thrown(createDBNoteFromTemplate(id, 1, null, "Copia"))).toMatchObject({ code: "TEMPLATE_APPLY_FAILED" })
        vi.restoreAllMocks()
        expect(rows("SELECT COUNT(*) AS c FROM task")[0].c).toBe(before)
        expect(rows("SELECT COUNT(*) AS c FROM note WHERE name = 'Copia'")[0].c).toBe(0)
    })

    it("fails for a template of another workspace, a deleted one or a missing one", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        expect(await thrown(createDBNoteFromTemplate(id, 2, null, "X"))).toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
        expect(await thrown(createDBNoteFromTemplate(999, 1, null, "X"))).toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
        await deleteDBItem("note_template", id)
        expect(await thrown(createDBNoteFromTemplate(id, 1, null, "X"))).toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
    })

    it("inserts big templates in chunks with correct parent links", async () => {
        sqlite.exec("INSERT INTO note (id, workspaceID, name) VALUES (6, 1, 'Grande'); INSERT INTO section_group (id, noteID, position) VALUES (10, 6, 0); INSERT INTO section (id, groupID, title, position) VALUES (10, 10, 'S', 1); INSERT INTO section (groupID, title, position, is_default) VALUES (10, NULL, 0, 1);")
        const insert = sqlite.prepare("INSERT INTO task (sectionID, taskID, text, position) VALUES (10, ?, ?, ?)")
        for (let i = 0; i < 1200; i++) insert.run(null, `T${i}`, i)
        const top = rows("SELECT id, text FROM task WHERE sectionID = 10 AND text IN ('T0', 'T600', 'T1199')")
        for (const t of top) insert.run(t.id as number, `child of ${t.text}`, 0)
        const id = await createDBTemplateFromNote(6, "Grande")
        const noteId = await createDBNoteFromTemplate(id, 1, null, "Grande copia")
        expect(await noteTree(noteId)).toEqual(await noteTree(6))
        const children = rows(`SELECT c.text AS child, p.text AS parent FROM task c JOIN task p ON p.id = c.taskID
            JOIN section s ON s.id = c.sectionID JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ${noteId} ORDER BY c.text`)
        expect(children).toEqual([
            { child: "child of T0", parent: "T0" }, { child: "child of T1199", parent: "T1199" }, { child: "child of T600", parent: "T600" },
        ])
    })
})

describe("trash integration", () => {
    it("lists a deleted template with 'Da: <note>' context, restores it, purges it and empties the trash", async () => {
        const a = await createDBTemplateFromNote(1, "A")
        const b = await createDBTemplateFromNote(2, "B")
        await deleteDBItem("note_template", a)
        await deleteDBItem("note_template", b)
        const trash = await getDBTrash(1)
        expect(trash.map(t => [t.type, t.name, t.context])).toEqual(
            expect.arrayContaining([["note_template", "A", "Da: Sorgente"], ["note_template", "B", "Da: Nella cartella"]]))
        expect(await getDBTemplates(1)).toEqual([])

        await restoreDBItem("note_template", a)
        expect((await getDBTemplates(1)).map(t => t.name)).toEqual(["A"])

        await purgeDBItem("note_template", b)
        expect(rows("SELECT id FROM note_template").map(r => r.id)).toEqual([a])
        await purgeDBItem("note_template", a) // not in the trash: untouched
        expect(rows("SELECT id FROM note_template")).toHaveLength(1)

        await deleteDBItem("note_template", a)
        await emptyDBTrash(1)
        expect(rows("SELECT id FROM note_template")).toEqual([])
    })

    it("has an empty context when the source note is gone, and empties only its workspace", async () => {
        const a = await createDBTemplateFromNote(1, "A")
        sqlite.exec("INSERT INTO note (id, workspaceID, name) VALUES (3, 2, 'Altro')")
        const other = await createDBTemplateFromNote(3, "O")
        await deleteDBItem("note_template", a)
        await deleteDBItem("note_template", other)
        sqlite.exec("DELETE FROM note WHERE id = 1")
        expect((await getDBTrash(1)).find(t => t.type === "note_template")).toMatchObject({ name: "A", context: "" })
        await emptyDBTrash(1)
        expect(rows("SELECT id FROM note_template").map(r => r.id)).toEqual([other])
    })

    it("restore fails with the unique message when an active template has the same name", async () => {
        const a = await createDBTemplateFromNote(1, "A")
        await deleteDBItem("note_template", a)
        await createDBTemplateFromNote(2, "A")
        expect(await thrown(restoreDBItem("note_template", a))).toMatchObject({ code: "NOTE_TEMPLATE_EXISTS" })
    })
})

describe("group color", () => {
    it("is stored, returned by the note data, cleared and kept through the trash", async () => {
        await updateDBColor("section_group", 2, "#123456")
        expect((await getDBNoteData(1)).groups.map(g => g.color ?? null)).toEqual(["#abcdef", "#123456"])
        await updateDBColor("section_group", 1)
        expect((await getDBNoteData(1)).groups.map(g => g.color ?? null)).toEqual([null, "#123456"])
        await deleteDBItem("section_group", 2)
        expect((await getDBNoteData(1)).groups).toHaveLength(1)
        await restoreDBItem("section_group", 2)
        expect((await getDBNoteData(1)).groups.map(g => g.color ?? null)).toEqual([null, "#123456"])
    })

    it("rejects an empty color", async () => {
        await expect(updateDBColor("section_group", 1, "")).rejects.toBeDefined()
    })

    it("is copied from a template to the new note, and a template without it gives uncolored groups", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const copy = await createDBNoteFromTemplate(id, 1, null, "Copia")
        expect((await getDBNoteData(copy)).groups.map(g => g.color ?? null)).toEqual(["#abcdef", null])
        const oldContent = JSON.stringify({ version: 1, groups: [{ name: "Vecchio", position: 0, sections: [] }] })
        sqlite.prepare("UPDATE note_template SET content = ? WHERE id = ?").run(oldContent, id)
        const old = await createDBNoteFromTemplate(id, 1, null, "Da vecchio")
        expect((await getDBNoteData(old)).groups.map(g => g.color ?? null)).toEqual([null])
    })
})

describe("parseTemplateContent", () => {
    it("returns the parsed snapshot and falls back to an empty template when it is corrupted", () => {
        const content = { version: 1, groups: [{ sections: [] }] }
        expect(parseTemplateContent(JSON.stringify(content))).toEqual(content)
        expect(parseTemplateContent("not json")).toEqual({ version: 1, groups: [] })
        expect(parseTemplateContent('{"groups":3}')).toEqual({ version: 1, groups: [] })
        expect(parseTemplateContent("null")).toEqual({ version: 1, groups: [] })
    })
})

describe("the place of the list of the direct tasks among the sections", () => {
    // Group 1 of the fixture as [Da fare, (list), Archivio]
    const listInTheMiddle = () => sqlite.exec("UPDATE section SET position = 3 WHERE id = 2; UPDATE section SET position = 2 WHERE id = 20")
    // The live rows of the first group of a note in order, the list shown as "(list)"
    const rowsOf = (noteId: number) => rows(`SELECT s.title, s.is_default FROM section s JOIN section_group g ON g.id = s.groupID
        WHERE g.noteID = ${noteId} AND g.position = 0 AND s.deleted_at IS NULL ORDER BY s.position, s.id`).map(r => r.is_default ? "(list)" : r.title)

    it("is stored as directIndex (the sections before the list), and omitted when the list is on top", async () => {
        const top = await createDBTemplateFromNote(1, "Top")
        expect((await getDBTemplates(1)).find(t => t.id === top)!.content.groups[0]).not.toHaveProperty("directIndex")
        listInTheMiddle()
        const id = await createDBTemplateFromNote(1, "Middle")
        expect((await getDBTemplates(1)).find(t => t.id === id)!.content.groups[0]).toMatchObject({ directIndex: 1 })
        expect((await getDBTemplates(1)).find(t => t.id === id)!.content.groups[1]).not.toHaveProperty("directIndex")
    })

    it("is rebuilt in a note created from the template, with the rows numbered without gaps", async () => {
        listInTheMiddle()
        const id = await createDBTemplateFromNote(1, "Middle")
        const noteId = await createDBNoteFromTemplate(id, 1, null, "Copia")
        expect(rowsOf(noteId)).toEqual(["Da fare", "(list)", "Archivio"])
        expect(rows(`SELECT s.position FROM section s JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ${noteId} AND g.position = 0 ORDER BY s.position`).map(r => r.position)).toEqual([0, 1, 2])
        // the direct tasks went with the list
        expect(rows(`SELECT t.text FROM task t JOIN section s ON s.id = t.sectionID JOIN section_group g ON g.id = s.groupID
            WHERE g.noteID = ${noteId} AND s.is_default = 1 AND t.taskID IS NULL AND g.position = 0`).map(r => r.text)).toEqual(["Diretto"])
    })

    it("is clamped when it is out of range and a template without it keeps the list on top", async () => {
        const content = (directIndex?: number) => JSON.stringify({ version: 1, groups: [{
            name: null, position: 0, ...(directIndex === undefined ? {} : { directIndex }),
            sections: [{ title: "A", position: 0, tasks: [] }, { title: "B", position: 1, tasks: [] }],
        }] })
        for (const [directIndex, expected] of [[undefined, ["(list)", "A", "B"]], [1, ["A", "(list)", "B"]], [2, ["A", "B", "(list)"]], [99, ["A", "B", "(list)"]], [-3, ["(list)", "A", "B"]]] as const) {
            sqlite.prepare("INSERT INTO note_template (workspaceID, name, content) VALUES (1, ?, ?)").run(`T${directIndex}`, content(directIndex))
            const templateId = rows("SELECT MAX(id) AS id FROM note_template")[0].id as number
            const noteId = await createDBNoteFromTemplate(templateId, 1, null, `N${directIndex}`)
            expect(rowsOf(noteId)).toEqual(expected)
        }
    })
})

describe("automatic group color", () => {
    it("goes into the template and comes back in the note made from it", async () => {
        sqlite.exec("UPDATE section_group SET color = 'progress' WHERE id = 1")
        const id = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBNoteFromTemplate(id, 1, null, "Copia")
        expect(rows(`SELECT color FROM section_group WHERE noteID = ${noteId} ORDER BY position`)).toEqual([{ color: "progress" }, { color: null }])
    })
})
