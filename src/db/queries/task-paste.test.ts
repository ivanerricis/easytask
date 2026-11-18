// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"
import type { TemplateTask } from "@/types/template"

// The real SQL on a real SQLite database
let sqlite: DatabaseSync
let failOn: string | null = null

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})
vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    return { invoke: createSqliteInvoke(() => sqlite, { shouldFail: sql => failOn !== null && sql.includes(failOn) }) }
})

import { insertDBTasksAfter } from "./task-paste"

const rows = sqliteRows(() => sqlite)

const snap = (text: string, extra: Partial<TemplateTask> = {}): TemplateTask =>
    ({ text, description: null, completed: false, priority: false, color: null, position: 0, subtasks: [], ...extra })

/** The texts of the living tasks that match a condition, in order. */
const order = (where: string) => rows(`SELECT text FROM task WHERE ${where} AND deleted_at IS NULL ORDER BY position, id`).map(row => row.text)

beforeEach(() => {
    failOn = null
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS');
        INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0);
        INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0);
        INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'S1', 0), (2, 1, 'S2', 1);
        INSERT INTO task (id, sectionID, taskID, text, position) VALUES
            (1, 1, NULL, 'A', 0), (2, 1, NULL, 'B', 1), (3, 1, NULL, 'C', 2), (4, 1, 2, 'B1', 0), (5, 1, 2, 'B2', 1),
            (6, 2, NULL, 'Other section', 0), (7, 1, NULL, 'Trashed', 3);
        UPDATE task SET deleted_at = datetime('now') WHERE id = 7;
        INSERT INTO tag (id, workspaceID, name, color, position) VALUES (1, 1, 'Casa', '#ff0000', 0);
    `)
})

describe("insertDBTasksAfter", () => {
    it("puts the copies right after the task, renumbers the siblings and returns the new ids in order", async () => {
        const ids = await insertDBTasksAfter(1, [snap("X"), snap("Y")])
        expect(order("sectionID = 1 AND taskID IS NULL")).toEqual(["A", "X", "Y", "B", "C"])
        expect(ids).toHaveLength(2)
        expect(rows(`SELECT text FROM task WHERE id IN (${ids.join(",")}) ORDER BY position`).map(row => row.text)).toEqual(["X", "Y"])
        expect(rows("SELECT position FROM task WHERE sectionID = 1 AND taskID IS NULL AND deleted_at IS NULL ORDER BY position").map(row => row.position)).toEqual([0, 1, 2, 3, 4])
        // The other sections are left alone
        expect(order("sectionID = 2")).toEqual(["Other section"])
    })

    it("pasting after a subtask makes siblings of it, in the same section", async () => {
        const [id] = await insertDBTasksAfter(4, [snap("B1b")])
        expect(order("taskID = 2")).toEqual(["B1", "B1b", "B2"])
        expect(rows(`SELECT sectionID, taskID FROM task WHERE id = ${id}`)[0]).toEqual({ sectionID: 1, taskID: 2 })
    })

    it("copies the subtasks at any depth with their fields and the tags by name (new ones are created in the workspace)", async () => {
        await insertDBTasksAfter(3, [snap("P", {
            description: "d", completed: true, priority: true, color: "#00ff00", tags: [{ name: "casa", color: null }, { name: "Nuovo", color: "#0000ff" }],
            subtasks: [snap("P1", { subtasks: [snap("P11")] }), snap("P2")],
        })])
        const p = rows("SELECT * FROM task WHERE text = 'P'")[0]
        expect(p).toMatchObject({ sectionID: 1, taskID: null, description: "d", completed: 1, priority: 1, color: "#00ff00" })
        expect(order(`taskID = ${p.id}`)).toEqual(["P1", "P2"])
        const p1 = rows("SELECT id FROM task WHERE text = 'P1'")[0]
        expect(order(`taskID = ${p1.id}`)).toEqual(["P11"])
        expect(order("sectionID = 1 AND taskID IS NULL")).toEqual(["A", "B", "C", "P"])
        // "casa" is the tag "Casa" of the workspace (case ignored), "Nuovo" is created
        expect(rows(`SELECT t.name FROM task_tag l JOIN tag t ON t.id = l.tagID WHERE l.taskID = ${p.id} ORDER BY t.name`).map(row => row.name)).toEqual(["Casa", "Nuovo"])
        expect(rows("SELECT name, workspaceID, color FROM tag WHERE name = 'Nuovo'")).toEqual([{ name: "Nuovo", workspaceID: 1, color: "#0000ff" }])
        expect(rows("SELECT count(*) AS n FROM tag WHERE workspaceID = 1")[0].n).toBe(2)
    })

    it("fails with TASK_PARENT_MISSING when the task is missing or in the trash, writing nothing", async () => {
        for (const id of [99, 7]) {
            await expect(insertDBTasksAfter(id, [snap("X")])).rejects.toMatchObject({ code: "TASK_PARENT_MISSING" })
        }
        expect(rows("SELECT count(*) AS n FROM task")[0].n).toBe(7)
    })

    it("writes nothing when a statement fails halfway, and nothing for an empty list", async () => {
        expect(await insertDBTasksAfter(1, [])).toEqual([])
        failOn = "UPDATE task SET position"
        await expect(insertDBTasksAfter(1, [snap("X", { subtasks: [snap("X1")] })])).rejects.toBeTruthy()
        expect(rows("SELECT count(*) AS n FROM task")[0].n).toBe(7)
        expect(order("sectionID = 1 AND taskID IS NULL")).toEqual(["A", "B", "C"])
    })
})
