import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { ButtonMenuGroup } from "./ButtonMenuGroup"
import { makeGroup, makeSection } from "@/test/ui-fixtures"
// The request to delete is tested with its hook (use-delete-request.test.tsx): here it opens the dialog
vi.mock("@/components/dialogs/use-delete-item", () => ({ useDeleteRequest: ({ openDialog }: { openDialog: () => void }) => ({ request: openDialog }) }))

const patchGroup = vi.fn()
const removeGroup = vi.fn()
vi.mock("../NoteStepMoves", () => ({ GroupStepMoves: () => null, DirectStepMoves: ({ groupId }: { groupId: number }) => <div role="menuitem">mosse lista {groupId}</div> }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => ({ patchGroup, removeGroup }) }))
const addMediaFiles = vi.fn()
vi.mock("@/contexts/use-audio", () => ({ useAudioActions: () => ({ addFiles: vi.fn(), addMediaFiles }) }))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const updateItemColor = vi.fn()
const recordColor = vi.fn()
const archive = vi.fn()
const archiveItem = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ updateItemColor, archiveItem }) }))
const recorder = makeUndoRecorderMock({ color: recordColor, archive })
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))
vi.mock("@/contexts/use-tabs", () => ({ useActiveNoteId: () => 7 }))
let draftActive = false
vi.mock("@/contexts/use-template-drafts", () => ({ useIsActiveDraft: () => draftActive }))
vi.mock("@/components/dialogs/dialog-automations", () => ({
    DialogAutomations: ({ isOpen, noteId, groupId }: { isOpen: boolean, noteId: number, groupId?: number }) =>
        isOpen ? <div>Dialog automazioni {noteId}/{groupId}</div> : null,
}))
vi.mock("@/components/dialogs/dialog-delete", () => ({
    DialogDeleteItem: ({ isOpen, optimistic }: { isOpen: boolean, optimistic: () => () => void }) =>
        isOpen ? <button onClick={() => optimistic()}>Dialog elimina</button> : null,
}))
const onRename = vi.fn()
const onAddSection = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
    draftActive = false
    updateItemColor.mockResolvedValue(undefined)
    patchGroup.mockReturnValue(vi.fn())
    removeGroup.mockReturnValue(vi.fn())
    archiveItem.mockResolvedValue(undefined)
})

const setup = (color?: string | null, withAddSection = true, withSections = true) => {
    render(
        <ButtonMenuGroup group={makeGroup({ id: 3, color, sections: withSections ? [makeSection({ id: 5, groupID: 3 })] : [] })} onRename={onRename} onAddSection={withAddSection ? onAddSection : undefined}>
            <div data-testid="row">Gruppo</div>
        </ButtonMenuGroup>,
    )
    return screen.getByTestId("row")
}

describe("ButtonMenuGroup", () => {
    it("has no archive, automations and audio entries in a template draft", async () => {
        draftActive = true
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Rinomina"))
        fireEvent.contextMenu(row)
        expect(await screen.findByText("Elimina")).toBeInTheDocument()
        expect(screen.queryByText("Archivia")).not.toBeInTheDocument()
        expect(screen.queryByText("Automazioni…")).not.toBeInTheDocument()
        expect(screen.queryByText("Aggiungi file audio")).not.toBeInTheDocument()
        expect(screen.queryByText("Aggiungi immagine o video")).not.toBeInTheDocument()
    })

    it("offers 'Aggiungi immagine o video' next to the audio entry, and it asks for the files of this group", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        const audio = await screen.findByText("Aggiungi file audio")
        const media = screen.getByRole("menuitem", { name: "Aggiungi immagine o video" })
        expect(audio.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        await user.click(media)
        expect(addMediaFiles).toHaveBeenCalledWith(3)
    })

    it("archives the group, removing it from the note, and records the undo step", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Archivia"))
        await waitFor(() => expect(archive).toHaveBeenCalledWith("section_group", 3, undefined))
        expect(removeGroup).toHaveBeenCalledWith(3)
        expect(archiveItem).toHaveBeenCalledWith("section_group", 3)
    })

    it("opens the automations of the group", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Automazioni…"))
        expect(await screen.findByText("Dialog automazioni 7/3")).toBeInTheDocument()
    })

    it("starts the inline rename from the context menu", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Rinomina"))
        await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    })

    it("offers 'Nuova sezione' right after the audio file entry", async () => {
        const row = setup()
        fireEvent.contextMenu(row)
        const audio = await screen.findByText("Aggiungi file audio")
        const entry = screen.getByRole("menuitem", { name: "Nuova sezione" })
        expect(audio.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("offers the moves of the list of the group next to 'Nuova sezione'", async () => {
        const row = setup()
        fireEvent.contextMenu(row)
        const section = await screen.findByRole("menuitem", { name: "Nuova sezione" })
        const moves = screen.getByRole("menuitem", { name: "mosse lista 3" })
        expect(section.compareDocumentPosition(moves) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        const rename = screen.getByRole("menuitem", { name: "Rinomina" })
        expect(moves.compareDocumentPosition(rename) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("hides the moves of the list of the group while the group has no section", async () => {
        const row = setup(undefined, true, false)
        fireEvent.contextMenu(row)
        await screen.findByText("Aggiungi file audio")
        expect(screen.queryByRole("menuitem", { name: "mosse lista 3" })).not.toBeInTheDocument()
    })

    it("opens the section form only once the menu is closed, so it keeps the focus", async () => {
        const user = userEvent.setup()
        let menuWasOpen: boolean | null = null
        onAddSection.mockImplementation(() => { menuWasOpen = screen.queryByText("Archivia") !== null })
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByRole("menuitem", { name: "Nuova sezione" }))

        await waitFor(() => expect(onAddSection).toHaveBeenCalledTimes(1))
        expect(menuWasOpen).toBe(false)
        expect(onRename).not.toHaveBeenCalled()
    })

    it("does not show 'Nuova sezione' when nothing can add one", async () => {
        const row = setup(undefined, false)
        fireEvent.contextMenu(row)
        await screen.findByText("Aggiungi file audio")
        expect(screen.queryByRole("menuitem", { name: "Nuova sezione" })).not.toBeInTheDocument()
    })

    it("removes the group through the cached note tree", async () => {
        const user = userEvent.setup()
        const row = setup()
        fireEvent.contextMenu(row)
        await user.click(await screen.findByText("Elimina"))
        await user.click(await screen.findByText("Dialog elimina"))
        expect(removeGroup).toHaveBeenCalledWith(3)
    })

    const openColorMenu = async (user: ReturnType<typeof userEvent.setup>, row: HTMLElement) => {
        fireEvent.contextMenu(row)
        const trigger = (await screen.findByText("Cambia colore")).closest("[data-slot=context-menu-sub-trigger]") as HTMLElement
        trigger.focus()
        await user.keyboard("{ArrowRight}")
    }

    it("applies a color at once, writes it and records it for undo", async () => {
        const user = userEvent.setup()
        const row = setup()
        await openColorMenu(user, row)
        await user.click(await screen.findByLabelText("Colore Rosso"))

        expect(patchGroup).toHaveBeenCalledWith(3, { color: "#e6194b" })
        expect(updateItemColor).toHaveBeenCalledWith("section_group", 3, "#e6194b")
        await waitFor(() => expect(recordColor).toHaveBeenCalledWith("section_group", 3, undefined, null, "#e6194b"))
    })

    it("removes the color of a colored group", async () => {
        const user = userEvent.setup()
        const row = setup("#e6194b")
        await openColorMenu(user, row)
        await user.click(await screen.findByText("Nessun colore", { selector: "button[type=button]" }))

        expect(patchGroup).toHaveBeenCalledWith(3, { color: null })
        expect(updateItemColor).toHaveBeenCalledWith("section_group", 3, undefined)
        await waitFor(() => expect(recordColor).toHaveBeenCalledWith("section_group", 3, undefined, "#e6194b", null))
    })

    it("restores the color and shows the error when the write fails, without recording it", async () => {
        const user = userEvent.setup()
        const rollback = vi.fn()
        patchGroup.mockReturnValue(rollback)
        updateItemColor.mockRejectedValueOnce(new Error("boom"))
        const row = setup()
        await openColorMenu(user, row)
        await user.click(await screen.findByLabelText("Colore Rosso"))

        await waitFor(() => expect(rollback).toHaveBeenCalledTimes(1))
        expect(toast.error).toHaveBeenCalledWith("boom")
        expect(recordColor).not.toHaveBeenCalled()
    })
})
