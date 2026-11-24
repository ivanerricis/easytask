import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { ButtonMenuNote } from "./ButtonMenuNote"
import { ItemMenuButton } from "@/components/item-menu"
import { makeNote } from "@/test/ui-fixtures"
import { LayoutActionsContext, LayoutContext, PaneTabsContext, type LayoutActionsType, type PaneTabsValue } from "@/contexts/layout-context-object"
import type { TabsActionsType } from "@/contexts/tabs-context-object"
// The request to delete is tested with its hook (use-delete-request.test.tsx): here it opens the dialog
vi.mock("@/components/dialogs/use-delete-item", () => ({ useDeleteRequest: ({ openDialog }: { openDialog: () => void }) => ({ request: openDialog }) }))

const openNote = vi.fn()
const duplicateNote = vi.fn()
const create = vi.fn()
const archive = vi.fn()
const archiveItem = vi.fn()

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const recorder = makeUndoRecorderMock({ create, archive })
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))

vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceActions: () => ({ getWorkspaceData: vi.fn(), updateItemColor: vi.fn(), duplicateNote, archiveItem }),
}))
const exportItem = vi.fn()
vi.mock("@/hooks/use-workspace-transfer", () => ({ useItemTransfer: () => ({ exportItem, importItems: vi.fn(), isBusy: false }) }))
const reorderTabs = vi.fn()
let openTabs: { id: number }[] = []
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote, reorderTabs }), useTabs: () => ({ tabs: openTabs }) }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1 } }) }))
vi.mock("../MoveToSubmenu", () => ({ MoveToSubmenu: () => null }))
vi.mock("@/components/dialogs/dialog-create-template", () => ({
    DialogCreateTemplate: ({ isOpen, note }: { isOpen: boolean, note: { id: number } }) =>
        isOpen ? <div>Dialog template {note.id}</div> : null,
}))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
const onRename = vi.fn()
let hideCompleted = false
vi.mock("@/contexts/use-preference", () => ({ usePreference: (select: (p: { hideCompletedTasks: boolean }) => unknown) => select({ hideCompletedTasks: hideCompleted }) }))
const copyNoteAsMarkdown = vi.fn()
const printNoteAsPdf = vi.fn()
vi.mock("@/lib/note-export", () => ({ copyNoteAsMarkdown: (...args: unknown[]) => copyNoteAsMarkdown(...args), printNoteAsPdf: (...args: unknown[]) => printNoteAsPdf(...args) }))

const ENTRIES = ["Apri", "Rinomina", "Duplica", "Cambia colore", "Crea template", "Esporta", "Copia come Markdown", "Esporta PDF", "Archivia", "Elimina"]

beforeEach(() => {
    vi.clearAllMocks()
    openTabs = []
    hideCompleted = false
    copyNoteAsMarkdown.mockResolvedValue(undefined)
    printNoteAsPdf.mockResolvedValue(undefined)
    duplicateNote.mockResolvedValue(9)
    archiveItem.mockResolvedValue(undefined)
})

const setup = () => {
    render(
        <ButtonMenuNote note={makeNote({ id: 4 })} onRename={onRename}>
            <div data-testid="row">
                Nota
                <ItemMenuButton />
            </div>
        </ButtonMenuNote>,
    )
    return screen.getByTestId("row")
}

describe("ButtonMenuNote", () => {
    it("copies the note as Markdown (following hide completed) and confirms", async () => {
        const user = userEvent.setup()
        hideCompleted = true
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Copia come Markdown"))
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Nota copiata come Markdown"))
        expect(copyNoteAsMarkdown).toHaveBeenCalledWith(4, expect.any(String), true)
    })

    it("opens the print of the note and reports a webview without print", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Esporta PDF"))
        await waitFor(() => expect(printNoteAsPdf).toHaveBeenCalledWith(4, expect.any(String), false))

        printNoteAsPdf.mockRejectedValueOnce(new Error("no print"))
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Esporta PDF"))
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })

    it("has no tab moves for a note that is not open as a tab", async () => {
        const row = setup()
        fireEvent.contextMenu(row)
        await screen.findByText("Apri")
        expect(screen.queryByText("Sposta tab a sinistra")).not.toBeInTheDocument()
    })

    it("moves the tab of an open note left and right, disabled at the ends", async () => {
        const user = userEvent.setup()
        openTabs = [{ id: 5 }, { id: 4 }, { id: 8 }]
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Sposta tab a sinistra"))
        expect(reorderTabs).toHaveBeenCalledWith(1, 0)
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Sposta tab a destra"))
        expect(reorderTabs).toHaveBeenCalledWith(1, 2)
    })

    it("disables the move to the left of the first tab", async () => {
        openTabs = [{ id: 4 }, { id: 8 }]
        const row = setup()
        fireEvent.contextMenu(row)
        expect((await screen.findByText("Sposta tab a sinistra")).closest("[role=menuitem]")).toHaveAttribute("aria-disabled", "true")
    })

    it("shows the same entries from the '…' button and from a right click", async () => {
        const user = userEvent.setup()
        const row = setup()
        await user.click(row.querySelector("svg")!)
        for (const entry of ENTRIES) expect(await screen.findByText(entry)).toBeInTheDocument()
        await user.keyboard("{Escape}")
        expect(screen.queryByText("Elimina")).not.toBeInTheDocument()

        fireEvent.contextMenu(row)
        for (const entry of ENTRIES) expect(await screen.findByText(entry)).toBeInTheDocument()
    })

    it("opens the note and starts the inline rename from the context menu", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Apri"))
        expect(openNote).toHaveBeenCalledWith(4)

        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Rinomina"))
        await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    })

    it("opens the create template dialog from the '…' button and from the context menu", async () => {
        const user = userEvent.setup()
        const row = setup()
        await user.click(row.querySelector("svg")!)
        await user.click(await screen.findByText("Crea template"))
        expect(await screen.findByText("Dialog template 4")).toBeInTheDocument()
    })

    it("opens the create template dialog from a right click", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Crea template"))
        expect(await screen.findByText("Dialog template 4")).toBeInTheDocument()
    })

    it("duplicates the note, records the creation, opens the copy and confirms", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Duplica"))
        await waitFor(() => expect(openNote).toHaveBeenCalledWith(9))
        expect(duplicateNote).toHaveBeenCalledWith(4)
        expect(create).toHaveBeenCalledWith("note", 9, null)
        expect(toast.success).toHaveBeenCalledWith("Nota duplicata")
    })

    it("shows the error and opens nothing when the duplication fails", async () => {
        const user = userEvent.setup()
        duplicateNote.mockRejectedValueOnce(new Error("boom"))
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Duplica"))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"))
        expect(openNote).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
    })

    it("does not open the menu on a right click inside a text field", () => {
        render(
            <ButtonMenuNote note={makeNote()}>
                <div><input aria-label="nome" /></div>
            </ButtonMenuNote>,
        )
        fireEvent.contextMenu(screen.getByLabelText("nome"))
        expect(screen.queryByText("Rinomina")).not.toBeInTheDocument()
    })

    it("archives the note without asking and records the undo step", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Archivia"))
        await waitFor(() => expect(archive).toHaveBeenCalledWith("note", 4, expect.any(String)))
        expect(archiveItem).toHaveBeenCalledWith("note", 4)
        expect(screen.queryByText("Archivia")).not.toBeInTheDocument()
    })

    it("shows the error and records nothing when the archive fails", async () => {
        const user = userEvent.setup()
        archiveItem.mockRejectedValueOnce(new Error("boom"))
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Archivia"))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"))
        expect(archive).not.toHaveBeenCalled()
    })

    it("exports the note from the context menu", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Esporta"))
        expect(exportItem).toHaveBeenCalledWith("note", expect.objectContaining({ id: 4 }))
        expect(screen.queryByText("Elimina")).not.toBeInTheDocument()
    })
})

describe("ButtonMenuNote in a split workspace", () => {
    const layoutActions: LayoutActionsType = { split: vi.fn(), unsplit: vi.fn(), toggleSplit: vi.fn(), focusPane: vi.fn(), openInPane: vi.fn(), moveToPane: vi.fn(), getLayout: () => ({ left: { openIds: [], activeId: null }, right: null, focused: 0, isSplit: false }) }
    const reorder0 = vi.fn()
    const reorder1 = vi.fn()
    const paneValue = (ids: number[], reorderTabs: () => void): PaneTabsValue => ({
        tabs: { openIds: ids, activeId: ids[0] ?? null, tabs: ids.map(id => makeNote({ id })), currentNote: null, restored: true },
        actions: { reorderTabs } as unknown as TabsActionsType,
        activeStore: undefined as never,
    })
    const setupSplit = (left: number[], right: number[] | null) => {
        render(
            <LayoutContext.Provider value={{ left: { openIds: left, activeId: null }, right: right && { openIds: right, activeId: null }, focused: 0, isSplit: right !== null }}>
                <LayoutActionsContext.Provider value={layoutActions}>
                    <PaneTabsContext.Provider value={[paneValue(left, reorder0), paneValue(right ?? [], reorder1)]}>
                        <ButtonMenuNote note={makeNote({ id: 4 })}>
                            <div data-testid="row">Nota<ItemMenuButton /></div>
                        </ButtonMenuNote>
                    </PaneTabsContext.Provider>
                </LayoutActionsContext.Provider>
            </LayoutContext.Provider>,
        )
        return screen.getByTestId("row")
    }

    it("offers 'Apri a destra' after 'Apri' and not 'Apri a sinistra' for a note that is not in the right pane", async () => {
        const user = userEvent.setup()
        const row = setupSplit([4], [9])
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Apri a destra"))
        expect(layoutActions.openInPane).toHaveBeenCalledWith(4, 1)
        expect(screen.queryByText("Apri a sinistra")).not.toBeInTheDocument()
        expect(screen.queryByText("Apri a destra")).not.toBeInTheDocument()
    })

    it("offers 'Apri a destra' when the workspace is not split and the note is not open", async () => {
        const row = setupSplit([], null)
        fireEvent.contextMenu(row)
        expect(await screen.findByText("Apri a destra")).toBeInTheDocument()
    })

    it("offers 'Apri a sinistra' instead for a note of the right pane", async () => {
        const user = userEvent.setup()
        const row = setupSplit([1], [4])
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Apri a sinistra"))
        expect(layoutActions.moveToPane).toHaveBeenCalledWith(4, 0)
        expect(screen.queryByText("Apri a destra")).not.toBeInTheDocument()
    })

    it("moves the tab inside the bar of the right pane", async () => {
        const user = userEvent.setup()
        openTabs = [{ id: 1 }, { id: 4 }]
        const row = setupSplit([1], [7, 4, 8])
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Sposta tab a destra"))
        expect(reorder1).toHaveBeenCalledWith(1, 2)
        expect(reorder0).not.toHaveBeenCalled()
        expect(reorderTabs).not.toHaveBeenCalled()
    })

    it("moves the tab inside the bar of the left pane, disabled at its ends", async () => {
        const user = userEvent.setup()
        openTabs = [{ id: 4 }, { id: 8 }, { id: 9 }]
        const row = setupSplit([5, 4], [8, 9])
        fireEvent.contextMenu(row)
        expect((await screen.findByText("Sposta tab a destra")).closest("[role=menuitem]")).toHaveAttribute("aria-disabled", "true")
        await user.click(screen.getByText("Sposta tab a sinistra"))
        expect(reorder0).toHaveBeenCalledWith(1, 0)
    })
})

