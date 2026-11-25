import { describe, expect, it, vi } from "vitest"

const applyPageText = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock("@/lib/page-text", () => ({ applyPageText }))

import { pageCommands } from "./page"

describe("pageText command", () => {
    it("puts the text before on undo and the text after on redo, and names the page in the label", async () => {
        const command = pageCommands().pageText(5, "My page", "old", "new")
        expect(command.label).toContain("My page")
        await command.undo()
        expect(applyPageText).toHaveBeenLastCalledWith(5, "old")
        await command.redo()
        expect(applyPageText).toHaveBeenLastCalledWith(5, "new")
    })

    it("rejects when the write fails, so the history reports it", async () => {
        applyPageText.mockRejectedValueOnce(new Error("disk"))
        await expect(pageCommands().pageText(5, "P", "a", "b").undo()).rejects.toThrow("disk")
    })
})
