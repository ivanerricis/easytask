// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import type Database from "@tauri-apps/plugin-sql"
import { invoke } from "@tauri-apps/api/core"
import { initDB, LATEST_SCHEMA_VERSION } from "./initDb"
import { APPLICATION_ID, archiveSchema, initialSchema, taskArchiveSchema } from "./schema/initial"
import { automationSchema } from "./schema/automation"
import { createWorkspaceEditTriggers } from "./schema/workspace_edit"
import { addGroupColorColumn } from "./schema/section_group"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

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

type Call = { statements?: { sql: string }[] }

/** Fake of the `db_transaction` command: multi-statement SQL, ROLLBACK on the first error, "statement N failed: ..." like the Rust one. */
async function sqliteTransaction(command: string, args?: Call) {
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

const pragma = (name: string) => (sqlite.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name]
const schema = () => sqlite.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all()
const tables = () => (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(r => r.name)

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(invoke).mockReset().mockImplementation(sqliteTransaction as unknown as typeof invoke)
})

describe("initDB atomic migrations", () => {
    // A real database at v14: everything but media_file
    const makeV14 = async () => {
        await initDB(adapter())
        sqlite.exec("DROP TABLE media_file; PRAGMA user_version = 14")
    }

    it("a fresh database reaches the latest version", async () => {
        await initDB(adapter())
        expect(pragma("user_version")).toBe(LATEST_SCHEMA_VERSION)
        expect(LATEST_SCHEMA_VERSION).toBe(16)
        expect(tables()).toContain("media_file")
    })

    it("an older database is migrated all the way to the latest version", async () => {
        sqlite.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
        for (const query of initialSchema) sqlite.exec(query)
        sqlite.exec("PRAGMA user_version = 1")
        await initDB(adapter())
        expect(pragma("user_version")).toBe(LATEST_SCHEMA_VERSION)
        expect(tables()).toContain("media_file")
    })

    it("a migration that fails after its statements leaves the schema and the version unchanged", async () => {
        await makeV14()
        const before = schema()
        // the transaction is cut at its last statement (the version bump): the table created before must roll back
        vi.mocked(invoke).mockImplementation((async (command: string, args?: Call) =>
            sqliteTransaction(command, { statements: (args?.statements ?? []).map(s => s.sql.startsWith("PRAGMA user_version") ? { sql: "SELECT * FROM missing_table" } : s) })
        ) as unknown as typeof invoke)
        await expect(initDB(adapter())).rejects.toThrow(/missing_table/)
        expect(pragma("user_version")).toBe(14)
        expect(schema()).toEqual(before)
        expect(tables()).not.toContain("media_file")
        // the next start applies it
        vi.mocked(invoke).mockImplementation(sqliteTransaction as unknown as typeof invoke)
        await initDB(adapter())
        expect(pragma("user_version")).toBe(16)
        expect(tables()).toContain("media_file")
    })

    it("a migration that fails halfway on its own statements changes nothing", async () => {
        await makeV14()
        const before = schema()
        // a view named like the index makes the second statement of the migration fail
        sqlite.exec("CREATE VIEW idx_media_file_group AS SELECT 1 AS x")
        await expect(initDB(adapter())).rejects.toThrow()
        expect(pragma("user_version")).toBe(14)
        expect(tables()).not.toContain("media_file")
        sqlite.exec("DROP VIEW idx_media_file_group")
        expect(schema()).toEqual(before)
    })

    it("a migration with its own BEGIN/COMMIT script gets its version bump inside the script (v7, then v8 fails: stays at 7)", async () => {
        sqlite.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
        for (const queries of [initialSchema, [addGroupColorColumn], createWorkspaceEditTriggers, archiveSchema, automationSchema, taskArchiveSchema])
            for (const query of queries) sqlite.exec(query)
        sqlite.exec("PRAGMA user_version = 6")
        // every transaction fails: v7 (own script, not run through db_transaction) still lands together with its version
        vi.mocked(invoke).mockRejectedValue("statement 0 failed: boom")
        await expect(initDB(adapter())).rejects.toThrow(/boom/)
        expect(pragma("user_version")).toBe(7)
        expect(pragma("foreign_keys")).toBe(1)
        expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1)
    })
})
