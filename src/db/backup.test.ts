import { beforeEach, describe, expect, it, vi } from "vitest"
import { createMockDb, type MockDb } from "@/test/db-mock"

type Entry = { name: string, isFile: boolean }

let files: Map<string, number>
let db: MockDb
const closeDB = vi.fn()
const relaunch = vi.fn()
const reportError = vi.fn()
const setRestoring = vi.fn()
const loadValidation = vi.fn()
let validation: MockDb
let validationRows: { application_id: number, user_version: number, integrity: string }
let keep = 7
let auto = true
let frequency: "daily" | "weekly" | "monthly" = "daily"
let folder: string | null = null

const BACKUPS = "/data/backups"
const PRE_MIGRATION = `${BACKUPS}/pre-migration`

vi.mock("@tauri-apps/api/path", () => ({
    join: vi.fn(async (...parts: string[]) => parts.join("/")),
}))
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: (...a: unknown[]) => loadValidation(...a) } }))
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunch() }))
vi.mock("@tauri-apps/plugin-fs", () => ({
    exists: vi.fn(async (path: string) => path === BACKUPS || path === PRE_MIGRATION || files.has(path)),
    mkdir: vi.fn(async () => undefined),
    readDir: vi.fn(async (dir: string): Promise<Entry[]> =>
        [...files.keys()].filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/")).map(p => ({ name: p.slice(dir.length + 1), isFile: true }))),
    stat: vi.fn(async (path: string) => ({ size: files.get(path) ?? 0, mtime: new Date(2026, 0, 5) })),
    remove: vi.fn(async (path: string) => { files.delete(path) }),
    rename: vi.fn(async (from: string, to: string) => { files.set(to, files.get(from) ?? 0); files.delete(from) }),
    copyFile: vi.fn(async (from: string, to: string) => { files.set(to, files.get(from) ?? 0) }),
}))
vi.mock("./appPaths", () => ({ ensureAppFolder: async () => "/data" }))
vi.mock("./dbManager", () => ({
    DB_FILE: "easytask.db",
    getDB: async () => db,
    closeDB: () => closeDB(),
    setRestoring: (value: boolean) => setRestoring(value),
}))
vi.mock("@/lib/report-error", () => ({
    reportError: (...a: unknown[]) => reportError(...a),
    resetReportErrorDedupe: () => undefined,
}))
vi.mock("@/lib/store/preferences", () => ({
    getBackupKeep: async () => keep,
    getAutoBackup: async () => auto,
    getBackupFrequency: async () => frequency,
    getBackupFolder: async () => folder,
}))

import {
    backupFileName,
    createBackup,
    createPreMigrationBackup,
    MAX_PRE_MIGRATION_BACKUPS,
    deleteBackup,
    listBackups,
    listPreMigrationBackups,
    parseBackupName,
    restoreBackup,
    rotateBackups,
    runAutoBackup,
} from "./backup"
import { APPLICATION_ID, LATEST_SCHEMA_VERSION } from "./initDb"

const at = (y: number, mo: number, d: number, h = 10, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s)
const seed = (name: string, size = 100) => files.set(`${BACKUPS}/${name}`, size)

beforeEach(() => {
    files = new Map()
    db = createMockDb()
    validationRows = { application_id: APPLICATION_ID, user_version: LATEST_SCHEMA_VERSION, integrity: "ok" }
    validation = createMockDb()
    validation.select.mockImplementation(async (sql: unknown) => {
        if (sql === "PRAGMA application_id") return [{ application_id: validationRows.application_id }]
        if (sql === "PRAGMA user_version") return [{ user_version: validationRows.user_version }]
        return [{ integrity_check: validationRows.integrity }]
    })
    loadValidation.mockReset().mockImplementation(async () => validation)
    setRestoring.mockReset()
    closeDB.mockReset()
    relaunch.mockReset()
    // VACUUM INTO creates the file like SQLite would
    db.execute.mockImplementation(async (sql: unknown) => {
        const path = /INTO '(.*)'/.exec(String(sql))![1].replace(/''/g, "'")
        files.set(path, 1234)
        return { rowsAffected: 0, lastInsertId: 0 }
    })
    closeDB.mockReset().mockResolvedValue(undefined)
    relaunch.mockReset().mockResolvedValue(undefined)
    reportError.mockReset()
    keep = 7
    auto = true
    frequency = "daily"
    folder = null
    vi.useRealTimers()
})

describe("backup names", () => {
    it("builds and parses names", () => {
        const date = at(2026, 3, 9, 7, 5, 2)
        expect(backupFileName(date)).toBe("easytask-20260309-070502.db")
        expect(backupFileName(date, true)).toBe("easytask-pre-restore-20260309-070502.db")
        expect(parseBackupName("easytask-20260309-070502.db")).toEqual({ date, preRestore: false, sequence: 1 })
        expect(parseBackupName("easytask-pre-restore-20260309-070502.db")).toEqual({ date, preRestore: true, sequence: 1 })
        expect(backupFileName(date, false, 3)).toBe("easytask-20260309-070502-3.db")
        expect(parseBackupName("easytask-20260309-070502-3.db")).toEqual({ date, preRestore: false, sequence: 3 })
    })

    it("rejects anything else", () => {
        for (const name of ["easytask.db", "../easytask-20260309-070502.db", "easytask-2026-070502.db", "x.db"]) {
            expect(parseBackupName(name)).toBeNull()
        }
    })
})

describe("listBackups", () => {
    it("lists only backups, newest first, with their size", async () => {
        seed("easytask-20260101-100000.db", 10)
        seed("easytask-20260102-100000.db", 20)
        seed("easytask-pre-restore-20260103-100000.db", 30)
        seed("notes.txt")
        const list = await listBackups()
        expect(list.map(b => b.name)).toEqual([
            "easytask-pre-restore-20260103-100000.db",
            "easytask-20260102-100000.db",
            "easytask-20260101-100000.db",
        ])
        expect(list[0]).toMatchObject({ size: 30, preRestore: true, path: `${BACKUPS}/easytask-pre-restore-20260103-100000.db` })
    })
})

describe("createBackup", () => {
    it("runs VACUUM INTO on the database, in the backups folder", async () => {
        const backup = await createBackup("manual")
        expect(db.execute).toHaveBeenCalledTimes(1)
        expect(String(db.execute.mock.calls[0][0])).toMatch(/^VACUUM INTO '\/data\/backups\/easytask-\d{8}-\d{6}\.db'$/)
        expect(backup.size).toBe(1234)
        expect(files.has(backup.path)).toBe(true)
    })

    it("copies the connection it is given instead of opening the shared one", async () => {
        const other = createMockDb()
        const backup = await createBackup("manual", other as never)
        expect(other.execute).toHaveBeenCalledTimes(1)
        expect(String(other.execute.mock.calls[0][0])).toMatch(/^VACUUM INTO '\/data\/backups\/easytask-\d{8}-\d{6}\.db'$/)
        expect(db.execute).not.toHaveBeenCalled()
        expect(backup.preRestore).toBe(false)
    })

    it("escapes single quotes in the path", async () => {
        const { join } = await import("@tauri-apps/api/path")
        vi.mocked(join).mockImplementationOnce(async () => BACKUPS).mockImplementationOnce(async () => "/da'ta/x.db")
        await createBackup("manual")
        expect(String(db.execute.mock.calls[0][0])).toBe("VACUUM INTO '/da''ta/x.db'")
    })

    it("refuses a path with a NUL character and never runs the statement", async () => {
        const { join } = await import("@tauri-apps/api/path")
        vi.mocked(join).mockImplementationOnce(async () => BACKUPS).mockImplementationOnce(async () => "/data/x\0'; DROP TABLE note; --.db")
        await expect(createBackup("manual")).rejects.toThrow("Invalid backup path")
        expect(db.execute).not.toHaveBeenCalled()
    })

    it("rotates the oldest regular backups, keeping the preferred number", async () => {
        keep = 3
        for (let day = 1; day <= 5; day++) seed(`easytask-2026010${day}-100000.db`)
        seed("easytask-pre-restore-20250101-100000.db")
        await createBackup("manual")
        const names = (await listBackups()).filter(b => !b.preRestore).map(b => b.name)
        expect(names).toHaveLength(3)
        expect(names).not.toContain("easytask-20260101-100000.db")
        // the pre-restore copy is not touched by a regular rotation
        expect(files.has(`${BACKUPS}/easytask-pre-restore-20250101-100000.db`)).toBe(true)
    })

    it("keeps only the newest pre-restore copy and does not rotate", async () => {
        keep = 1
        seed("easytask-20260101-100000.db")
        seed("easytask-20260102-100000.db")
        seed("easytask-pre-restore-20250101-100000.db")
        const backup = await createBackup("pre-restore")
        expect(backup.preRestore).toBe(true)
        const names = (await listBackups()).map(b => b.name)
        expect(names).toContain(backup.name)
        expect(names).not.toContain("easytask-pre-restore-20250101-100000.db")
        expect(names).toContain("easytask-20260101-100000.db")
    })
})

describe("pre-migration backups", () => {
    const copyVacuum = (target: MockDb) => target.execute.mockImplementation(async (sql: unknown) => {
        files.set(/INTO '(.*)'/.exec(String(sql))![1], 777)
        return { rowsAffected: 0, lastInsertId: 0 }
    })

    it("writes a named copy in the dedicated folder through a temporary file", async () => {
        const other = createMockDb()
        copyVacuum(other)
        const copy = await createPreMigrationBackup(other as never, 6, 7)
        expect(String(other.execute.mock.calls[0][0])).toBe(`VACUUM INTO '${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db.tmp'`)
        expect(copy).toMatchObject({ name: "easytask-pre-migration-v6-to-v7.db", path: `${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db`, size: 777 })
        expect(files.has(`${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db.tmp`)).toBe(false)
    })

    it("does not overwrite nor duplicate the copy of the same versions", async () => {
        files.set(`${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db`, 42)
        const other = createMockDb()
        expect(await createPreMigrationBackup(other as never, 6, 7)).toBeNull()
        expect(other.execute).not.toHaveBeenCalled()
        expect(files.get(`${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db`)).toBe(42)
    })

    it("keeps at most MAX_PRE_MIGRATION_BACKUPS copies, deleting those of the oldest migrations and never the new one", async () => {
        for (let to = 2; to < 2 + MAX_PRE_MIGRATION_BACKUPS; to++) files.set(`${PRE_MIGRATION}/easytask-pre-migration-v${to - 1}-to-v${to}.db`, 1)
        const other = createMockDb()
        copyVacuum(other)
        const next = 2 + MAX_PRE_MIGRATION_BACKUPS
        await createPreMigrationBackup(other as never, next - 1, next)
        const left = [...files.keys()].filter(path => path.startsWith(`${PRE_MIGRATION}/`))
        expect(left).toHaveLength(MAX_PRE_MIGRATION_BACKUPS)
        expect(left).not.toContain(`${PRE_MIGRATION}/easytask-pre-migration-v1-to-v2.db`)
        expect(left).toContain(`${PRE_MIGRATION}/easytask-pre-migration-v${next - 1}-to-v${next}.db`)
    })

    it("is not touched by the rotation and does not show among the regular backups", async () => {
        keep = 1
        files.set(`${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db`, 42)
        seed("easytask-20260101-100000.db")
        seed("easytask-20260102-100000.db")
        await createBackup("manual")
        expect(files.has(`${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db`)).toBe(true)
        expect((await listBackups()).every(b => b.name.startsWith("easytask-2"))).toBe(true)
    })

    it("lists only the pre-migration copies", async () => {
        files.set(`${PRE_MIGRATION}/easytask-pre-migration-v5-to-v6.db`, 1)
        files.set(`${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db`, 2)
        files.set(`${PRE_MIGRATION}/other.txt`, 3)
        const list = await listPreMigrationBackups()
        expect(list.map(b => b.name)).toEqual(["easytask-pre-migration-v6-to-v7.db", "easytask-pre-migration-v5-to-v6.db"])
        expect(list[0].date).toEqual(new Date(2026, 0, 5))
    })
})

describe("same-second backups", () => {
    it("adds a numeric suffix when the file already exists and keeps listing them in order", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(at(2026, 3, 9, 7, 5, 2))
        const first = await createBackup("manual")
        const second = await createBackup("manual")
        const third = await createBackup("manual")
        expect(first.name).toBe("easytask-20260309-070502.db")
        expect(second.name).toBe("easytask-20260309-070502-2.db")
        expect(third.name).toBe("easytask-20260309-070502-3.db")
        expect((await listBackups()).map(b => b.name)).toEqual([third.name, second.name, first.name])
    })
})

describe("rotateBackups", () => {
    it("never deletes the last backup even with keep 0", async () => {
        seed("easytask-20260101-100000.db")
        seed("easytask-20260102-100000.db")
        expect(await rotateBackups(0)).toBe(1)
        expect((await listBackups()).map(b => b.name)).toEqual(["easytask-20260102-100000.db"])
    })
})

describe("runAutoBackup", () => {
    it("creates a backup when none was taken today", async () => {
        seed("easytask-20200101-100000.db")
        expect(await runAutoBackup()).toBe(true)
        expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it("skips when a backup already exists today", async () => {
        await createBackup("manual")
        db.execute.mockClear()
        expect(await runAutoBackup()).toBe(false)
        expect(db.execute).not.toHaveBeenCalled()
    })

    it("weekly: skips with a backup in the last 7 days, runs otherwise", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(at(2026, 3, 20))
        frequency = "weekly"
        seed("easytask-20260315-100000.db")
        expect(await runAutoBackup()).toBe(false)
        files.clear()
        seed("easytask-20260312-100000.db")
        expect(await runAutoBackup()).toBe(true)
    })

    it("monthly: skips with a backup in the last 30 days, runs otherwise", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(at(2026, 3, 20))
        frequency = "monthly"
        seed("easytask-20260225-100000.db")
        expect(await runAutoBackup()).toBe(false)
        files.clear()
        seed("easytask-20260215-100000.db")
        expect(await runAutoBackup()).toBe(true)
    })

    it("does not count the pre-restore copy", async () => {
        frequency = "weekly"
        await createBackup("pre-restore")
        db.execute.mockClear()
        expect(await runAutoBackup()).toBe(true)
    })

    it("does nothing when disabled", async () => {
        auto = false
        expect(await runAutoBackup()).toBe(false)
        expect(db.execute).not.toHaveBeenCalled()
    })

    it("never runs two backups at once", async () => {
        let release: () => void = () => undefined
        db.execute.mockImplementationOnce(async (sql: unknown) => {
            await new Promise<void>(resolve => { release = resolve })
            files.set(/INTO '(.*)'/.exec(String(sql))![1], 1234)
            return { rowsAffected: 0, lastInsertId: 0 }
        })
        const first = runAutoBackup()
        await vi.waitFor(() => expect(db.execute).toHaveBeenCalledTimes(1))
        await expect(runAutoBackup()).resolves.toBe(false)
        expect(db.execute).toHaveBeenCalledTimes(1)
        release()
        await expect(first).resolves.toBe(true)
        // once finished, the next check works again (here: nothing is due, a backup exists today)
        await expect(runAutoBackup()).resolves.toBe(false)
        expect(reportError).not.toHaveBeenCalled()
    })

    it("a failed rotation is reported and the backup stays a success", async () => {
        const { remove } = await import("@tauri-apps/plugin-fs")
        keep = 1
        seed("easytask-20200101-100000.db")
        seed("easytask-20200102-100000.db")
        vi.mocked(remove).mockRejectedValueOnce(new Error("file in use"))
        await expect(runAutoBackup()).resolves.toBe(true)
        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "file in use" }))
    })

    it("swallows failures and reports them without a toast message", async () => {
        db.execute.mockRejectedValueOnce(new Error("disk full"))
        await expect(runAutoBackup()).resolves.toBe(false)
        expect(reportError).toHaveBeenCalledTimes(1)
        expect(reportError.mock.calls[0]).toHaveLength(1)
    })
})

describe("custom backup folder", () => {
    const CUSTOM = "/mnt/usb/easy"

    beforeEach(() => { folder = CUSTOM })

    it("writes, lists, rotates, deletes and restores in the custom folder", async () => {
        keep = 1
        files.set(`${CUSTOM}/easytask-20260101-100000.db`, 50)
        files.set("/data/easytask.db", 5)
        const backup = await createBackup("manual")
        expect(backup.path.startsWith(`${CUSTOM}/`)).toBe(true)
        expect(String(db.execute.mock.calls[0][0])).toContain(`VACUUM INTO '${CUSTOM}/easytask-`)
        // rotated in the custom folder
        expect((await listBackups()).map(b => b.name)).toEqual([backup.name])
        await restoreBackup(backup.name)
        expect(files.get("/data/easytask.db")).toBe(1234)
        await deleteBackup(backup.name)
        expect(files.has(backup.path)).toBe(false)
        // nothing was written in the default folder
        expect([...files.keys()].some(path => path.startsWith(`${BACKUPS}/`))).toBe(false)
    })

    it("keeps the pre-migration copies in the data folder", async () => {
        const other = createMockDb()
        other.execute.mockImplementation(async (sql: unknown) => {
            files.set(/INTO '(.*)'/.exec(String(sql))![1], 7)
            return { rowsAffected: 0, lastInsertId: 0 }
        })
        const copy = await createPreMigrationBackup(other as never, 6, 7)
        expect(copy?.path).toBe(`${PRE_MIGRATION}/easytask-pre-migration-v6-to-v7.db`)
    })
})

describe("deleteBackup", () => {
    it("removes the file", async () => {
        seed("easytask-20260101-100000.db")
        await deleteBackup("easytask-20260101-100000.db")
        expect(files.size).toBe(0)
    })

    it("refuses names that are not backups", async () => {
        await expect(deleteBackup("../easytask.db")).rejects.toMatchObject({ code: "BACKUP_INVALID_NAME" })
    })
})

describe("restoreBackup", () => {
    it("takes a pre-restore copy, closes the db, replaces the file and relaunches", async () => {
        seed("easytask-20260101-100000.db", 999)
        files.set("/data/easytask.db", 5)
        files.set("/data/easytask.db-wal", 1)
        files.set("/data/easytask.db-shm", 1)
        const order: string[] = []
        db.execute.mockImplementation(async () => { order.push("vacuum"); return { rowsAffected: 0, lastInsertId: 0 } })
        closeDB.mockImplementation(async () => { order.push("close") })
        relaunch.mockImplementation(async () => { order.push("relaunch") })

        await restoreBackup("easytask-20260101-100000.db")

        expect(order).toEqual(["vacuum", "close", "relaunch"])
        expect(loadValidation).toHaveBeenCalledWith(expect.stringMatching(/easytask-20260101-100000\.db\?mode=ro$/))
        expect(validation.close).toHaveBeenCalled()
        expect(files.has("/data/easytask.db.restoring")).toBe(false)
        expect(setRestoring.mock.calls).toEqual([[true]])
        expect(String(db.execute.mock.calls[0][0])).toContain("easytask-pre-restore-")
        expect(files.get("/data/easytask.db")).toBe(999)
        expect(files.has("/data/easytask.db-wal")).toBe(false)
        expect(files.has("/data/easytask.db-shm")).toBe(false)
    })

    it("fails before touching anything when the backup is missing", async () => {
        await expect(restoreBackup("easytask-20260101-100000.db")).rejects.toMatchObject({ code: "BACKUP_NOT_FOUND" })
        expect(closeDB).not.toHaveBeenCalled()
        expect(relaunch).not.toHaveBeenCalled()
    })

    it("does not relaunch when the copy fails", async () => {
        seed("easytask-20260101-100000.db")
        const { copyFile } = await import("@tauri-apps/plugin-fs")
        vi.mocked(copyFile).mockRejectedValueOnce(new Error("locked"))
        await expect(restoreBackup("easytask-20260101-100000.db")).rejects.toThrow("locked")
        expect(relaunch).not.toHaveBeenCalled()
        // the temp file is cleaned up and the db is usable again
        expect(files.has("/data/easytask.db.restoring")).toBe(false)
        expect(setRestoring.mock.calls).toEqual([[true], [false]])
    })

    it("rejects a backup of another application, without touching the database", async () => {
        seed("easytask-20260101-100000.db")
        validationRows.application_id = 0
        await expect(restoreBackup("easytask-20260101-100000.db")).rejects.toMatchObject({ code: "BACKUP_INVALID" })
        expect(validation.close).toHaveBeenCalled()
        expect(closeDB).not.toHaveBeenCalled()
        expect(db.execute).not.toHaveBeenCalled()
    })

    it("rejects a backup from a newer schema", async () => {
        seed("easytask-20260101-100000.db")
        validationRows.user_version = LATEST_SCHEMA_VERSION + 1
        await expect(restoreBackup("easytask-20260101-100000.db")).rejects.toMatchObject({ code: "BACKUP_NEWER" })
        expect(closeDB).not.toHaveBeenCalled()
    })

    it("rejects a backup failing the integrity check", async () => {
        seed("easytask-20260101-100000.db")
        validationRows.integrity = "*** in database main ***"
        await expect(restoreBackup("easytask-20260101-100000.db")).rejects.toMatchObject({ code: "BACKUP_INVALID" })
        expect(closeDB).not.toHaveBeenCalled()
    })

    it("rejects a file that cannot be opened as a database", async () => {
        seed("easytask-20260101-100000.db")
        loadValidation.mockRejectedValueOnce(new Error("file is not a database"))
        await expect(restoreBackup("easytask-20260101-100000.db")).rejects.toMatchObject({ code: "BACKUP_INVALID" })
        expect(closeDB).not.toHaveBeenCalled()
    })
})
