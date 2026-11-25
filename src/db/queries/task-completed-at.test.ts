// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { latestSchema } from "../schema/initial"

// The completion moment of the tasks and the statistics built on it (real SQL on a real SQLite database)
let sqlite: DatabaseSync

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    const sqliteInvoke = createSqliteInvoke(() => sqlite)
    return {
        invoke: vi.fn(async (command: string, args?: { paths?: string[] }) => {
            if (command === "files_exist") return (args?.paths ?? []).map(() => true)
            if (command === "audio_file_exists") return true
            return sqliteInvoke(command, args as never)
        }),
    }
})

import { getDBWorkspaceStats } from "./stats"
import { createDBTemplateFromNote, createDBNoteFromTemplate } from "./template"
import { duplicateDBNote } from "./duplicate"
import { buildDBWorkspaceExport, importDBWorkspace, validateWorkspaceExport } from "./transfer"

const rows = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...(params as never[])) as T[]
const momentsOf = () => rows<{ text: string, completed_at: string | null }>("SELECT text, completed_at FROM task WHERE text = 'Done' ORDER BY id")

const TODAY = "2026-11-25"

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS');
        INSERT INTO note (id, workspaceID, name, edit_date) VALUES (1, 1, 'Active', '2026-11-24'), (2, 1, 'Old', '2026-01-02'), (3, 1, 'Trashed', '2026-11-24');
        UPDATE note SET deleted_at = datetime('now') WHERE id = 3;
        INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0), (2, 2, 0), (3, 3, 0);
        INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'Todo', 0), (2, 2, 'Todo', 0), (3, 3, 'Todo', 0);
        INSERT INTO task (id, sectionID, text, completed, completed_at, due_date, edit_date, position) VALUES
            (1, 1, 'Done', 1, '2026-11-24 10:15', NULL, '2026-11-24', 0),
            (2, 1, 'Done too', 1, '2026-11-10 08:00', NULL, '2026-11-10', 1),
            (3, 1, 'Open overdue', 0, NULL, '2020-01-01', '2026-11-24', 2),
            (4, 2, 'Old open', 0, NULL, NULL, '2026-01-02', 0),
            (5, 3, 'In the trash', 1, '2026-11-24 09:00', NULL, '2026-11-24', 0);
    `)
})

describe("getDBWorkspaceStats", () => {
    it("counts the completions per week, the progress per note, the stale notes and the overdue tasks", async () => {
        const stats = await getDBWorkspaceStats(1, TODAY)
        expect(stats.weeks).toHaveLength(12)
        expect(stats.weeks.at(-1)).toEqual({ start: "2026-11-23", count: 1 })
        expect(stats.weeks.at(-3)).toEqual({ start: "2026-11-09", count: 1 })
        expect(stats.completedInRange).toBe(2)
        expect(stats.notes.map(note => [note.name, note.done, note.total])).toEqual([["Active", 2, 3], ["Old", 0, 1]].sort((a, b) => Number(a[1]) / Number(a[2]) - Number(b[1]) / Number(b[2])))
        expect(stats.stale.map(note => note.name)).toEqual(["Old"])
        expect(stats.overdue.map(task => task.text)).toEqual(["Open overdue"])
        expect(stats.doneTotal).toBe(2)
    })

    it("reports a failure with the statistics message", async () => {
        sqlite.exec("DROP TABLE task")
        await expect(getDBWorkspaceStats(1, TODAY)).rejects.toMatchObject({ code: "STATS_LOAD_FAILED" })
    })
})

describe("completed_at", () => {
    it("is stamped when a task is completed and cleared when it is reopened", () => {
        sqlite.exec("UPDATE task SET completed = 1 WHERE id = 3")
        expect(rows<{ completed_at: string }>("SELECT completed_at FROM task WHERE id = 3")[0].completed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        sqlite.exec("UPDATE task SET completed = 0 WHERE id = 3")
        expect(rows("SELECT completed_at FROM task WHERE id = 3")).toEqual([{ completed_at: null }])
    })

    it("is carried by a copy of the note, not by a template (a task copied from it is completed now)", async () => {
        sqlite.exec("DELETE FROM task WHERE id <> 1")
        await duplicateDBNote(1)
        expect(momentsOf()).toEqual([{ text: "Done", completed_at: "2026-11-24 10:15" }, { text: "Done", completed_at: "2026-11-24 10:15" }])
        sqlite.exec("DELETE FROM task WHERE id <> 1")
        const template = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBNoteFromTemplate(template, 1, null, "From template")
        const fromTemplate = rows<{ completed_at: string | null }>("SELECT t.completed_at FROM task t INNER JOIN section s ON s.id = t.sectionID INNER JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ?", [noteId])
        expect(fromTemplate).toHaveLength(1)
        expect(fromTemplate[0].completed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        expect(fromTemplate[0].completed_at).not.toBe("2026-11-24 10:15")
    })

    it("travels through export and import; a file without it imports with the moment of the import", async () => {
        const data = await buildDBWorkspaceExport(1)
        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(JSON.parse(JSON.stringify(data))), { name: "Imported" })
        expect(rows("SELECT t.completed_at FROM task t INNER JOIN section s ON s.id = t.sectionID INNER JOIN section_group g ON g.id = s.groupID INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ? AND t.text = 'Done'", [workspaceId])).toEqual([{ completed_at: "2026-11-24 10:15" }])

        const text = JSON.stringify(data).replace(/"completed_at":"[^"]*",?/g, "")
        const { workspaceId: old } = await importDBWorkspace(validateWorkspaceExport(JSON.parse(text)), { name: "Old file" })
        const moment = rows<{ completed_at: string | null }>("SELECT t.completed_at FROM task t INNER JOIN section s ON s.id = t.sectionID INNER JOIN section_group g ON g.id = s.groupID INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ? AND t.text = 'Done'", [old])
        expect(moment[0].completed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    })
})
