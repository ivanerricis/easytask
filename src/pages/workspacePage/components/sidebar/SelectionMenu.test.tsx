import { fireEvent, render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import type { Folder, Note } from "@/types/types"
import { ItemMenuButton } from "@/components/item-menu"
import { ButtonMenuFolder } from "../folder/ButtonMenuFolder"
import { ButtonMenuNote } from "../note/ButtonMenuNote"
import { SelectionContext } from "./selection-context-object"
import { SelectionActionsProvider } from "./selection-actions"
import { createSelectionStore } from "./selection"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const note = (id: number, name: string, folderID: number | null = null, color: string | null = null): Note =>
    ({ id, name, folderID, color, workspaceID: 1, position: 0 }) as unknown as Note
const folder = (id: number, name: string, subfolders: Folder[] = [], notes: Note[] = [], color: string | null = null): Folder =>
    ({ id, name, folderID: null, color, workspaceID: 1, position: 0, subfolders, notes }) as unknown as Folder

// Lavoro { Report }, Archivio, Spesa (root note), Idee (root note, red)
const report = note(5, "Report", 1)
const lavoro = folder(1, "Lavoro", [], [report])
const archivio = folder(2, "Archivio", [], [], "#e6194b")
const spesa = note(9, "Spesa")
const idee = note(10, "Idee", null, "#e6194b")
const workspaceDataTree = { rootFolders: [lavoro, archivio], rootNotes: [spesa, idee] }

const deleteItem = vi.fn()
const updateItemColor = vi.fn()
const moveTreeItem = vi.fn()
const getWorkspaceData = vi.fn()
const archiveItem = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceData: () => ({
        workspaceDataTree, deleteItem, updateItemColor, moveTreeItem, getWorkspaceData, archiveItem,
        updateFolderColorContent: vi.fn(),
    }),
    useWorkspaceActions: () => ({ updateItemColor, duplicateNote: vi.fn(), deleteItem }),
}))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1 } }) }))
vi.mock("@/contexts/use-tabs", () => ({ useActiveNoteId: () => null, useTabsActions: () => ({ openNote: vi.fn(), reorderTabs: vi.fn() }), useTabs: () => ({ tabs: [] }) }))
const recorder = makeUndoRecorderMock()
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder, useOptionalUndo: () => null }))
const exportItem = vi.fn()
const exportItems = vi.fn()
vi.mock("@/hooks/use-workspace-transfer", () => ({ useItemTransfer: () => ({ exportItem, exportItems, importItems: vi.fn(), isBusy: false }) }))
vi.mock("../MoveToSubmenu", () => ({ MoveToSubmenu: () => null }))
vi.mock("../AddNoteDialog", () => ({ AddNoteDialog: () => null }))
vi.mock("../AddFolderDialog", () => ({ AddFolderDialog: () => null }))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
vi.mock("@/components/dialogs/dialog-rename", () => ({ DialogRenameItem: () => null }))

let store: ReturnType<typeof createSelectionStore>

const select = (...keys: string[]) => act(() => { keys.forEach(key => store.toggle(key)) })

const setup = (row: "lavoro" | "archivio" = "lavoro") => {
    render(
        <SelectionContext.Provider value={store}>
            <SelectionActionsProvider>
                <ButtonMenuFolder folder={row === "lavoro" ? lavoro : archivio}>
                    <div data-testid="row">Riga<ItemMenuButton /></div>
                </ButtonMenuFolder>
            </SelectionActionsProvider>
        </SelectionContext.Provider>,
    )
    return screen.getByTestId("row")
}

beforeEach(() => {
    vi.clearAllMocks()
    deleteItem.mockResolvedValue(undefined)
    updateItemColor.mockResolvedValue(undefined)
    moveTreeItem.mockResolvedValue(undefined)
    archiveItem.mockResolvedValue(undefined)
    getWorkspaceData.mockResolvedValue(undefined)
    exportItems.mockResolvedValue(undefined)
    store = createSelectionStore()
    store.sync(["folder-1", "note-5", "folder-2", "note-9", "note-10"])
})

describe("menu of a multi-selection", () => {
    it("a selected row shows the multi menu with the number of items to act on", async () => {
        const row = setup()
        // Report is inside the selected Lavoro: it goes with it
        select("folder-1", "note-5", "note-9")
        fireEvent.contextMenu(row)
        expect(await screen.findByText("Elimina 2 elementi")).toBeInTheDocument()
        for (const entry of ["Sposta", "Colore", "Esporta"]) expect(screen.getByText(entry)).toBeInTheDocument()
        expect(screen.queryByText("Rinomina")).not.toBeInTheDocument()
        expect(screen.queryByText("Nuova nota")).not.toBeInTheDocument()
    })

    it("also opens from the '…' button", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-9", "note-10")
        await user.click(row.querySelector("svg")!)
        expect(await screen.findByText("Elimina 3 elementi")).toBeInTheDocument()
    })

    it("an unselected row keeps its own menu", async () => {
        const row = setup("archivio")
        select("folder-1", "note-9")
        fireEvent.contextMenu(row)
        expect(await screen.findByText("Rinomina")).toBeInTheDocument()
        expect(screen.queryByText(/Elimina \d/)).not.toBeInTheDocument()
    })

    it("a lone selected row shows the single item menu", async () => {
        const row = setup()
        select("folder-1")
        fireEvent.contextMenu(row)
        expect(await screen.findByText("Rinomina")).toBeInTheDocument()
    })

    it("a note row gets the multi menu too", async () => {
        select("note-9", "note-10")
        render(
            <SelectionContext.Provider value={store}>
                <SelectionActionsProvider>
                    <ButtonMenuNote note={spesa}><div data-testid="row">Spesa</div></ButtonMenuNote>
                </SelectionActionsProvider>
            </SelectionContext.Provider>,
        )
        fireEvent.contextMenu(screen.getByTestId("row"))
        expect(await screen.findByText("Elimina 2 elementi")).toBeInTheDocument()
    })
})

describe("delete", () => {
    it("asks once, trashes the top-most items and records ONE undo step", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-5", "note-9")
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Elimina 2 elementi"))
        expect(await screen.findByRole("button", { name: "Sposta 2 elementi nel cestino" })).toBeInTheDocument()
        expect(deleteItem).not.toHaveBeenCalled()
        await user.click(screen.getByRole("button", { name: "Sposta 2 elementi nel cestino" }))
        await waitFor(() => expect(recorder.removeMany).toHaveBeenCalledTimes(1))
        expect(deleteItem.mock.calls).toEqual([["folder", 1], ["note", 9]])
        expect(recorder.removeMany).toHaveBeenCalledWith([
            { itemType: "folder", id: 1, name: "Lavoro" }, { itemType: "note", id: 9, name: "Spesa" },
        ])
        await waitFor(() => expect(screen.queryByRole("button", { name: "Sposta 2 elementi nel cestino" })).not.toBeInTheDocument())
    })

    it("keeps the dialog open with an inline error, records what was trashed and retries only the rest", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-9", "note-10")
        deleteItem.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disco pieno"))
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Elimina 3 elementi"))
        await user.click(await screen.findByRole("button", { name: "Sposta 3 elementi nel cestino" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("1 su 3")
        expect(screen.getByRole("alert")).toHaveTextContent("disco pieno")
        expect(recorder.removeMany).toHaveBeenCalledTimes(1)
        expect(recorder.removeMany).toHaveBeenLastCalledWith([{ itemType: "folder", id: 1, name: "Lavoro" }])

        await user.click(screen.getByRole("button", { name: "Sposta 3 elementi nel cestino" }))
        await waitFor(() => expect(recorder.removeMany).toHaveBeenCalledTimes(2))
        // The folder is not trashed again
        expect(deleteItem.mock.calls).toEqual([["folder", 1], ["note", 9], ["note", 9], ["note", 10]])
        expect(recorder.removeMany).toHaveBeenLastCalledWith([
            { itemType: "note", id: 9, name: "Spesa" }, { itemType: "note", id: 10, name: "Idee" },
        ])
    })
})

describe("archive", () => {
    it("archives the top-most items without asking, as ONE undo step, and clears the selection", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-5", "note-9")
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Archivia 2 elementi"))
        await waitFor(() => expect(recorder.archiveMany).toHaveBeenCalledTimes(1))
        expect(archiveItem.mock.calls).toEqual([["folder", 1], ["note", 9]])
        expect(recorder.archiveMany).toHaveBeenCalledWith([
            { itemType: "folder", id: 1, name: "Lavoro" }, { itemType: "note", id: 9, name: "Spesa" },
        ])
        expect(store.getSelected().size).toBe(0)
    })

    it("records only what was archived when one fails", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-9")
        archiveItem.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disco pieno"))
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Archivia 2 elementi"))
        await waitFor(() => expect(recorder.archiveMany).toHaveBeenCalledWith([{ itemType: "folder", id: 1, name: "Lavoro" }]))
    })
})

describe("color", () => {
    it("applies one color to every selected item with ONE undo step, skipping the ones that already have it", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-5", "note-10")
        fireEvent.contextMenu(row)
        await user.hover(await screen.findByText("Colore"))
        fireEvent.click(await screen.findByRole("radio", { name: "Colore Rosso" }))
        await waitFor(() => expect(recorder.colorMany).toHaveBeenCalledTimes(1))
        // Idee already has this color; the note inside the selected folder changes too (only the item itself is colored)
        expect(updateItemColor.mock.calls).toEqual([["folder", 1, "#e6194b"], ["note", 5, "#e6194b"]])
        expect(recorder.colorMany).toHaveBeenCalledWith([
            { itemType: "folder", id: 1, name: "Lavoro", before: null, after: "#e6194b" },
            { itemType: "note", id: 5, name: "Report", before: null, after: "#e6194b" },
        ])
    })

    it("removes the color of the colored items only", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-10", "folder-2")
        fireEvent.contextMenu(row)
        await user.hover(await screen.findByText("Colore"))
        fireEvent.click(await screen.findByRole("button", { name: "Nessun colore" }))
        await waitFor(() => expect(recorder.colorMany).toHaveBeenCalledTimes(1))
        expect(updateItemColor.mock.calls).toEqual([["folder", 2, undefined], ["note", 10, undefined]])
        expect(recorder.colorMany).toHaveBeenCalledWith([
            { itemType: "folder", id: 2, name: "Archivio", before: "#e6194b", after: null },
            { itemType: "note", id: 10, name: "Idee", before: "#e6194b", after: null },
        ])
    })

    it("records only the changes that were applied when one fails", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-9", "note-10")
        updateItemColor.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"))
        fireEvent.contextMenu(row)
        await user.hover(await screen.findByText("Colore"))
        fireEvent.click(await screen.findByRole("radio", { name: "Colore Verde" }))
        await waitFor(() => expect(recorder.colorMany).toHaveBeenCalledTimes(1))
        expect(recorder.colorMany.mock.calls[0][0]).toHaveLength(1)
        expect(updateItemColor).toHaveBeenCalledTimes(2)
    })
})

describe("move", () => {
    it("moves the top-most items to the chosen folder with ONE undo step and reloads the tree", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-5", "note-9")
        fireEvent.contextMenu(row)
        await user.hover(await screen.findByText("Sposta"))
        // Lavoro cannot go into itself, and Archivio is the only folder left
        expect(screen.queryByText("Lavoro", { selector: "span" })).not.toBeInTheDocument()
        fireEvent.click(await screen.findByText("Archivio", { selector: "span" }))
        await waitFor(() => expect(recorder.treeMoveMany).toHaveBeenCalledTimes(1))
        expect(moveTreeItem.mock.calls).toEqual([["folder", 1, 2, 0], ["note", 9, 2, 0]])
        expect(recorder.treeMoveMany.mock.calls[0][0]).toEqual([
            { itemType: "folder", id: 1, name: "Lavoro", from: { folderId: null, index: 0 }, to: { folderId: 2, index: 0 } },
            { itemType: "note", id: 9, name: "Spesa", from: { folderId: null, index: 0 }, to: { folderId: 2, index: 0 } },
        ])
        expect(getWorkspaceData).toHaveBeenCalledWith(1)
    })

})

describe("export", () => {
    it("exports the top-most items in one file named after their count", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-5", "note-9", "note-10")
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Esporta"))
        await waitFor(() => expect(exportItems).toHaveBeenCalledTimes(1))
        expect(exportItems).toHaveBeenCalledWith([{ type: "folder", id: 1 }, { type: "note", id: 9 }, { type: "note", id: 10 }], "3 elementi")
        expect(exportItem).not.toHaveBeenCalled()
    })

    it("uses the name of the only top-most item", async () => {
        const user = userEvent.setup()
        const row = setup()
        select("folder-1", "note-5")
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Esporta"))
        await waitFor(() => expect(exportItems).toHaveBeenCalledWith([{ type: "folder", id: 1 }], "Lavoro"))
    })
})
