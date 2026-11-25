import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { DialogTaskDescription } from "./DialogTaskDescription"
import { makeTask } from "@/test/ui-fixtures"

const updateTaskDescription = vi.fn()
const patchTask = vi.fn()
const rollback = vi.fn()
const taskDescription = vi.fn()

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ updateTaskDescription }) }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => ({ patchTask }) }))
const recorder = makeUndoRecorderMock({ taskDescription })
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))

// A description opens drawn from its Markdown: a click on it gives the textarea
const edit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("group", { name: "Descrizione" }))

const setup = (description = "") => {
    const onOpenChange = vi.fn()
    render(<DialogTaskDescription task={makeTask({ id: 4, text: "Write the report", description })} open onOpenChange={onOpenChange} />)
    return { onOpenChange }
}

describe("DialogTaskDescription", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        updateTaskDescription.mockResolvedValue(undefined)
        patchTask.mockReturnValue(rollback)
    })

    it("has a title, shows the task text and labels the field", () => {
        setup()
        expect(screen.getByRole("dialog", { name: "Descrizione del task" })).toBeInTheDocument()
        expect(screen.getByText("Write the report")).toBeInTheDocument()
        const field = screen.getByRole("textbox", { name: "Descrizione" })
        expect(field).toHaveAttribute("placeholder", "Scrivi qualcosa per descrivere il task…")
        expect(field).toHaveFocus()
    })

    it("starts with the caret at the end of the existing description", async () => {
        const user = userEvent.setup()
        setup("Existing text")
        await edit(user)
        const field = screen.getByRole("textbox", { name: "Descrizione" }) as HTMLTextAreaElement
        expect(field.selectionStart).toBe("Existing text".length)
    })

    it("keeps Save disabled until the text changes", async () => {
        const user = userEvent.setup()
        setup("Old")
        await edit(user)
        expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled()
        await user.type(screen.getByRole("textbox", { name: "Descrizione" }), "er")
        expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled()
    })

    it("saves, records the undo step and closes", async () => {
        const user = userEvent.setup()
        const { onOpenChange } = setup("Old")
        await edit(user)
        await user.type(screen.getByRole("textbox", { name: "Descrizione" }), " text")
        await user.click(screen.getByRole("button", { name: "Salva" }))

        await waitFor(() => expect(updateTaskDescription).toHaveBeenCalledWith(4, "Old text"))
        expect(patchTask).toHaveBeenCalledWith(4, { description: "Old text" })
        expect(taskDescription).toHaveBeenCalledWith(4, "Write the report", "Old", "Old text")
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("saves with Ctrl+Enter", async () => {
        const user = userEvent.setup()
        setup()
        await user.type(screen.getByRole("textbox", { name: "Descrizione" }), "Done{Control>}{Enter}{/Control}")
        await waitFor(() => expect(updateTaskDescription).toHaveBeenCalledWith(4, "Done"))
    })

    it("ignores a second Ctrl+Enter while the save is pending", async () => {
        const user = userEvent.setup()
        let resolve: () => void = () => {}
        updateTaskDescription.mockReturnValue(new Promise<void>(r => { resolve = r }))
        const { onOpenChange } = setup()
        await user.type(screen.getByRole("textbox", { name: "Descrizione" }), "Done{Control>}{Enter}{Enter}{/Control}")
        expect(updateTaskDescription).toHaveBeenCalledTimes(1)
        resolve()
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("removes the description when it is cleared", async () => {
        const user = userEvent.setup()
        setup("Old")
        await edit(user)
        await user.clear(screen.getByRole("textbox", { name: "Descrizione" }))
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(updateTaskDescription).toHaveBeenCalledWith(4, undefined))
    })

    it("rolls back and shows an inline error when the write fails", async () => {
        const user = userEvent.setup()
        const { onOpenChange } = setup()
        updateTaskDescription.mockRejectedValueOnce(new Error("disk full"))
        await user.type(screen.getByRole("textbox", { name: "Descrizione" }), "x")
        await user.click(screen.getByRole("button", { name: "Salva" }))

        await waitFor(() => expect(rollback).toHaveBeenCalled())
        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(taskDescription).not.toHaveBeenCalled()
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
    })

    it("closes without saving on Cancel", async () => {
        const user = userEvent.setup()
        const { onOpenChange } = setup()
        await user.type(screen.getByRole("textbox", { name: "Descrizione" }), "x")
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
        expect(updateTaskDescription).not.toHaveBeenCalled()
    })

    it("Escape closes without saving and drops the unsaved text for the next open", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn()
        const task = makeTask({ id: 4, text: "Write the report", description: "Old" })
        const ui = (open: boolean) => <DialogTaskDescription task={task} open={open} onOpenChange={onOpenChange} />
        const { rerender } = render(ui(true))
        await edit(user)
        await user.type(screen.getByRole("textbox", { name: "Descrizione" }), "xyz")
        await user.keyboard("{Escape}")

        expect(onOpenChange).toHaveBeenCalledWith(false)
        expect(updateTaskDescription).not.toHaveBeenCalled()

        rerender(ui(false))
        rerender(ui(true))
        expect(screen.getByRole("group", { name: "Descrizione" })).toHaveTextContent("Old")
        await edit(user)
        expect(screen.getByRole("textbox", { name: "Descrizione" })).toHaveValue("Old")
    })

    it("ticks a checklist item of the drawn description, saves it at once and stays open", async () => {
        const user = userEvent.setup()
        const before = "Todo:\n- [ ] one\n- [x] two"
        const after = "Todo:\n- [x] one\n- [x] two"
        const { onOpenChange } = setup(before)
        await user.click(screen.getAllByRole("checkbox")[0])
        await waitFor(() => expect(updateTaskDescription).toHaveBeenCalledWith(4, after))
        expect(taskDescription).toHaveBeenCalledWith(4, "Write the report", before, after)
        expect(onOpenChange).not.toHaveBeenCalled()
        expect(screen.queryByRole("textbox", { name: "Descrizione" })).toBeNull()
    })
})
