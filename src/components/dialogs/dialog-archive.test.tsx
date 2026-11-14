import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { toast } from "sonner"
import { DialogArchive } from "./dialog-archive"
import { makeWorkspace } from "@/test/ui-fixtures"
import type { ArchiveItem } from "@/types/types"

const data = {
    getArchive: vi.fn(),
    unarchiveItem: vi.fn(),
    deleteItem: vi.fn(),
    getWorkspaceData: vi.fn(),
}
const note = { refreshActiveNote: vi.fn() }
const recorder = makeUndoRecorderMock()
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => data }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => note }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: makeWorkspace({ id: 4 }) }) }))
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const items: ArchiveItem[] = [
    { type: "note", id: 2, name: "Nota B", context: "Cartella A", summary: "2 gruppi · 3 sezioni", archived_at: "2026-09-02 08:05:00" },
    { type: "note", id: 5, name: "Nota E", context: "", summary: "", archived_at: "2026-09-03 09:00:00" },
    { type: "section", id: 7, name: "Sezione G", context: "Nota B", summary: "4 task", archived_at: "2026-09-04 12:00:00" },
]

describe("DialogArchive", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        data.getArchive.mockResolvedValue(items)
        data.unarchiveItem.mockResolvedValue(undefined)
        data.deleteItem.mockResolvedValue(undefined)
        data.getWorkspaceData.mockResolvedValue(undefined)
        note.refreshActiveNote.mockResolvedValue(undefined)
    })

    it("lists the types with their counts and selects the first non-empty one", async () => {
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText("Nota B")).toBeInTheDocument()
        expect(data.getArchive).toHaveBeenCalledWith(4)
        expect(screen.getByRole("tablist")).toBeInTheDocument()
        expect(screen.getByRole("tab", { name: /Cartelle/ })).toHaveTextContent("0")
        expect(screen.getByRole("tab", { name: /Note/ })).toHaveTextContent("2")
        expect(screen.getByRole("tab", { name: /Sezioni/ })).toHaveTextContent("1")
        expect(screen.getByRole("tab", { name: /Note/ })).toHaveAttribute("aria-selected", "true")
        expect(screen.getByText("Nota E")).toBeInTheDocument()
        expect(screen.queryByText("Sezione G")).not.toBeInTheDocument()
    })

    it("la descrizione lascia spazio alla X di chiusura (pr-10)", async () => {
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText(/Gli elementi archiviati sono nascosti da/)).toHaveClass("pr-10")
    })

    it("shows context, summary and archive date of a row", async () => {
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText("Cartella A · 2 gruppi · 3 sezioni · Archiviato il 02/09/2026 08:05")).toBeInTheDocument()
    })

    it("switches type by click and with the arrow keys", async () => {
        const user = userEvent.setup()
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        await screen.findByText("Nota B")
        await user.click(screen.getByRole("tab", { name: /Sezioni/ }))
        expect(screen.getByText("Sezione G")).toBeInTheDocument()
        expect(screen.queryByText("Nota B")).not.toBeInTheDocument()

        await user.keyboard("{ArrowUp}")
        expect(screen.getByRole("tab", { name: /Gruppi/ })).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("tab", { name: /Gruppi/ })).toHaveFocus()
        expect(screen.getByText("Nessun elemento archiviato di questo tipo")).toBeInTheDocument()
        await user.keyboard("{Home}")
        expect(screen.getByRole("tab", { name: /Cartelle/ })).toHaveAttribute("aria-selected", "true")
    })

    it("shows the empty state of the whole archive in the tabbed layout", async () => {
        data.getArchive.mockResolvedValue([])
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText("L'archivio è vuoto")).toBeInTheDocument()
        // The layout stays the one with the tabs (all at 0), so opening an empty archive does not change the layout
        expect(screen.getByRole("tablist")).toBeInTheDocument()
    })

    it("restores an item, records the undo step and reloads tree and note", async () => {
        const user = userEvent.setup()
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        await user.click(await screen.findByRole("button", { name: "Ripristina Nota B" }))

        await waitFor(() => expect(data.unarchiveItem).toHaveBeenCalledWith("note", 2))
        expect(recorder.unarchive).toHaveBeenCalledWith("note", 2, "Nota B")
        await waitFor(() => expect(data.getWorkspaceData).toHaveBeenCalledWith(4))
        expect(note.refreshActiveNote).toHaveBeenCalled()
        expect(toast.success).toHaveBeenCalledWith("Elemento ripristinato dall'archivio")
        await waitFor(() => expect(data.getArchive).toHaveBeenCalledTimes(2))
    })

    it("shows the error inline when the restore fails and records nothing", async () => {
        const user = userEvent.setup()
        data.unarchiveItem.mockRejectedValue(new Error("Esiste già un elemento con questo nome"))
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        await user.click(await screen.findByRole("button", { name: "Ripristina Nota B" }))

        expect(await screen.findByRole("alert")).toHaveTextContent("Esiste già un elemento con questo nome")
        expect(recorder.unarchive).not.toHaveBeenCalled()
    })

    it("moves an item to the trash only after confirmation and records the removal", async () => {
        const user = userEvent.setup()
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        await user.click(await screen.findByRole("button", { name: "Sposta Nota B nel cestino" }))
        expect(data.deleteItem).not.toHaveBeenCalled()

        await user.click(within(await screen.findByRole("dialog", { name: "Spostare nel cestino?" })).getByRole("button", { name: "Sposta nel cestino" }))
        await waitFor(() => expect(data.deleteItem).toHaveBeenCalledWith("note", 2))
        expect(recorder.remove).toHaveBeenCalledWith("note", 2, "Nota B")
        await waitFor(() => expect(data.getWorkspaceData).toHaveBeenCalledWith(4))
        expect(toast.success).toHaveBeenCalledWith("Elemento spostato nel cestino")
    })

    it("cancelling the confirmation does nothing", async () => {
        const user = userEvent.setup()
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        await user.click(await screen.findByRole("button", { name: "Sposta Nota B nel cestino" }))
        await user.click(within(await screen.findByRole("dialog", { name: "Spostare nel cestino?" })).getByRole("button", { name: "Annulla" }))
        expect(data.deleteItem).not.toHaveBeenCalled()
    })

    it("shows the error inline when moving to the trash fails", async () => {
        const user = userEvent.setup()
        data.deleteItem.mockRejectedValue(new Error("boom"))
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        await user.click(await screen.findByRole("button", { name: "Sposta Nota B nel cestino" }))
        await user.click(within(await screen.findByRole("dialog", { name: "Spostare nel cestino?" })).getByRole("button", { name: "Sposta nel cestino" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("boom")
        expect(recorder.remove).not.toHaveBeenCalled()
    })

    it("shows the error when the archive cannot be loaded", async () => {
        data.getArchive.mockRejectedValue(new Error("lettura fallita"))
        render(<DialogArchive isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByRole("alert")).toHaveTextContent("lettura fallita")
    })
})
