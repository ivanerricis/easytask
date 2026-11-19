import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NoteDataTree, Tag } from "@/types/types"
import { createTagsStore, WorkspaceTagsContext } from "@/contexts/workspace-data/tags"
import { PreferencesContext, type PreferencesContextType } from "@/contexts/preferences-context-object"
import { UndoContext } from "@/contexts/undo/context"
import { toast } from "sonner"
import { makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import { TagPicker } from "./TagPicker"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())

const mutations = { assign: vi.fn(), create: vi.fn(), rename: vi.fn(), recolor: vi.fn(), reshape: vi.fn(), remove: vi.fn() }
vi.mock("@/hooks/use-tag-mutations", () => ({ useTagMutations: () => mutations }))

let tree: NoteDataTree
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: tree }) }))

const tag = (id: number, name: string, color: string | null = null): Tag => ({ id, workspaceID: 1, name, color, shape: null, position: id })
const bug = tag(1, "Bug", "#e6194b")
const urgent = tag(2, "Urgent")

const undoLast = vi.fn()
const skipped = { list: [] as string[] }
const setup = (tags: Tag[], taskIds: number[] = [10], groupIds?: number[]) => {
    const store = createTagsStore()
    store.set({ workspaceId: 1, tags })
    return render(
        <PreferencesContext.Provider value={{ skippedConfirms: skipped.list, setSkippedConfirms: vi.fn() } as unknown as PreferencesContextType}>
            <UndoContext.Provider value={{ undo: undoLast } as never}>
                <WorkspaceTagsContext.Provider value={store}>{groupIds ? <TagPicker groupIds={groupIds} /> : <TagPicker taskIds={taskIds} />}</WorkspaceTagsContext.Provider>
            </UndoContext.Provider>
        </PreferencesContext.Provider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    skipped.list = []
    for (const fn of Object.values(mutations)) fn.mockResolvedValue(undefined)
    tree = {
        groups: [makeGroup({
            id: 5,
            tagIDs: [2],
            sections: [makeSection({ id: 1, tasks: [makeTask({ id: 10, tagIDs: [1] }), makeTask({ id: 11 })] })],
        }), makeGroup({ id: 6 })],
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

    it("changes the shape of a tag from its menu with a picker of samples, naming each shape", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        const picker = await screen.findByRole("radiogroup", { name: "Forma" })
        expect(picker).toBeInTheDocument()
        // The current shape (the pill) is the pressed one
        expect(screen.getByRole("radio", { name: "Pillola" })).toBeChecked()
        await user.click(screen.getByRole("radio", { name: "Punto" }))
        expect(mutations.reshape).toHaveBeenCalledWith(bug, "dot")
        await user.click(screen.getByRole("radio", { name: "Cartellino" }))
        expect(mutations.reshape).toHaveBeenLastCalledWith(bug, "tag")
        // A click on the selected shape does nothing
        await user.click(screen.getByRole("radio", { name: "Pillola" }))
        expect(mutations.reshape).toHaveBeenCalledTimes(2)
    })

    it("has no empty gap under the name while there is no error, and shows the error when the rename fails", async () => {
        const user = userEvent.setup()
        mutations.rename.mockRejectedValueOnce(new Error("Esiste già"))
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        const field = await screen.findByRole("textbox", { name: "Nome del tag" })
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
        await user.type(field, "x{Enter}")
        expect(await screen.findByRole("alert")).toHaveTextContent("Esiste già")
    })

    it("deletes a tag only after the confirmation", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        await user.click(await screen.findByRole("button", { name: "Elimina il tag" }))
        expect(mutations.remove).not.toHaveBeenCalled()
        expect(await screen.findByText(/Il tag "Bug" sarà tolto da tutti i task e i gruppi che lo hanno/)).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Elimina tag" }))
        await waitFor(() => expect(mutations.remove).toHaveBeenCalledWith(bug))
    })

    it("offers 'Non chiedermelo più' and shows an undo toast after deleting a tag", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        await user.click(await screen.findByRole("button", { name: "Elimina il tag" }))
        expect(await screen.findByRole("checkbox", { name: "Non chiedermelo più" })).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Elimina tag" }))
        await waitFor(() => expect(mutations.remove).toHaveBeenCalledWith(bug))
        expect(toast.success).toHaveBeenCalledWith("Tag eliminato", expect.objectContaining({ action: expect.objectContaining({ label: "Annulla" }) }))
        const options = vi.mocked(toast.success).mock.calls[0][1] as unknown as { action: { onClick: () => void } }
        options.action.onClick()
        expect(undoLast).toHaveBeenCalledTimes(1)
    })

    it("deletes at once, with the undo toast, when the confirmation was skipped", async () => {
        const user = userEvent.setup()
        skipped.list = ["tag-delete"]
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        await user.click(await screen.findByRole("button", { name: "Elimina il tag" }))
        await waitFor(() => expect(mutations.remove).toHaveBeenCalledWith(bug))
        expect(screen.queryByText("Eliminare il tag?")).toBeNull()
        expect(toast.success).toHaveBeenCalledWith("Tag eliminato", expect.anything())
    })
})

describe("TagPicker for groups", () => {
    it("checks the tags the group has and gives or takes them for the group", async () => {
        const user = userEvent.setup()
        setup([bug, urgent], [], [5])
        expect(screen.getByRole("checkbox", { name: "Urgent" })).toBeChecked()
        expect(screen.getByRole("checkbox", { name: "Bug" })).not.toBeChecked()
        await user.click(screen.getByRole("checkbox", { name: "Bug" }))
        expect(mutations.assign).toHaveBeenLastCalledWith(bug, { kind: "groups", ids: [5] }, true)
        await user.click(screen.getByRole("checkbox", { name: "Urgent" }))
        expect(mutations.assign).toHaveBeenLastCalledWith(urgent, { kind: "groups", ids: [5] }, false)
    })

    it("shows how many of the groups have a tag, and creates a tag for them", async () => {
        const user = userEvent.setup()
        setup([bug, urgent], [], [5, 6])
        expect(screen.getByText("1/2")).toBeInTheDocument()
        await user.type(screen.getByRole("textbox", { name: "Nuovo tag" }), "Later{Enter}")
        expect(mutations.create).toHaveBeenCalledWith("Later", { kind: "groups", ids: [5, 6] })
    })
})

describe("TagPicker menu of a tag: Enter closes it", () => {
    it("saves a changed name and closes the menu", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        const field = await screen.findByRole("textbox", { name: "Nome del tag" })
        await user.clear(field)
        await user.type(field, "Defect{Enter}")
        expect(mutations.rename).toHaveBeenCalledWith(bug, "Defect")
        await waitFor(() => expect(screen.queryByRole("textbox", { name: "Nome del tag" })).not.toBeInTheDocument())
    })

    it("only closes the menu when the name did not change, or is empty", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        await user.type(await screen.findByRole("textbox", { name: "Nome del tag" }), "{Enter}")
        expect(mutations.rename).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.queryByRole("textbox", { name: "Nome del tag" })).not.toBeInTheDocument())

        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        await user.clear(await screen.findByRole("textbox", { name: "Nome del tag" }))
        await user.keyboard("{Enter}")
        expect(mutations.rename).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.queryByRole("textbox", { name: "Nome del tag" })).not.toBeInTheDocument())
    })

    it("keeps the menu open and shows the error when the rename fails", async () => {
        const user = userEvent.setup()
        mutations.rename.mockRejectedValueOnce(new Error("Esiste già"))
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        await user.type(await screen.findByRole("textbox", { name: "Nome del tag" }), "x{Enter}")
        expect(await screen.findByRole("alert")).toHaveTextContent("Esiste già")
        expect(screen.getByRole("textbox", { name: "Nome del tag" })).toBeInTheDocument()
    })

    it("does not let the Enter reach the dialog that hosts the picker", async () => {
        const user = userEvent.setup()
        const outer = vi.fn()
        const store = createTagsStore()
        store.set({ workspaceId: 1, tags: [bug] })
        render(
            <PreferencesContext.Provider value={{ skippedConfirms: [], setSkippedConfirms: vi.fn() } as unknown as PreferencesContextType}>
                <WorkspaceTagsContext.Provider value={store}><div onKeyDown={outer}><TagPicker taskIds={[10]} /></div></WorkspaceTagsContext.Provider>
            </PreferencesContext.Provider>,
        )
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        await user.type(await screen.findByRole("textbox", { name: "Nome del tag" }), "{Enter}")
        expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }))
    })

    it("offers the eight shapes", async () => {
        const user = userEvent.setup()
        setup([bug])
        await user.click(screen.getByRole("button", { name: "Gestisci il tag Bug" }))
        const picker = await screen.findByRole("radiogroup", { name: "Forma" })
        expect([...picker.querySelectorAll("[role='radio']")].map(radio => radio.getAttribute("aria-label"))).toEqual(
            ["Pillola", "Rettangolo", "Punto", "Cartellino", "Rombo", "Esagono", "Stella", "Quadrato"])
        await user.click(screen.getByRole("radio", { name: "Stella" }))
        expect(mutations.reshape).toHaveBeenCalledWith(bug, "star")
    })
})

describe("TagPicker for sections", () => {
    it("checks the tags the section has and gives or takes them for the section", async () => {
        const user = userEvent.setup()
        tree = { groups: [makeGroup({ id: 5, sections: [makeSection({ id: 7, tagIDs: [2] })] })] }
        const store = createTagsStore()
        store.set({ workspaceId: 1, tags: [bug, urgent] })
        render(
            <PreferencesContext.Provider value={{ skippedConfirms: [], setSkippedConfirms: vi.fn() } as unknown as PreferencesContextType}>
                <WorkspaceTagsContext.Provider value={store}><TagPicker sectionIds={[7]} /></WorkspaceTagsContext.Provider>
            </PreferencesContext.Provider>,
        )
        expect(screen.getByRole("checkbox", { name: "Urgent" })).toBeChecked()
        expect(screen.getByRole("checkbox", { name: "Bug" })).not.toBeChecked()
        await user.click(screen.getByRole("checkbox", { name: "Bug" }))
        expect(mutations.assign).toHaveBeenLastCalledWith(bug, { kind: "sections", ids: [7] }, true)
        await user.click(screen.getByRole("checkbox", { name: "Urgent" }))
        expect(mutations.assign).toHaveBeenLastCalledWith(urgent, { kind: "sections", ids: [7] }, false)
    })
})
