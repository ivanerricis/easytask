import { useEffect, type ReactNode } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { Task } from "./Task"
import { TabsProvider } from "@/contexts/tabs-context"
import { useSelectedTask, useTabsActions } from "@/contexts/use-tabs"
import { makeGroup, makeNote, makeSection, makeTask } from "@/test/ui-fixtures"
import type { NoteDataTree } from "@/types/types"
import { createSelectionStore } from "../sidebar/selection"
import { PreferencesContext } from "@/contexts/preferences-context-object"
import { TaskSelectionContext } from "./use-task-selection"
import { TaskSelectionActionsProvider } from "./task-selection-actions"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const sub = makeTask({ id: 13, sectionID: 10, taskID: 12, text: "Sotto" })
const tasks = [
    makeTask({ id: 10, text: "Primo" }),
    makeTask({ id: 11, text: "Secondo", color: "#e6194b" }),
    makeTask({ id: 12, text: "Terzo", subtasks: [sub] }),
].map(task => ({ ...task, sectionID: 10 }))
const tree: NoteDataTree = {
    groups: [makeGroup({
        id: 1,
        sections: [makeSection({ id: 10, title: "Fare", tasks }), makeSection({ id: 20, title: "Fatto" })],
    })],
}

const updateItemColor = vi.fn()
const deleteItem = vi.fn()
const archiveItem = vi.fn()
const moveTask = vi.fn()
const patchTask = vi.fn(() => () => { })
const removeTask = vi.fn(() => () => { })
const applyTaskMove = vi.fn(() => () => { })
const dispatch = vi.fn()
const recorder = makeUndoRecorderMock()
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceActions: () => ({
        updateTaskCompletion: vi.fn(), renameItem: vi.fn(), updateTaskPriority: vi.fn(), updateTaskDescription: vi.fn(),
        updateItemColor, deleteItem, archiveItem, moveTask,
    }),
}))
vi.mock("@/contexts/use-active-note", () => ({
    useActiveNote: () => ({ noteDataTree: tree }),
    useActiveNoteActions: () => ({ patchTask, removeTask, applyTaskMove, getNoteTree: () => tree, getCachedNoteTree: () => tree, subscribeNoteTree: () => () => { } }),
}))
vi.mock("@/contexts/workspace-data/context", () => ({ useWorkspaceActions: () => ({ setCollapsed: vi.fn() }) }))
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder, useOptionalUndo: () => null }))
vi.mock("@/hooks/use-automations", () => ({ useAutomations: () => ({ dispatch }) }))
vi.mock("../note-dnd-state", () => ({
    useNoteDndSelector: (select: (state: unknown) => unknown) => select({ active: null }),
    useNoteDrop: () => ({ setNodeRef: () => { }, zone: null, active: null }),
    useNoteDrag: () => ({ setNodeRef: () => { }, dragProps: {}, isDragging: false }),
}))
vi.mock("../NoteMoveSubmenus", () => ({ TaskMoveSubmenu: () => null }))
vi.mock("../NoteStepMoves", () => ({ TaskStepMoves: () => null }))
vi.mock("./AddTask", () => ({ AddTask: () => null }))
vi.mock("./DialogTaskDescription", () => ({ DialogTaskDescription: () => null }))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
vi.mock("@/components/tags/DialogTaskTags", () => ({ DialogTaskTags: ({ taskIds }: { taskIds: number[] }) => <output data-testid="tags-dialog">{taskIds.join(",")}</output> }))

function OpenNote({ children }: { children: ReactNode }) {
    const { openNote } = useTabsActions()
    useEffect(() => { openNote(1) }, [openNote])
    return <>{children}</>
}

function Probe() {
    const [selected] = useSelectedTask(1)
    return <output data-testid="selected">{String(selected)}</output>
}

let store: ReturnType<typeof createSelectionStore>

const setup = () => render(
    <TabsProvider notes={[makeNote({ id: 1 })]} workspaceId={null}>
        <OpenNote>
            <PreferencesContext.Provider value={{ showTaskInsertLine: true, taskDensity: "normal" } as never}>
                <TaskSelectionContext.Provider value={store}>
                    <TaskSelectionActionsProvider>
                        {tasks.map(task => <Task key={task.id} task={task} />)}
                    </TaskSelectionActionsProvider>
                </TaskSelectionContext.Provider>
            </PreferencesContext.Provider>
            <Probe />
        </OpenNote>
    </TabsProvider>,
)

const rowOf = (id: number) => document.querySelector(`[data-task-id="${id}"]`) as HTMLElement
const multi = () => Array.from(document.querySelectorAll("[data-multi-selected='true']")).map(el => Number(el.getAttribute("data-task-id")))
const select = (...ids: number[]) => act(() => { ids.forEach(id => store.toggle(`task-${id}`)) })

beforeEach(() => {
    vi.clearAllMocks()
    updateItemColor.mockResolvedValue(undefined)
    deleteItem.mockResolvedValue(undefined)
    archiveItem.mockResolvedValue(undefined)
    moveTask.mockResolvedValue(undefined)
    store = createSelectionStore()
    store.sync(["task-10", "task-11", "task-12", "task-13"])
})

describe("gestures", () => {
    it("Ctrl+click toggles a task without selecting it for the details or starting the rename", () => {
        setup()
        fireEvent.click(rowOf(10), { ctrlKey: true })
        fireEvent.click(rowOf(12), { ctrlKey: true })
        expect(multi()).toEqual([10, 12])
        expect(screen.getByTestId("selected")).toHaveTextContent("null")
        expect(screen.getAllByLabelText("Modifica il testo del task").length).toBe(4)
        expect(screen.getAllByTestId("selection-mark")).toHaveLength(2)

        fireEvent.click(rowOf(10), { metaKey: true })
        expect(multi()).toEqual([12])
    })

    it("a selected row says so to the screen readers, the others do not", () => {
        setup()
        expect(screen.queryByText("selezionato")).not.toBeInTheDocument()
        select(10, 12)
        expect(screen.getAllByText("selezionato")).toHaveLength(2)
        expect(rowOf(10)).toHaveTextContent("selezionato")
        expect(rowOf(11)).not.toHaveTextContent("selezionato")
    })

    it("a click on the text with Ctrl does not start the rename", async () => {
        setup()
        fireEvent.click(screen.getAllByLabelText("Modifica il testo del task")[0], { ctrlKey: true })
        expect(multi()).toEqual([10])
        expect(screen.getAllByLabelText("Modifica il testo del task").length).toBe(4)
    })

    it("a click on the checkbox keeps its own action and leaves the selection alone", () => {
        setup()
        select(10)
        fireEvent.click(screen.getAllByRole("checkbox")[1], { ctrlKey: true })
        expect(multi()).toEqual([10])
    })

    it("Shift+click selects the range from the anchor, subtasks included", () => {
        setup()
        fireEvent.click(rowOf(10), { ctrlKey: true })
        fireEvent.click(rowOf(13), { shiftKey: true })
        expect(multi()).toEqual([10, 11, 12, 13])
    })

    it("Shift+mousedown does not start a text selection", () => {
        setup()
        const prevented = !fireEvent.mouseDown(rowOf(10), { shiftKey: true })
        expect(prevented).toBe(true)
    })

    it("the focus of a Ctrl+click does not select the task for the details", () => {
        setup()
        const checkbox = screen.getAllByRole("checkbox")[0]
        fireEvent.mouseDown(rowOf(10), { ctrlKey: true })
        act(() => checkbox.focus())
        expect(screen.getByTestId("selected")).toHaveTextContent("null")
    })

    it("a plain click resets the multi-selection and selects the task as before", () => {
        setup()
        select(10, 11)
        fireEvent.click(rowOf(12))
        expect(multi()).toEqual([])
        expect(screen.getByTestId("selected")).toHaveTextContent("12")
    })
})

describe("menu of a multi-selection", () => {
    it("shows on right click of a selected task with the counts of the tasks it acts on", async () => {
        setup()
        // 13 is a subtask of the selected 12: it goes with it
        select(10, 12, 13)
        fireEvent.contextMenu(rowOf(10))
        expect(await screen.findByText("Elimina 2 task")).toBeInTheDocument()
        expect(screen.getByText("Archivia 2 task")).toBeInTheDocument()
        expect(screen.getByText("Colora")).toBeInTheDocument()
        expect(screen.getByText("Sposta in…")).toBeInTheDocument()
        expect(screen.queryByText("Rinomina")).not.toBeInTheDocument()
    })

    it("a task outside the selection keeps its own menu", async () => {
        setup()
        select(10, 11)
        fireEvent.contextMenu(rowOf(12))
        expect(await screen.findByText("Rinomina")).toBeInTheDocument()
    })
})

describe("tags of the selection", () => {
    it("the menu of a multi-selection has the tags entry, which opens the dialog for the selected tasks (a subtask included when selected)", async () => {
        const user = userEvent.setup()
        setup()
        select(10, 12, 13)
        fireEvent.contextMenu(rowOf(10))
        await user.click(await screen.findByRole("menuitem", { name: "Tag…" }))
        expect(await screen.findByTestId("tags-dialog")).toHaveTextContent("10,12,13")
    })
})

describe("actions (one undo step each)", () => {
    it("archives the top-most tasks and records ONE step", async () => {
        const user = userEvent.setup()
        setup()
        select(10, 12, 13)
        fireEvent.contextMenu(rowOf(10))
        await user.click(await screen.findByText("Archivia 2 task"))
        await waitFor(() => expect(recorder.archiveMany).toHaveBeenCalledTimes(1))
        expect(archiveItem.mock.calls).toEqual([["task", 10], ["task", 12]])
        expect(removeTask.mock.calls).toEqual([[10], [12]])
        expect(recorder.archiveMany).toHaveBeenCalledWith([
            { itemType: "task", id: 10, name: "Primo" }, { itemType: "task", id: 12, name: "Terzo" },
        ])
        expect(store.getSelected().size).toBe(0)
    })

    it("records only what was archived when one fails", async () => {
        const user = userEvent.setup()
        setup()
        select(10, 11)
        archiveItem.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"))
        fireEvent.contextMenu(rowOf(10))
        await user.click(await screen.findByText("Archivia 2 task"))
        await waitFor(() => expect(recorder.archiveMany).toHaveBeenCalledWith([{ itemType: "task", id: 10, name: "Primo" }]))
    })

    it("asks once before the delete, then trashes the top-most tasks and records ONE step", async () => {
        const user = userEvent.setup()
        setup()
        select(10, 12, 13)
        fireEvent.contextMenu(rowOf(10))
        await user.click(await screen.findByText("Elimina 2 task"))
        const confirm = await screen.findByRole("button", { name: "Sposta 2 task nel cestino" })
        expect(deleteItem).not.toHaveBeenCalled()
        await user.click(confirm)
        await waitFor(() => expect(recorder.removeMany).toHaveBeenCalledTimes(1))
        expect(deleteItem.mock.calls).toEqual([["task", 10], ["task", 12]])
        expect(recorder.removeMany).toHaveBeenCalledWith([
            { itemType: "task", id: 10, name: "Primo" }, { itemType: "task", id: 12, name: "Terzo" },
        ])
    })

    it("colors every selected task (also a selected subtask) with ONE step, skipping the ones that already have the color", async () => {
        const user = userEvent.setup()
        setup()
        select(10, 11, 12, 13)
        fireEvent.contextMenu(rowOf(10))
        await user.hover(await screen.findByText("Colora"))
        fireEvent.click(await screen.findByRole("radio", { name: "Colore Rosso" }))
        await waitFor(() => expect(recorder.colorMany).toHaveBeenCalledTimes(1))
        expect(updateItemColor.mock.calls.map(call => call[1])).toEqual([10, 12, 13])
        // Tracked, so an undo asked right after the last write waits for the step to be recorded
        expect(recorder.track).toHaveBeenCalled()
        expect(recorder.colorMany.mock.calls[0][0]).toEqual([
            { itemType: "task", id: 10, name: "Primo", before: null, after: "#e6194b" },
            { itemType: "task", id: 12, name: "Terzo", before: null, after: "#e6194b" },
            { itemType: "task", id: 13, name: "Sotto", before: null, after: "#e6194b" },
        ])
    })

    it("moves the top-most tasks to the end of the chosen section, in order, with ONE step and the automation event", async () => {
        const user = userEvent.setup()
        setup()
        select(11, 10)
        fireEvent.contextMenu(rowOf(10))
        await user.hover(await screen.findByText("Sposta in…"))
        fireEvent.click(await screen.findByText("Fatto"))
        await waitFor(() => expect(recorder.taskMoveMany).toHaveBeenCalledTimes(1))
        expect(moveTask.mock.calls.map(call => [call[0], call[1]])).toEqual([
            [10, { sectionId: 20, parentTaskId: null }], [11, { sectionId: 20, parentTaskId: null }],
        ])
        expect(recorder.taskMoveMany.mock.calls[0][0].map((step: { id: number }) => step.id)).toEqual([10, 11])
        expect(dispatch.mock.calls).toEqual([
            [{ type: "task.moved", taskId: 10, fromSectionId: 10 }], [{ type: "task.moved", taskId: 11, fromSectionId: 10 }],
        ])
    })
})
