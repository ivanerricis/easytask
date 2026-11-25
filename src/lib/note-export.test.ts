import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ write: vi.fn(), body: vi.fn(), flush: vi.fn(), print: vi.fn(), order: [] as string[] }))
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: mocks.write }))
vi.mock("@/db/queries/note", () => ({ getDBPageBody: mocks.body }))
vi.mock("./page-text", () => ({ flushPage: mocks.flush }))
vi.mock("./note-print", () => ({ printNote: vi.fn(), printPage: mocks.print }))

import { copyPageAsMarkdown, printPageAsPdf } from "./note-export"

beforeEach(() => {
    mocks.order.length = 0
    mocks.write.mockReset().mockImplementation(async () => { mocks.order.push("write") })
    mocks.body.mockReset().mockImplementation(async () => { mocks.order.push("read"); return "# Saved text" })
    mocks.flush.mockReset().mockImplementation(async () => { mocks.order.push("flush") })
    mocks.print.mockReset()
})

describe("exporting a page", () => {
    it("copies the saved text as it is, after writing what is typed", async () => {
        await copyPageAsMarkdown(4)
        expect(mocks.order).toEqual(["flush", "read", "write"])
        expect(mocks.write).toHaveBeenCalledWith("# Saved text")
    })

    it("prints the saved text with the name of the page as the title", async () => {
        await printPageAsPdf(4, "My page")
        expect(mocks.flush).toHaveBeenCalledWith(4)
        expect(mocks.print).toHaveBeenCalledWith("# Saved text", "My page")
    })
})
