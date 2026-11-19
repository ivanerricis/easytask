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

import {
    copyDBGroupToNote, copyDBSectionToNote, copyDBTasksToNote, moveDBGroupToNote, moveDBSectionToNewGroupOfNote, moveDBSectionToNote, moveDBTaskToNote,
} from "./cross-note"
import { moveDBTask } from "./move"

const rows = sqliteRows(() => sqlite)
const col = (sql: string) => rows(sql).map(row => Object.values(row)[0])
const topTasks = (sectionId: number) => col(`SELECT text FROM task WHERE sectionID = ${sectionId} AND taskID IS NULL AND deleted_at IS NULL ORDER BY position, id`)
const groupsOfNote = (noteId: number) => col(`SELECT id FROM section_group WHERE noteID = ${noteId} AND deleted_at IS NULL ORDER BY position, id`)

/*
 * workspace 1: note 1 "A" and note 2 "B"; workspace 2: note 3 "C".
 * A: group 1 [section 11 "S1" (tasks: "t1" with subtask "t1a" tagged, "t2"), section 12 "S2"], group 2 (empty)
 * B: group 3 [section 31 "S1" (task "b1"), section 32 "Other"], group 4 (direct tasks section 40)
 */
beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'W1'), (2, 'W2');
        INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'A'), (2, 1, 'B'), (3, 2, 'C');
        INSERT INTO section_group (id, noteID, position, name, color, width) VALUES (1, 1, 0, 'GA', '#112233', 300), (2, 1, 1, NULL, NULL, NULL), (3, 2, 0, NULL, NULL, NULL), (4, 2, 1, NULL, NULL, NULL), (5, 3, 0, NULL, NULL, NULL);
        INSERT INTO section (id, groupID, title, position, is_default) VALUES
            (10, 1, NULL, 0, 1), (11, 1, 'S1', 1, 0), (12, 1, 'S2', 2, 0),
            (20, 2, NULL, 0, 1),
            (30, 3, NULL, 0, 1), (31, 3, 'S1', 1, 0), (32, 3, 'Other', 2, 0),
            (40, 4, NULL, 0, 1),
            (50, 5, NULL, 0, 1);
        INSERT INTO task (id, sectionID, taskID, text, position) VALUES
            (1, 11, NULL, 't1', 0), (2, 11, 1, 't1a', 0), (3, 11, NULL, 't2', 1), (4, 31, NULL, 'b1', 0), (5, 40, NULL, 'direct', 0);
        INSERT INTO tag (id, workspaceID, name, color, position) VALUES (1, 1, 'urgent', '#ff0000', 0);
        INSERT INTO task_tag (taskID, tagID) VALUES (2, 1);
        INSERT INTO section_group_tag (groupID, tagID) VALUES (1, 1);
        INSERT INTO section_tag (sectionID, tagID) VALUES (11, 1);
    `)
})

describe("moveDBTaskToNote", () => {
    it("moves a task with its subtasks and tags to a section of another note", async () => {
        await moveDBTaskToNote(1, { sectionId: 31, parentTaskId: null }, 0)
        expect(topTasks(31)).toEqual(["t1", "b1"])
        expect(topTasks(11)).toEqual(["t2"])
        // the subtask follows the task: same parent, section of the new note, tag untouched
        expect(rows("SELECT sectionID, taskID FROM task WHERE id = 2")).toEqual([{ sectionID: 31, taskID: 1 }])
        expect(col("SELECT tagID FROM task_tag WHERE taskID = 2")).toEqual([1])
        expect(col("SELECT position FROM task WHERE sectionID = 11 AND taskID IS NULL")).toEqual([0])
    })

    it("moves a task under a task of the other note", async () => {
        await moveDBTaskToNote(3, { sectionId: 31, parentTaskId: 4 }, 0)
        expect(rows("SELECT sectionID, taskID FROM task WHERE id = 3")).toEqual([{ sectionID: 31, taskID: 4 }])
    })

    it("still refuses another note without the option", async () => {
        await expect(moveDBTask(1, { sectionId: 31, parentTaskId: null }, 0)).rejects.toMatchObject({ code: "TASK_MOVE_INVALID" })
    })

    it("refuses a note of another workspace", async () => {
        await expect(moveDBTaskToNote(1, { sectionId: 50, parentTaskId: null }, 0)).rejects.toMatchObject({ code: "TASK_MOVE_INVALID" })
        expect(topTasks(11)).toEqual(["t1", "t2"])
    })
})

describe("moveDBSectionToNote", () => {
    it("a moved section keeps its own tags", async () => {
        await moveDBSectionToNote(11, 4, 0)
        expect(col("SELECT groupID FROM section WHERE id = 11")).toEqual([4])
        expect(col("SELECT tagID FROM section_tag WHERE sectionID = 11")).toEqual([1])
    })

    it("moves a section with its tasks to a group of the other note", async () => {
        await moveDBSectionToNote(12, 3, 0)
        expect(col("SELECT title FROM section WHERE groupID = 3 AND is_default = 0 ORDER BY position, id")).toEqual(["S2", "S1", "Other"])
        expect(col("SELECT title FROM section WHERE groupID = 1 AND is_default = 0 ORDER BY position, id")).toEqual(["S1"])
    })

    it("keeps the tasks of the section and reports a clashing title", async () => {
        await expect(moveDBSectionToNote(11, 3, 0)).rejects.toMatchObject({ code: "SECTION_EXISTS" })
        expect(topTasks(11)).toEqual(["t1", "t2"])
        await moveDBSectionToNote(32, 1, 5)
        expect(col("SELECT groupID FROM section WHERE id = 32")).toEqual([1])
    })

    it("creates a new group in the other note", async () => {
        const { groupId, defaultSectionId } = await moveDBSectionToNewGroupOfNote(12, 2, 1)
        expect(groupsOfNote(2)).toEqual([3, groupId, 4])
        expect(col("SELECT groupID FROM section WHERE id = 12")).toEqual([groupId])
        expect(col(`SELECT groupID FROM section WHERE id = ${defaultSectionId}`)).toEqual([groupId])
        expect(col("SELECT noteID FROM section_group WHERE id = " + groupId)).toEqual([2])
    })
})

describe("moveDBGroupToNote", () => {
    it("moves a group with its sections, tasks, tags and settings and renumbers both notes", async () => {
        await moveDBGroupToNote(1, 2, 1)
        expect(groupsOfNote(2)).toEqual([3, 1, 4])
        expect(groupsOfNote(1)).toEqual([2])
        expect(col("SELECT position FROM section_group WHERE noteID = 1")).toEqual([0])
        expect(rows("SELECT name, color, width FROM section_group WHERE id = 1")).toEqual([{ name: "GA", color: "#112233", width: 300 }])
        expect(topTasks(11)).toEqual(["t1", "t2"])
        expect(col("SELECT groupID FROM section_group_tag")).toEqual([1])
        expect(col("SELECT sectionID FROM section_tag")).toEqual([11])
        expect(col("SELECT taskID FROM task_tag")).toEqual([2])
    })

    it("puts the group at the end for a large index and refuses another workspace", async () => {
        await moveDBGroupToNote(2, 2, 99)
        expect(groupsOfNote(2)).toEqual([3, 4, 2])
        await expect(moveDBGroupToNote(1, 3, 0)).rejects.toMatchObject({ code: "GROUP_MOVE_INVALID" })
        expect(groupsOfNote(1)).toEqual([1])
    })

    it("counts only the visible groups for the index", async () => {
        sqlite.exec("UPDATE section_group SET archived_at = '2026-01-01' WHERE id = 3")
        await moveDBGroupToNote(1, 2, 1)
        // visible: [4] -> index 1 = after group 4; the archived one keeps its place
        expect(groupsOfNote(2)).toEqual([3, 4, 1])
    })
})

describe("copyDBTasksToNote", () => {
    const snapshot = [{
        text: "copy", description: null, completed: false, priority: false, color: null, position: 0,
        tags: [{ name: "Urgent", color: null }],
        subtasks: [{ text: "copy sub", description: null, completed: true, priority: false, color: null, position: 0, subtasks: [] }],
    }]

    it("inserts copies with their subtasks at the index, linking the tag of the workspace by name", async () => {
        const [id] = await copyDBTasksToNote(snapshot, { sectionId: 31, parentTaskId: null }, 0)
        expect(topTasks(31)).toEqual(["copy", "b1"])
        expect(rows(`SELECT text, completed FROM task WHERE taskID = ${id}`)).toEqual([{ text: "copy sub", completed: 1 }])
        expect(col(`SELECT tagID FROM task_tag WHERE taskID = ${id}`)).toEqual([1])
        expect(col("SELECT COUNT(*) FROM tag")).toEqual([1])
    })

    it("leaves the source untouched and can go under a task", async () => {
        const [id] = await copyDBTasksToNote(snapshot, { sectionId: 31, parentTaskId: 4 }, 0)
        expect(col(`SELECT taskID FROM task WHERE id = ${id}`)).toEqual([4])
        expect(topTasks(11)).toEqual(["t1", "t2"])
    })

    it("rejects a missing section", async () => {
        await expect(copyDBTasksToNote(snapshot, { sectionId: 999, parentTaskId: null }, 0)).rejects.toMatchObject({ code: "TASK_MOVE_INVALID" })
    })
})

describe("copyDBSectionToNote", () => {
    it("copies a section with tasks and tags into a group, renaming it when the title is taken", async () => {
        const { sectionId } = await copyDBSectionToNote(11, { type: "group", groupId: 3, index: 1 })
        expect(col("SELECT title FROM section WHERE groupID = 3 AND is_default = 0 ORDER BY position, id")).toEqual(["S1", "S1 (copia)", "Other"])
        expect(topTasks(sectionId)).toEqual(["t1", "t2"])
        const sub = col(`SELECT id FROM task WHERE sectionID = ${sectionId} AND taskID IS NOT NULL`)
        expect(sub).toHaveLength(1)
        expect(col(`SELECT tagID FROM task_tag WHERE taskID = ${sub[0]}`)).toEqual([1])
        // the section keeps its own tag too; the original is untouched
        expect(col(`SELECT tagID FROM section_tag WHERE sectionID = ${sectionId}`)).toEqual([1])
        expect(col("SELECT COUNT(*) FROM section_tag WHERE sectionID = 11")).toEqual([1])
        expect(topTasks(11)).toEqual(["t1", "t2"])
    })

    it("keeps the title when it is free and can create a new group in the note", async () => {
        const { sectionId, groupId } = await copyDBSectionToNote(12, { type: "new-group", noteId: 2, index: 0 })
        expect(groupsOfNote(2)).toEqual([groupId, 3, 4])
        expect(col(`SELECT title FROM section WHERE id = ${sectionId}`)).toEqual(["S2"])
        expect(col(`SELECT groupID FROM section WHERE id = ${sectionId}`)).toEqual([groupId])
        expect(col(`SELECT COUNT(*) FROM section WHERE groupID = ${groupId} AND is_default = 1`)).toEqual([1])
    })
})

describe("copyDBGroupToNote", () => {
    it("copies a group with sections, tasks, subtasks, tags and settings; the original stays", async () => {
        const id = await copyDBGroupToNote(1, 2, 0)
        expect(groupsOfNote(2)).toEqual([id, 3, 4])
        expect(groupsOfNote(1)).toEqual([1, 2])
        expect(rows(`SELECT name, color, width FROM section_group WHERE id = ${id}`)).toEqual([{ name: "GA", color: "#112233", width: 300 }])
        expect(col(`SELECT title FROM section WHERE groupID = ${id} AND is_default = 0 ORDER BY position`)).toEqual(["S1", "S2"])
        expect(col(`SELECT COUNT(*) FROM task WHERE sectionID IN (SELECT id FROM section WHERE groupID = ${id})`)).toEqual([3])
        expect(col(`SELECT COUNT(*) FROM section_group_tag WHERE groupID = ${id}`)).toEqual([1])
        expect(col("SELECT COUNT(*) FROM task_tag")).toEqual([2])
        // the tag of the section of the group and the tag of the group itself are copied
        expect(col(`SELECT COUNT(*) FROM section_tag WHERE sectionID IN (SELECT id FROM section WHERE groupID = ${id})`)).toEqual([1])
        expect(topTasks(11)).toEqual(["t1", "t2"])
    })

    it("refuses another workspace", async () => {
        await expect(copyDBGroupToNote(1, 3, 0)).rejects.toMatchObject({ code: "GROUP_MOVE_INVALID" })
    })
})
