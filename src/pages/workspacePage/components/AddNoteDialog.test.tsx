import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { AddNoteDialog } from "./AddNoteDialog"
import { AddFolderDialog } from "./AddFolderDialog"

const createWorkspaceNote = vi.fn()
const createNoteInFolder = vi.fn()
const createNoteFromTemplate = vi.fn()
const createWorkspaceFolder = vi.fn()
const createSubFolder = vi.fn()
const create = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceActions: () => ({ createWorkspaceNote, createNoteInFolder, createNoteFromTemplate, createWorkspaceFolder, createSubFolder }),
}))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1 } }) }))
const recorder = makeUndoRecorderMock({ create })
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))
vi.mock("@/hooks/use-templates", () => ({ useTemplates: () => [] }))

beforeEach(() => {
    vi.clearAllMocks()
    createWorkspaceNote.mockResolvedValue(10)
    createNoteInFolder.mockResolvedValue(11)
    createWorkspaceFolder.mockResolvedValue(20)
    createSubFolder.mockResolvedValue(21)
})

describe("AddNoteDialog", () => {
    it("limita il nome a 120 caratteri", () => {
        render(<AddNoteDialog open onOpenChange={vi.fn()} parentId={null} />)
        expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "120")
    })

    it("creates a root note with the optional color", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn()
        render(<AddNoteDialog open onOpenChange={onOpenChange} parentId={null} withColor />)
        await user.type(screen.getByRole("textbox"), " Nota ")
        await user.click(screen.getByRole("button", { name: "Aggiungi colore" }))
        await user.click(screen.getByRole("radio", { name: "Colore Blu" }))
        await user.click(screen.getByRole("button", { name: /Crea/ }))
        await waitFor(() => expect(createWorkspaceNote).toHaveBeenCalledWith(1, "Nota", "#4363d8", "note"))
        expect(create).toHaveBeenCalledWith("note", 10, "Nota")
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("creates a note inside a folder, without color", async () => {
        const user = userEvent.setup()
        render(<AddNoteDialog open onOpenChange={vi.fn()} parentId={5} />)
        expect(screen.queryByRole("button", { name: "Aggiungi colore" })).not.toBeInTheDocument()
        await user.type(screen.getByRole("textbox"), "Nota")
        await user.click(screen.getByRole("button", { name: /Crea/ }))
        await waitFor(() => expect(createNoteInFolder).toHaveBeenCalledWith(1, 5, "Nota", "note"))
    })
})

describe("AddFolderDialog", () => {
    it("limita il nome a 120 caratteri", () => {
        render(<AddFolderDialog open onOpenChange={vi.fn()} parentId={null} />)
        expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "120")
    })

    it("creates a root folder or a subfolder depending on parentId", async () => {
        const user = userEvent.setup()
        const { unmount } = render(<AddFolderDialog open onOpenChange={vi.fn()} parentId={null} withColor />)
        await user.type(screen.getByRole("textbox"), "Cart")
        await user.click(screen.getByRole("button", { name: /Crea/ }))
        await waitFor(() => expect(createWorkspaceFolder).toHaveBeenCalledWith(1, "Cart", undefined))
        unmount()
        render(<AddFolderDialog open onOpenChange={vi.fn()} parentId={7} />)
        await user.type(screen.getByRole("textbox"), "Sub")
        await user.click(screen.getByRole("button", { name: /Crea/ }))
        await waitFor(() => expect(createSubFolder).toHaveBeenCalledWith(1, 7, "Sub"))
        expect(create).toHaveBeenCalledWith("folder", 21, "Sub")
    })
})
