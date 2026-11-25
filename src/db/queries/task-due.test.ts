// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { latestSchema } from "../schema/initial"

// The due date and time of the tasks, carried through the queries (real SQL on a real SQLite database)
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

import { updateDBTaskDue } from "./task"
import { getDBDueTasks } from "./due"
import { getDBNoteData } from "./note"
import { createDBTemplateFromNote, createDBNoteFromTemplate, getDBTemplates } from "./template"
import { duplicateDBNote, duplicateDBSection } from "./duplicate"
import { copyDBTasksToNote, moveDBTaskToNote } from "./cross-note"
import { deleteDBItem } from "./shared_queries"
import { restoreDBItem } from "./trash"
import { buildDBWorkspaceExport, importDBWorkspace, validateWorkspaceExport } from "./transfer"

const rows = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...(params as never[])) as T[]
const dueOf = (text: string) => rows<{ due_date: string | null, due_time: string | null }>("SELECT t.due_date, t.due_time FROM task t INNER JOIN section s ON s.id = t.sectionID INNER JOIN section_group g ON g.id = s.groupID INNER JOIN note n ON n.id = g.noteID WHERE t.text = ? ORDER BY n.id DESC", [text])

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS');
        INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'Source'), (2, 1, 'Target');
        INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0), (2, 2, 0);
        INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'Todo', 1), (2, 2, 'Other', 1);
        INSERT INTO task (id, sectionID, taskID, text, position, due_date, due_time) VALUES
            (1, 1, NULL, 'Dated with time', 0, '2030-05-06', '09:30'),
            (2, 1, 1, 'Subtask dated', 0, '2030-05-07', NULL),
            (3, 1, NULL, 'No date', 1, NULL, NULL);
    `)
})

describe("updateDBTaskDue", () => {
    it("sets, changes and clears the date and the time", async () => {
        await updateDBTaskDue(3, "2031-01-02", "18:00")
        expect(dueOf("No date")).toEqual([{ due_date: "2031-01-02", due_time: "18:00" }])
        await updateDBTaskDue(3, "2031-01-03", null)
        expect(dueOf("No date")).toEqual([{ due_date: "2031-01-03", due_time: null }])
        await updateDBTaskDue(3, null, null)
        expect(dueOf("No date")).toEqual([{ due_date: null, due_time: null }])
    })

    it("never stores a time without a date or something that is not a date or a time", async () => {
        await updateDBTaskDue(3, null, "10:00")
        expect(dueOf("No date")).toEqual([{ due_date: null, due_time: null }])
        await updateDBTaskDue(3, "2031-02-30", "10:00")
        expect(dueOf("No date")).toEqual([{ due_date: null, due_time: null }])
        await updateDBTaskDue(3, "2031-02-03", "25:99")
        expect(dueOf("No date")).toEqual([{ due_date: "2031-02-03", due_time: null }])
    })
})

describe("the note tree", () => {
    it("loads the due date and time of the tasks", async () => {
        const { tasks } = await getDBNoteData(1)
        expect(tasks.map(task => [task.text, task.due_date, task.due_time])).toEqual([
            ["Dated with time", "2030-05-06", "09:30"], ["Subtask dated", "2030-05-07", null], ["No date", null, null],
        ])
    })
})

describe("templates", () => {
    it("drop the due dates (they would be overdue when the template is used) and the notes made from them have none", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const [template] = await getDBTemplates(1)
        expect(JSON.stringify(template.content)).not.toContain("due_")
        const noteId = await createDBNoteFromTemplate(id, 1, null, "From template")
        expect(rows("SELECT COUNT(*) AS n FROM task t INNER JOIN section s ON s.id = t.sectionID INNER JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ? AND t.due_date IS NOT NULL", [noteId])).toEqual([{ n: 0 }])
    })
})

describe("copies", () => {
    it("a duplicated note keeps the dates and times of its tasks and subtasks", async () => {
        await duplicateDBNote(1)
        expect(dueOf("Dated with time")).toEqual([{ due_date: "2030-05-06", due_time: "09:30" }, { due_date: "2030-05-06", due_time: "09:30" }])
        expect(dueOf("Subtask dated")).toEqual([{ due_date: "2030-05-07", due_time: null }, { due_date: "2030-05-07", due_time: null }])
    })

    it("a duplicated section keeps them", async () => {
        await duplicateDBSection(1)
        expect(rows("SELECT COUNT(*) AS n FROM task WHERE text = 'Dated with time' AND due_date = '2030-05-06' AND due_time = '09:30'")).toEqual([{ n: 2 }])
    })

    it("a copy to another note (Alt drag, paste) keeps them", async () => {
        const { tasks } = await getDBNoteData(1)
        const top = tasks.find(task => task.id === 1)!
        const snapshot = {
            text: top.text, description: null, completed: false, priority: false, color: null, position: 0,
            due_date: top.due_date, due_time: top.due_time, subtasks: [],
        }
        await copyDBTasksToNote([snapshot], { sectionId: 2, parentTaskId: null }, 0)
        expect(rows("SELECT due_date, due_time FROM task WHERE sectionID = 2")).toEqual([{ due_date: "2030-05-06", due_time: "09:30" }])
    })

    it("a task moved to another note keeps its date (the row moves)", async () => {
        await moveDBTaskToNote(1, { sectionId: 2, parentTaskId: null }, 0)
        expect(rows("SELECT text, due_date, due_time FROM task WHERE sectionID = 2 ORDER BY id")).toEqual([
            { text: "Dated with time", due_date: "2030-05-06", due_time: "09:30" },
            { text: "Subtask dated", due_date: "2030-05-07", due_time: null },
        ])
    })
})

describe("trash", () => {
    it("a trashed task comes back with its date and time", async () => {
        await deleteDBItem("task", 1)
        await restoreDBItem("task", 1)
        expect(rows("SELECT deleted_at, due_date, due_time FROM task WHERE id = 1")).toEqual([{ deleted_at: null, due_date: "2030-05-06", due_time: "09:30" }])
    })
})

describe("export and import", () => {
    it("a workspace exported and imported keeps the dates and times", async () => {
        const data = await buildDBWorkspaceExport(1)
        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(JSON.parse(JSON.stringify(data))), { name: "Imported" })
        expect(rows(`SELECT t.text, t.due_date, t.due_time FROM task t INNER JOIN section s ON s.id = t.sectionID INNER JOIN section_group g ON g.id = s.groupID
            INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ? AND n.name = 'Source' ORDER BY t.text`, [workspaceId])).toEqual([
            { text: "Dated with time", due_date: "2030-05-06", due_time: "09:30" },
            { text: "No date", due_date: null, due_time: null },
            { text: "Subtask dated", due_date: "2030-05-07", due_time: null },
        ])
    })

    it("an old file without the fields still imports, and a malformed date or a time without a date is dropped", async () => {
        const data = await buildDBWorkspaceExport(1)
        const text = JSON.stringify(data).replace(/"due_date":"[^"]*",?/g, "").replace(/"due_time":"[^"]*",?/g, "")
        expect(text).not.toContain("due_")
        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(JSON.parse(text)), { name: "Old" })
        expect(rows("SELECT COUNT(*) AS n FROM task t INNER JOIN section s ON s.id = t.sectionID INNER JOIN section_group g ON g.id = s.groupID INNER JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ?", [workspaceId])).toEqual([{ n: 3 }])
        const bad = JSON.parse(text) as { notes: { content: { groups: { sections: { tasks: Record<string, unknown>[] }[] }[] } }[] }
        const first = bad.notes.find(note => note.content.groups.length > 0)!.content.groups[0].sections[0].tasks[0]
        first.due_date = "not a date"
        first.due_time = "10:00"
        const checked = validateWorkspaceExport(bad)
        const clean = checked.notes.find(note => note.content.groups.length > 0)!.content.groups[0].sections[0].tasks[0]
        expect(clean).not.toHaveProperty("due_date")
        expect(clean).not.toHaveProperty("due_time")
    })
})

describe("getDBDueTasks", () => {
    it("lists the open tasks that are overdue or due until the date, soonest first, over every workspace", async () => {
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (2, 'Other');
            INSERT INTO note (id, workspaceID, name) VALUES (3, 2, 'Elsewhere');
            INSERT INTO section_group (id, noteID, position) VALUES (3, 3, 0);
            INSERT INTO section (id, groupID, title, position) VALUES (3, 3, 'S', 1);
            INSERT INTO task (sectionID, text, position, due_date) VALUES (3, 'Late elsewhere', 0, '2030-05-01'), (3, 'Far elsewhere', 1, '2031-01-01');
        `)
        const list = await getDBDueTasks("2030-05-06")
        expect(list.map(task => [task.text, task.workspaceName, task.noteName])).toEqual([
            ["Late elsewhere", "Other", "Elsewhere"], ["Dated with time", "WS", "Source"],
        ])
        expect((await getDBDueTasks("2030-05-06", 1)).map(task => task.text)).toEqual(["Dated with time"])
        expect((await getDBDueTasks("2030-05-07", 1)).map(task => task.text)).toEqual(["Dated with time", "Subtask dated"])
    })

    it("leaves out completed tasks and everything hidden: trashed or archived tasks, their subtasks, sections, groups, notes and folders", async () => {
        sqlite.exec(`
            INSERT INTO folder (id, workspaceID, name) VALUES (1, 1, 'F'), (2, 1, 'Sub');
            UPDATE folder SET folderID = 1 WHERE id = 2;
            INSERT INTO note (id, workspaceID, folderID, name) VALUES (4, 1, 2, 'In trashed folder');
            INSERT INTO section_group (id, noteID, position) VALUES (4, 4, 0);
            INSERT INTO section (id, groupID, title, position) VALUES (4, 4, 'S', 1);
            INSERT INTO task (sectionID, text, position, due_date) VALUES (4, 'In trashed folder task', 0, '2030-05-01');
            UPDATE folder SET deleted_at = datetime('now') WHERE id = 1;
            UPDATE task SET completed = 1 WHERE id = 2;
            INSERT INTO task (id, sectionID, text, position, due_date, deleted_at) VALUES (10, 1, 'Trashed', 5, '2030-05-01', datetime('now'));
            INSERT INTO task (sectionID, taskID, text, position, due_date) VALUES (1, 10, 'Child of trashed', 0, '2030-05-01');
            INSERT INTO task (sectionID, text, position, due_date, archived_at) VALUES (1, 'Archived', 6, '2030-05-01', datetime('now'));
        `)
        expect((await getDBDueTasks("2030-12-31")).map(task => task.text)).toEqual(["Dated with time"])
    })
})
