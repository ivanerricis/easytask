import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), report: vi.fn() }))
vi.mock("@/db/queries/note", () => ({ getDBPageBody: mocks.read, updateDBPageBody: mocks.write }))
vi.mock("./report-error", () => ({ reportError: mocks.report, resetReportErrorDedupe: () => {} }))

import { acquirePage, editPageText, flushAllPages, flushPage, getPageSnapshot, PAGE_SAVE_DELAY_MS, resetPageTexts } from "./page-text"

const loaded = async (id: number, text = "") => {
    mocks.read.mockResolvedValueOnce(text)
    const release = acquirePage(id)
    await vi.waitFor(() => expect(getPageSnapshot(id).status).toBe("ready"))
    return release
}

beforeEach(() => {
    mocks.read.mockReset()
    mocks.write.mockReset().mockResolvedValue(undefined)
    mocks.report.mockReset()
})
afterEach(() => {
    vi.useRealTimers()
    resetPageTexts()
})

describe("page text store", () => {
    it("reads the text once for every editor of the page", async () => {
        const first = await loaded(1, "hello")
        const second = acquirePage(1)
        expect(mocks.read).toHaveBeenCalledTimes(1)
        expect(getPageSnapshot(1)).toEqual({ status: "ready", text: "hello" })
        first()
        second()
    })

    it("ignores typing before the text is read", () => {
        mocks.read.mockReturnValue(new Promise(() => {}))
        acquirePage(1)
        editPageText(1, "x")
        expect(getPageSnapshot(1).status).toBe("loading")
        expect(mocks.write).not.toHaveBeenCalled()
    })

    it("saves the text as typed once the typing stops (one write for a burst)", async () => {
        await loaded(1)
        vi.useFakeTimers()
        editPageText(1, "a")
        editPageText(1, "a\n  b  ")
        expect(mocks.write).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(PAGE_SAVE_DELAY_MS)
        expect(mocks.write).toHaveBeenCalledTimes(1)
        expect(mocks.write).toHaveBeenCalledWith(1, "a\n  b  ")
    })

    it("flushes at once, and still writes the text of a page whose editor is gone", async () => {
        const release = await loaded(1)
        editPageText(1, "kept")
        release()
        await flushAllPages()
        expect(mocks.write).toHaveBeenCalledWith(1, "kept")
        // Saved and unused: forgotten, the next opening reads it again
        expect(getPageSnapshot(1).status).toBe("loading")
    })

    it("keeps the text unsaved after a failed write and reports it, then writes it on the next flush", async () => {
        await loaded(1)
        mocks.write.mockRejectedValueOnce(new Error("disk"))
        editPageText(1, "x")
        await flushPage(1)
        expect(mocks.report).toHaveBeenCalledTimes(1)
        await flushPage(1)
        expect(mocks.write).toHaveBeenCalledTimes(2)
    })

    it("does not write a text equal to the saved one", async () => {
        await loaded(1, "same")
        editPageText(1, "same")
        await flushPage(1)
        expect(mocks.write).not.toHaveBeenCalled()
    })
})
