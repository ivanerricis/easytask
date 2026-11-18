import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AddTask, GROUP_ADD_TASK_VARIANT } from "./AddTask"
import { toast } from "sonner"
import { deferred } from "@/test/ui-render"
import { TaskInsertProvider, useTaskInsertStore } from "./task-insert-state"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const ctx = {
    createTask: vi.fn(),
    createSubTask: vi.fn(),
    appendTask: vi.fn(),
    applyTaskMove: vi.fn(),
}
let prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: false }
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ctx }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => ctx }))

const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button"))
    return screen.getByPlaceholderText("Nuovo task…")
}

describe("AddTask", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: false }
        ctx.createTask.mockResolvedValue(50)
        ctx.createSubTask.mockResolvedValue(60)
    })

    it("registers no mousedown listener while closed, one when open, and does not re-register while typing", async () => {
        const user = userEvent.setup()
        const spy = vi.spyOn(document, "addEventListener")
        const mousedowns = () => spy.mock.calls.filter(([type]) => type === "mousedown").length
        render(<AddTask sectionId={3} />)
        expect(mousedowns()).toBe(0)
        const input = await open(user)
        expect(mousedowns()).toBe(1)
        await user.type(input, "abc")
        expect(mousedowns()).toBe(1)
        spy.mockRestore()
    })

    it("in a group the closed control is always visible (not only on hover) and left aligned, like the row of a section", () => {
        render(<AddTask sectionId={12} inGroup />)
        const button = screen.getByRole("button", { name: "Nuovo task" })
        expect(button).not.toHaveClass("opacity-0")
        expect(button).toHaveClass("w-full", "justify-start")
        expect(GROUP_ADD_TASK_VARIANT).toBe("row")
    })

    it("starts collapsed and opens the input on click", async () => {
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument()

        await open(user)
        expect(screen.getByPlaceholderText("Nuovo task…")).toHaveFocus()
    })

    it("in a group starts as a 'Nuovo task' button and creates the task in the given (default) section", async () => {
        const user = userEvent.setup()
        render(<AddTask sectionId={12} inGroup />)
        const button = screen.getByRole("button", { name: "Nuovo task" })
        expect(button).toHaveTextContent("Nuovo task")
        await user.click(button)

        await user.type(screen.getByPlaceholderText("Nuovo task…"), "Diretto{Enter}")
        await waitFor(() => expect(ctx.createTask).toHaveBeenCalledWith(12, "Diretto", "bottom"))
        expect(ctx.appendTask).toHaveBeenCalledWith(50, { sectionId: 12 }, "Diretto")
        expect(screen.getByRole("button", { name: "Nuovo task" })).toBeInTheDocument()
    })

    it("creates the trimmed task, appends it to the note without reloading and collapses", async () => {
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)

        await user.type(input, "  Buy milk  {Enter}")

        await waitFor(() => expect(ctx.appendTask).toHaveBeenCalledWith(50, { sectionId: 3 }, "Buy milk"))
        expect(ctx.createTask).toHaveBeenCalledWith(3, "Buy milk", "bottom")
        expect(ctx.applyTaskMove).not.toHaveBeenCalled()
        expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument()
    })

    it("with keepAddingTasks on, Enter creates the task and keeps an empty, focused input open", async () => {
        prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: true }
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)

        await user.type(input, "Buy milk{Enter}")

        await waitFor(() => expect(ctx.appendTask).toHaveBeenCalledWith(50, { sectionId: 3 }, "Buy milk"))
        const next = screen.getByPlaceholderText("Nuovo task…")
        expect(next).toHaveValue("")
        await waitFor(() => expect(next).toHaveFocus())

        await user.type(next, "Second{Enter}")
        await waitFor(() => expect(ctx.createTask).toHaveBeenCalledTimes(2))
    })

    it("with keepAddingTasks on, the input does not take the focus back from something that got it while the task was being created", async () => {
        prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: true }
        const creation = deferred<number>()
        ctx.createTask.mockReturnValue(creation.promise)
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)
        const other = document.body.appendChild(document.createElement("button"))

        await user.type(input, "Buy milk{Enter}")
        // A menu (or anything else) takes the focus before the creation ends
        other.focus()
        creation.resolve(50)

        await waitFor(() => expect(ctx.appendTask).toHaveBeenCalled())
        expect(other).toHaveFocus()
        other.remove()
    })

    it("with keepAddingTasks on, Enter on an empty field closes the input", async () => {
        prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: true }
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)

        await user.type(input, "{Enter}")

        expect(ctx.createTask).not.toHaveBeenCalled()
        expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument()
    })

    it("with keepAddingTasks on, Escape still closes the input", async () => {
        prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: true }
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        await user.type(await open(user), "draft{Escape}")

        expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument()
    })

    it("puts the new task before its siblings, also in the cached note, when new tasks go on top", async () => {
        prefs = { newTaskPosition: "top", taskDensity: "normal", keepAddingTasks: false }
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)

        await user.type(input, "Buy milk{Enter}")

        await waitFor(() => expect(ctx.applyTaskMove).toHaveBeenCalledWith(50, { sectionId: 3, parentTaskId: null }, 0))
        expect(ctx.createTask).toHaveBeenCalledWith(3, "Buy milk", "top")
    })

    it("puts the new subtask before its sibling subtasks when new tasks go on top", async () => {
        prefs = { newTaskPosition: "top", taskDensity: "normal", keepAddingTasks: false }
        const user = userEvent.setup()
        render(<AddTask sectionId={3} parentTaskId={7} />)

        await user.type(screen.getByPlaceholderText("Nuovo sottotask…"), "Sub{Enter}")

        await waitFor(() => expect(ctx.applyTaskMove).toHaveBeenCalledWith(60, { sectionId: 3, parentTaskId: 7 }, 0))
        expect(ctx.createSubTask).toHaveBeenCalledWith(7, "Sub", "top")
    })

    it("does not create a task for an empty or blank name", async () => {
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)

        await user.type(input, "   {Enter}")
        expect(ctx.createTask).not.toHaveBeenCalled()
    })

    it("reports creation errors with a toast and keeps the form open", async () => {
        const user = userEvent.setup()
        ctx.createTask.mockRejectedValue(new Error("duplicate"))
        render(<AddTask sectionId={3} />)
        await user.type(await open(user), "Task{Enter}")

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("duplicate"))
        expect(screen.getByPlaceholderText("Nuovo task…")).toBeInTheDocument()
        expect(ctx.appendTask).not.toHaveBeenCalled()
    })

    it("creates the task once when Enter is pressed twice while saving", async () => {
        const user = userEvent.setup()
        const pending = deferred<number>()
        ctx.createTask.mockReturnValue(pending.promise)
        render(<AddTask sectionId={3} />)
        const input = await open(user)
        await user.type(input, "Once{Enter}{Enter}")

        expect(ctx.createTask).toHaveBeenCalledTimes(1)
        expect(input).toHaveAttribute("readonly")
        pending.resolve(50)
        await waitFor(() => expect(ctx.appendTask).toHaveBeenCalledTimes(1))
    })

    it("keeps the typed text on an outside mousedown", async () => {
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        await user.type(await open(user), "draft")

        fireEvent.mouseDown(document.body)
        expect(screen.getByPlaceholderText("Nuovo task…")).toHaveValue("draft")
        expect(ctx.createTask).not.toHaveBeenCalled()
    })

    it("closes on an outside mousedown when the field is empty, and again with the text erased", async () => {
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)
        await user.type(input, "x")
        await user.clear(input)

        fireEvent.mouseDown(document.body)
        expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument()
        expect(await open(user)).toHaveValue("")
    })

    it("non ha bottoni di aggiunta o annullamento: Invio aggiunge, Esc annulla", async () => {
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)
        expect(screen.queryByRole("button")).not.toBeInTheDocument()
        expect(input).toHaveAccessibleDescription("Invio per aggiungere, Esc per annullare")

        await user.type(input, "Uno{Enter}")
        await waitFor(() => expect(ctx.createTask).toHaveBeenCalledWith(3, "Uno", "bottom"))

        const reopened = await open(user)
        await user.type(reopened, "Bozza{Escape}")
        expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument()
        expect(ctx.createTask).toHaveBeenCalledTimes(1)
    })

    it("segna il campo come occupato mentre salva", async () => {
        const gate = deferred<number>()
        ctx.createTask.mockReturnValue(gate.promise)
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        const input = await open(user)
        await user.type(input, "Lento{Enter}")
        await waitFor(() => expect(input).toHaveAttribute("aria-busy", "true"))
        gate.resolve(50)
        await waitFor(() => expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument())
    })

    it("closes on Escape, discarding the text, without creating", async () => {
        const user = userEvent.setup()
        render(<AddTask sectionId={3} />)
        await open(user)
        await user.type(screen.getByPlaceholderText("Nuovo task…"), "bozza{Escape}")

        expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument()
        expect(ctx.createTask).not.toHaveBeenCalled()
        await open(user)
        expect(screen.getByPlaceholderText("Nuovo task…")).toHaveValue("")
    })

    describe("subtask mode", () => {
        const placeholder = "Nuovo sottotask…"

        it("starts open and focused, and creates a subtask instead of a task", async () => {
            const user = userEvent.setup()
            render(<AddTask sectionId={3} parentTaskId={7} />)
            const input = screen.getByPlaceholderText(placeholder)
            expect(input).toHaveFocus()

            await user.type(input, "  Step one  {Enter}")

            await waitFor(() => expect(ctx.appendTask).toHaveBeenCalledWith(60, { parentTaskId: 7 }, "Step one"))
            expect(ctx.createSubTask).toHaveBeenCalledWith(7, "Step one", "bottom")
            expect(ctx.createTask).not.toHaveBeenCalled()
        })

        it("with keepAddingTasks on, keeps the input open and empty to add the next subtask", async () => {
            prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: true }
            const user = userEvent.setup()
            const onClose = vi.fn()
            render(<AddTask sectionId={3} parentTaskId={7} onClose={onClose} />)
            await user.type(screen.getByPlaceholderText(placeholder), "One{Enter}")
            await waitFor(() => expect(ctx.appendTask).toHaveBeenCalled())

            const input = screen.getByPlaceholderText(placeholder)
            expect(input).toHaveValue("")
            await user.type(input, "Two{Enter}")
            await waitFor(() => expect(ctx.createSubTask).toHaveBeenLastCalledWith(7, "Two", "bottom"))
            expect(onClose).not.toHaveBeenCalled()
        })

        it("with keepAddingTasks on, Enter on the empty input ends the series", async () => {
            prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: true }
            const user = userEvent.setup()
            const onClose = vi.fn()
            render(<AddTask sectionId={3} parentTaskId={7} onClose={onClose} />)
            const input = screen.getByPlaceholderText(placeholder)
            await user.type(input, "One{Enter}")
            await waitFor(() => expect(ctx.appendTask).toHaveBeenCalled())
            expect(onClose).not.toHaveBeenCalled()

            await user.type(input, "{Enter}")
            expect(onClose).toHaveBeenCalledTimes(1)
            expect(ctx.createSubTask).toHaveBeenCalledTimes(1)
        })

        it("with keepAddingTasks off, closes after adding the subtask", async () => {
            const user = userEvent.setup()
            const onClose = vi.fn()
            render(<AddTask sectionId={3} parentTaskId={7} onClose={onClose} />)
            await user.type(screen.getByPlaceholderText(placeholder), "One{Enter}")

            await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
            expect(ctx.createSubTask).toHaveBeenCalledWith(7, "One", "bottom")
        })

        it("non ha bottoni di aggiunta o annullamento: Invio aggiunge, Esc annulla", async () => {
            const user = userEvent.setup()
            const onClose = vi.fn()
            render(<AddTask sectionId={3} parentTaskId={7} onClose={onClose} />)
            const input = screen.getByPlaceholderText(placeholder)
            expect(screen.queryByRole("button")).not.toBeInTheDocument()
            expect(input).toHaveAccessibleDescription("Invio per aggiungere, Esc per annullare")

            await user.type(input, "Passo{Enter}")
            await waitFor(() => expect(ctx.createSubTask).toHaveBeenCalledWith(7, "Passo", "bottom"))
            onClose.mockClear()
            await user.type(screen.getByPlaceholderText(placeholder), "Bozza{Escape}")
            expect(onClose).toHaveBeenCalledTimes(1)
            expect(ctx.createSubTask).toHaveBeenCalledTimes(1)
        })

        it("closes on Escape", async () => {
            const user = userEvent.setup()
            const onClose = vi.fn()
            render(<AddTask sectionId={3} parentTaskId={7} onClose={onClose} />)
            await user.type(screen.getByPlaceholderText(placeholder), "draft{Escape}")
            expect(onClose).toHaveBeenCalledTimes(1)
            expect(ctx.createSubTask).not.toHaveBeenCalled()
        })

        it("closes on blur when empty but not when it holds text", async () => {
            const user = userEvent.setup()
            const onClose = vi.fn()
            render(<AddTask sectionId={3} parentTaskId={7} onClose={onClose} />)
            const input = screen.getByPlaceholderText(placeholder)
            await user.type(input, "keep")
            input.blur()
            expect(onClose).not.toHaveBeenCalled()

            await user.clear(input)
            input.blur()
            expect(onClose).toHaveBeenCalledTimes(1)
        })

        it("reports errors with a toast", async () => {
            const user = userEvent.setup()
            ctx.createSubTask.mockRejectedValue(new Error("boom"))
            render(<AddTask sectionId={3} parentTaskId={7} />)
            await user.type(screen.getByPlaceholderText(placeholder), "x{Enter}")
            await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"))
            expect(ctx.appendTask).not.toHaveBeenCalled()
        })
    })
})

describe("AddTask and the field of a new task opened by a + line", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: false }
    })

    const setup = (ui: React.ReactNode) => {
        let store!: ReturnType<typeof useTaskInsertStore>
        function Grab() {
            const current = useTaskInsertStore()
            useEffect(() => { store = current }, [current])
            return null
        }
        render(<TaskInsertProvider><Grab />{ui}</TaskInsertProvider>)
        return () => store
    }

    it("opening the bottom field takes the place of the open field", async () => {
        const user = userEvent.setup()
        const getStore = setup(<AddTask sectionId={3} />)
        act(() => getStore().claim({ listKey: "s-3", afterTaskId: 4 }))
        await user.click(screen.getByRole("button"))
        expect(getStore().getState()).toEqual({ listKey: "s-3", afterTaskId: null, end: true })
        expect(screen.getByPlaceholderText(/Nuovo task/)).toBeInTheDocument()
    })

    it("a + line that opens a field closes the bottom field, discarding its text", async () => {
        const user = userEvent.setup()
        const getStore = setup(<AddTask sectionId={3} />)
        await user.type(await open(user), "bozza")
        act(() => getStore().claim({ listKey: "s-3", afterTaskId: 4 }))
        expect(screen.queryByPlaceholderText(/Nuovo task/)).not.toBeInTheDocument()

        await user.click(screen.getByRole("button"))
        expect(screen.getByPlaceholderText(/Nuovo task/)).toHaveValue("")
    })

    it("closing the bottom field frees the place, but not if another field took it", async () => {
        const user = userEvent.setup()
        const getStore = setup(<AddTask sectionId={3} />)
        const input = await open(user)
        await user.type(input, "{Escape}")
        expect(getStore().getState()).toBeNull()

        await open(user)
        act(() => getStore().claim({ listKey: "s-9", afterTaskId: null }))
        expect(getStore().getState()).toEqual({ listKey: "s-9", afterTaskId: null })
    })

    it("the new subtask field closes when a field is opened elsewhere, and frees the place when it closes", async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        const getStore = setup(<AddTask sectionId={3} parentTaskId={7} onClose={onClose} />)
        act(() => getStore().claimEnd("t-7"))
        expect(onClose).not.toHaveBeenCalled()

        await user.type(screen.getByPlaceholderText(/Nuovo sottotask/), "{Escape}")
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(getStore().getState()).toBeNull()

        act(() => getStore().claim({ listKey: "t-7", afterTaskId: 11 }))
        expect(onClose).toHaveBeenCalledTimes(2)
    })
})
