import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeNote, makeWorkspace } from "@/test/ui-fixtures"
import { pendingRename } from "@/lib/pending-rename"
import { NewNoteTabButton } from "./NewNoteTabButton"

const createWorkspaceNote = vi.fn()
const openNote = vi.fn()
const create = vi.fn()
let rootNotes = [makeNote({ id: 1, name: "Nuova nota" })]
let pane: number | null = 1

vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: makeWorkspace({ id: 4 }) }) }))
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceState: () => ({ workspaceDataTree: { rootFolders: [], rootNotes } }),
    useWorkspaceActions: () => ({ createWorkspaceNote }),
}))
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => ({ create }) }))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote }) }))
vi.mock("@/contexts/use-layout", () => ({ usePane: () => (pane === null ? null : { pane }), useLayout: () => ({ focused: 1 }) }))
vi.mock("@/lib/report-error", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/report-error")>(), reportError: vi.fn() }))
// Radix tooltips measure their arrow with a ResizeObserver, which jsdom lacks
vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } })

beforeEach(() => {
    vi.clearAllMocks()
    pendingRename.set(null)
    rootNotes = [makeNote({ id: 1, name: "Nuova nota" })]
    pane = 1
    createWorkspaceNote.mockResolvedValue(9)
})

describe("NewNoteTabButton", () => {
    it("creates a note in the root with a free name, opens it in its pane and asks to rename it", async () => {
        render(<NewNoteTabButton />)
        await userEvent.click(screen.getByRole("button", { name: "Nuova nota nella radice" }))
        await waitFor(() => expect(openNote).toHaveBeenCalledWith(9))
        // "Nuova nota" is taken among the root notes
        expect(createWorkspaceNote).toHaveBeenCalledWith(4, "Nuova nota (2)")
        expect(pendingRename.getState()).toEqual({ noteId: 9, pane: 1, onKeep: expect.any(Function) })
        // The undo step exists only once the note is kept (Escape in the name field deletes it instead)
        expect(create).not.toHaveBeenCalled()
        pendingRename.getState()?.onKeep?.()
        expect(create).toHaveBeenCalledWith("note", 9, "Nuova nota (2)")
    })

    it("tries the next name when the database says it exists (e.g. a trashed note)", async () => {
        rootNotes = []
        createWorkspaceNote.mockRejectedValueOnce({ code: "NOTE_EXISTS" }).mockResolvedValueOnce(5)
        render(<NewNoteTabButton />)
        await userEvent.click(screen.getByRole("button", { name: "Nuova nota nella radice" }))
        await waitFor(() => expect(openNote).toHaveBeenCalledWith(5))
        expect(createWorkspaceNote).toHaveBeenNthCalledWith(1, 4, "Nuova nota")
        expect(createWorkspaceNote).toHaveBeenNthCalledWith(2, 4, "Nuova nota (2)")
    })

    it("opens and renames nothing when the creation fails", async () => {
        createWorkspaceNote.mockRejectedValueOnce(new Error("boom"))
        render(<NewNoteTabButton />)
        await userEvent.click(screen.getByRole("button", { name: "Nuova nota nella radice" }))
        await waitFor(() => expect(createWorkspaceNote).toHaveBeenCalled())
        expect(openNote).not.toHaveBeenCalled()
        expect(pendingRename.getState()).toBeNull()
    })
})
