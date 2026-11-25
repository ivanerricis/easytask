import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    mode: { value: "edit" as "edit" | "preview" },
    read: vi.fn(),
    write: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    pageText: vi.fn(),
    store: { current: null as unknown },
}))

vi.mock("@/contexts/use-tabs", () => ({ useActiveNoteId: () => 5 }))
vi.mock("@/contexts/use-page", () => ({ usePageMode: () => [mocks.mode.value, vi.fn()] }))
vi.mock("@/hooks/use-note-background", () => ({ useNoteBackgroundCss: () => undefined }))
vi.mock("@/contexts/undo/use-undo", () => ({
    useUndoRecorder: () => ({ pageText: mocks.pageText }),
    useOptionalUndo: () => ({ undo: mocks.undo, redo: mocks.redo }),
}))
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceState: () => ({ workspaceDataTree: { rootFolders: [], rootNotes: [{ id: 5, name: "My page", kind: "page" }] } }),
}))
vi.mock("@/db/queries/note", () => ({ getDBPageBody: mocks.read, updateDBPageBody: mocks.write }))
vi.mock("../note-search-context", () => ({ useNoteSearchStore: () => mocks.store.current }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }))

import { PageView } from "./PageView"
import { createNoteSearchStore } from "../note-search-store"
import { flushAllPages, resetPageTexts, setPageStepSink } from "@/lib/page-text"

beforeEach(() => {
    mocks.mode.value = "edit"
    mocks.read.mockReset().mockResolvedValue("# Title\n\nfox and Fox\n\n- [ ] item")
    mocks.write.mockReset().mockResolvedValue(undefined)
    mocks.undo.mockReset().mockResolvedValue(undefined)
    mocks.redo.mockReset().mockResolvedValue(undefined)
    mocks.pageText.mockReset()
    mocks.store.current = createNoteSearchStore()
})
afterEach(() => {
    resetPageTexts()
    setPageStepSink(null)
})

describe("PageView", () => {
    it("shows the saved text in the editor and saves what is typed, as typed", async () => {
        const user = userEvent.setup()
        render(<PageView />)
        const field = await screen.findByRole("textbox")
        expect(field).toHaveValue("# Title\n\nfox and Fox\n\n- [ ] item")
        await user.type(field, "!")
        await flushAllPages()
        expect(mocks.write).toHaveBeenCalledWith(5, "# Title\n\nfox and Fox\n\n- [ ] item!")
        // The saved burst is a step of the history, named after the page
        expect(mocks.pageText).toHaveBeenCalledWith(5, "My page", "# Title\n\nfox and Fox\n\n- [ ] item", "# Title\n\nfox and Fox\n\n- [ ] item!")
    })

    it("sends Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z to the history of the app instead of the textarea", async () => {
        const user = userEvent.setup()
        render(<PageView />)
        const field = await screen.findByRole("textbox")
        await user.click(field)
        await user.keyboard("{Control>}z{/Control}")
        await waitFor(() => expect(mocks.undo).toHaveBeenCalledTimes(1))
        await user.keyboard("{Control>}y{/Control}")
        await waitFor(() => expect(mocks.redo).toHaveBeenCalledTimes(1))
        await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}")
        await waitFor(() => expect(mocks.redo).toHaveBeenCalledTimes(2))
    })

    it("draws the preview, and a click on a box ticks it in the text", async () => {
        mocks.mode.value = "preview"
        const user = userEvent.setup()
        render(<PageView />)
        expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Title")
        await user.click(screen.getByRole("checkbox"))
        await flushAllPages()
        expect(mocks.write).toHaveBeenCalledWith(5, "# Title\n\nfox and Fox\n\n- [x] item")
    })

    it("tells that an empty page has nothing to show", async () => {
        mocks.mode.value = "preview"
        mocks.read.mockResolvedValue("  ")
        render(<PageView />)
        await waitFor(() => expect(screen.getByTestId("page-preview")).toHaveTextContent(/./))
        expect(screen.queryByRole("heading")).toBeNull()
    })

    it("searches the text: counts the matches, marks them on the layer under the textarea and steps through them", async () => {
        const store = mocks.store.current as ReturnType<typeof createNoteSearchStore>
        render(<PageView />)
        await screen.findByRole("textbox")
        act(() => { store.open(); store.setQuery("fox") })
        await waitFor(() => expect(store.getState().matches).toHaveLength(2))
        const marks = () => [...screen.getByTestId("page-text-marks").querySelectorAll("mark")]
        expect(marks().map(mark => mark.hasAttribute("data-active"))).toEqual([true, false])
        act(() => store.step(1))
        await waitFor(() => expect(marks().map(mark => mark.hasAttribute("data-active"))).toEqual([false, true]))
        act(() => store.close())
        await waitFor(() => expect(screen.queryByTestId("page-text-marks")).toBeNull())
    })

    it("searches the preview: the matches of what is drawn are marked", async () => {
        mocks.mode.value = "preview"
        const store = mocks.store.current as ReturnType<typeof createNoteSearchStore>
        render(<PageView />)
        await screen.findByRole("heading")
        act(() => { store.open(); store.setQuery("title") })
        await waitFor(() => expect(store.getState().matches).toHaveLength(1))
        expect(screen.getByTestId("page-preview").querySelectorAll("mark")).toHaveLength(1)
    })
})
