import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    openNote: vi.fn(),
    search: vi.fn(),
    flush: vi.fn(),
    shortcut: { handler: null as null | (() => void) },
}))

vi.mock("@/hooks/use-all-notes", () => ({
    useAllNotes: () => [
        { note: { id: 1, name: "Alpha", kind: "page" }, path: "Docs" },
        { note: { id: 2, name: "Beta", kind: "page" }, path: "" },
    ],
}))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote: mocks.openNote }) }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 9, name: "WS" } }) }))
vi.mock("@/contexts/undo/use-undo", () => ({ useOptionalUndo: () => null }))
vi.mock("@/contexts/use-shortcuts", () => ({ useShortcutKeys: () => ["Ctrl", "K"], useShortcutLabel: () => "Ctrl+K" }))
vi.mock("@/hooks/use-shortcut", () => ({ useShortcut: (_id: string, handler: () => void) => { mocks.shortcut.handler = handler } }))
vi.mock("@/db/queries/note", () => ({ searchDBPageText: mocks.search }))
vi.mock("@/lib/page-text", () => ({ flushAllPages: mocks.flush }))

import { CommandMenu } from "./CommandMenu"

beforeEach(() => {
    mocks.openNote.mockReset()
    mocks.search.mockReset().mockResolvedValue([{ id: 2, snippet: "…the quick brown fox…" }])
    mocks.flush.mockReset().mockResolvedValue(undefined)
})

describe("CommandMenu search in the text of the pages", () => {
    it("also lists the pages whose text has the words, with a snippet, and opens the chosen one", async () => {
        const user = userEvent.setup()
        render(<CommandMenu />)
        act(() => mocks.shortcut.handler?.())
        await user.type(await screen.findByRole("combobox"), "fox")
        await waitFor(() => expect(screen.getByTestId("search-snippet")).toHaveTextContent("quick brown fox"))
        expect(mocks.flush).toHaveBeenCalled()
        expect(mocks.search).toHaveBeenCalledWith(9, "fox")
        // The name does not match "fox": only the page found in the text stays in the list
        expect(screen.queryByText("Alpha")).toBeNull()
        await user.click(screen.getByText("Beta"))
        expect(mocks.openNote).toHaveBeenCalledWith(2)
    })

    it("has an action that opens the statistics tab", async () => {
        const user = userEvent.setup()
        render(<CommandMenu />)
        act(() => mocks.shortcut.handler?.())
        await user.click(await screen.findByText("Statistiche"))
        expect(mocks.openNote).toHaveBeenCalledWith(-2)
    })

    it("does not read the database for an empty query", async () => {
        render(<CommandMenu />)
        act(() => mocks.shortcut.handler?.())
        await screen.findByRole("combobox")
        await new Promise(resolve => setTimeout(resolve, 300))
        expect(mocks.search).not.toHaveBeenCalled()
    })
})
