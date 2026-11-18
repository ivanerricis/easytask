import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runAutoBackup = vi.fn()
const reportError = vi.fn()

vi.mock("@/db/backup", () => ({ runAutoBackup: (...a: unknown[]) => runAutoBackup(...a) }))
vi.mock("@/lib/report-error", () => ({ reportError: (...a: unknown[]) => reportError(...a), resetReportErrorDedupe: () => undefined }))

import { backupBeforeQuit, CLOSE_BACKUP_EVENT, CLOSE_BACKUP_TIMEOUT_MS } from "./close-backup"

const events: boolean[] = []
const listener = (event: Event) => events.push((event as CustomEvent<boolean>).detail)

beforeEach(() => {
    vi.useFakeTimers()
    events.length = 0
    runAutoBackup.mockReset().mockResolvedValue(true)
    reportError.mockReset()
    window.addEventListener(CLOSE_BACKUP_EVENT, listener)
})

afterEach(() => {
    window.removeEventListener(CLOSE_BACKUP_EVENT, listener)
    vi.useRealTimers()
})

describe("backupBeforeQuit", () => {
    it("runs the backup of the closing and waits for it", async () => {
        await backupBeforeQuit()
        expect(runAutoBackup).toHaveBeenCalledWith("close", expect.objectContaining({ onWriting: expect.any(Function) }))
    })

    it("shows the overlay only when a copy is written, and always hides it at the end", async () => {
        runAutoBackup.mockImplementation(async (_trigger: string, options: { onWriting: () => void }) => { options.onWriting(); return true })
        const onWriting = vi.fn()
        await backupBeforeQuit(onWriting)
        expect(onWriting).toHaveBeenCalledTimes(1)
        expect(events).toEqual([true, false])
    })

    it("hides the overlay even when no backup was due", async () => {
        runAutoBackup.mockResolvedValue(false)
        await backupBeforeQuit()
        expect(events).toEqual([false])
    })

    it("gives up after 20 seconds without waiting for a stuck backup", async () => {
        runAutoBackup.mockReturnValue(new Promise(() => undefined))
        let done = false
        const closing = backupBeforeQuit().then(() => { done = true })
        await vi.advanceTimersByTimeAsync(CLOSE_BACKUP_TIMEOUT_MS - 1)
        expect(done).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await closing
        expect(done).toBe(true)
        expect(events).toEqual([false])
    })

    it("never throws, whatever fails", async () => {
        runAutoBackup.mockRejectedValue(new Error("disk full"))
        await expect(backupBeforeQuit()).resolves.toBeUndefined()
        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "disk full" }))

        runAutoBackup.mockImplementation(async (_trigger: string, options: { onWriting: () => void }) => { options.onWriting(); return true })
        await expect(backupBeforeQuit(() => { throw new Error("no window") })).resolves.toBeUndefined()
    })
})
