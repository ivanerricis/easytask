import { useEffect } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NoteDndStoreContext, createNoteDndStore } from "../note-dnd-state"
import { TaskInsertProvider, useTaskInsertStore } from "../tasks/task-insert-state"
import { SectionBody } from "./SectionBody"
import { makeSection, makeTask } from "@/test/ui-fixtures"

const prefs = { hideCompletedTasks: false, completedTasksLast: false, showTaskInsertLine: true, taskDensity: "normal", keepAddingTasks: false }
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))
const ctx = { insertTaskAfter: vi.fn(), appendTask: vi.fn() }
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ctx }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => ctx }))
vi.mock("@/contexts/undo/use-undo", async () => (await import("@/test/mocks")).undoModuleMock())
vi.mock("@/hooks/use-automations", () => ({ useAutomations: () => ({ dispatch: vi.fn() }) }))
vi.mock("../tasks/AddTask", () => ({ AddTask: () => <div>add task</div> }))
// Shows the task and, nested, its visible subtasks (what the real Task does: it renders them itself)
vi.mock("../tasks/Task", async () => {
    const { visibleTasks } = await import("../section/hide-completed")
    type MockTask = { id: number, text: string, subtasks: MockTask[] }
    const Task = ({ task, hideCompleted }: { task: MockTask, hideCompleted?: boolean }) => (
        <div data-testid="task" data-subtasks={task.subtasks.length}>
            {task.text}
            <div>{visibleTasks(task.subtasks as never, !!hideCompleted).map(sub => <Task key={sub.id} task={sub as MockTask} hideCompleted={hideCompleted} />)}</div>
        </div>
    )
    return { Task }
})

const section = makeSection({
    id: 1,
    tasks: [
        makeTask({ id: 1, text: "Aperto" }),
        makeTask({
            id: 2, text: "Fatto", completed: true,
            subtasks: [makeTask({ id: 21, text: "Sub aperto" }), makeTask({ id: 22, text: "Sub fatto", completed: true })],
        }),
        makeTask({ id: 3, text: "Padre", subtasks: [makeTask({ id: 31, text: "Figlio fatto", completed: true }), makeTask({ id: 32, text: "Figlio aperto" })] }),
    ],
})

describe("SectionBody hiding the completed tasks", () => {
    beforeEach(() => { prefs.hideCompletedTasks = false; prefs.completedTasksLast = false })

    it("shows the completed tasks after the open ones when the preference is on, without touching the stored order", () => {
        const mixed = makeSection({ id: 4, tasks: [
            makeTask({ id: 1, text: "Uno", completed: true }), makeTask({ id: 2, text: "Due" }),
            makeTask({ id: 3, text: "Tre", completed: true }), makeTask({ id: 4, text: "Quattro" }),
        ] })
        const texts = () => screen.getAllByTestId("task").map(node => node.textContent)
        const { rerender } = render(<SectionBody isOpen section={mixed} />)
        expect(texts()).toEqual(["Uno", "Due", "Tre", "Quattro"])
        prefs.completedTasksLast = true
        rerender(<SectionBody isOpen section={makeSection({ ...mixed, tasks: [...mixed.tasks] })} />)
        expect(texts()).toEqual(["Due", "Quattro", "Uno", "Tre"])
        expect(mixed.tasks.map(task => task.id)).toEqual([1, 2, 3, 4])
    })

    it("shows every task and no counter when the preference is off", () => {
        render(<SectionBody isOpen section={section} />)
        for (const text of ["Aperto", "Fatto", "Sub aperto", "Sub fatto", "Padre", "Figlio fatto", "Figlio aperto"]) expect(screen.getByText(text)).toBeInTheDocument()
        expect(screen.queryByTestId("hidden-completed")).not.toBeInTheDocument()
    })

    it("hides fully completed subtrees, keeps a completed task with open work below it, and hides the completed subtasks of the open ones", () => {
        prefs.hideCompletedTasks = true
        render(<SectionBody isOpen section={section} />)
        expect(screen.getByText("Aperto")).toBeInTheDocument()
        expect(screen.getByText("Padre")).toBeInTheDocument()
        expect(screen.getByText("Figlio aperto")).toBeInTheDocument()
        // "Fatto" is completed but "Sub aperto" is open: it stays, and its own completed subtask goes
        expect(screen.getByText("Fatto")).toBeInTheDocument()
        expect(screen.getByText("Sub aperto")).toBeInTheDocument()
        for (const text of ["Sub fatto", "Figlio fatto"]) expect(screen.queryByText(text)).not.toBeInTheDocument()
    })

    it("still hands the full task to the Task (its progress counts the hidden subtasks)", () => {
        prefs.hideCompletedTasks = true
        render(<SectionBody isOpen section={section} />)
        const parent = screen.getAllByTestId("task").find(node => node.textContent?.startsWith("Padre"))
        expect(parent).toHaveAttribute("data-subtasks", "2")
    })

    it("tells how many completed tasks are hidden (plural)", () => {
        prefs.hideCompletedTasks = true
        render(<SectionBody isOpen section={section} />)
        // Sub fatto + Figlio fatto (Fatto stays visible)
        expect(screen.getByTestId("hidden-completed")).toHaveTextContent("2 task completati nascosti")
    })

    it("hides a completed task together with its completed subtasks and counts them all", () => {
        prefs.hideCompletedTasks = true
        const tree = makeSection({ id: 3, tasks: [makeTask({ id: 1, text: "Chiuso", completed: true, subtasks: [makeTask({ id: 11, text: "Chiuso figlio", completed: true })] })] })
        render(<SectionBody isOpen section={tree} />)
        expect(screen.queryByText("Chiuso")).not.toBeInTheDocument()
        expect(screen.queryByText("Chiuso figlio")).not.toBeInTheDocument()
        expect(screen.getByTestId("hidden-completed")).toHaveTextContent("2 task completati nascosti")
    })

    it("uses the singular for one hidden task and shows nothing when none is hidden", () => {
        prefs.hideCompletedTasks = true
        const { rerender } = render(<SectionBody isOpen section={makeSection({ id: 2, tasks: [makeTask({ id: 1, completed: true }), makeTask({ id: 2 })] })} />)
        expect(screen.getByTestId("hidden-completed")).toHaveTextContent("1 task completato nascosto")
        rerender(<SectionBody isOpen section={makeSection({ id: 2, tasks: [makeTask({ id: 2 })] })} />)
        expect(screen.queryByTestId("hidden-completed")).not.toBeInTheDocument()
    })
})

describe("SectionBody collapsed", () => {
    it("is hidden (out of the tab order and of the accessibility tree) while the section is closed", () => {
        const { container, rerender } = render(<SectionBody isOpen={false} section={section} />)
        expect(container.firstElementChild).toHaveClass("hidden")
        rerender(<SectionBody isOpen section={section} />)
        expect(container.firstElementChild).not.toHaveClass("hidden")
    })
})

describe("SectionBody + lines", () => {
    beforeEach(() => { prefs.hideCompletedTasks = false; vi.clearAllMocks(); ctx.insertTaskAfter.mockResolvedValue({ id: 50, index: 1 }) })

    const dnd = createNoteDndStore()
    const setup = (tasks: ReturnType<typeof makeTask>[], task_order?: "manual" | "open-first" | "done-first") => {
        let store!: ReturnType<typeof useTaskInsertStore>
        function Grab() {
            const current = useTaskInsertStore()
            useEffect(() => { store = current }, [current])
            return null
        }
        render(
            <NoteDndStoreContext.Provider value={dnd}>
                <TaskInsertProvider><Grab /><SectionBody isOpen section={makeSection({ id: 1, tasks, task_order })} /></TaskInsertProvider>
            </NoteDndStoreContext.Provider>,
        )
        return () => store
    }
    const plus = (index: number) => screen.getAllByTestId("task-insert-zone")[index].querySelector("button") as HTMLElement
    const fields = () => screen.queryAllByPlaceholderText(/Nuovo task/)

    it("draws a line above every task, the first included, and none under the last", () => {
        setup([makeTask({ id: 1, text: "Uno" }), makeTask({ id: 2, text: "Due" }), makeTask({ id: 3, text: "Tre" })])
        expect(screen.getAllByTestId("task-insert-zone")).toHaveLength(3)
    })

    it("draws no line in an empty section", () => {
        setup([])
        expect(screen.queryByTestId("task-insert-zone")).not.toBeInTheDocument()
    })

    it("opens the field at the top for the first line and under the task above for the others, one field at a time", () => {
        const getStore = setup([makeTask({ id: 1, text: "Uno" }), makeTask({ id: 2, text: "Due" })])
        fireEvent.click(plus(0))
        expect(getStore().getState()).toEqual({ listKey: "s-1", afterTaskId: null })
        expect(fields()).toHaveLength(1)
        expect(fields()[0].compareDocumentPosition(screen.getByText("Uno")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        fireEvent.click(plus(1))
        expect(getStore().getState()).toEqual({ listKey: "s-1", afterTaskId: 1 })
        expect(fields()).toHaveLength(1)
        expect(screen.getByText("Uno").compareDocumentPosition(fields()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("hides the lines while the preference is off", () => {
        prefs.showTaskInsertLine = false
        setup([makeTask({ id: 1 }), makeTask({ id: 2 })])
        expect(screen.queryByTestId("task-insert-zone")).not.toBeInTheDocument()
        prefs.showTaskInsertLine = true
    })

    it("with the completed hidden, inserts before the first visible task and after the visible one above the others", async () => {
        prefs.hideCompletedTasks = true
        const user = userEvent.setup()
        const getStore = setup([
            makeTask({ id: 1, completed: true }), makeTask({ id: 2, text: "Due" }), makeTask({ id: 3, completed: true }), makeTask({ id: 4, text: "Quattro" }),
        ])
        expect(screen.getAllByTestId("task-insert-zone")).toHaveLength(2)

        fireEvent.click(plus(0))
        expect(getStore().getState()).toEqual({ listKey: "s-1", afterTaskId: 1 })
        await user.type(fields()[0], "Prima{Enter}")
        await waitFor(() => expect(ctx.insertTaskAfter).toHaveBeenCalledWith({ sectionId: 1 }, 1, "Prima"))
        expect(ctx.appendTask).toHaveBeenCalledWith(50, { sectionId: 1 }, "Prima", 1)

        fireEvent.click(plus(1))
        await user.type(fields()[0], "Dopo{Enter}")
        await waitFor(() => expect(ctx.insertTaskAfter).toHaveBeenLastCalledWith({ sectionId: 1 }, 2, "Dopo"))
    })

    it("with the completed tasks last, keeps the line above the first completed task and has none between completed ones", async () => {
        prefs.completedTasksLast = true
        const user = userEvent.setup()
        setup([
            makeTask({ id: 1, text: "Uno", completed: true }), makeTask({ id: 2, text: "Due" }),
            makeTask({ id: 3, text: "Tre", completed: true }), makeTask({ id: 4, text: "Quattro" }), makeTask({ id: 5, text: "Cinque", completed: true }),
        ])
        // Drawn: Due, Quattro, Uno, Tre, Cinque: lines above Due, Quattro and Uno only
        expect(screen.getAllByTestId("task-insert-zone")).toHaveLength(3)
        fireEvent.click(plus(2))
        await user.type(fields()[0], "Nuovo{Enter}")
        await waitFor(() => expect(ctx.insertTaskAfter).toHaveBeenCalledWith({ sectionId: 1 }, 4, "Nuovo"))
        prefs.completedTasksLast = false
    })

    it("with the completed tasks first, has no line above a completed task and the first open one inserts before it", async () => {
        const user = userEvent.setup()
        setup([
            makeTask({ id: 1, text: "Uno", completed: true }), makeTask({ id: 2, text: "Due" }),
            makeTask({ id: 3, text: "Tre", completed: true }), makeTask({ id: 4, text: "Quattro" }),
        ], "done-first")
        // Drawn: Uno, Tre, Due, Quattro: lines above Due and Quattro only
        expect(screen.getAllByTestId("task-insert-zone")).toHaveLength(2)
        fireEvent.click(plus(0))
        await user.type(fields()[0], "Nuovo{Enter}")
        // Right before Due in the stored list: after Uno
        await waitFor(() => expect(ctx.insertTaskAfter).toHaveBeenCalledWith({ sectionId: 1 }, 1, "Nuovo"))
    })

    it("the order of the section wins over the preference", () => {
        const mixed = [makeTask({ id: 1, text: "Uno", completed: true }), makeTask({ id: 2, text: "Due" })]
        const texts = () => screen.getAllByTestId("task").map(node => node.textContent)
        prefs.completedTasksLast = true
        const { unmount } = render(<SectionBody isOpen section={makeSection({ id: 5, tasks: mixed, task_order: "manual" })} />)
        expect(texts()).toEqual(["Uno", "Due"])
        unmount()
        prefs.completedTasksLast = false
        render(<SectionBody isOpen section={makeSection({ id: 5, tasks: mixed, task_order: "open-first" })} />)
        expect(texts()).toEqual(["Due", "Uno"])
    })

    it("a line at the top inserts in the first place", async () => {
        const user = userEvent.setup()
        setup([makeTask({ id: 1, text: "Uno" })])
        fireEvent.click(plus(0))
        await user.type(fields()[0], "Primo{Enter}")
        await waitFor(() => expect(ctx.insertTaskAfter).toHaveBeenCalledWith({ sectionId: 1 }, null, "Primo"))
    })

    it("a line opened while the bottom field is open is the only field", () => {
        const getStore = setup([makeTask({ id: 1 })])
        act(() => getStore().claimEnd("s-1"))
        fireEvent.click(plus(0))
        expect(getStore().getState()).toEqual({ listKey: "s-1", afterTaskId: null })
    })
})
