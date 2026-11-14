import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { DialogTrash, DialogTrashWorkspaces } from "./dialog-trash"
import { makeWorkspace } from "@/test/ui-fixtures"
import { UndoContext, type UndoContextType } from "@/contexts/undo/context"
import type { TrashItem } from "@/types/types"

const data = {
    getTrash: vi.fn(),
    restoreItem: vi.fn(),
    purgeItem: vi.fn(),
    emptyTrash: vi.fn(),
    getWorkspaceData: vi.fn(),
}
const note = { refreshActiveNote: vi.fn() }
const ws = {
    currentWorkspace: makeWorkspace({ id: 4 }),
    getTrashedWorkspaces: vi.fn(),
    restoreWorkspace: vi.fn(),
    purgeWorkspace: vi.fn(),
}
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => data }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => note }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ws }))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const items: TrashItem[] = [
    { type: "folder", id: 1, name: "Cartella A", context: "", summary: "1 sottocartella · 2 note", deleted_at: "2026-09-01 10:30:00" },
    { type: "note", id: 2, name: "Nota B", context: "Cartella A", summary: "", deleted_at: "2026-09-02 08:05:00" },
    { type: "task", id: 3, name: "Task C", context: "Nota B › Sezione 1", summary: "Vuoto", deleted_at: "2026-09-03 12:00:00" },
]

/** Opens the tab of a kind of item (the trash shows one kind at a time). */
const openTab = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) =>
    user.click(await screen.findByRole("tab", { name }))

describe("DialogTrash templates", () => {
    it("shows a deleted template in its own group and restores it as a template", async () => {
        const user = userEvent.setup()
        vi.resetAllMocks()
        data.getTrash.mockResolvedValue([{ type: "note_template", id: 5, name: "Retro", context: "Da: Sprint", summary: "2 gruppi · 3 sezioni · 6 task", deleted_at: "2026-09-04 09:00:00" }])
        data.restoreItem.mockResolvedValue(undefined)
        data.getWorkspaceData.mockResolvedValue(undefined)
        note.refreshActiveNote.mockResolvedValue(undefined)
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByRole("tab", { name: /Template/ })).toHaveAttribute("aria-selected", "true")
        expect(screen.getByText(/Da: Sprint · 2 gruppi · 3 sezioni · 6 task · Eliminato il 04\/09\/2026 09:00/)).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Ripristina Retro" }))
        await waitFor(() => expect(data.restoreItem).toHaveBeenCalledWith("note_template", 5))
    })
})

describe("DialogTrash", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        data.getTrash.mockResolvedValue(items)
        data.restoreItem.mockResolvedValue(undefined)
        data.purgeItem.mockResolvedValue(undefined)
        data.emptyTrash.mockResolvedValue(undefined)
        data.getWorkspaceData.mockResolvedValue(undefined)
        note.refreshActiveNote.mockResolvedValue(undefined)
    })

    it("shows one tab per type with its count and the first type that has items", async () => {
        const user = userEvent.setup()
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText("Cartella A")).toBeInTheDocument()
        expect(data.getTrash).toHaveBeenCalledWith(4)
        expect(screen.getByRole("tablist")).toBeInTheDocument()
        expect(screen.getByRole("tab", { name: /Cartelle/ })).toHaveTextContent("1")
        expect(screen.getByRole("tab", { name: /Sezioni/ })).toHaveTextContent("0")
        expect(screen.getByRole("tab", { name: /Cartelle/ })).toHaveAttribute("aria-selected", "true")
        // Only the selected type is listed
        expect(screen.queryByText("Nota B")).not.toBeInTheDocument()

        await openTab(user, /Note/)
        expect(screen.getByText(/Cartella A · Eliminato il 02\/09\/2026 08:05/)).toBeInTheDocument()
        expect(screen.queryByText("Cartella A")).not.toBeInTheDocument()
    })

    it("la descrizione lascia spazio alla X di chiusura (pr-10)", async () => {
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText(/Ripristina gli elementi eliminati oppure/)).toHaveClass("pr-10")
    })

    it("says so when the selected type has no items", async () => {
        const user = userEvent.setup()
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        await screen.findByText("Cartella A")
        await openTab(user, /Sezioni/)
        expect(screen.getByText("Nessun elemento di questo tipo nel cestino")).toBeInTheDocument()
    })

    it("moves between the tabs with the arrow keys", async () => {
        const user = userEvent.setup()
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        await screen.findByText("Cartella A")
        screen.getByRole("tab", { name: /Cartelle/ }).focus()
        await user.keyboard("{ArrowDown}")
        expect(screen.getByRole("tab", { name: /Note/ })).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("tab", { name: /Note/ })).toHaveFocus()
    })

    it("shows what a deleted item contained between context and date, with the full text as title", async () => {
        const user = userEvent.setup()
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        const folderLine = await screen.findByText("1 sottocartella · 2 note · Eliminato il 01/09/2026 10:30")
        expect(folderLine).toHaveAttribute("title", "1 sottocartella · 2 note · Eliminato il 01/09/2026 10:30")
        await openTab(user, /Task/)
        expect(screen.getByText("Nota B › Sezione 1 · Vuoto · Eliminato il 03/09/2026 12:00")).toBeInTheDocument()
    })

    it("nel piè di pagina Chiudi sta a sinistra e Svuota cestino (l'azione) a destra", async () => {
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        const empty = await screen.findByRole("button", { name: "Svuota cestino" })
        const footer = empty.closest("[data-slot=dialog-footer]") as HTMLElement
        const close = within(footer).getByRole("button", { name: "Chiudi" })
        expect(close.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("shows the empty state and disables emptying", async () => {
        data.getTrash.mockResolvedValue([])
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText("Il cestino è vuoto")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Svuota cestino" })).toBeDisabled()
    })

    it("shows only the error, with a retry, when the load fails", async () => {
        const user = userEvent.setup()
        data.getTrash.mockRejectedValueOnce(new Error("db locked"))
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByRole("alert")).toHaveTextContent("db locked")
        expect(screen.queryByText("Il cestino è vuoto")).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Riprova" }))
        expect(await screen.findByText("Cartella A")).toBeInTheDocument()
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })

    it("restores an item and reloads workspace and note data", async () => {
        const user = userEvent.setup()
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        await openTab(user, /Note/)
        await user.click(await screen.findByRole("button", { name: "Ripristina Nota B" }))

        await waitFor(() => expect(data.restoreItem).toHaveBeenCalledWith("note", 2))
        await waitFor(() => expect(data.getWorkspaceData).toHaveBeenCalledWith(4))
        expect(note.refreshActiveNote).toHaveBeenCalled()
        expect(toast.success).toHaveBeenCalledWith("Elemento ripristinato")
        await waitFor(() => expect(data.getTrash).toHaveBeenCalledTimes(2))
    })

    it("shows the error inline when restore fails", async () => {
        const user = userEvent.setup()
        data.restoreItem.mockRejectedValue(new Error("Esiste già un elemento con questo nome"))
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        await openTab(user, /Note/)
        await user.click(await screen.findByRole("button", { name: "Ripristina Nota B" }))

        expect(await screen.findByRole("alert")).toHaveTextContent("Esiste già un elemento con questo nome")
    })

    it("purge requires confirmation", async () => {
        const user = userEvent.setup()
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        await openTab(user, /Task/)
        await user.click(await screen.findByRole("button", { name: "Elimina definitivamente Task C" }))
        expect(data.purgeItem).not.toHaveBeenCalled()

        const alert = await screen.findByRole("dialog")
        await user.click(within(alert).getByRole("button", { name: "Elimina definitivamente" }))
        await waitFor(() => expect(data.purgeItem).toHaveBeenCalledWith("task", 3))
        expect(data.getWorkspaceData).toHaveBeenCalledWith(4)
    })

    it("cancelling the purge confirmation does nothing", async () => {
        const user = userEvent.setup()
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        await openTab(user, /Task/)
        await user.click(await screen.findByRole("button", { name: "Elimina definitivamente Task C" }))
        const alert = await screen.findByRole("dialog")
        await user.click(within(alert).getByRole("button", { name: "Annulla" }))

        expect(data.purgeItem).not.toHaveBeenCalled()
    })

    it("empties the trash after confirmation", async () => {
        const user = userEvent.setup()
        render(<DialogTrash isOpen onOpenChange={vi.fn()} />)
        await screen.findByText("Cartella A")
        await user.click(screen.getByRole("button", { name: "Svuota cestino" }))
        expect(data.emptyTrash).not.toHaveBeenCalled()

        const alert = await screen.findByRole("dialog")
        await user.click(within(alert).getByRole("button", { name: "Svuota cestino" }))
        await waitFor(() => expect(data.emptyTrash).toHaveBeenCalledWith(4))
        expect(data.getWorkspaceData).toHaveBeenCalledWith(4)
    })

    it("closes the dialog after emptying the trash", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn()
        render(<DialogTrash isOpen onOpenChange={onOpenChange} />)
        await screen.findByText("Cartella A")
        await user.click(screen.getByRole("button", { name: "Svuota cestino" }))
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Svuota cestino" }))
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("stays open and shows the error when emptying fails", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn()
        data.emptyTrash.mockRejectedValue(new Error("boom"))
        render(<DialogTrash isOpen onOpenChange={onOpenChange} />)
        await screen.findByText("Cartella A")
        await user.click(screen.getByRole("button", { name: "Svuota cestino" }))
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Svuota cestino" }))
        expect(await screen.findByText(/boom/)).toBeInTheDocument()
        expect(onOpenChange).not.toHaveBeenCalled()
    })
})

describe("DialogTrash and the undo history", () => {
    const clear = vi.fn()
    const renderWithUndo = () => render(
        <UndoContext.Provider value={{ clear } as unknown as UndoContextType}>
            <DialogTrash isOpen onOpenChange={vi.fn()} />
        </UndoContext.Provider>,
    )

    beforeEach(() => {
        vi.resetAllMocks()
        data.getTrash.mockResolvedValue(items)
        data.purgeItem.mockResolvedValue(undefined)
        data.emptyTrash.mockResolvedValue(undefined)
        data.getWorkspaceData.mockResolvedValue(undefined)
        note.refreshActiveNote.mockResolvedValue(undefined)
    })

    it("clears the history after a purge (ids can be reused by new rows)", async () => {
        const user = userEvent.setup()
        renderWithUndo()
        await openTab(user, /Task/)
        await user.click(await screen.findByRole("button", { name: "Elimina definitivamente Task C" }))
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Elimina definitivamente" }))
        await waitFor(() => expect(clear).toHaveBeenCalledTimes(1))
    })

    it("clears the history after emptying the trash", async () => {
        const user = userEvent.setup()
        renderWithUndo()
        await screen.findByText("Cartella A")
        await user.click(screen.getByRole("button", { name: "Svuota cestino" }))
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Svuota cestino" }))
        await waitFor(() => expect(clear).toHaveBeenCalledTimes(1))
    })

    it("keeps the history when the purge fails", async () => {
        const user = userEvent.setup()
        data.purgeItem.mockRejectedValue(new Error("no"))
        renderWithUndo()
        await openTab(user, /Task/)
        await user.click(await screen.findByRole("button", { name: "Elimina definitivamente Task C" }))
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Elimina definitivamente" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("no")
        expect(clear).not.toHaveBeenCalled()
    })
})

describe("DialogTrashWorkspaces", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        ws.getTrashedWorkspaces.mockResolvedValue([makeWorkspace({ id: 7, name: "Vecchio", deleted_at: "2026-09-05 09:00:00" })])
        ws.restoreWorkspace.mockResolvedValue(undefined)
        ws.purgeWorkspace.mockResolvedValue(undefined)
    })

    it("lists and restores trashed workspaces", async () => {
        const user = userEvent.setup()
        render(<DialogTrashWorkspaces isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText("Vecchio")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Ripristina Vecchio" }))
        await waitFor(() => expect(ws.restoreWorkspace).toHaveBeenCalledWith(7))
    })

    it("shows the summary of a trashed workspace", async () => {
        ws.getTrashedWorkspaces.mockResolvedValue([{ ...makeWorkspace({ id: 7, name: "Vecchio", deleted_at: "2026-09-05 09:00:00" }), summary: "3 cartelle · 12 note" }])
        render(<DialogTrashWorkspaces isOpen onOpenChange={vi.fn()} />)
        expect(await screen.findByText("3 cartelle · 12 note · Eliminato il 05/09/2026 09:00")).toBeInTheDocument()
    })

    it("purges all workspaces when emptying", async () => {
        const user = userEvent.setup()
        render(<DialogTrashWorkspaces isOpen onOpenChange={vi.fn()} />)
        await screen.findByText("Vecchio")
        await user.click(screen.getByRole("button", { name: "Svuota cestino" }))
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Svuota cestino" }))
        await waitFor(() => expect(ws.purgeWorkspace).toHaveBeenCalledWith(7))
    })
})
