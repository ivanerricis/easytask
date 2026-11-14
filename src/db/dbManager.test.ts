import { beforeEach, describe, expect, it, vi } from "vitest"
import { createMockDb, type MockDb } from "@/test/db-mock"

const load = vi.fn()
const ensureAppFolder = vi.fn()
const initDB = vi.fn()

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: (...a: unknown[]) => load(...a) } }))
vi.mock("@tauri-apps/api/path", () => ({
    documentDir: vi.fn(async () => "/docs"),
    join: vi.fn(async (...parts: string[]) => parts.join("/")),
}))
vi.mock("./appPaths", () => ({ ensureAppFolder: () => ensureAppFolder() }))
vi.mock("./initDb", () => ({ initDB: (...a: unknown[]) => initDB(...a) }))
const createBackup = vi.fn()
const reportError = vi.fn()
vi.mock("./backup", () => ({ createPreMigrationBackup: (...a: unknown[]) => createBackup(...a) }))
vi.mock("@/lib/report-error", async (importOriginal) => ({ ...(await importOriginal<object>()), reportError: (...a: unknown[]) => reportError(...a) }))

const ask = vi.fn()
const exit = vi.fn()
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: (...a: unknown[]) => ask(...a) }))
vi.mock("@tauri-apps/plugin-process", () => ({ exit: (...a: unknown[]) => exit(...a) }))

let db: MockDb

// The module keeps a singleton promise, so load a fresh copy per test
async function freshGetDB() {
    vi.resetModules()
    return (await import("./dbManager")).getDB
}

beforeEach(() => {
    db = createMockDb()
    load.mockReset().mockImplementation(async () => db)
    ensureAppFolder.mockReset().mockResolvedValue("/docs/EasyTask")
    initDB.mockReset().mockResolvedValue(undefined)
    createBackup.mockReset().mockResolvedValue(undefined)
    reportError.mockReset()
    ask.mockReset()
    exit.mockReset().mockResolvedValue(undefined)
})

describe("getDB", () => {
    it("loads the sqlite file and runs the migrations", async () => {
        const getDB = await freshGetDB()
        const result = await getDB()
        expect(result).toBe(db)
        expect(load).toHaveBeenCalledWith("sqlite:/docs/EasyTask/easytask.db")
        expect(initDB).toHaveBeenCalledWith(db, expect.objectContaining({ beforeMigrate: expect.any(Function) }))
    })

    it("takes a pre-migration backup of the connection being opened", async () => {
        const getDB = await freshGetDB()
        await getDB()
        const { beforeMigrate } = initDB.mock.calls[0][1] as { beforeMigrate: (d: unknown, from: number, to: number) => Promise<void> }
        await beforeMigrate(db, 6, 7)
        expect(createBackup).toHaveBeenCalledWith(db, 6, 7)
    })

    describe("when the pre-migration backup fails", () => {
        const beforeMigrateOf = async () => {
            const getDB = await freshGetDB()
            await getDB()
            createBackup.mockRejectedValueOnce(new Error("disk full"))
            return (initDB.mock.calls[0][1] as { beforeMigrate: (d: unknown, from: number, to: number) => Promise<void> }).beforeMigrate
        }

        it("asks the user with a blocking dialog and migrates anyway on \"Continue anyway\"", async () => {
            const beforeMigrate = await beforeMigrateOf()
            ask.mockResolvedValueOnce(true)
            await expect(beforeMigrate(db, 6, 7)).resolves.toBeUndefined()
            expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "disk full" }))
            expect(ask).toHaveBeenCalledTimes(1)
            expect(ask.mock.calls[0][0]).toContain("disk full")
            expect(ask.mock.calls[0][1]).toMatchObject({ kind: "warning", title: expect.any(String), okLabel: expect.any(String), cancelLabel: expect.any(String) })
            expect(exit).not.toHaveBeenCalled()
        })

        it("exits the app and aborts the migration on \"Exit\"", async () => {
            const beforeMigrate = await beforeMigrateOf()
            ask.mockResolvedValueOnce(false)
            await expect(beforeMigrate(db, 6, 7)).rejects.toMatchObject({ code: "DB_MIGRATION_CANCELLED" })
            expect(exit).toHaveBeenCalledWith(0)
        })

        it("does not migrate when the dialog cannot be shown", async () => {
            const beforeMigrate = await beforeMigrateOf()
            ask.mockRejectedValueOnce(new Error("no window"))
            await expect(beforeMigrate(db, 6, 7)).rejects.toMatchObject({ code: "DB_MIGRATION_CANCELLED" })
            expect(exit).toHaveBeenCalledWith(0)
        })

        it("does not ask when the backup succeeds or already exists", async () => {
            const getDB = await freshGetDB()
            await getDB()
            const { beforeMigrate } = initDB.mock.calls[0][1] as { beforeMigrate: (d: unknown, from: number, to: number) => Promise<void> }
            createBackup.mockResolvedValueOnce(null)
            await beforeMigrate(db, 6, 7)
            expect(ask).not.toHaveBeenCalled()
        })

        it("rejects getDB and closes the connection when the user exits", async () => {
            initDB.mockImplementationOnce(async (_db: unknown, options: { beforeMigrate: (d: unknown, from: number, to: number) => Promise<void> }) => {
                createBackup.mockRejectedValueOnce(new Error("disk full"))
                await options.beforeMigrate(db, 6, 7)
            })
            ask.mockResolvedValueOnce(false)
            const getDB = await freshGetDB()
            await expect(getDB()).rejects.toMatchObject({ code: "DB_MIGRATION_CANCELLED" })
            expect(db.close).toHaveBeenCalledTimes(1)
        })
    })

    it("creates the database once for concurrent calls", async () => {
        const getDB = await freshGetDB()
        const [a, b, c] = await Promise.all([getDB(), getDB(), getDB()])
        expect(a).toBe(b)
        expect(b).toBe(c)
        expect(load).toHaveBeenCalledTimes(1)
        expect(initDB).toHaveBeenCalledTimes(1)
    })

    it("memoizes the promise across sequential calls", async () => {
        const getDB = await freshGetDB()
        const p1 = getDB()
        await p1
        expect(getDB()).toBe(p1)
        expect(load).toHaveBeenCalledTimes(1)
    })

    it("closes the connection and rejects when the migration fails", async () => {
        initDB.mockRejectedValueOnce(new Error("migration failed"))
        const getDB = await freshGetDB()
        await expect(getDB()).rejects.toThrow("migration failed")
        expect(db.close).toHaveBeenCalledTimes(1)
    })

    it("still rejects with the migration error if close fails", async () => {
        initDB.mockRejectedValueOnce(new Error("migration failed"))
        db.close.mockRejectedValueOnce(new Error("close failed"))
        const getDB = await freshGetDB()
        await expect(getDB()).rejects.toThrow("migration failed")
    })

    it("resets after a failure so the next call retries", async () => {
        load.mockRejectedValueOnce(new Error("cannot open"))
        const getDB = await freshGetDB()
        await expect(getDB()).rejects.toThrow("cannot open")
        await expect(getDB()).resolves.toBe(db)
        expect(load).toHaveBeenCalledTimes(2)
    })

    it("closeDB closes the connection so the next call reopens the file", async () => {
        vi.resetModules()
        const { getDB, closeDB } = await import("./dbManager")
        await getDB()
        await closeDB()
        expect(db.close).toHaveBeenCalledTimes(1)
        await getDB()
        expect(load).toHaveBeenCalledTimes(2)
    })

    it("getDB rejects while a restore is in progress and works again afterwards", async () => {
        vi.resetModules()
        const { getDB, setRestoring } = await import("./dbManager")
        setRestoring(true)
        await expect(getDB()).rejects.toMatchObject({ code: "DB_RESTORING" })
        expect(load).not.toHaveBeenCalled()
        setRestoring(false)
        await expect(getDB()).resolves.toBe(db)
    })

    it("closeDB does nothing when the database was never opened", async () => {
        vi.resetModules()
        const { closeDB } = await import("./dbManager")
        await closeDB()
        expect(db.close).not.toHaveBeenCalled()
    })

    it("shares the same failure among concurrent callers", async () => {
        ensureAppFolder.mockRejectedValueOnce(new Error("no folder"))
        const getDB = await freshGetDB()
        const results = await Promise.allSettled([getDB(), getDB()])
        expect(results.map(r => r.status)).toEqual(["rejected", "rejected"])
        expect(ensureAppFolder).toHaveBeenCalledTimes(1)
    })
})
