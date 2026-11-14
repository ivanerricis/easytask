// @vitest-environment node
/// <reference types="node" />
import { sectionTitleSchema } from "./schema/initial"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import type Database from "@tauri-apps/plugin-sql"
import { createMockDb, type MockDb } from "@/test/db-mock"
import { createRecordingInvoke } from "@/test/db-mock"
import { invoke } from "@tauri-apps/api/core"
import { initDB, legacyDbMessage, newerDbMessage } from "./initDb"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

/** Fake of the `db_transaction` command on the test database: like the real one it runs multi-statement SQL and rolls back on the first error. */
async function sqliteTransaction(command: string, args?: { statements?: { sql: string }[] }) {
    if (command !== "db_transaction") throw new Error(`Unexpected command ${command}`)
    sqlite.exec("BEGIN")
    try {
        (args?.statements ?? []).forEach((statement, index) => {
            try {
                sqlite.exec(statement.sql)
            } catch (error: unknown) {
                throw `statement ${index} failed: ${error instanceof Error ? error.message : String(error)}`
            }
        })
        sqlite.exec("COMMIT")
        return []
    } catch (error: unknown) {
        try { sqlite.exec("ROLLBACK") } catch { /* already rolled back */ }
        throw error
    }
}
import { APPLICATION_ID, archiveSchema, collapsedSchema, customThemeSchema, groupStructureSchema, initialSchema, latestSchema, mediaFileSchema, noteBackgroundSchema, tagSchema, sectionOrderSchema, taskArchiveSchema, templateDraftSchema, trashIndexesSchema } from "./schema/initial"
import { automationSchema } from "./schema/automation"
import { addGroupColorColumn } from "./schema/section_group"
import { createWorkspaceEditTriggers } from "./schema/workspace_edit"
import { WORKSPACE_EDIT_COLUMNS } from "./schema/collapsed"

// Runs initDB against a real SQLite database through a minimal adapter of the plugin API
let sqlite: DatabaseSync

function adapter(): Database {
    return {
        select: async (sql: string, params: SQLInputValue[] = []) => sqlite.prepare(sql).all(...params),
        execute: async (sql: string) => {
            sqlite.exec(sql)
            return { rowsAffected: 0, lastInsertId: 0 }
        },
    } as unknown as Database
}

const names = (type: "table" | "index" | "trigger") =>
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name").all(type) as { name: string }[])
        .map(r => r.name)

const pragma = (name: string) => (sqlite.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name]

const columns = (table: string) =>
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name)

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(invoke).mockReset().mockImplementation(sqliteTransaction as unknown as typeof invoke)
})

describe("initDB final schema", () => {
    beforeEach(async () => {
        await initDB(adapter())
    })

    it("sets user_version to 16 and the application id", () => {
        expect(pragma("user_version")).toBe(16)
        expect(pragma("application_id")).toBe(APPLICATION_ID)
    })

    it("creates the expected tables", () => {
        expect(names("table")).toEqual([
            "audio_file", "automation", "custom_themes", "folder", "media_file", "note", "note_template", "section", "section_group", "tag", "task", "task_tag", "workspace",
        ])
    })

    it("creates the expected indexes", () => {
        const explicit = names("index").filter(n => n.startsWith("idx_"))
        const base = [
            "idx_audio_file_group", "idx_automation_note",
            "idx_folder_name", "idx_folder_parent", "idx_folder_workspace_parent", "idx_media_file_group",
            "idx_note_name", "idx_note_parent", "idx_note_template_draft", "idx_note_template_name", "idx_note_template_source",
            "idx_note_template_workspace", "idx_note_workspace_parent",
            "idx_section_default", "idx_section_group_note", "idx_section_parent", "idx_section_title", "idx_tag_workspace", "idx_task_tag_tag",
            "idx_task_parent", "idx_task_section",
            "idx_workspace_name",
        ]
        // v12: partial indexes of the trash and the archive
        const trashAndArchive = [
            "idx_audio_file_deleted_at", "idx_folder_archived_at", "idx_folder_deleted_at", "idx_media_file_deleted_at", "idx_note_archived_at", "idx_note_deleted_at",
            "idx_note_template_deleted_at", "idx_section_archived_at", "idx_section_deleted_at", "idx_section_group_archived_at", "idx_section_group_deleted_at",
            "idx_task_archived_at", "idx_task_deleted_at", "idx_workspace_deleted_at",
        ]
        expect(explicit).toEqual([...base, ...trashAndArchive].sort())
    })

    it("creates the edit timestamp triggers", () => {
        expect(names("trigger")).toEqual([
            "update_folder_edit_timestamp", "update_note_edit_timestamp", "update_note_template_edit_timestamp",
            "update_section_edit_timestamp", "update_task_edit_timestamp", "update_workspace_edit_timestamp",
            ...["audio_file", "folder", "media_file", "note", "note_template", "section", "section_group", "tag", "task", "task_tag"]
                .flatMap(t => ["delete", "insert", "update"].map(e => `workspace_edit_on_${t}_${e}`)),
        ].sort())
    })

    it("has the soft delete and ordering columns", () => {
        for (const t of ["workspace", "folder", "note", "section_group", "section", "task", "audio_file", "media_file", "note_template"])
            expect(columns(t)).toContain("deleted_at")
        for (const t of ["folder", "note", "section_group", "section", "task", "audio_file", "media_file"])
            expect(columns(t)).toContain("position")
        expect(columns("section_group")).toContain("name")
    })

    it("allows the name of a trashed item to be reused but not a duplicate among live ones", () => {
        sqlite.exec("INSERT INTO workspace (id, name) VALUES (1, 'WS')")
        expect(() => sqlite.exec("INSERT INTO workspace (name) VALUES ('WS')")).toThrow(/UNIQUE/)
        sqlite.exec("UPDATE workspace SET deleted_at = '2024-01-01' WHERE id = 1")
        expect(() => sqlite.exec("INSERT INTO workspace (name) VALUES ('WS')")).not.toThrow()
    })

    it("updates the edit timestamp only when a content column changes", () => {
        sqlite.exec("INSERT INTO workspace (id, name, edit_date, edit_time) VALUES (1, 'WS', '2000-01-01', '00:00')")
        sqlite.exec("UPDATE workspace SET deleted_at = '2024-01-01' WHERE id = 1")
        expect(sqlite.prepare("SELECT edit_date FROM workspace").get()).toEqual({ edit_date: "2000-01-01" })
        sqlite.exec("UPDATE workspace SET name = 'Renamed' WHERE id = 1")
        expect(sqlite.prepare("SELECT edit_date FROM workspace").get()).not.toEqual({ edit_date: "2000-01-01" })
    })

    it("has consistent foreign keys", () => {
        expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    })
})

describe("initDB behaviour", () => {
    it("is idempotent when called twice", async () => {
        await initDB(adapter())
        const snapshot = sqlite.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all()
        sqlite.exec("INSERT INTO workspace (id, name) VALUES (1, 'WS')")
        await initDB(adapter())
        expect(sqlite.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all()).toEqual(snapshot)
        expect(sqlite.prepare("SELECT name FROM workspace").all()).toEqual([{ name: "WS" }])
        expect(pragma("user_version")).toBe(16)
    })

    it("does not execute anything when already at the latest version", async () => {
        const db: MockDb = createMockDb()
        db.select.mockResolvedValueOnce([{ user_version: 16 }]).mockResolvedValueOnce([{ application_id: APPLICATION_ID }])
        await initDB(db as unknown as Database)
        expect(db.execute).not.toHaveBeenCalled()
    })

    it("applies every migration with its version bump in one transaction, or inside its own transaction script", async () => {
        const db: MockDb = createMockDb()
        db.select.mockResolvedValueOnce([{ user_version: 0 }])
        const recorder = createRecordingInvoke()
        vi.mocked(invoke).mockImplementation(recorder.invoke as unknown as typeof invoke)
        await initDB(db as unknown as Database)
        const plain = [
            [1, initialSchema], [2, [addGroupColorColumn]], [3, createWorkspaceEditTriggers], [4, archiveSchema], [5, automationSchema], [6, taskArchiveSchema],
            [8, groupStructureSchema], [11, templateDraftSchema], [12, trashIndexesSchema], [13, noteBackgroundSchema], [14, customThemeSchema], [15, mediaFileSchema], [16, tagSchema],
        ] as const
        expect(recorder.calls.map(call => call.map(s => s.sql))).toEqual(plain.map(([version, queries]) => [...queries, `PRAGMA user_version = ${version}`]))
        // v7, v9 and v10 are scripts with their own transaction: the bump is written inside, right before the COMMIT, and never separately
        const executed = db.execute.mock.calls.map(c => String(c[0]))
        for (const [version, queries] of [[7, sectionTitleSchema], [9, sectionOrderSchema], [10, collapsedSchema]] as const) {
            const script = queries.find(q => /BEGIN IMMEDIATE/.test(q))!
            expect(executed).toContain(`${script.slice(0, script.lastIndexOf("COMMIT;"))}PRAGMA user_version = ${version};\n    COMMIT;${script.slice(script.lastIndexOf("COMMIT;") + 7)}`)
        }
        expect(executed.some(sql => sql.startsWith("PRAGMA user_version"))).toBe(false)
    })

    it("treats an empty PRAGMA result as a fresh database", async () => {
        const db: MockDb = createMockDb()
        db.select.mockResolvedValueOnce([])
        const recorder = createRecordingInvoke()
        vi.mocked(invoke).mockImplementation(recorder.invoke as unknown as typeof invoke)
        await initDB(db as unknown as Database)
        expect(recorder.calls[0].at(-1)?.sql).toBe("PRAGMA user_version = 1")
        expect(recorder.calls.at(-1)?.at(-1)?.sql).toBe("PRAGMA user_version = 16")
    })

    it("refuses a legacy database (user_version > 0 without the application id) and leaves it untouched", async () => {
        for (const version of [1, 2, 9]) {
            const db: MockDb = createMockDb()
            db.select.mockResolvedValueOnce([{ user_version: version }]).mockResolvedValueOnce([{ application_id: 0 }])
            await expect(initDB(db as unknown as Database)).rejects.toThrow(legacyDbMessage())
            expect(db.execute).not.toHaveBeenCalled()
        }
    })

    it("refuses a real legacy database file without modifying it", async () => {
        sqlite.exec("CREATE TABLE workspace (id INTEGER PRIMARY KEY, name TEXT); PRAGMA user_version = 9")
        await expect(initDB(adapter())).rejects.toThrow(/elimina il file/)
        expect(names("table")).toEqual(["workspace"])
        expect(pragma("user_version")).toBe(9)
    })

    it("refuses a database of a newer version", async () => {
        const db: MockDb = createMockDb()
        db.select.mockResolvedValueOnce([{ user_version: 17 }]).mockResolvedValueOnce([{ application_id: APPLICATION_ID }])
        await expect(initDB(db as unknown as Database)).rejects.toThrow(newerDbMessage())
        expect(db.execute).not.toHaveBeenCalled()
    })

    it("rethrows on failure and does not bump the version", async () => {
        const db: MockDb = createMockDb()
        db.select.mockResolvedValueOnce([{ user_version: 0 }])
        const recorder = createRecordingInvoke({ error: "statement 2 failed: syntax error" })
        vi.mocked(invoke).mockImplementation(recorder.invoke as unknown as typeof invoke)
        await expect(initDB(db as unknown as Database)).rejects.toMatchObject({ message: "statement 2 failed: syntax error", statementIndex: 2 })
        expect(recorder.calls).toHaveLength(1)
        expect(db.execute).not.toHaveBeenCalled()
        expect(console.error).toHaveBeenCalled()
    })

    it("propagates a failing PRAGMA read", async () => {
        const db: MockDb = createMockDb()
        db.select.mockRejectedValueOnce(new Error("no pragma"))
        await expect(initDB(db as unknown as Database)).rejects.toThrow("no pragma")
        expect(db.execute).not.toHaveBeenCalled()
    })
})

describe("initDB v2 (group color)", () => {
    const groupInfo = () => (sqlite.prepare("PRAGMA table_info(section_group)").all() as { name: string, notnull: number, dflt_value: unknown }[])
        .find(c => c.name === "color")

    // A real v1 database: the initial schema only, with data
    const makeV1 = () => {
        for (const q of initialSchema) sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 1")
        sqlite.exec(`INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0);
            INSERT INTO section_group (id, noteID, position, name) VALUES (1, 1, 0, 'Idee')`)
    }

    it("adds a nullable color column with a non empty check on a new database", async () => {
        await initDB(adapter())
        expect(columns("section_group")).toContain("color")
        expect(groupInfo()).toMatchObject({ notnull: 0, dflt_value: "NULL" })
        sqlite.exec("INSERT INTO workspace (id, name) VALUES (1, 'WS'); INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0)")
        expect(() => sqlite.exec("INSERT INTO section_group (noteID, position, color) VALUES (1, 0, '')")).toThrow(/CHECK/)
        expect(() => sqlite.exec("INSERT INTO section_group (noteID, position, color) VALUES (1, 1, '#fff')")).not.toThrow()
    })

    it("migrates a real v1 database to v2 preserving its data and application id", async () => {
        makeV1()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(pragma("application_id")).toBe(APPLICATION_ID)
        expect(sqlite.prepare("SELECT id, name, color FROM section_group").all()).toEqual([{ id: 1, name: "Idee", color: null }])
        expect(sqlite.prepare("SELECT name FROM note").all()).toEqual([{ name: "N" }])
        expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    })

    it("a v1 and a fresh database end up with the same columns", async () => {
        makeV1()
        await initDB(adapter())
        expect(columns("section_group")).toEqual(["id", "noteID", "position", "deleted_at", "name", "color", "archived_at", "width", "collapsed"])
    })

    it("retries safely when the column exists but the version was not bumped", async () => {
        makeV1()
        sqlite.exec("ALTER TABLE section_group ADD COLUMN color TEXT CHECK (LENGTH(color) > 0) DEFAULT NULL")
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(16)
    })

    it("still fails on other ALTER errors", async () => {
        const db: MockDb = createMockDb()
        db.select.mockResolvedValueOnce([{ user_version: 1 }]).mockResolvedValueOnce([{ application_id: APPLICATION_ID }])
        vi.mocked(invoke).mockRejectedValue("statement 0 failed: disk full")
        await expect(initDB(db as unknown as Database)).rejects.toThrow("disk full")
        expect(db.execute).not.toHaveBeenCalled()
    })
})

describe("initDB v3 (workspace edit triggers)", () => {
    const setup = () => sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS'), (2, 'Other');
        INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0);
        INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0);
        INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'S', 0);
        INSERT INTO audio_file (name, section_groupID, path, position) VALUES ('a', 1, 'p', 0);
    `)
    const old = () => sqlite.exec("UPDATE workspace SET edit_date='2000-01-01', edit_time='00:00'")
    const edit = (id: number) => sqlite.prepare("SELECT edit_date d, edit_time t FROM workspace WHERE id = ?").get(id) as { d: string, t: string }
    const touched = (id: number) => edit(id).d !== "2000-01-01"

    it("insert, update, soft delete and delete of a task or subtask bump only the owning workspace", async () => {
        await initDB(adapter())
        setup()
        const steps = [
            "INSERT INTO task (id, sectionID, text) VALUES (1, 1, 't')",
            "INSERT INTO task (id, sectionID, taskID, text) VALUES (2, 1, 1, 'sub')",
            "UPDATE task SET text = 'x' WHERE id = 1",
            "UPDATE task SET deleted_at = '2025-01-01' WHERE id = 2",
            "DELETE FROM task WHERE id = 2",
        ]
        for (const q of steps) {
            old()
            sqlite.exec(q)
            expect(touched(1), q).toBe(true)
            expect(edit(1).t).toMatch(/^[0-9]{2}:[0-9]{2}$/)
            expect(touched(2), q).toBe(false)
        }
    })

    it("every table bumps its workspace", async () => {
        await initDB(adapter())
        setup()
        const qs = [
            "INSERT INTO folder (id, workspaceID, name, position) VALUES (1, 1, 'F', 0)",
            "UPDATE folder SET position = 3 WHERE id = 1",
            "DELETE FROM folder WHERE id = 1",
            "INSERT INTO note_template (id, workspaceID, name, content) VALUES (1, 1, 'T', '{}')",
            "UPDATE note_template SET deleted_at = '2025-01-01' WHERE id = 1",
            "DELETE FROM note_template WHERE id = 1",
            "UPDATE note SET position = 4 WHERE id = 1",
            "INSERT INTO section_group (noteID, position) VALUES (1, 1)",
            "UPDATE section_group SET position = 5 WHERE id = 1",
            "INSERT INTO section (groupID, title, position) VALUES (1, 'S2', 1)",
            "UPDATE section SET position = 2 WHERE id = 1",
            "INSERT INTO audio_file (name, section_groupID, path, position) VALUES ('b', 1, 'p', 1)",
            "UPDATE audio_file SET position = 7 WHERE name = 'a'",
            "DELETE FROM audio_file WHERE name = 'b'",
            "DELETE FROM section WHERE title = 'S2'",
            "DELETE FROM section_group WHERE position = 1",
        ]
        for (const q of qs) {
            old()
            sqlite.exec(q)
            expect(touched(1), q).toBe(true)
            expect(touched(2), q).toBe(false)
        }
    })

    it("moving a note to another workspace bumps both", async () => {
        await initDB(adapter())
        setup()
        old()
        sqlite.exec("UPDATE note SET workspaceID = 2 WHERE id = 1")
        expect(touched(1)).toBe(true)
        expect(touched(2)).toBe(true)
    })

    it("deleting a whole workspace (cascade) works", async () => {
        await initDB(adapter())
        setup()
        sqlite.exec("INSERT INTO task (sectionID, text) VALUES (1, 't')")
        expect(() => sqlite.exec("DELETE FROM workspace WHERE id = 1")).not.toThrow()
    })

    it("a v2 database gets the triggers once on migration", async () => {
        for (const q of [...initialSchema, addGroupColorColumn]) sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 2")
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(names("trigger").filter(n => n.startsWith("workspace_edit_on_"))).toHaveLength(30)
    })
})

describe("initDB beforeMigrate", () => {
    const latest = 16

    it("is not called for a new database", async () => {
        const beforeMigrate = vi.fn()
        await initDB(adapter(), { beforeMigrate })
        expect(beforeMigrate).not.toHaveBeenCalled()
        expect(pragma("user_version")).toBe(latest)
    })

    it("is not called when the database is already up to date", async () => {
        await initDB(adapter())
        const beforeMigrate = vi.fn()
        await initDB(adapter(), { beforeMigrate })
        expect(beforeMigrate).not.toHaveBeenCalled()
    })

    it("is called once, before anything changes, for an existing database that needs migrating", async () => {
        sqlite.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
        for (const query of initialSchema) sqlite.exec(query)
        sqlite.exec("PRAGMA user_version = 1")
        let versionSeen = -1
        const beforeMigrate = vi.fn(async () => { versionSeen = pragma("user_version") })
        const db = adapter()
        await initDB(db, { beforeMigrate })
        expect(beforeMigrate).toHaveBeenCalledTimes(1)
        expect(beforeMigrate).toHaveBeenCalledWith(db, 1, latest)
        expect(versionSeen).toBe(1)
        expect(pragma("user_version")).toBe(latest)
    })

    it("a rejection stops the migration", async () => {
        sqlite.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
        for (const query of initialSchema) sqlite.exec(query)
        sqlite.exec("PRAGMA user_version = 1")
        await expect(initDB(adapter(), { beforeMigrate: async () => { throw new Error("no space") } })).rejects.toThrow("no space")
        expect(pragma("user_version")).toBe(1)
    })
})

describe("initDB v4 (archive)", () => {
    // A real v3 database with data, including the flags and the names that v4 has to deal with
    const makeV3 = () => {
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers]) sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 3")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO folder (id, workspaceID, name) VALUES (1, 1, 'F');
            INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0);
            INSERT INTO section_group (id, noteID, position, name) VALUES (1, 1, 0, 'G');
            INSERT INTO section (id, groupID, title, archived, position) VALUES (1, 1, 'S', 1, 0);
            INSERT INTO task (id, sectionID, text, archived) VALUES (1, 1, 'T', 1);
        `)
    }
    const sqlOf = (name: string) => (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(name) as { sql: string }).sql

    it("adds archived_at to folder, note, section_group and section, and drops the old archived flags", async () => {
        makeV3()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        for (const t of ["folder", "note", "section_group", "section"]) expect(columns(t)).toContain("archived_at")
        // The old `archived` flag is gone; v6 adds the archive date to the tasks
        expect(columns("task")).not.toContain("archived")
        expect(columns("task")).toContain("archived_at")
        expect(columns("section")).not.toContain("archived")
        expect(columns("task")).not.toContain("archived")
        expect(sqlite.prepare("SELECT archived_at FROM section WHERE is_default = 0").all()).toEqual([{ archived_at: null }])
    })

    it("keeps the data, the foreign keys and the application id", async () => {
        makeV3()
        await initDB(adapter())
        expect(sqlite.prepare("SELECT title FROM section WHERE is_default = 0").all()).toEqual([{ title: "S" }])
        expect(sqlite.prepare("SELECT text FROM task").all()).toEqual([{ text: "T" }])
        expect(sqlite.prepare("SELECT name FROM folder").all()).toEqual([{ name: "F" }])
        expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([])
        expect(pragma("application_id")).toBe(APPLICATION_ID)
    })

    it("recreates the edit triggers without the removed column and they still work", async () => {
        makeV3()
        await initDB(adapter())
        expect(sqlOf("update_section_edit_timestamp")).not.toMatch(/archived/)
        expect(sqlOf("update_task_edit_timestamp")).not.toMatch(/archived/)
        for (const [table, set] of [["section", "title = 'X'"], ["task", "text = 'X'"]] as const) {
            sqlite.exec(`UPDATE ${table} SET edit_date = '2000-01-01', edit_time = '00:00'`)
            sqlite.exec(`UPDATE ${table} SET ${set} WHERE id = 1`)
            expect(sqlite.prepare(`SELECT edit_date FROM ${table} WHERE id = 1`).get(), table).not.toEqual({ edit_date: "2000-01-01" })
        }
        // archiving is not a content edit
        sqlite.exec("UPDATE section SET edit_date = '2000-01-01'")
        sqlite.exec("UPDATE section SET archived_at = datetime('now')")
        expect(sqlite.prepare("SELECT edit_date FROM section").get()).toEqual({ edit_date: "2000-01-01" })
    })

    it("keeps the workspace edit triggers (the workspace is touched when something is archived)", async () => {
        makeV3()
        await initDB(adapter())
        sqlite.exec("UPDATE workspace SET edit_date = '2000-01-01'")
        sqlite.exec("UPDATE note SET archived_at = datetime('now')")
        expect(sqlite.prepare("SELECT edit_date FROM workspace").get()).not.toEqual({ edit_date: "2000-01-01" })
    })

    it("the unique names ignore the archived (and trashed) items", async () => {
        await initDB(adapter())
        sqlite.exec(`INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO folder (id, workspaceID, name) VALUES (1, 1, 'A');
            INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'A');
            INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0);
            INSERT INTO section (id, groupID, title) VALUES (1, 1, 'A')`)
        const inserts = [
            "INSERT INTO folder (workspaceID, name) VALUES (1, 'A')",
            "INSERT INTO note (workspaceID, name) VALUES (1, 'A')",
            "INSERT INTO section (groupID, title) VALUES (1, 'A')",
        ]
        for (const q of inserts) expect(() => sqlite.exec(q), q).toThrow(/UNIQUE/)
        for (const t of ["folder", "note", "section"]) sqlite.exec(`UPDATE ${t} SET archived_at = datetime('now') WHERE id = 1`)
        for (const q of inserts) expect(() => sqlite.exec(q), q).not.toThrow()
        // the unarchive conflicts with the new live item
        for (const t of ["folder", "note", "section"])
            expect(() => sqlite.exec(`UPDATE ${t} SET archived_at = NULL WHERE id = 1`), t).toThrow(/UNIQUE/)
    })

    it("a migrated and a fresh database have the same schema", async () => {
        await initDB(adapter())
        const fresh = sqlite.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all()
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        makeV3()
        await initDB(adapter())
        expect(sqlite.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all()).toEqual(fresh)
    })

    it("latestSchema builds the same schema as the migrations", async () => {
        await initDB(adapter())
        const migrated = sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY type, name").all()
        sqlite = new DatabaseSync(":memory:")
        for (const q of latestSchema) sqlite.exec(q)
        expect(sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY type, name").all()).toEqual(migrated)
        expect(columns("section")).toContain("archived_at")
        expect(columns("section")).not.toContain("archived")
    })

    it("retries safely when a previous run was interrupted after dropping the columns", async () => {
        makeV3()
        sqlite.exec("DROP TRIGGER update_section_edit_timestamp; DROP TRIGGER update_task_edit_timestamp")
        sqlite.exec("ALTER TABLE section ADD COLUMN archived_at TEXT DEFAULT NULL")
        sqlite.exec("ALTER TABLE section DROP COLUMN archived")
        sqlite.exec("ALTER TABLE task DROP COLUMN archived")
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(16)
        expect(names("trigger")).toContain("update_task_edit_timestamp")
        expect(names("trigger")).toContain("update_section_edit_timestamp")
        expect(columns("folder")).toContain("archived_at")
    })
})

describe("initDB v7 (optional section title)", () => {
    // A real v6 database with a section and its tasks: the rebuild of the section table must not lose them
    const makeV6 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 6")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'N');
            INSERT INTO section_group (id, noteID, name, position) VALUES (1, 1, 'G', 0);
            INSERT INTO section (id, groupID, title, color) VALUES (1, 1, 'S1', '#ff0000'), (2, 1, 'S2', NULL);
            INSERT INTO task (id, sectionID, text) VALUES (1, 1, 'T1'), (2, 1, 'T2'), (3, 2, 'T3');
            INSERT INTO task (id, taskID, text) VALUES (4, 1, 'sub');
        `)
    }

    it("keeps the sections and their tasks, and the foreign keys keep working", async () => {
        makeV6()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(sqlite.prepare("SELECT id, title, color FROM section WHERE is_default = 0 ORDER BY id").all()).toEqual([
            { id: 1, title: "S1", color: "#ff0000" }, { id: 2, title: "S2", color: null },
        ])
        expect(sqlite.prepare("SELECT COUNT(*) AS c FROM task").get()).toEqual({ c: 4 })
        expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([])
        expect(pragma("foreign_keys")).toBe(1)
        sqlite.exec("DELETE FROM section WHERE id = 2")
        expect(sqlite.prepare("SELECT COUNT(*) AS c FROM task").get()).toEqual({ c: 3 })
    })

    it("allows sections without a title (several in a group) but not a blank one, and the titles stay unique", async () => {
        makeV6()
        await initDB(adapter())
        expect(() => sqlite.exec("INSERT INTO section (groupID) VALUES (1), (1)")).not.toThrow()
        expect(() => sqlite.exec("INSERT INTO section (groupID, title) VALUES (1, '')")).toThrow()
        expect(() => sqlite.exec("INSERT INTO section (groupID, title) VALUES (1, 'S1')")).toThrow(/UNIQUE/)
    })

    it("keeps the triggers: editing a section or a task still refreshes the workspace", async () => {
        makeV6()
        await initDB(adapter())
        sqlite.exec("UPDATE workspace SET edit_date = '2000-01-01'")
        sqlite.exec("UPDATE section SET color = '#00ff00' WHERE id = 1")
        expect(sqlite.prepare("SELECT edit_date FROM workspace").get()).not.toEqual({ edit_date: "2000-01-01" })
        sqlite.exec("UPDATE workspace SET edit_date = '2000-01-01'")
        sqlite.exec("UPDATE task SET text = 'X' WHERE id = 1")
        expect(sqlite.prepare("SELECT edit_date FROM workspace").get()).not.toEqual({ edit_date: "2000-01-01" })
    })

    it("rolls back when it fails halfway: the section table, its rows and the triggers are still there", async () => {
        makeV6()
        // A view with the name of the scratch table makes the script fail after it has dropped the task triggers
        sqlite.exec("CREATE VIEW section_new AS SELECT 1 AS x")
        const triggersBefore = names("trigger")
        await expect(initDB(adapter())).rejects.toThrow()
        expect(pragma("user_version")).toBe(6)
        expect(sqlite.prepare("SELECT COUNT(*) AS c FROM section").get()).toEqual({ c: 2 })
        expect(sqlite.prepare("SELECT COUNT(*) AS c FROM task").get()).toEqual({ c: 4 })
        expect(names("trigger")).toEqual(triggersBefore)
    })
})

describe("initDB v8 (default section, group width)", () => {
    // A real v7 database: a workspace with a live, a trashed and an archived group, one of them already holding sections and tasks
    const makeV7 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 7")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS'), (2, 'Other');
            INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0), (2, 2, 'M', 0);
            INSERT INTO section_group (id, noteID, name, position) VALUES (1, 1, 'G', 0), (2, 1, 'Trashed', 1), (3, 2, 'Archived', 0);
            UPDATE section_group SET deleted_at = '2024-01-01' WHERE id = 2;
            UPDATE section_group SET archived_at = '2024-01-01' WHERE id = 3;
            INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'S1', 0), (2, 1, NULL, 1);
            INSERT INTO task (id, sectionID, text) VALUES (1, 1, 'T1');
            UPDATE workspace SET edit_date = '2000-01-01', edit_time = '00:00';
        `)
    }
    const defaults = () => sqlite.prepare("SELECT groupID, title, position, is_default FROM section WHERE is_default = 1 ORDER BY groupID").all()
    const editDates = () => sqlite.prepare("SELECT id, edit_date, edit_time FROM workspace ORDER BY id").all()
    const master = () => sqlite.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all()

    it("creates exactly one default section per group, trashed and archived groups included", async () => {
        makeV7()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(defaults()).toEqual([1, 2, 3].map(groupID => ({ groupID, title: null, position: 0, is_default: 1 })))
        expect(sqlite.prepare("SELECT COUNT(*) AS c FROM section").get()).toEqual({ c: 5 })
        expect(sqlite.prepare("SELECT title FROM section WHERE is_default = 0 ORDER BY id").all()).toEqual([{ title: "S1" }, { title: null }])
        expect(sqlite.prepare("SELECT COUNT(*) AS c FROM task").get()).toEqual({ c: 1 })
        expect(sqlite.prepare("SELECT width FROM section_group").all()).toEqual([{ width: null }, { width: null }, { width: null }])
        expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    })

    it("running the migration again creates no duplicates", async () => {
        makeV7()
        await initDB(adapter())
        // the version was not bumped: the columns exist already and the backfill adds nothing
        sqlite.exec("PRAGMA user_version = 7")
        await initDB(adapter())
        expect(defaults()).toHaveLength(3)
        expect(sqlite.prepare("SELECT COUNT(*) AS c FROM section").get()).toEqual({ c: 5 })
    })

    it("does not change the edit date of the workspaces", async () => {
        makeV7()
        await initDB(adapter())
        expect(editDates()).toEqual([{ id: 1, edit_date: "2000-01-01", edit_time: "00:00" }, { id: 2, edit_date: "2000-01-01", edit_time: "00:00" }])
    })

    it("allows only one default section per group", async () => {
        makeV7()
        await initDB(adapter())
        expect(() => sqlite.exec("INSERT INTO section (groupID, title, is_default) VALUES (1, NULL, 1)")).toThrow(/UNIQUE/)
        // another group may have its own, and any number of normal sections can coexist with it
        sqlite.exec("INSERT INTO section_group (id, noteID, position) VALUES (4, 1, 2)")
        expect(() => sqlite.exec("INSERT INTO section (groupID, title, is_default) VALUES (4, NULL, 1)")).not.toThrow()
        expect(() => sqlite.exec("INSERT INTO section (groupID, title) VALUES (4, NULL), (4, NULL)")).not.toThrow()
    })

    it("recreates the workspace insert trigger: a new section still refreshes the workspace", async () => {
        makeV7()
        await initDB(adapter())
        expect(names("trigger")).toContain("workspace_edit_on_section_insert")
        sqlite.exec("INSERT INTO section (groupID, title) VALUES (1, 'New')")
        expect(sqlite.prepare("SELECT edit_date FROM workspace WHERE id = 1").get()).not.toEqual({ edit_date: "2000-01-01" })
        expect(sqlite.prepare("SELECT edit_date FROM workspace WHERE id = 2").get()).toEqual({ edit_date: "2000-01-01" })
    })

    it("recovers when a previous run stopped with the trigger dropped", async () => {
        makeV7()
        sqlite.exec("ALTER TABLE section ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE; DROP TRIGGER workspace_edit_on_section_insert")
        await initDB(adapter())
        expect(names("trigger")).toContain("workspace_edit_on_section_insert")
        expect(defaults()).toHaveLength(3)
    })

    it("adds the width column with a positive check", async () => {
        makeV7()
        await initDB(adapter())
        expect(() => sqlite.exec("UPDATE section_group SET width = 320 WHERE id = 1")).not.toThrow()
        expect(() => sqlite.exec("UPDATE section_group SET width = 0 WHERE id = 1")).toThrow(/CHECK/)
        expect(() => sqlite.exec("UPDATE section_group SET width = NULL WHERE id = 1")).not.toThrow()
    })

    it("a migrated and a fresh database have the same schema", async () => {
        await initDB(adapter())
        const fresh = master()
        makeV7()
        await initDB(adapter())
        expect(master()).toEqual(fresh)
        expect(columns("section")).toContain("is_default")
        expect(columns("section_group")).toContain("width")
        sqlite = new DatabaseSync(":memory:")
        for (const q of latestSchema) sqlite.exec(q)
        expect(master()).toEqual(fresh)
    })
})

describe("initDB v9 (shared order of the default section and the sections)", () => {
    // A real v8 database: group 1 (live) has the default section, two sections and a trashed and an archived one, all at the old positions
    const makeV8 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 8")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS'), (2, 'Other');
            INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0), (2, 2, 'M', 0);
            INSERT INTO section_group (id, noteID, name, position) VALUES (1, 1, 'G', 0), (2, 2, 'H', 0);
            INSERT INTO section (id, groupID, title, position, is_default) VALUES
                (10, 1, NULL, 0, 1), (11, 1, 'B', 0, 0), (12, 1, 'A', 1, 0), (13, 1, 'Trashed', 2, 0), (14, 1, 'Archived', 3, 0), (15, 1, 'Last', 4, 0),
                (20, 2, NULL, 0, 1);
            UPDATE section SET deleted_at = '2024-01-01' WHERE id = 13;
            UPDATE section SET archived_at = '2024-01-01' WHERE id = 14;
            INSERT INTO task (id, sectionID, text) VALUES (1, 10, 'Direct'), (2, 11, 'In B'), (3, 12, 'In A');
            UPDATE task SET edit_date = '2000-01-01', edit_time = '00:00';
            UPDATE section SET edit_date = '2000-01-01', edit_time = '00:00';
            UPDATE workspace SET edit_date = '2000-01-01', edit_time = '00:00';
        `)
    }
    const order = (groupId: number) => sqlite.prepare("SELECT id, position FROM section WHERE groupID = ? ORDER BY position, id").all(groupId)
    const dates = () => sqlite.prepare(`
        SELECT 'w' AS t, id, edit_date, edit_time FROM workspace UNION ALL
        SELECT 's', id, edit_date, edit_time FROM section UNION ALL
        SELECT 't', id, edit_date, edit_time FROM task ORDER BY 1, 2`).all()
    const master = () => sqlite.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all()

    it("puts the default section at 0 and the sections after it in their old order, trash and archive included", async () => {
        makeV8()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(order(1)).toEqual([
            { id: 10, position: 0 }, { id: 11, position: 1 }, { id: 12, position: 2 }, { id: 13, position: 3 }, { id: 14, position: 4 }, { id: 15, position: 5 },
        ])
        expect(order(2)).toEqual([{ id: 20, position: 0 }])
        expect(sqlite.prepare("SELECT COUNT(*) AS c FROM section WHERE deleted_at IS NOT NULL OR archived_at IS NOT NULL").get()).toEqual({ c: 2 })
    })

    it("keeps the tasks, their sections and every edit date", async () => {
        makeV8()
        const tasks = () => sqlite.prepare("SELECT id, sectionID, text, position FROM task ORDER BY id").all()
        const before = { tasks: tasks(), dates: dates() }
        expect(before.dates.every(d => (d as { edit_date: string }).edit_date === '2000-01-01')).toBe(true)
        await initDB(adapter())
        expect(tasks()).toEqual(before.tasks)
        expect(dates()).toEqual(before.dates)
        expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([])
        expect(pragma("foreign_keys")).toBe(1)
    })

    it("recreates the workspace trigger of the section updates: it fires again afterwards", async () => {
        makeV8()
        await initDB(adapter())
        expect(names("trigger")).toContain("workspace_edit_on_section_update")
        expect(names("trigger")).not.toContain("_pos")
        expect(names("table")).not.toContain("_pos")
        sqlite.exec("UPDATE section SET position = 9 WHERE id = 20")
        expect(sqlite.prepare("SELECT edit_date FROM workspace WHERE id = 2").get()).not.toEqual({ edit_date: "2000-01-01" })
        expect(sqlite.prepare("SELECT edit_date FROM workspace WHERE id = 1").get()).toEqual({ edit_date: "2000-01-01" })
    })

    it("an interruption rolls everything back and the second run is correct", async () => {
        makeV8()
        // a section whose update fails halfway through the renumbering (a trigger that aborts on position 3)
        sqlite.exec(`CREATE TRIGGER boom BEFORE UPDATE OF position ON section WHEN NEW.position = 3 BEGIN SELECT RAISE(ABORT, 'boom'); END`)
        const before = order(1)
        await expect(initDB(adapter())).rejects.toThrow(/boom/)
        expect(pragma("user_version")).toBe(8)
        expect(order(1)).toEqual(before)
        expect(names("trigger")).toContain("workspace_edit_on_section_update")
        expect(names("table")).not.toContain("_pos")
        expect(pragma("foreign_keys")).toBe(1)
        sqlite.exec("DROP TRIGGER boom")
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(order(1).map(r => (r as { id: number }).id)).toEqual([10, 11, 12, 13, 14, 15])
        expect((order(1) as { position: number }[]).map(r => r.position)).toEqual([0, 1, 2, 3, 4, 5])
    })

    it("running it again changes nothing", async () => {
        makeV8()
        await initDB(adapter())
        sqlite.exec("PRAGMA user_version = 8")
        await initDB(adapter())
        expect(order(1).map(r => (r as { position: number }).position)).toEqual([0, 1, 2, 3, 4, 5])
    })

    it("a migrated and a fresh database have the same schema", async () => {
        await initDB(adapter())
        const fresh = master()
        makeV8()
        await initDB(adapter())
        expect(master()).toEqual(fresh)
        sqlite = new DatabaseSync(":memory:")
        for (const q of latestSchema) sqlite.exec(q)
        expect(master()).toEqual(fresh)
        expect(latestSchema).toEqual(expect.arrayContaining(sectionOrderSchema))
    })
})

describe("initDB v10 (saved open/closed state)", () => {
    // A real v9 database with a group, a section and tasks in the three tables the migration touches
    const makeV9 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 9")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0);
            INSERT INTO section_group (id, noteID, name, position) VALUES (1, 1, 'G', 0);
            INSERT INTO section (id, groupID, title, position) VALUES (11, 1, 'S', 1);
            INSERT INTO task (id, sectionID, text) VALUES (1, 11, 'T');
            INSERT INTO task (id, sectionID, taskID, text) VALUES (2, 11, 1, 'Sub');
            UPDATE task SET edit_date = '2000-01-01', edit_time = '00:00';
            UPDATE section SET edit_date = '2000-01-01', edit_time = '00:00';
            UPDATE workspace SET edit_date = '2000-01-01', edit_time = '00:00';
        `)
    }
    const dates = () => sqlite.prepare(`
        SELECT 'w' AS t, id, edit_date, edit_time FROM workspace UNION ALL
        SELECT 's', id, edit_date, edit_time FROM section UNION ALL
        SELECT 't', id, edit_date, edit_time FROM task ORDER BY 1, 2`).all()
    const master = () => sqlite.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all()
    const FROZEN = { edit_date: "2000-01-01", edit_time: "00:00" }
    const wsEdit = () => sqlite.prepare("SELECT edit_date, edit_time FROM workspace WHERE id = 1").get()
    const freezeAll = () => sqlite.exec(`
        UPDATE task SET edit_date = '2000-01-01', edit_time = '00:00';
        UPDATE section SET edit_date = '2000-01-01', edit_time = '00:00';
        UPDATE workspace SET edit_date = '2000-01-01', edit_time = '00:00'`)
    const count = (table: string, where = "1") => (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get() as { c: number }).c

    it("adds collapsed (false by default) to groups, sections and tasks and keeps the data and the edit dates", async () => {
        makeV9()
        const before = dates()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        for (const table of ["section_group", "section", "task"]) {
            expect(columns(table)).toContain("collapsed")
            expect(count(table, "collapsed = 0")).toBe(count(table))
        }
        expect(dates()).toEqual(before)
        expect(count("task")).toBe(2)
        expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    })

    it("the column is not nullable", async () => {
        makeV9()
        await initDB(adapter())
        expect(() => sqlite.exec("UPDATE task SET collapsed = NULL WHERE id = 1")).toThrow(/NOT NULL/)
    })

    it("an update of only collapsed changes no edit date, an update of the content still does", async () => {
        makeV9()
        await initDB(adapter())
        const rows = [
            ["section_group", 1, "name", "'Renamed'"],
            ["section", 11, "title", "'Renamed'"],
            ["task", 1, "text", "'Renamed'"],
        ] as const
        for (const [table, id, column, value] of rows) {
            freezeAll()
            const before = dates()
            sqlite.exec(`UPDATE ${table} SET collapsed = 1 WHERE id = ${id}`)
            sqlite.exec(`UPDATE ${table} SET collapsed = 0 WHERE id = ${id}`)
            expect(dates()).toEqual(before)
            expect(wsEdit()).toEqual(FROZEN)
            sqlite.exec(`UPDATE ${table} SET ${column} = ${value} WHERE id = ${id}`)
            expect(wsEdit(), table).not.toEqual(FROZEN)
            if (table !== "section_group") expect(sqlite.prepare(`SELECT edit_date FROM ${table} WHERE id = ${id}`).get(), table).not.toEqual({ edit_date: "2000-01-01" })
        }
    })

    it("the width of a group no longer refreshes the edit date, the other columns do (position, trash, archive)", async () => {
        makeV9()
        await initDB(adapter())
        freezeAll()
        sqlite.exec("UPDATE section_group SET width = 300 WHERE id = 1")
        expect(wsEdit()).toEqual(FROZEN)
        for (const sql of [
            "UPDATE section_group SET position = 3 WHERE id = 1",
            "UPDATE section_group SET archived_at = '2024-01-01' WHERE id = 1",
            "UPDATE section SET position = 5 WHERE id = 11",
            "UPDATE section SET deleted_at = '2024-01-01' WHERE id = 11",
            "UPDATE task SET position = 4 WHERE id = 1",
            "UPDATE task SET completed = 1 WHERE id = 2",
            "UPDATE task SET archived_at = '2024-01-01' WHERE id = 2",
        ]) {
            freezeAll()
            sqlite.exec(sql)
            expect(wsEdit(), sql).not.toEqual(FROZEN)
        }
    })

    it("the update triggers list exactly the columns of the tables but the view state ones", async () => {
        await initDB(adapter())
        const viewState: Record<string, string[]> = { section_group: ["collapsed", "width"], section: ["collapsed"], task: ["collapsed"] }
        for (const [table, listed] of Object.entries(WORKSPACE_EDIT_COLUMNS))
            expect([...listed, ...viewState[table]].sort(), table).toEqual(columns(table).sort())
    })

    it("insert and delete still refresh the edit date of the workspace", async () => {
        makeV9()
        await initDB(adapter())
        freezeAll()
        sqlite.exec("INSERT INTO task (id, sectionID, text) VALUES (3, 11, 'New')")
        expect(wsEdit()).not.toEqual(FROZEN)
        freezeAll()
        sqlite.exec("DELETE FROM task WHERE id = 3")
        expect(wsEdit()).not.toEqual(FROZEN)
    })

    it("a failure halfway rolls the triggers back and the second run is correct", async () => {
        makeV9()
        const failing = adapter()
        const execute = failing.execute.bind(failing)
        let fail = true
        failing.execute = (async (sql: string) => {
            if (fail && sql.includes("COMMIT;")) return execute(sql.replace("COMMIT;", "SELECT * FROM missing_table;"))
            return execute(sql)
        }) as typeof failing.execute
        await expect(initDB(failing)).rejects.toThrow(/missing_table/)
        expect(pragma("user_version")).toBe(9)
        // the old triggers are back and still fire on any update
        for (const table of ["section_group", "section", "task"]) expect(names("trigger")).toContain(`workspace_edit_on_${table}_update`)
        freezeAll()
        sqlite.exec("UPDATE section_group SET width = 300 WHERE id = 1")
        expect(wsEdit()).not.toEqual(FROZEN)
        expect(pragma("foreign_keys")).toBe(1)
        fail = false
        await initDB(failing)
        expect(pragma("user_version")).toBe(16)
        freezeAll()
        sqlite.exec("UPDATE task SET collapsed = 1 WHERE id = 1")
        expect(wsEdit()).toEqual(FROZEN)
    })

    it("running it again changes nothing", async () => {
        makeV9()
        await initDB(adapter())
        const first = master()
        sqlite.exec("PRAGMA user_version = 9")
        await initDB(adapter())
        expect(master()).toEqual(first)
        expect(pragma("user_version")).toBe(16)
    })

    it("a migrated and a fresh database have the same schema, and latestSchema builds it too", async () => {
        await initDB(adapter())
        const fresh = master()
        makeV9()
        await initDB(adapter())
        expect(master()).toEqual(fresh)
        sqlite = new DatabaseSync(":memory:")
        for (const q of latestSchema) sqlite.exec(q)
        expect(master()).toEqual(fresh)
        expect(latestSchema).toEqual(expect.arrayContaining(collapsedSchema))
    })
})

describe("initDB v11 (drafts of the templates)", () => {
    // A real v10 database with a workspace, a note and a template
    const makeV10 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema, ...collapsedSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 10")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name, position) VALUES (1, 1, 'N', 0);
            INSERT INTO note_template (id, workspaceID, sourceNoteID, name, content) VALUES (1, 1, 1, 'T', '{"version":1,"groups":[]}');
            UPDATE workspace SET edit_date = '2000-01-01', edit_time = '00:00';
        `)
    }
    const count = (table: string, where = "1") => (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get() as { c: number }).c
    const wsEdit = () => sqlite.prepare("SELECT edit_date, edit_time FROM workspace WHERE id = 1").get()
    const FROZEN = { edit_date: "2000-01-01", edit_time: "00:00" }

    it("adds a nullable templateID to the notes and keeps the data", async () => {
        makeV10()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(columns("note")).toContain("templateID")
        expect(count("note", "templateID IS NULL")).toBe(count("note"))
        expect(count("note_template")).toBe(1)
        expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    })

    it("a migrated database and a new one have the same columns and indexes", async () => {
        makeV10()
        await initDB(adapter())
        const migrated = { columns: columns("note"), indexes: names("index") }
        sqlite = new DatabaseSync(":memory:")
        await initDB(adapter())
        expect({ columns: columns("note"), indexes: names("index") }).toEqual(migrated)
    })

    it("allows one draft per template and as many notes without a template as wanted", async () => {
        makeV10()
        await initDB(adapter())
        sqlite.exec("INSERT INTO note (workspaceID, templateID, name) VALUES (NULL, 1, 'T')")
        expect(() => sqlite.exec("INSERT INTO note (workspaceID, templateID, name) VALUES (NULL, 1, 'T2')")).toThrow(/UNIQUE/)
        expect(() => sqlite.exec("INSERT INTO note (workspaceID, name) VALUES (1, 'A'), (1, 'B')")).not.toThrow()
        expect(() => sqlite.exec("INSERT INTO note (workspaceID, templateID, name) VALUES (NULL, 999, 'X')")).toThrow(/FOREIGN KEY/)
    })

    it("purging the template removes the draft with its content", async () => {
        makeV10()
        await initDB(adapter())
        sqlite.exec(`
            INSERT INTO note (id, workspaceID, templateID, name) VALUES (50, NULL, 1, 'T');
            INSERT INTO section_group (id, noteID, position) VALUES (50, 50, 0);
            INSERT INTO section (id, groupID, position, is_default) VALUES (50, 50, 0, 1);
            INSERT INTO task (sectionID, text) VALUES (50, 'Diretto');
        `)
        sqlite.exec("DELETE FROM note_template WHERE id = 1")
        expect(count("note", "id = 50")).toBe(0)
        expect(count("section_group", "noteID = 50")).toBe(0)
        expect(count("task")).toBe(0)
    })

    it("editing a draft never changes the edit date of a workspace", async () => {
        makeV10()
        await initDB(adapter())
        sqlite.exec(`
            INSERT INTO note (id, workspaceID, templateID, name) VALUES (50, NULL, 1, 'T');
            INSERT INTO section_group (id, noteID, position) VALUES (50, 50, 0);
            INSERT INTO section (id, groupID, position, is_default) VALUES (50, 50, 0, 1);
            INSERT INTO task (id, sectionID, text) VALUES (50, 50, 'Diretto');
            UPDATE task SET text = 'Cambiato' WHERE id = 50;
            UPDATE note SET name = 'Rinominato', color = '#fff' WHERE id = 50;
            UPDATE section_group SET name = 'G' WHERE id = 50;
        `)
        expect(wsEdit()).toEqual(FROZEN)
        sqlite.exec("UPDATE note SET name = 'Vera' WHERE id = 1")
        expect(wsEdit()).not.toEqual(FROZEN)
    })

    it("retries safely when the column exists but the version was not bumped", async () => {
        makeV10()
        sqlite.exec("ALTER TABLE note ADD COLUMN templateID INTEGER DEFAULT NULL REFERENCES note_template(id) ON DELETE CASCADE")
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(16)
    })
})

describe("initDB v12 (partial indexes of the trash and the archive)", () => {
    const TRASH_INDEXES = ["audio_file", "task", "section", "section_group", "note", "folder", "note_template", "workspace"].map(t => `idx_${t}_deleted_at`)
    const ARCHIVE_INDEXES = ["task", "section", "section_group", "note", "folder"].map(t => `idx_${t}_archived_at`)
    const makeV11 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema, ...collapsedSchema, ...templateDraftSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 11")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name, position, deleted_at) VALUES (1, 1, 'N', 0, datetime('now', 'localtime'));
        `)
    }

    it("creates the partial indexes on a new database", async () => {
        await initDB(adapter())
        expect(names("index")).toEqual(expect.arrayContaining([...TRASH_INDEXES, ...ARCHIVE_INDEXES]))
        const sql = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_note_deleted_at'").get() as { sql: string }).sql
        expect(sql).toMatch(/WHERE deleted_at IS NOT NULL/)
    })

    it("a v11 database gets the indexes, keeps its data and ends up like a new one", async () => {
        makeV11()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(sqlite.prepare("SELECT name FROM note").all()).toEqual([{ name: "N" }])
        const migrated = names("index")
        expect(migrated).toEqual(expect.arrayContaining([...TRASH_INDEXES, ...ARCHIVE_INDEXES]))
        sqlite = new DatabaseSync(":memory:")
        await initDB(adapter())
        expect(names("index")).toEqual(migrated)
    })

    it("is retried safely when the indexes exist but the version was not bumped", async () => {
        makeV11()
        for (const q of trashIndexesSchema) sqlite.exec(q)
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(16)
    })

    it("the purge query uses the partial index", async () => {
        await initDB(adapter())
        const plan = sqlite.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM note WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', 'localtime', '-30 days')").all() as { detail: string }[]
        expect(plan.map(r => r.detail).join(" ")).toMatch(/idx_note_deleted_at/)
    })
})

describe("initDB v13 (background color of the notes)", () => {
    const makeV12 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema, ...collapsedSchema, ...templateDraftSchema, ...trashIndexesSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 12")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name, position, edit_date, edit_time) VALUES (1, 1, 'N', 0, '2020-01-01', '10:00');
            INSERT INTO note_template (id, workspaceID, name, content) VALUES (1, 1, 'T', '{}');
        `)
    }

    it("a v12 database gets bg_color on notes and templates (NULL), keeps its data and ends up like a new one", async () => {
        makeV12()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(sqlite.prepare("SELECT name, bg_color FROM note").all()).toEqual([{ name: "N", bg_color: null }])
        expect(sqlite.prepare("SELECT name, bg_color FROM note_template").all()).toEqual([{ name: "T", bg_color: null }])
        const migrated = sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()
        sqlite = new DatabaseSync(":memory:")
        await initDB(adapter())
        expect(sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()).toEqual(migrated)
    })

    it("refuses an empty background and does not touch the edit date of the note", async () => {
        makeV12()
        await initDB(adapter())
        expect(() => sqlite.exec("UPDATE note SET bg_color = '' WHERE id = 1")).toThrow()
        sqlite.exec("UPDATE note SET bg_color = '#e6194b' WHERE id = 1")
        expect(sqlite.prepare("SELECT bg_color, edit_date, edit_time FROM note").all()).toEqual([{ bg_color: "#e6194b", edit_date: "2020-01-01", edit_time: "10:00" }])
    })

    it("is retried safely when the columns exist but the version was not bumped", async () => {
        makeV12()
        for (const q of noteBackgroundSchema) sqlite.exec(q)
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(16)
    })
})

describe("initDB v14 (custom themes)", () => {
    const makeV13 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema, ...collapsedSchema, ...templateDraftSchema, ...trashIndexesSchema, ...noteBackgroundSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 13")
        sqlite.exec("INSERT INTO workspace (id, name) VALUES (1, 'WS')")
    }
    const insert = (id: string, base = "dark", colors = "{}") =>
        sqlite.prepare("INSERT INTO custom_themes (id, name, base, colors, accent) VALUES (?, 'T', ?, ?, '#112233')").run(id, base, colors)

    it("a v13 database gets the empty custom_themes table, keeps its data and ends up like a new one", async () => {
        makeV13()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(sqlite.prepare("SELECT COUNT(*) AS n FROM custom_themes").all()).toEqual([{ n: 0 }])
        expect(sqlite.prepare("SELECT name FROM workspace").all()).toEqual([{ name: "WS" }])
        const migrated = sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()
        sqlite = new DatabaseSync(":memory:")
        await initDB(adapter())
        expect(sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()).toEqual(migrated)
    })

    it("refuses a wrong id, base or colors", async () => {
        makeV13()
        await initDB(adapter())
        expect(() => insert("light")).toThrow()
        expect(() => insert("custom-a", "sepia")).toThrow()
        expect(() => insert("custom-a", "dark", "not json")).toThrow()
        insert("custom-a")
        expect(sqlite.prepare("SELECT id FROM custom_themes").all()).toEqual([{ id: "custom-a" }])
    })

    it("is retried safely when the table exists but the version was not bumped", async () => {
        makeV13()
        for (const q of customThemeSchema) sqlite.exec(q)
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(16)
    })
})

describe("initDB v15 (images and videos of the groups)", () => {
    const makeV14 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema, ...collapsedSchema, ...templateDraftSchema, ...trashIndexesSchema, ...noteBackgroundSchema, ...customThemeSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 14")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'N');
            INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0);
            INSERT INTO audio_file (name, section_groupID, path, position) VALUES ('a', 1, 'p', 0);
        `)
    }

    it("a v14 database gets the empty media_file table, keeps its data and ends up like a new one", async () => {
        makeV14()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(sqlite.prepare("SELECT COUNT(*) AS n FROM media_file").all()).toEqual([{ n: 0 }])
        expect(sqlite.prepare("SELECT name FROM audio_file").all()).toEqual([{ name: "a" }])
        const migrated = sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()
        sqlite = new DatabaseSync(":memory:")
        await initDB(adapter())
        expect(sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()).toEqual(migrated)
    })

    it("a media file refreshes the edit date of the workspace like the audio files do", async () => {
        makeV14()
        await initDB(adapter())
        sqlite.exec("UPDATE workspace SET edit_date = '2000-01-01'")
        sqlite.exec("INSERT INTO media_file (name, section_groupID, path) VALUES ('m.jpg', 1, 'p')")
        expect(sqlite.prepare("SELECT edit_date FROM workspace WHERE id = 1").get()).not.toEqual({ edit_date: "2000-01-01" })
        sqlite.exec("UPDATE workspace SET edit_date = '2000-01-01'")
        sqlite.exec("UPDATE media_file SET deleted_at = '2024-01-01'")
        expect(sqlite.prepare("SELECT edit_date FROM workspace WHERE id = 1").get()).not.toEqual({ edit_date: "2000-01-01" })
    })

    it("keeps the unique name per group (also for the trashed files) and deletes the files with their group", async () => {
        makeV14()
        await initDB(adapter())
        sqlite.exec("INSERT INTO media_file (name, section_groupID, path) VALUES ('m.jpg', 1, 'p')")
        expect(() => sqlite.exec("INSERT INTO media_file (name, section_groupID, path) VALUES ('m.jpg', 1, 'q')")).toThrow(/UNIQUE/)
        expect(() => sqlite.exec("INSERT INTO media_file (name, section_groupID, path) VALUES ('', 1, 'q')")).toThrow(/CHECK/)
        sqlite.exec("DELETE FROM section_group WHERE id = 1")
        expect(sqlite.prepare("SELECT COUNT(*) AS n FROM media_file").all()).toEqual([{ n: 0 }])
    })

    it("is retried safely when the table exists but the version was not bumped", async () => {
        makeV14()
        for (const q of mediaFileSchema) sqlite.exec(q)
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(16)
    })
})

describe("initDB v16 (tags of the tasks)", () => {
    const makeV15 = () => {
        sqlite = new DatabaseSync(":memory:")
        sqlite.exec("PRAGMA foreign_keys=ON")
        for (const q of [...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema, ...collapsedSchema, ...templateDraftSchema, ...trashIndexesSchema, ...noteBackgroundSchema, ...customThemeSchema, ...mediaFileSchema])
            sqlite.exec(q)
        sqlite.exec("PRAGMA user_version = 15")
        sqlite.exec(`
            INSERT INTO workspace (id, name) VALUES (1, 'WS');
            INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'N');
            INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0);
            INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'S', 0);
            INSERT INTO task (id, sectionID, text) VALUES (1, 1, 't');
        `)
    }

    it("a v15 database gets the empty tag tables, keeps its data and ends up like a new one", async () => {
        makeV15()
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(sqlite.prepare("SELECT (SELECT COUNT(*) FROM tag) AS tags, (SELECT COUNT(*) FROM task_tag) AS links").all()).toEqual([{ tags: 0, links: 0 }])
        expect(sqlite.prepare("SELECT text FROM task").all()).toEqual([{ text: "t" }])
        const migrated = sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()
        sqlite = new DatabaseSync(":memory:")
        await initDB(adapter())
        expect(sqlite.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all()).toEqual(migrated)
    })

    it("keeps the names unique per workspace (case insensitive) and non empty", async () => {
        makeV15()
        await initDB(adapter())
        sqlite.exec("INSERT INTO workspace (id, name) VALUES (2, 'Other')")
        sqlite.exec("INSERT INTO tag (workspaceID, name) VALUES (1, 'Bug')")
        expect(() => sqlite.exec("INSERT INTO tag (workspaceID, name) VALUES (1, 'bug')")).toThrow(/UNIQUE/)
        expect(() => sqlite.exec("INSERT INTO tag (workspaceID, name) VALUES (1, '')")).toThrow(/CHECK/)
        expect(() => sqlite.exec("INSERT INTO tag (workspaceID, name) VALUES (2, 'Bug')")).not.toThrow()
    })

    it("deletes the links with the task and with the tag, and the tags with the workspace", async () => {
        makeV15()
        await initDB(adapter())
        sqlite.exec("INSERT INTO tag (id, workspaceID, name) VALUES (1, 1, 'A'), (2, 1, 'B')")
        sqlite.exec("INSERT INTO task_tag (taskID, tagID) VALUES (1, 1), (1, 2)")
        sqlite.exec("DELETE FROM tag WHERE id = 1")
        expect(sqlite.prepare("SELECT tagID FROM task_tag").all()).toEqual([{ tagID: 2 }])
        sqlite.exec("DELETE FROM task WHERE id = 1")
        expect(sqlite.prepare("SELECT COUNT(*) AS n FROM task_tag").all()).toEqual([{ n: 0 }])
        sqlite.exec("INSERT INTO task (id, sectionID, text) VALUES (2, 1, 'u')")
        sqlite.exec("INSERT INTO task_tag (taskID, tagID) VALUES (2, 2)")
        sqlite.exec("DELETE FROM workspace WHERE id = 1")
        expect(sqlite.prepare("SELECT (SELECT COUNT(*) FROM tag) AS tags, (SELECT COUNT(*) FROM task_tag) AS links").all()).toEqual([{ tags: 0, links: 0 }])
    })

    it("a tag or a link refreshes the edit date of the workspace", async () => {
        makeV15()
        await initDB(adapter())
        const stale = () => sqlite.exec("UPDATE workspace SET edit_date = '2000-01-01'")
        const touched = () => expect(sqlite.prepare("SELECT edit_date FROM workspace WHERE id = 1").get()).not.toEqual({ edit_date: "2000-01-01" })
        stale()
        sqlite.exec("INSERT INTO tag (id, workspaceID, name) VALUES (1, 1, 'A')")
        touched()
        stale()
        sqlite.exec("UPDATE tag SET name = 'B' WHERE id = 1")
        touched()
        stale()
        sqlite.exec("INSERT INTO task_tag (taskID, tagID) VALUES (1, 1)")
        touched()
        stale()
        sqlite.exec("DELETE FROM task_tag")
        touched()
    })

    it("is retried safely when the tables exist but the version was not bumped", async () => {
        makeV15()
        for (const q of tagSchema) sqlite.exec(q)
        await expect(initDB(adapter())).resolves.toBeUndefined()
        expect(pragma("user_version")).toBe(16)
    })
})
