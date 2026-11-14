import { beforeEach, describe, expect, it, vi } from "vitest"
import { store } from "./initStore"
import { saveStoreSoon } from "./save-soon"
import { deleteWorkspaceTabs, getWorkspaceTabs, saveWorkspaceTabs } from "./tabs"

vi.mock("./initStore", () => ({ store: { get: vi.fn(), set: vi.fn(), save: vi.fn(), delete: vi.fn() } }))
vi.mock("./save-soon", () => ({ saveStoreSoon: vi.fn().mockResolvedValue(undefined) }))

const empty = { left: { openIds: [], activeId: null }, right: null, focused: 0 }

describe("workspace tabs store", () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    describe("getWorkspaceTabs", () => {
        it("reads under the per-workspace key", async () => {
            vi.mocked(store.get).mockResolvedValue(undefined)
            expect(await getWorkspaceTabs(7)).toEqual(empty)
            expect(store.get).toHaveBeenCalledWith("openTabs:7")
        })

        it("reads the legacy shape as the left pane", async () => {
            vi.mocked(store.get).mockResolvedValue({ openIds: [3, 1], activeId: 1 })
            expect(await getWorkspaceTabs(7)).toEqual({ left: { openIds: [3, 1], activeId: 1 }, right: null, focused: 0 })
        })

        it("reads the version 2 layout", async () => {
            vi.mocked(store.get).mockResolvedValue({
                version: 2, left: { openIds: [1, 2], activeId: 2 }, right: { openIds: [3], activeId: 3 }, focused: 1,
            })
            expect(await getWorkspaceTabs(7)).toEqual({
                left: { openIds: [1, 2], activeId: 2 }, right: { openIds: [3], activeId: 3 }, focused: 1,
            })
        })

        it("keeps an empty right pane", async () => {
            vi.mocked(store.get).mockResolvedValue({ version: 2, left: { openIds: [1], activeId: 1 }, right: { openIds: [], activeId: null }, focused: 1 })
            expect(await getWorkspaceTabs(7)).toEqual({ left: { openIds: [1], activeId: 1 }, right: { openIds: [], activeId: null }, focused: 1 })
        })

        it("sanitizes ids, makes the active id valid and normalizes the layout", async () => {
            vi.mocked(store.get).mockResolvedValue({
                version: 2,
                left: { openIds: [1, "x", null, Number.NaN, 2, 1], activeId: 99 },
                right: { openIds: [2, 4], activeId: 2 },
                focused: 7,
            })
            expect(await getWorkspaceTabs(7)).toEqual({
                left: { openIds: [1, 2], activeId: 1 }, right: { openIds: [4], activeId: 4 }, focused: 0,
            })
        })

        it("promotes the right pane when the left one is empty", async () => {
            vi.mocked(store.get).mockResolvedValue({ version: 2, left: { openIds: [], activeId: null }, right: { openIds: [5], activeId: 5 }, focused: 1 })
            expect(await getWorkspaceTabs(7)).toEqual({ left: { openIds: [5], activeId: 5 }, right: null, focused: 0 })
        })

        it.each([
            ["null", null],
            ["a string", "tabs"],
            ["a number", 3],
            ["an array", [1, 2]],
            ["an object with wrong types", { openIds: "no", activeId: "no" }],
            ["a version 2 with malformed panes", { version: 2, left: "x", right: 5, focused: "y" }],
        ])("returns an empty layout for %s", async (_name, value) => {
            vi.mocked(store.get).mockResolvedValue(value)
            expect(await getWorkspaceTabs(7)).toEqual(empty)
        })
    })

    describe("saveWorkspaceTabs", () => {
        it("saves the version 2 payload for a single pane", async () => {
            vi.mocked(store.set).mockResolvedValue(undefined)
            await saveWorkspaceTabs(7, { left: { openIds: [1, 2], activeId: 2 }, right: null, focused: 0 })
            expect(store.set).toHaveBeenCalledWith("openTabs:7", {
                version: 2, left: { openIds: [1, 2], activeId: 2 }, right: null, focused: 0,
            })
        })

        it("saves both panes and the focused one when split", async () => {
            vi.mocked(store.set).mockResolvedValue(undefined)
            await saveWorkspaceTabs(7, { left: { openIds: [1], activeId: 1 }, right: { openIds: [2], activeId: 2 }, focused: 1 })
            expect(store.set).toHaveBeenCalledWith("openTabs:7", {
                version: 2, left: { openIds: [1], activeId: 1 }, right: { openIds: [2], activeId: 2 }, focused: 1,
            })
        })
    })
})

describe("deleteWorkspaceTabs", () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it("deletes the per-workspace key and saves", async () => {
        await deleteWorkspaceTabs(7)
        expect(store.delete).toHaveBeenCalledWith("openTabs:7")
        expect(saveStoreSoon).toHaveBeenCalled()
    })
})
