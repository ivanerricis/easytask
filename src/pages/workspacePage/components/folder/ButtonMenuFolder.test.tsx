import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { ButtonMenuFolder } from "./ButtonMenuFolder"
import { ItemMenuButton } from "@/components/item-menu"
import type { Folder } from "@/types/types"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const updateFolderColorContent = vi.fn()
const colorContent = vi.fn()
const archive = vi.fn()
const archiveItem = vi.fn()
const recorder = makeUndoRecorderMock({ colorContent, archive })
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder, useOptionalUndo: () => null }))
const getWorkspaceData = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceActions: () => ({ updateFolderColorContent, getWorkspaceData, updateItemColor: vi.fn(), archiveItem }),
}))
const exportItem = vi.fn()
const importItems = vi.fn()
vi.mock("@/hooks/use-workspace-transfer", () => ({ useItemTransfer: () => ({ exportItem, importItems, isBusy: false }) }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1 } }) }))
vi.mock("../MoveToSubmenu", () => ({ MoveToSubmenu: () => null }))
vi.mock("../AddNoteDialog", () => ({ AddNoteDialog: () => null }))
vi.mock("../AddFolderDialog", () => ({ AddFolderDialog: () => null }))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
const onRename = vi.fn()

const folder = { id: 3, name: "Cartella", folderID: null, color: "#00ff00" } as Folder

beforeEach(() => {
    vi.clearAllMocks()
    archiveItem.mockResolvedValue(undefined)
    updateFolderColorContent.mockResolvedValue([{ itemType: "note", id: 9, before: "#111111" }])
})
const ENTRIES = ["Nuova nota", "Nuova cartella", "Rinomina", "Colora contenuto", "Cambia colore", "Importa qui", "Esporta", "Archivia", "Elimina"]

const setup = () => {
    const onRowClick = vi.fn()
    render(
        <ButtonMenuFolder folder={folder} onRename={onRename}>
            <div data-testid="row" onClick={onRowClick}>
                Cartella
                <ItemMenuButton />
            </div>
        </ButtonMenuFolder>,
    )
    return { onRowClick, row: screen.getByTestId("row") }
}

describe("ButtonMenuFolder", () => {
    it("archives the folder and records the undo step", async () => {
        const user = userEvent.setup()
        const { row } = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Archivia"))
        await waitFor(() => expect(archive).toHaveBeenCalledWith("folder", 3, "Cartella"))
        expect(archiveItem).toHaveBeenCalledWith("folder", 3)
    })

    it("opens the menu from the '…' button", async () => {
        const user = userEvent.setup()
        const { row } = setup()
        await user.click(row.querySelector("svg")!)
        for (const entry of ENTRIES) expect(await screen.findByText(entry)).toBeInTheDocument()
    })

    it("opens the same menu with a right click anywhere on the row, without clicking the row", async () => {
        const { onRowClick, row } = setup()
        fireEvent.contextMenu(row, { clientX: 20, clientY: 30 })
        for (const entry of ENTRIES) expect(await screen.findByText(entry)).toBeInTheDocument()
        expect(onRowClick).not.toHaveBeenCalled()
    })

    it("colors the content through the context (which updates the sidebar tree) without reloading the workspace", async () => {
        const user = userEvent.setup()
        const { row } = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Colora contenuto"))
        await waitFor(() => expect(updateFolderColorContent).toHaveBeenCalledWith(3, "#00ff00"))
        expect(getWorkspaceData).not.toHaveBeenCalled()
        expect(colorContent).toHaveBeenCalledWith(3, "Cartella", "#00ff00", [{ itemType: "note", id: 9, before: "#111111" }])
    })

    it("shows a toast when coloring the content fails", async () => {
        const user = userEvent.setup()
        updateFolderColorContent.mockRejectedValue(new Error("boom"))
        const { row } = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Colora contenuto"))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"))
        expect(colorContent).not.toHaveBeenCalled()
    })

    it("runs the chosen entry of the context menu and closes it", async () => {
        const user = userEvent.setup()
        const { row } = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Rinomina"))
        await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
        expect(screen.queryByText("Elimina")).not.toBeInTheDocument()
    })

    it("exports the folder and imports into it from the menu", async () => {
        const user = userEvent.setup()
        const { row } = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Esporta"))
        expect(exportItem).toHaveBeenCalledWith("folder", folder)
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Importa qui"))
        expect(importItems).toHaveBeenCalledWith(3)
        expect(screen.queryByText("Elimina")).not.toBeInTheDocument()
    })
})
