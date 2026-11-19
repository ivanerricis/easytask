import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { open } from "@tauri-apps/plugin-dialog"
import { NoteBackgroundMenu } from "./NoteBackgroundMenu"
import { makeUndoRecorderMock } from "@/test/mocks"
import { IMAGE_EXTENSIONS } from "@/db/queries/media"

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }))
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => ({ hideCompletedTasks: false, setHideCompletedTasks: vi.fn() }) }))
vi.mock("@/contexts/use-shortcuts", () => ({ useShortcutKeys: () => [] }))
vi.mock("@/contexts/use-tabs", () => ({ useActiveNoteId: () => 1 }))

const updateNoteBackground = vi.fn()
const updateNoteBackgroundImage = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ updateNoteBackground, updateNoteBackgroundImage }) }))

let image: string | null = null
vi.mock("@/hooks/use-note-background", () => ({ useNoteBackgroundColor: () => null, useNoteBackgroundImagePath: () => image }))

const recorder = makeUndoRecorderMock()
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))

const openMenu = () => {
    render(<NoteBackgroundMenu><div data-testid="area" /></NoteBackgroundMenu>)
    fireEvent.contextMenu(screen.getByTestId("area"))
}

beforeEach(() => {
    vi.clearAllMocks()
    image = null
})

describe("NoteBackgroundMenu image entries", () => {
    it("offers the choice of an image and no removal while the note has none", () => {
        openMenu()
        expect(screen.getByRole("menuitem", { name: "Scegli immagine…" })).toBeInTheDocument()
        expect(screen.queryByRole("menuitem", { name: "Togli immagine" })).toBeNull()
    })

    it("opens the dialog with the image extensions only, saves the file and records the undo", async () => {
        vi.mocked(open).mockResolvedValue("C:\\img\\a.png")
        openMenu()
        await userEvent.setup().click(screen.getByRole("menuitem", { name: "Scegli immagine…" }))
        await waitFor(() => expect(updateNoteBackgroundImage).toHaveBeenCalledWith(1, "C:\\img\\a.png"))
        expect(open).toHaveBeenCalledWith({ multiple: false, directory: false, filters: [{ name: "Immagini", extensions: [...IMAGE_EXTENSIONS] }] })
        expect(recorder.backgroundImage).toHaveBeenCalledWith(1, null, null, "C:\\img\\a.png")
    })

    it("changes nothing when the dialog is cancelled", async () => {
        vi.mocked(open).mockResolvedValue(null)
        openMenu()
        await userEvent.setup().click(screen.getByRole("menuitem", { name: "Scegli immagine…" }))
        await waitFor(() => expect(open).toHaveBeenCalled())
        expect(updateNoteBackgroundImage).not.toHaveBeenCalled()
        expect(recorder.backgroundImage).not.toHaveBeenCalled()
    })

    it("removes the image when the note has one, and records the undo with the previous path", async () => {
        image = "C:\\img\\a.png"
        openMenu()
        await userEvent.setup().click(screen.getByRole("menuitem", { name: "Togli immagine" }))
        await waitFor(() => expect(updateNoteBackgroundImage).toHaveBeenCalledWith(1, undefined))
        expect(recorder.backgroundImage).toHaveBeenCalledWith(1, null, "C:\\img\\a.png", null)
    })

    it("does not record anything when the chosen file is the one already set", async () => {
        image = "C:\\img\\a.png"
        vi.mocked(open).mockResolvedValue("C:\\img\\a.png")
        openMenu()
        await userEvent.setup().click(screen.getByRole("menuitem", { name: "Scegli immagine…" }))
        await waitFor(() => expect(open).toHaveBeenCalled())
        expect(updateNoteBackgroundImage).not.toHaveBeenCalled()
    })
})
