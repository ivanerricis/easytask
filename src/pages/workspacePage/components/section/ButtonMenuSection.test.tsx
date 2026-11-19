import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { ButtonMenuSection } from "./ButtonMenuSection"
import { ItemMenuButton } from "@/components/item-menu"
import { makeSection } from "@/test/ui-fixtures"
// The request to delete is tested with its hook (use-delete-request.test.tsx): here it opens the dialog
vi.mock("@/components/dialogs/use-delete-item", () => ({ useDeleteRequest: ({ openDialog }: { openDialog: () => void }) => ({ request: openDialog }) }))

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const duplicateSection = vi.fn()
const refreshActiveNote = vi.fn()
const create = vi.fn()
const archive = vi.fn()
const archiveItem = vi.fn()
const recorder = makeUndoRecorderMock({ create, archive })
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))
const updateItemColor = vi.fn()
const patchSection = vi.fn()
const removeSection = vi.fn()
const setSectionTaskOrder = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ updateItemColor, duplicateSection, archiveItem, setSectionTaskOrder }) }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => ({ patchSection, removeSection, refreshActiveNote }) }))
vi.mock("../NoteMoveSubmenus", () => ({ SectionMoveSubmenu: () => null }))
vi.mock("../NoteStepMoves", () => ({ SectionStepMoves: () => null }))
vi.mock("@/components/tags/DialogSectionTags", () => ({
    DialogSectionTags: ({ open, sectionId }: { open: boolean, sectionId: number }) => open ? <div>Dialog tag sezione {sectionId}</div> : null,
}))
vi.mock("@/components/dialogs/dialog-delete", () => ({
    DialogDeleteItem: ({ isOpen, optimistic }: { isOpen: boolean, optimistic: () => () => void }) =>
        isOpen ? <button onClick={() => optimistic()}>Dialog elimina</button> : null,
}))
const onRename = vi.fn()

const ENTRIES = ["Rinomina", "Duplica", "Cambia colore", "Ordine dei task", "Tag…", "Archivia", "Elimina"]

beforeEach(() => {
    vi.clearAllMocks()
    updateItemColor.mockResolvedValue(undefined)
    patchSection.mockReturnValue(vi.fn())
    duplicateSection.mockResolvedValue(12)
    refreshActiveNote.mockResolvedValue(undefined)
    archiveItem.mockResolvedValue(undefined)
    removeSection.mockReturnValue(vi.fn())
    setSectionTaskOrder.mockResolvedValue(undefined)
})

const setup = (taskOrder?: "manual" | "open-first" | "done-first") => {
    render(
        <ButtonMenuSection section={makeSection({ id: 7, task_order: taskOrder })} onRename={onRename}>
            <div data-testid="row">
                Sezione
                <ItemMenuButton />
            </div>
        </ButtonMenuSection>,
    )
    return screen.getByTestId("row")
}

describe("ButtonMenuSection", () => {
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

    it("opens the tags dialog of the section from the Tag entry", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Tag…"))
        expect(await screen.findByText("Dialog tag sezione 7")).toBeInTheDocument()
    })

    it("starts the inline rename from the context menu", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Rinomina"))
        await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    })

    it("duplicates the section, records the creation, reloads the note and confirms", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Duplica"))
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sezione duplicata"))
        expect(duplicateSection).toHaveBeenCalledWith(7)
        expect(create).toHaveBeenCalledWith("section", 12, null)
        expect(refreshActiveNote).toHaveBeenCalledTimes(1)
    })

    it("removes the section from the note, archives it and records the undo step", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Archivia"))
        await waitFor(() => expect(archive).toHaveBeenCalledWith("section", 7, expect.anything()))
        expect(removeSection).toHaveBeenCalledWith(7)
        expect(archiveItem).toHaveBeenCalledWith("section", 7)
    })

    it("puts the section back and shows the error when the archive fails", async () => {
        const user = userEvent.setup()
        const rollback = vi.fn()
        removeSection.mockReturnValue(rollback)
        archiveItem.mockRejectedValueOnce(new Error("boom"))
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Archivia"))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"))
        expect(rollback).toHaveBeenCalledTimes(1)
        expect(archive).not.toHaveBeenCalled()
    })

    it("shows the error when the duplication fails", async () => {
        const user = userEvent.setup()
        duplicateSection.mockRejectedValueOnce(new Error("boom"))
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Duplica"))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"))
        expect(create).not.toHaveBeenCalled()
        expect(refreshActiveNote).not.toHaveBeenCalled()
    })

    it("opens the color submenu from the context menu", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        const trigger = (await screen.findByText("Cambia colore")).closest("[data-slot=context-menu-sub-trigger]") as HTMLElement
        trigger.focus()
        await user.keyboard("{ArrowRight}")
        expect(await screen.findByText("Nessun colore", { selector: "button[type=button]" })).toBeInTheDocument()
    })

    const openOrderSubmenu = async (row: HTMLElement) => {
        fireEvent.contextMenu(row)
        const trigger = (await screen.findByText("Ordine dei task")).closest("[data-slot=context-menu-sub-trigger]") as HTMLElement
        trigger.focus()
        await userEvent.keyboard("{ArrowRight}")
        await screen.findByText("Come nelle impostazioni")
    }

    it("lists the orders in a radio group with the choice of the section checked (the preference when it has none)", async () => {
        await openOrderSubmenu(setup())
        const checked = () => screen.getAllByRole("menuitemradio").filter(item => item.getAttribute("aria-checked") === "true").map(item => item.textContent)
        expect(screen.getAllByRole("menuitemradio").map(item => item.textContent)).toEqual(["Come nelle impostazioni", "Manuale", "Prima i task aperti", "Prima i task completati"])
        expect(checked()).toEqual(["Come nelle impostazioni"])
    })

    it("checks the order the section has", async () => {
        await openOrderSubmenu(setup("open-first"))
        expect(screen.getAllByRole("menuitemradio").filter(item => item.getAttribute("aria-checked") === "true").map(item => item.textContent)).toEqual(["Prima i task aperti"])
    })

    it("applies the order to the note at once, saves it and is no undo step", async () => {
        await openOrderSubmenu(setup())
        await userEvent.click(screen.getByText("Prima i task completati"))
        expect(patchSection).toHaveBeenCalledWith(7, { task_order: "done-first" })
        await waitFor(() => expect(setSectionTaskOrder).toHaveBeenCalledWith(7, "done-first"))
        expect(recorder.track).not.toHaveBeenCalled()
        expect(screen.queryByText("Come nelle impostazioni")).not.toBeInTheDocument()
    })

    it("gives the choice back to the preference with null", async () => {
        await openOrderSubmenu(setup("manual"))
        await userEvent.click(screen.getByText("Come nelle impostazioni"))
        expect(patchSection).toHaveBeenCalledWith(7, { task_order: null })
        await waitFor(() => expect(setSectionTaskOrder).toHaveBeenCalledWith(7, null))
    })

    it("does nothing when the order already chosen is picked again", async () => {
        await openOrderSubmenu(setup("manual"))
        await userEvent.click(screen.getByText("Manuale"))
        expect(patchSection).not.toHaveBeenCalled()
        expect(setSectionTaskOrder).not.toHaveBeenCalled()
    })

    it("puts the order back and shows the error when the write fails", async () => {
        const rollback = vi.fn()
        patchSection.mockReturnValue(rollback)
        setSectionTaskOrder.mockRejectedValueOnce(new Error("boom"))
        await openOrderSubmenu(setup())
        await userEvent.click(screen.getByText("Manuale"))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"))
        expect(rollback).toHaveBeenCalledTimes(1)
    })

    it("deletes through the cached note tree, without reloading it", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Elimina"))
        await user.click(await screen.findByText("Dialog elimina"))
        expect(removeSection).toHaveBeenCalledWith(7)
    })

    it("changes the color at once and restores it when the write fails", async () => {
        const user = userEvent.setup()
        const rollback = vi.fn()
        patchSection.mockReturnValue(rollback)
        updateItemColor.mockRejectedValueOnce(new Error("boom"))
        const row = setup()
        fireEvent.contextMenu(row)
        const trigger = (await screen.findByText("Cambia colore")).closest("[data-slot=context-menu-sub-trigger]") as HTMLElement
        trigger.focus()
        await user.keyboard("{ArrowRight}")
        await user.click(await screen.findByLabelText("Colore Rosso"))

        expect(patchSection).toHaveBeenCalledWith(7, { color: "#e6194b" })
        expect(updateItemColor).toHaveBeenCalledWith("section", 7, "#e6194b")
        await waitFor(() => expect(rollback).toHaveBeenCalledTimes(1))
        expect(toast.error).toHaveBeenCalledWith("boom")
    })
})
