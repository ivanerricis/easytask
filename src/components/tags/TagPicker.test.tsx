import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NoteDataTree, Tag } from "@/types/types"
import { createTagsStore, WorkspaceTagsContext } from "@/contexts/workspace-data/tags"
import { makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import { TagPicker } from "./TagPicker"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())

const mutations = { assign: vi.fn(), create: vi.fn(), rename: vi.fn(), recolor: vi.fn(), remove: vi.fn() }
vi.mock("@/hooks/use-tag-mutations", () => ({ useTagMutations: () => mutations }))

let tree: NoteDataTree
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: tree }) }))

const tag = (id: number, name: string, color: string | null = null): Tag => ({ id, workspaceID: 1, name, color, position: id })
const bug = tag(1, "Bug", "#e6194b")
const urgent = tag(2, "Urgent")

const setup = (tags: Tag[], taskIds: number[] = [10]) => {
    const store = createTagsStore()
    store.set({ workspaceId: 1, tags })
    return render(<WorkspaceTagsContext.Provider value={store}><TagPicker taskIds={taskIds} /></WorkspaceTagsContext.Provider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of Object.values(mutations)) fn.mockResolvedValue(undefined)
    tree = {
        groups: [makeGroup({
            sections: [makeSection({ id: 1, tasks: [makeTask({ id: 10, tagIDs: [1] }), makeTask({ id: 11 })] })],
        })],
    }
})

describe("TagPicker", () => {
    it("lists the tags of the workspace, checked when the task has them", () => {
        setup([bug, urgent])
        expect(screen.getByRole("checkbox", { name: "Bug" })).toBeChecked()
        expect(screen.getByRole("checkbox", { name: "Urgent" })).not.toBeChecked()
    })

    it("says so when the workspace has no tags yet", () => {
        setup([])
        expect(screen.getByText("Nessun tag in questo workspace: creane uno qui sotto.")).toBeInTheDocument()
        expect(screen.queryByRole("list", { name: "Tag del workspace" })).not.toBeInTheDocument()
    })

    it("gives or takes the tag of every task with a click on its checkbox", async () => {
        const user = userEvent.setup()
        setup([bug, urgent], [10, 11])
        await user.click(screen.getByRole("checkbox", { name: "Urgent" }))
        expect(mutations.assign).toHaveBeenLastCalledWith(urgent, [10, 11], true)
        // Only one of the two has "Bug": it is not checked and shows how many do; a click gives it to all
        expect(screen.getByRole("checkbox", { name: "Bug" })).not.toBeChecked()
        expect(screen.getByText("1/2")).toBeInTheDocument()
        await user.click(screen.getByRole("checkbox", { name: "Bug" }))
        expect(mutations.assign).toHaveBeenLastCalledWith(bug, [10, 11], true)
    })

    it("takes the tag away from all when they all have it", async () => {
        const user = userEvent.setup()
        setup([bug], [10])
        await user.click(screen.getByRole("checkbox", { name: "Bug" }))
        expect(mutations.assign).toHaveBeenCalledWith(bug, [10], false)
    })

    it("creates a tag for the tasks with Enter or the button and clears the field", async () => {
        const user = userEvent.setup()
        setup([bug], [10, 11])
        const create = screen.getByRole("button", { name: "Crea" })
        expect(create).toBeDisabled()
        await user.type(screen.getByRole("textbox", { name: "Nuovo tag" }), "Later{Enter}")
        expect(mutations.create).toHaveBeenCalledWith("Later", [10, 11])
        await waitFor(() => expect(screen.getByRole("textbox", { name: "Nuovo tag" })).toHaveValue(""))
    })

    it("shows the error of a creation under the field and keeps the text", async () => {
        const user = userEvent.setup()
        mutations.create.mockRejectedValueOnce(new Error("Esiste già un tag con questo nome."))
        setup([bug])
        await user.type(screen.getByRole("textbox", { name: "Nuovo tag" }), "Bug{Enter}")
        expect(await screen.findByRole("alert")).toHaveTextContent("Esiste già un tag con questo nome.")
        expect(screen.getByRole("textbox", { name: "Nuovo tag" })).toHaveValue("Bug")
        expect(screen.getByRole("textbox", { name: "Nuovo tag" })).toHaveAttribute("aria-invalid", "true")
    })

    it("renames a tag from its menu", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        const field = await screen.findByRole("textbox", { name: "Nome del tag" })
        expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled()
        await user.clear(field)
        await user.type(field, "Defect{Enter}")
        expect(mutations.rename).toHaveBeenCalledWith(bug, "Defect")
    })

    it("changes the color of a tag from its menu, or removes it", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        fireEvent.click(await screen.findByRole("radio", { name: "Colore Verde" }))
        await waitFor(() => expect(mutations.recolor).toHaveBeenCalledWith(bug, "#3cb44b"))
        await user.click(screen.getByRole("button", { name: "Nessun colore" }))
        expect(mutations.recolor).toHaveBeenLastCalledWith(bug, null)
    })

    it("deletes a tag only after the confirmation", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        await user.click(await screen.findByRole("button", { name: "Elimina il tag" }))
        expect(mutations.remove).not.toHaveBeenCalled()
        expect(await screen.findByText(/Il tag "Bug" sarà tolto da tutti i task che lo hanno/)).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Elimina tag" }))
        await waitFor(() => expect(mutations.remove).toHaveBeenCalledWith(bug))
    })
})
