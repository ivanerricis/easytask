import { beforeEach, describe, expect, it, vi } from "vitest"

const flushStore = vi.fn()
const save = vi.fn()
const reportError = vi.fn()
vi.mock("./store/save-soon", () => ({ flushStore: () => flushStore() }))
vi.mock("./store/initStore", () => ({ store: { save: () => save() } }))
vi.mock("./report-error", () => ({ reportError: (...a: unknown[]) => reportError(...a), resetReportErrorDedupe: () => undefined }))

import { flushStoreReporting } from "./flush-store"

beforeEach(() => {
    flushStore.mockReset().mockResolvedValue(undefined)
    save.mockReset().mockResolvedValue(undefined)
    reportError.mockReset()
})

describe("flushStoreReporting", () => {
    it("does nothing more when the save works", async () => {
        await flushStoreReporting()
        expect(save).not.toHaveBeenCalled()
        expect(reportError).not.toHaveBeenCalled()
    })

    it("retries once on the store after a failure, without reporting when the retry works", async () => {
        flushStore.mockRejectedValueOnce(new Error("locked"))
        await flushStoreReporting()
        expect(save).toHaveBeenCalledTimes(1)
        expect(reportError).not.toHaveBeenCalled()
    })

    it("reports the error when the retry fails too", async () => {
        flushStore.mockRejectedValueOnce(new Error("locked"))
        save.mockRejectedValueOnce(new Error("disk full"))
        await expect(flushStoreReporting()).resolves.toBeUndefined()
        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "disk full" }))
    })
})
