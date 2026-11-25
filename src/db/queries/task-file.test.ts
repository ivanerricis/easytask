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
    return { invoke: createSqliteInvoke(() => sqlite) }
})

import { createDBTaskFiles, getDBTaskFiles, loadTaskFiles, setDBTaskFiles } from "./task-file"
import { getDBNoteData, getDBNotesData } from "./note"
import { buildContentWithSectionIds, createDBNoteFromTemplate, createDBTemplateFromNote } from "./template"
import { duplicateDBNote, duplicateDBSection } from "./duplicate"
import { copyDBGroupToNote, copyDBSectionToNote, copyDBTasksToNote, moveDBTaskToNote } from "./cross-note"
import { insertDBTasksAfter } from "./task-paste"
import { deleteDBItem } from "./shared_queries"
import { archiveDBItem, unarchiveDBItem } from "./archive"
import { purgeDBItem, restoreDBItem } from "./trash"
import { snapshotTasks } from "@/lib/task-clipboard"
import type { Task } from "@/types/types"

const rows = sqliteRows(() => sqlite)
const fileRows = (taskId: number) => rows(`SELECT name, path, position FROM task_file WHERE taskID = ${taskId} ORDER BY position, id`)

/*
 * workspace 1: note 1 "A" (group 1 > section 11 "S1": task 1 "t1" with subtask 2 "t1a", task 3 "t2"; section 12 "S2"),
 * note 2 "B" (group 3 > section 31); workspace 2: note 3 "C" (group 5 > section 50)
 * files: task 1 has a.pdf and b.docx, subtask 2 has c.txt
 */
beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'W1'), (2, 'W2');
        INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'A'), (2, 1, 'B'), (3, 2, 'C');
        INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0), (3, 2, 0), (5, 3, 0);
        INSERT INTO section (id, groupID, title, position, is_default) VALUES
            (10, 1, NULL, 0, 1), (11, 1, 'S1', 1, 0), (12, 1, 'S2', 2, 0), (30, 3, NULL, 0, 1), (31, 3, 'S1', 1, 0), (50, 5, NULL, 0, 1);
        INSERT INTO task (id, sectionID, taskID, text, position) VALUES (1, 11, NULL, 't1', 0), (2, 11, 1, 't1a', 0), (3, 11, NULL, 't2', 1);
    `)
    await createDBTaskFiles(1, ["C:\\docs\\a.pdf", "/home/me/b.docx"])
    await createDBTaskFiles(2, ["/tmp/c.txt"])
})

describe("task file queries", () => {
    it("attaches files appended by position, with the file name as name, only the path is stored", async () => {
        expect(await getDBTaskFiles(1)).toMatchObject([
            { name: "a.pdf", path: "C:\\docs\\a.pdf", position: 0, taskID: 1 },
            { name: "b.docx", path: "/home/me/b.docx", position: 1 },
        ])
        const more = await createDBTaskFiles(1, ["/x/c.zip", "/x/a.pdf"])
        expect(more.map(file => file.name)).toEqual(["a.pdf", "b.docx", "c.zip", "a.pdf"])
        expect(more.map(file => file.position)).toEqual([0, 1, 2, 3])
        expect(await createDBTaskFiles(3, [])).toEqual([])
    })

    it("writes the list back as it is given (the undo of a removal)", async () => {
        const [first, second] = await getDBTaskFiles(1)
        const withoutFirst = await setDBTaskFiles(1, [second])
        expect(withoutFirst.map(file => file.name)).toEqual(["b.docx"])
        const back = await setDBTaskFiles(1, [first, second])
        expect(back.map(file => [file.name, file.position])).toEqual([["a.pdf", 0], ["b.docx", 1]])
        expect(await setDBTaskFiles(1, [])).toEqual([])
        expect(fileRows(2)).toHaveLength(1)
    })

    it("rejects an empty path", async () => {
        await expect(createDBTaskFiles(3, [""])).rejects.toMatchObject({ code: "TASK_FILE_CHECK_FAILED" })
        expect(fileRows(3)).toEqual([])
    })

    it("loads the files with the data of a note, whatever the section or depth", async () => {
        const { tasks } = await getDBNoteData(1)
        expect(tasks.find(task => task.id === 1)?.files?.map(file => file.name)).toEqual(["a.pdf", "b.docx"])
        expect(tasks.find(task => task.id === 2)?.files?.map(file => file.name)).toEqual(["c.txt"])
        expect(tasks.find(task => task.id === 3)?.files).toBeUndefined()
        const many = await getDBNotesData([1, 2])
        expect(many.get(1)?.tasks.find(task => task.id === 1)?.files).toHaveLength(2)
        expect(many.get(2)?.tasks).toEqual([])
    })

    it("a trashed or archived task keeps its files and they come back with it", async () => {
        await deleteDBItem("task", 1)
        expect((await getDBNoteData(1)).tasks.some(task => task.id === 1)).toBe(false)
        expect(fileRows(1)).toHaveLength(2)
        await restoreDBItem("task", 1)
        expect((await getDBNoteData(1)).tasks.find(task => task.id === 1)?.files).toHaveLength(2)
        await archiveDBItem("task", 1)
        expect((await getDBNoteData(1)).tasks.some(task => task.id === 1)).toBe(false)
        expect((await getDBNoteData(1, true)).tasks.find(task => task.id === 1)?.files).toHaveLength(2)
        await unarchiveDBItem("task", 1)
        expect((await getDBNoteData(1)).tasks.find(task => task.id === 1)?.files).toHaveLength(2)
    })

    it("a purged task takes its files with it", async () => {
        await deleteDBItem("task", 1)
        await purgeDBItem("task", 1)
        expect(rows("SELECT COUNT(*) AS n FROM task_file")).toEqual([{ n: 0 }])
    })

    it("loadTaskFiles puts the files on tasks read straight from the table", async () => {
        const tasks = rows("SELECT * FROM task ORDER BY id") as unknown as Task[]
        await loadTaskFiles(tasks)
        expect(tasks.map(task => task.files?.length ?? 0)).toEqual([2, 1, 0])
    })
})

describe("task files in snapshots, copies and templates", () => {
    it("the content of a note carries the files of its tasks and subtasks", async () => {
        const { content } = await buildContentWithSectionIds(1)
        const tasks = content.groups[0].sections[0].tasks
        expect(tasks[0].files).toEqual([{ name: "a.pdf", path: "C:\\docs\\a.pdf" }, { name: "b.docx", path: "/home/me/b.docx" }])
        expect(tasks[0].subtasks[0].files).toEqual([{ name: "c.txt", path: "/tmp/c.txt" }])
        expect(tasks[1].files).toBeUndefined()
    })

    it("a template round trip: a note created from a template has the same files", async () => {
        const templateId = await createDBTemplateFromNote(1, "Tpl")
        const noteId = await createDBNoteFromTemplate(templateId, 1, null, "From template")
        const { tasks } = await getDBNoteData(noteId)
        const copy = tasks.find(task => task.text === "t1")!
        expect(copy.id).not.toBe(1)
        expect(copy.files?.map(file => [file.name, file.path])).toEqual([["a.pdf", "C:\\docs\\a.pdf"], ["b.docx", "/home/me/b.docx"]])
        expect(tasks.find(task => task.text === "t1a")?.files?.map(file => file.name)).toEqual(["c.txt"])
        // the original is untouched
        expect(fileRows(1)).toHaveLength(2)
    })

    it("duplicating a note and a section copies the files; they are independent rows", async () => {
        const noteId = await duplicateDBNote(1)
        const duplicated = (await getDBNoteData(noteId)).tasks.find(task => task.text === "t1")!
        expect(duplicated.files).toHaveLength(2)
        const sectionId = await duplicateDBSection(11)
        const inSection = rows(`SELECT id FROM task WHERE sectionID = ${sectionId} AND text = 't1a'`)[0].id as number
        expect(fileRows(inSection).map(file => file.name)).toEqual(["c.txt"])
        sqlite.exec(`DELETE FROM task_file WHERE taskID = ${inSection}`)
        expect(fileRows(2)).toHaveLength(1)
    })

    it("pasting tasks (snapshots of tree tasks) brings their files", async () => {
        const { tasks } = await getDBNoteData(1)
        const t1 = { ...tasks.find(task => task.id === 1)!, subtasks: [{ ...tasks.find(task => task.id === 2)!, subtasks: [] }] } as Task
        const snapshot = snapshotTasks([t1], [])
        expect(snapshot[0].files).toHaveLength(2)
        const [id] = await insertDBTasksAfter(3, snapshot)
        expect(fileRows(id).map(file => file.name)).toEqual(["a.pdf", "b.docx"])
        const child = rows(`SELECT id FROM task WHERE taskID = ${id}`)[0].id as number
        expect(fileRows(child).map(file => file.name)).toEqual(["c.txt"])
    })

    it("an Alt copy of tasks, a section and a group to the other note brings the files", async () => {
        const { tasks } = await getDBNoteData(1)
        const snapshot = snapshotTasks([{ ...tasks.find(task => task.id === 1)!, subtasks: [] } as Task], [])
        const [copied] = await copyDBTasksToNote(snapshot, { sectionId: 31, parentTaskId: null }, 0)
        expect(fileRows(copied).map(file => file.name)).toEqual(["a.pdf", "b.docx"])

        const { sectionId } = await copyDBSectionToNote(11, { type: "group", groupId: 3, index: 0 })
        const copiedT1 = rows(`SELECT id FROM task WHERE sectionID = ${sectionId} AND text = 't1'`)[0].id as number
        expect(fileRows(copiedT1)).toHaveLength(2)

        const groupId = await copyDBGroupToNote(1, 2, 0)
        const inGroup = rows(`SELECT t.id FROM task t JOIN section s ON s.id = t.sectionID WHERE s.groupID = ${groupId} AND t.text = 't1a'`)[0].id as number
        expect(fileRows(inGroup).map(file => file.name)).toEqual(["c.txt"])
        // the original keeps its own
        expect(fileRows(1)).toHaveLength(2)
    })

    it("a Ctrl move to the other note keeps the rows (same ids)", async () => {
        await moveDBTaskToNote(1, { sectionId: 31, parentTaskId: null }, 0)
        expect(rows("SELECT sectionID FROM task WHERE id = 1")).toEqual([{ sectionID: 31 }])
        expect((await getDBNoteData(2)).tasks.find(task => task.id === 1)?.files).toHaveLength(2)
        expect(fileRows(2)).toHaveLength(1)
    })
})
