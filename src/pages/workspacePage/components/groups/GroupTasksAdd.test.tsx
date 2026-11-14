import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLayoutEffect, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Group as GroupCard } from "./Group"
import { TabsProvider } from "@/contexts/tabs-context"
import { PreferencesContext } from "@/contexts/preferences-context-object"
import { TaskInsertProvider } from "../tasks/task-insert-state"
import { makeDefaultSection, makeGroup, makeNote, makeTask } from "@/test/ui-fixtures"
import type { Group } from "@/types/types"

vi.mock("@/hooks/use-automations", () => ({ useAutomations: () => ({ dispatch: vi.fn() }) }))
vi.mock("@/contexts/undo/use-undo", async () => (await import("@/test/mocks")).undoModuleMock())
vi.mock("./GroupHeader", () => ({ GroupHeader: () => <div>header</div> }))
vi.mock("./GroupAudioFiles", () => ({ GroupAudioFiles: () => null }))
vi.mock("./GroupMediaFiles", () => ({ GroupMediaFiles: () => null }))
vi.mock("../section/Section", () => ({ Section: () => null }))
vi.mock("../section/AddSection", () => ({ AddSection: () => null }))
vi.mock("../NoteMoveSubmenus", () => ({ TaskMoveSubmenu: () => null }))
vi.mock("../NoteStepMoves", () => ({ TaskStepMoves: () => null }))
vi.mock("../tasks/DialogTaskDescription", () => ({ DialogTaskDescription: () => null }))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
vi.mock("@/components/dialogs/dialog-add-color", () => ({ DialogAddColor: () => null }))
vi.mock("../note-dnd-state", () => ({
    useNoteDrag: () => ({ setNodeRef: vi.fn(), setActivatorNodeRef: vi.fn(), dragProps: {}, attributes: {}, listeners: {}, isDragging: false }),
    useNoteDrop: () => ({ setNodeRef: vi.fn(), zone: null, active: null }),
    useNoteDndSelector: (select: (state: unknown) => unknown) => select({ active: null, hover: { targetSectionId: null } }),
    useNoteMoves: () => ({ moveTaskTo: vi.fn() }),
}))

let nextId = 100
let append: (id: number, text: string) => void = () => {}
const ctx = { createTask: vi.fn(), applyTaskMove: vi.fn(), refreshActiveNote: vi.fn(), patchGroup: vi.fn(), setGroupWidth: vi.fn(), patchTask: vi.fn(() => () => {}), removeTask: vi.fn(), subscribeNoteTree: () => () => {}, getCachedNoteTree: () => ({ groups: [] }), getNoteTree: () => ({ groups: [] }) }
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ ...ctx, updateTaskCompletion: vi.fn(), renameItem: vi.fn() }) }))
vi.mock("@/contexts/workspace-data/context", () => ({ useWorkspaceActions: () => ({ setCollapsed: vi.fn() }) }))
vi.mock("@/contexts/use-active-note", () => ({
    useActiveNoteActions: () => ({ ...ctx, appendTask: (id: number, _parent: unknown, text: string) => append(id, text) }),
}))

let prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: true, showTaskInsertLine: true }

// Like the note: appending a task puts it in the group's state, and the group renders again
const Harness = ({ initial }: { initial: Group }) => {
    const [group, setGroup] = useState(initial)
    useLayoutEffect(() => {
        append = (id, text) => setGroup(current => ({
            ...current,
            defaultSection: { ...current.defaultSection!, tasks: [...current.defaultSection!.tasks, makeTask({ id, text })] },
        }))
    }, [])
    return (
        <TabsProvider notes={[makeNote({ id: 1 })]} workspaceId={null}>
            <PreferencesContext.Provider value={prefs as never}>
                <TaskInsertProvider><GroupCard group={group} /></TaskInsertProvider>
            </PreferencesContext.Provider>
        </TabsProvider>
    )
}

const emptyGroup = () => makeGroup({ id: 4, defaultSection: makeDefaultSection({ id: 12, groupID: 4, tasks: [] }) })

describe("new task in a group", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        nextId = 100
        prefs = { newTaskPosition: "bottom", taskDensity: "normal", keepAddingTasks: true, showTaskInsertLine: true }
        ctx.createTask.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 80)); return nextId++ })
    })

    it("with keepAddingTasks, Enter in an empty group keeps an empty, focused field open for the next task", async () => {
        const user = userEvent.setup()
        render(<Harness initial={emptyGroup()} />)
        await user.click(screen.getByRole("button", { name: "Nuovo task" }))
        await user.type(screen.getByPlaceholderText("Nuovo task…"), "Uno{Enter}")

        await waitFor(() => expect(screen.getByText("Uno")).toBeInTheDocument())
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
        const next = screen.getByPlaceholderText("Nuovo task…")
        expect(next).toHaveValue("")
        expect(next).toHaveFocus()

        await user.type(next, "Due{Enter}")
        await waitFor(() => expect(screen.getByText("Due")).toBeInTheDocument())
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
        expect(screen.getByPlaceholderText("Nuovo task…")).toHaveFocus()
    })

    it("without keepAddingTasks the field closes after the task", async () => {
        prefs = { ...prefs, keepAddingTasks: false }
        const user = userEvent.setup()
        render(<Harness initial={emptyGroup()} />)
        await user.click(screen.getByRole("button", { name: "Nuovo task" }))
        await user.type(screen.getByPlaceholderText("Nuovo task…"), "Uno{Enter}")
        await waitFor(() => expect(screen.getByText("Uno")).toBeInTheDocument())
        expect(screen.queryByPlaceholderText("Nuovo task…")).not.toBeInTheDocument()
    })
})
