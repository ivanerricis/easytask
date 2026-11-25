// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import type Database from "@tauri-apps/plugin-sql"
import { invoke } from "@tauri-apps/api/core"
import { initDB } from "./initDb"
import { archiveSchema, collapsedSchema, customThemeSchema, groupStructureSchema, initialSchema, mediaFileSchema, noteBackgroundImageSchema, noteBackgroundSchema, sectionOrderSchema, notePageSchema, sectionTagSchema, sectionTaskOrderSchema, taskFileSchema, sectionTitleSchema, tagSchema, groupTagSchema, taskArchiveSchema, taskDueSchema, templateDraftSchema, trashIndexesSchema } from "./schema/initial"
import { automationSchema } from "./schema/automation"
import { addGroupColorColumn } from "./schema/section_group"
import { createWorkspaceEditTriggers } from "./schema/workspace_edit"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

// Runs initDB against a real SQLite database through a minimal adapter of the plugin API (same harness as initDb.test.ts)
let sqlite: DatabaseSync

async function sqliteTransaction(command: string, args?: { statements?: { sql: string }[] }) {
    if (command !== "db_transaction") throw new Error(`Unexpected command ${command}`)
    sqlite.exec("BEGIN")
    try {
        for (const statement of args?.statements ?? []) sqlite.exec(statement.sql)
        sqlite.exec("COMMIT")
        return []
    } catch (error: unknown) {
        try { sqlite.exec("ROLLBACK") } catch { /* already rolled back */ }
        throw error
    }
}

function adapter(): Database {
    return {
        select: async (sql: string, params: SQLInputValue[] = []) => sqlite.prepare(sql).all(...params),
        execute: async (sql: string) => {
            sqlite.exec(sql)
            return { rowsAffected: 0, lastInsertId: 0 }
        },
    } as unknown as Database
}

const pragma = (name: string) => (sqlite.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name]

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(invoke).mockReset().mockImplementation(sqliteTransaction as unknown as typeof invoke)
})

describe("initDB v24 (completion moment of the tasks)", () => {
    const makeV23 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema, ...collapsedSchema, ...templateDraftSchema, ...trashIndexesSchema, ...noteBackgroundSchema, ...customThemeSchema, ...mediaFileSchema, ...tagSchema, ...sectionTaskOrderSchema, ...groupTagSchema, ...noteBackgroundImageSchema, ...sectionTagSchema, ...taskDueSchema, ...notePageSchema, ...taskFileSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 23")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'N');
            INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0);
            INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'S', 0);
            INSERT INTO task (id, sectionID, text, completed, position) VALUES (1, 1, 'Open', 0, 0), (2, 1, 'Done', 1, 1);
            UPDATE task SET edit_date = '2026-03-04', edit_time = '09:15' WHERE id = 2;
        `)
    }
    const moments = () => sqlite.prepare("SELECT id, completed, completed_at FROM task ORDER BY id").all()

    it("adds completed_at: open tasks get NULL, a completed one its last edit moment, and the schema ends up like a new one", async () => {
        makeV23()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(24)
        expect(moments()).toEqual([
            { id: 1, completed: 0, completed_at: null },
            { id: 2, completed: 1, completed_at: "2026-03-04 09:15" },
        ])
        const migrated = sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()
        sqlite = new DatabaseSync(":memory:")
        await initDB(adapter())
        expect(sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()).toEqual(migrated)
        expect(migrated).toContainEqual({ type: "trigger", name: "task_completed_at" })
    })

    it("completing a task stamps it, reopening clears it, and writing the same value again changes nothing", async () => {
        makeV23()
        await initDB(adapter())
        sqlite.exec("UPDATE task SET completed = 1 WHERE id = 1")
        const done = sqlite.prepare("SELECT completed_at FROM task WHERE id = 1").get() as { completed_at: string }
        expect(done.completed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        sqlite.exec("UPDATE task SET completed = 1 WHERE id = 2")
        expect(sqlite.prepare("SELECT completed_at FROM task WHERE id = 2").get()).toEqual({ completed_at: "2026-03-04 09:15" })
        sqlite.exec("UPDATE task SET completed = 0 WHERE id = 1")
        expect(sqlite.prepare("SELECT completed_at FROM task WHERE id = 1").get()).toEqual({ completed_at: null })
    })

    it("is retried safely when the column exists but the version was not bumped", async () => {
        makeV23()
        sqlite.exec("ALTER TABLE task ADD COLUMN completed_at TEXT DEFAULT NULL; UPDATE task SET completed_at = '2026-01-02 03:04' WHERE id = 2")
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(24)
        expect(moments()).toEqual([
            { id: 1, completed: 0, completed_at: null },
            { id: 2, completed: 1, completed_at: "2026-01-02 03:04" },
        ])
    })
})
