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

describe("page text history", () => {
    it("hands each saved burst to the history as one step, from the last saved text", async () => {
        const { setPageStepSink } = await import("./page-text")
        const steps: [number, string, string][] = []
        setPageStepSink((id, before, after) => steps.push([id, before, after]))
        await loaded(1, "start")
        editPageText(1, "start a")
        editPageText(1, "start ab")
        await flushPage(1)
        editPageText(1, "start abc")
        await flushPage(1)
        expect(steps).toEqual([[1, "start", "start ab"], [1, "start ab", "start abc"]])
        setPageStepSink(null)
    })

    it("does not record a step when the write fails or the text came back to the saved one", async () => {
        const { setPageStepSink } = await import("./page-text")
        const sink = vi.fn()
        setPageStepSink(sink)
        await loaded(1, "same")
        mocks.write.mockRejectedValueOnce(new Error("disk"))
        editPageText(1, "other")
        await flushPage(1)
        expect(sink).not.toHaveBeenCalled()
        editPageText(1, "same")
        await flushPage(1)
        expect(sink).not.toHaveBeenCalled()
        setPageStepSink(null)
    })

    it("applies a text from the history: shown and saved at once, and not recorded again", async () => {
        const { applyPageText, setPageStepSink } = await import("./page-text")
        const sink = vi.fn()
        setPageStepSink(sink)
        await loaded(1, "a")
        editPageText(1, "ab")
        await applyPageText(1, "zzz")
        expect(getPageSnapshot(1).text).toBe("zzz")
        expect(mocks.write).toHaveBeenLastCalledWith(1, "zzz")
        await flushPage(1)
        expect(sink).not.toHaveBeenCalled()
        // A page nobody shows is written straight in the database
        await applyPageText(7, "other page")
        expect(mocks.write).toHaveBeenLastCalledWith(7, "other page")
        setPageStepSink(null)
    })
})

describe("page text loading", () => {
    it("reports a page that cannot be read and does not accept typing in it", async () => {
        mocks.read.mockRejectedValueOnce(new Error("locked"))
        acquirePage(3)
        await vi.waitFor(() => expect(getPageSnapshot(3).status).toBe("failed"))
        expect(mocks.report).toHaveBeenCalledTimes(1)
        editPageText(3, "x")
        expect(getPageSnapshot(3)).toEqual({ status: "failed", text: "" })
        expect(mocks.write).not.toHaveBeenCalled()
    })

    it("shows nothing for no page, and forgets a page nobody shows once released", async () => {
        expect(getPageSnapshot(null).status).toBe("loading")
        const release = await loaded(4, "kept")
        release()
        release()
        expect(getPageSnapshot(4).status).toBe("loading")
    })

    it("tells the listeners when a page is loaded and edited, and stops after unsubscribing", async () => {
        const { subscribePages } = await import("./page-text")
        const listener = vi.fn()
        const stop = subscribePages(listener)
        await loaded(5, "a")
        editPageText(5, "ab")
        expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2)
        stop()
        const count = listener.mock.calls.length
        editPageText(5, "abc")
        expect(listener).toHaveBeenCalledTimes(count)
    })

    it("writes the text typed during a write in a second write", async () => {
        await loaded(6, "a")
        let release: () => void = () => {}
        mocks.write.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
        editPageText(6, "ab")
        const first = flushPage(6)
        editPageText(6, "abc")
        release()
        await first
        await flushPage(6)
        expect(mocks.write).toHaveBeenCalledTimes(2)
        expect(mocks.write).toHaveBeenLastCalledWith(6, "abc")
    })
})
