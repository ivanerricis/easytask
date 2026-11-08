import { useEffect } from "react"
import type { ReactNode } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Task } from "./Task"
import { TabsProvider } from "@/contexts/tabs-context"
import { useSelectedTask, useTabUiStore, useTabsActions } from "@/contexts/use-tabs"
import { RightPanelContext, type RightPanelContextType } from "../rightbar/right-panel-context-object"
import { makeGroup, makeNote, makeSection, makeTask } from "@/test/ui-fixtures"
import { searchingStore } from "@/test/search-store"
import { NoteSearchContext } from "../note-search-context"
import { COLOR_ALPHA_BASE } from "@/lib/color-intensity"
import { PreferencesContext } from "@/contexts/preferences-context-object"
import { useNoteDrop } from "../note-dnd-state"
import { TaskInsertProvider, useTaskInsertStore } from "./task-insert-state"

const updateTaskCompletion = vi.fn()
const renameItem = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceActions: () => ({
        updateTaskCompletion, renameItem, updateTaskPriority: vi.fn(), updateTaskDescription: vi.fn(), updateItemColor: vi.fn(),
    }),
}))
const patchTask = vi.fn(() => () => { })
const setCollapsed = vi.fn().mockResolvedValue(undefined)
// The tree of the active note as the open/closed hooks read it: the ids in this set are saved as closed
const closedTasks = new Set<number>()
const makeTree = () => ({ groups: [{ id: 1, noteID: 1, position: 0, sections: [{ id: 1, groupID: 1, title: "", position: 0, tasks: [...closedTasks].map(id => ({ id, collapsed: true, subtasks: [] })) }] }] })
vi.mock("@/contexts/use-active-note", () => ({
    useActiveNoteActions: () => ({
        patchTask, removeTask: vi.fn(), subscribeNoteTree: () => () => { },
        getCachedNoteTree: () => makeTree(),
    }),
}))
vi.mock("@/contexts/workspace-data/context", () => ({ useWorkspaceActions: () => ({ setCollapsed }) }))
vi.mock("../note-dnd-state", () => ({
    useNoteDndSelector: (select: (state: unknown) => unknown) => select({ active: null }),
    useNoteDrop: vi.fn(() => ({ setNodeRef: () => { }, zone: null, active: null })),
    useNoteDrag: () => ({
        setNodeRef: () => { }, setActivatorNodeRef: () => { },
        attributes: { role: "button", "aria-roledescription": "draggable", tabIndex: 0 }, listeners: {}, isDragging: false,
    }),
}))
vi.mock("../NoteMoveSubmenus", () => ({ TaskMoveSubmenu: () => null }))
vi.mock("../NoteStepMoves", () => ({ TaskStepMoves: () => null }))
vi.mock("./AddTask", () => ({ AddTask: () => null }))
// Like the real one, it shows only while it is open
vi.mock("./DialogTaskDescription", () => ({ DialogTaskDescription: ({ open }: { open: boolean }) => open ? <div>description dialog</div> : null }))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
vi.mock("@/components/dialogs/dialog-add-color", () => ({ DialogAddColor: () => null }))

const showTaskDetails = vi.fn()
const panel: RightPanelContextType = { open: false, setOpen: vi.fn(), tab: "history", setTab: vi.fn(), showTaskDetails, audioInfoFile: null, showAudioInfo: vi.fn() }

function OpenNote({ id, children }: { id: number, children: ReactNode }) {
    const { openNote } = useTabsActions()
    useEffect(() => { openNote(id) }, [openNote, id])
    return <>{children}</>
}

/** Shows the selection of the note and lets a test switch note. */
function Probe() {
    const { activateNote, openNote } = useTabsActions()
    const [selected] = useSelectedTask(1)
    const [selected2] = useSelectedTask(2)
    const ui = useTabUiStore()
    return (
        <>
            <output data-testid="selected-1">{String(selected)}</output>
            <output data-testid="selected-2">{String(selected2)}</output>
            <button onClick={() => ui.setRevealed(1, "task", 10, true)}>reveal 10</button>
            <button onClick={() => openNote(2)}>go 2</button>
            <button onClick={() => activateNote(1)}>go 1</button>
        </>
    )
}

const renderTasks = (ui: ReactNode, withPanel = true) => render(
    <TabsProvider notes={[makeNote({ id: 1 }), makeNote({ id: 2 })]} workspaceId={null}>
        <OpenNote id={1}>
            <PreferencesContext.Provider value={{ showTaskInsertLine: true, taskDensity: "normal" } as never}>
                <RightPanelContext.Provider value={withPanel ? panel : null}>{ui}<Probe /></RightPanelContext.Provider>
            </PreferencesContext.Provider>
        </OpenNote>
    </TabsProvider>,
)

beforeEach(() => { vi.clearAllMocks(); closedTasks.clear() })

describe("Task selection", () => {
    const tasks = (
        <>
            <Task task={makeTask({ id: 10, text: "Primo" })} />
            <Task task={makeTask({ id: 11, text: "Secondo" })} />
        </>
    )
    const rowOf = (id: number) => document.querySelector(`[data-task-id="${id}"]`) as HTMLElement
    const selected = () => document.querySelectorAll("[data-selected='true']")

    it("starts with nothing selected", () => {
        renderTasks(tasks)
        expect(selected()).toHaveLength(0)
        expect(screen.getByTestId("selected-1")).toHaveTextContent("null")
    })

    it("selects the task with a click on the row and highlights it", async () => {
        renderTasks(tasks)
        const first = rowOf(10)
        fireEvent.click(first)
        expect(screen.getByTestId("selected-1")).toHaveTextContent("10")
        expect(first).toHaveAttribute("data-selected", "true")
        expect(first).toHaveAttribute("aria-current", "true")
        expect(first.className).toContain("bg-accent")
        expect(selected()).toHaveLength(1)

        fireEvent.click(rowOf(11))
        expect(screen.getByTestId("selected-1")).toHaveTextContent("11")
        expect(rowOf(10)).not.toHaveAttribute("data-selected")
        expect(rowOf(11)).toHaveAttribute("data-selected", "true")
    })

    it("selects the task when the focus enters the row", async () => {
        renderTasks(tasks)
        const checkboxes = screen.getAllByRole("checkbox")
        act(() => checkboxes[1].focus())
        expect(screen.getByTestId("selected-1")).toHaveTextContent("11")
    })

    it("a click on the text selects the task and still opens the editing", async () => {
        const user = userEvent.setup()
        renderTasks(tasks)
        await user.click(screen.getAllByLabelText("Modifica il testo del task")[0])
        expect(screen.getByTestId("selected-1")).toHaveTextContent("10")
        // The text became an editable field without the "edit" label
        expect(screen.getAllByLabelText("Modifica il testo del task")).toHaveLength(1)
        expect(screen.getByDisplayValue("Primo")).not.toHaveAttribute("aria-label")
    })

    it("tints the whole row with a light version of the color, besides the full side bar", () => {
        const { container } = renderTasks(<Task task={makeTask({ id: 10, text: "Primo", color: "#e6194b" })} />)
        const styles = Array.from(container.querySelectorAll<HTMLElement>("[style]")).map(el => el.style.backgroundColor)
        expect(styles).toContain("rgb(230, 25, 75)")
        expect(styles).toContain(`rgba(230, 25, 75, ${COLOR_ALPHA_BASE.task})`)
    })

    it("has no tint when the preference is off, but keeps the side bar", () => {
        const { container } = renderTasks(
            <PreferencesContext.Provider value={{ taskBackground: false } as never}>
                <Task task={makeTask({ id: 10, text: "Primo", color: "#e6194b" })} />
            </PreferencesContext.Provider>,
        )
        const styles = Array.from(container.querySelectorAll<HTMLElement>("[style]")).map(el => el.style.backgroundColor)
        expect(styles).toContain("rgb(230, 25, 75)")
        expect(styles.some(color => color.startsWith("rgba("))).toBe(false)
    })

    it("has no tint without a color", () => {
        const { container } = renderTasks(<Task task={makeTask({ id: 10, text: "Primo" })} />)
        expect(Array.from(container.querySelectorAll<HTMLElement>("[style]")).some(el => el.style.backgroundColor)).toBe(false)
    })

    it("a click on the checkbox or a toolbar button does not select the row", async () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo" })} />)
        // userEvent focuses on mousedown: use fireEvent.click to look at the click alone
        fireEvent.click(screen.getByRole("checkbox"))
        fireEvent.click(screen.getByRole("button", { name: "Aggiungi sottotask" }))
        expect(screen.getByTestId("selected-1")).toHaveTextContent("null")
    })

    it("has no Details button on the row (the entry is in the menu of the task)", () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo" })} />)
        expect(screen.queryByRole("button", { name: "Mostra dettagli" })).not.toBeInTheDocument()
    })

    it("keeps the selection per note", async () => {
        const user = userEvent.setup()
        renderTasks(tasks)
        fireEvent.click(rowOf(10))
        await user.click(screen.getByRole("button", { name: "go 2" }))
        expect(screen.getByTestId("selected-2")).toHaveTextContent("null")
        expect(selected()).toHaveLength(0)
        await user.click(screen.getByRole("button", { name: "go 1" }))
        expect(screen.getByTestId("selected-1")).toHaveTextContent("10")
        expect(selected()).toHaveLength(1)
    })

    it("the context menu entry shows the details of the right clicked task", async () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo" })} />)
        fireEvent.contextMenu(rowOf(10))
        fireEvent.click(await screen.findByRole("menuitem", { name: "Mostra dettagli" }))
        expect(showTaskDetails).toHaveBeenCalledWith(10)
    })

    it("a right click on the text of the task opens the menu of the task, not the one of a text field", async () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo" })} />)
        const text = screen.getByLabelText("Modifica il testo del task")
        // Read only until the editing opens: the menu of the text fields (cut, copy, paste) does not apply to it
        expect(text).toHaveAttribute("readonly")
        fireEvent.contextMenu(text)
        expect(await screen.findByRole("menuitem", { name: "Mostra dettagli" })).toBeInTheDocument()
    })

    it("does not break the toggle of the completion", async () => {
        const user = userEvent.setup()
        updateTaskCompletion.mockResolvedValue(undefined)
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo" })} />)
        await user.click(screen.getByRole("checkbox"))
        expect(updateTaskCompletion).toHaveBeenCalledWith(10, true)
    })
})

describe("Task text editing", () => {
    const edit = async (user: ReturnType<typeof userEvent.setup>, text = "Primo") => {
        renderTasks(<Task task={makeTask({ id: 10, text })} />)
        await user.click(screen.getByLabelText("Modifica il testo del task"))
        return screen.getByDisplayValue(text)
    }

    it("renames on click by default", async () => {
        const user = userEvent.setup()
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo" })} />)
        await user.click(screen.getByLabelText("Modifica il testo del task"))
        expect(screen.getByDisplayValue("Primo")).not.toHaveAttribute("aria-label")
    })

    it("with renameOnClick off a click on the text only selects the task, and Enter still starts the edit", async () => {
        const user = userEvent.setup()
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo" })} renameOnClick={false} />)
        const text = screen.getByLabelText("Modifica il testo del task")
        await user.click(text)
        expect(screen.getByTestId("selected-1")).toHaveTextContent("10")
        expect(screen.getByLabelText("Modifica il testo del task")).toHaveAttribute("readonly")
        await user.keyboard("{Enter}")
        expect(screen.getByDisplayValue("Primo")).not.toHaveAttribute("readonly")
    })

    it("Escape cancels the edit: restores the text and does not rename", async () => {
        const user = userEvent.setup()
        const field = await edit(user)
        await user.type(field, " modificato{Escape}")

        expect(renameItem).not.toHaveBeenCalled()
        expect(screen.getByLabelText("Modifica il testo del task")).toHaveValue("Primo")
    })

    it("opening the edit focuses the field, and Escape works from the keyboard alone", async () => {
        const user = userEvent.setup()
        const field = await edit(user)
        expect(field).toHaveFocus()
        await user.keyboard("x{Escape}")

        expect(renameItem).not.toHaveBeenCalled()
        expect(screen.getByLabelText("Modifica il testo del task")).toHaveValue("Primo")
        expect(document.activeElement).not.toBeNull()
    })

    it("Escape also cancels while the rename error is shown", async () => {
        const user = userEvent.setup()
        // The error tooltip (Radix popper) measures with ResizeObserver, which jsdom lacks
        vi.stubGlobal("ResizeObserver", class { observe() { /* none */ } unobserve() { /* none */ } disconnect() { /* none */ } })
        renameItem.mockRejectedValueOnce(new Error("boom"))
        const field = await edit(user)
        await user.type(field, "x{Enter}")
        await screen.findAllByText(/boom/)
        expect(field).toHaveFocus()
        await user.keyboard("{Escape}")

        expect(screen.getByLabelText("Modifica il testo del task")).toHaveValue("Primo")
        expect(screen.queryByRole("alert")).toBeNull()
    })

    it("Escape works on every edit, not just the first", async () => {
        const user = userEvent.setup()
        const field = await edit(user)
        await user.type(field, "x{Escape}")
        await user.click(screen.getByLabelText("Modifica il testo del task"))
        await user.keyboard("y{Escape}")

        expect(renameItem).not.toHaveBeenCalled()
        expect(screen.getByLabelText("Modifica il testo del task")).toHaveValue("Primo")
    })

    it("Enter saves once (the blur on unmount does not save again)", async () => {
        const user = userEvent.setup()
        const field = await edit(user)
        await user.type(field, "x{Enter}")

        await waitFor(() => expect(renameItem).toHaveBeenCalledTimes(1))
        expect(renameItem).toHaveBeenCalledWith("task", 10, "Primox")
    })

    it("does not rename for a whitespace-only change", async () => {
        const user = userEvent.setup()
        const field = await edit(user)
        await user.type(field, "   {Enter}")

        await waitFor(() => expect(screen.getByLabelText("Modifica il testo del task")).toBeInTheDocument())
        expect(renameItem).not.toHaveBeenCalled()
    })

    it("labels the priority indicator", () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo", priority: true })} />)
        expect(screen.getByRole("img", { name: "Priorità alta" })).toBeInTheDocument()
    })
})

describe("Task subtasks", () => {
    const parent = makeTask({
        id: 10,
        text: "Genitore",
        subtasks: [makeTask({ id: 11, text: "Uno", completed: true }), makeTask({ id: 12, text: "Due" })],
    })

    it("shows how many direct subtasks are completed", () => {
        renderTasks(<Task task={parent} />)
        expect(screen.getByTitle("1 di 2 sottotask completati")).toHaveTextContent("1/2")
    })

    it("hides the counter when the preference is off", () => {
        renderTasks(<Task task={parent} showSubtaskCount={false} />)
        expect(screen.queryByTitle(/sottotask completati/)).not.toBeInTheDocument()
    })

    it("shows no counter on a task without subtasks", () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Solo" })} />)
        expect(screen.queryByTitle(/sottotask completati/)).not.toBeInTheDocument()
    })

    it("closed: draws no subtask, shows the count (also with the preference off) and keeps the progress", () => {
        closedTasks.add(10)
        renderTasks(<Task task={parent} showSubtaskCount={false} />)
        expect(screen.queryByText("Uno")).not.toBeInTheDocument()
        expect(screen.queryByText("Due")).not.toBeInTheDocument()
        const count = screen.getByTestId("subtask-count")
        expect(count).toHaveTextContent("1/2")
        expect(count).toHaveAttribute("data-subtasks-hidden", "true")
        expect(count).toHaveAttribute("title", "1 di 2 sottotask completati (sottotask nascosti)")
    })

    it("a closed task that the search opens shows its subtasks without saving anything", async () => {
        closedTasks.add(10)
        const user = userEvent.setup()
        renderTasks(<Task task={parent} />)
        expect(screen.queryByDisplayValue("Uno")).not.toBeInTheDocument()
        await user.click(screen.getByText("reveal 10"))
        expect(screen.getByDisplayValue("Uno")).toBeInTheDocument()
        expect(patchTask).not.toHaveBeenCalled()
        expect(setCollapsed).not.toHaveBeenCalled()
    })

    it("open: draws the subtasks and no hidden-subtasks sign", () => {
        renderTasks(<Task task={parent} />)
        expect(screen.getByDisplayValue("Uno")).toBeInTheDocument()
        expect(screen.getByTestId("subtask-count")).not.toHaveAttribute("data-subtasks-hidden")
    })

    it("closing one task leaves the subtasks of its siblings alone", () => {
        closedTasks.add(10)
        renderTasks(<><Task task={parent} /><Task task={makeTask({ id: 20, text: "Altro", subtasks: [makeTask({ id: 21, text: "Figlio" })] })} /></>)
        expect(screen.queryByDisplayValue("Uno")).not.toBeInTheDocument()
        expect(screen.getByDisplayValue("Figlio")).toBeInTheDocument()
    })

    it("the menu has Comprimi sottotask on a task with subtasks, and saves the closed state", async () => {
        const user = userEvent.setup()
        renderTasks(<Task task={parent} />)
        fireEvent.contextMenu(document.querySelector('[data-task-id="10"]') as HTMLElement)
        await user.click(await screen.findByRole("menuitem", { name: "Comprimi sottotask" }))
        expect(patchTask).toHaveBeenCalledWith(10, { collapsed: true })
        await waitFor(() => expect(setCollapsed).toHaveBeenCalledWith("task", 10, true))
    })

    it("the menu has Espandi sottotask on a closed task", async () => {
        closedTasks.add(10)
        const user = userEvent.setup()
        renderTasks(<Task task={parent} />)
        fireEvent.contextMenu(document.querySelector('[data-task-id="10"]') as HTMLElement)
        await user.click(await screen.findByRole("menuitem", { name: "Espandi sottotask" }))
        expect(patchTask).toHaveBeenCalledWith(10, { collapsed: false })
        await waitFor(() => expect(setCollapsed).toHaveBeenCalledWith("task", 10, false))
    })

    it("the menu of a task without subtasks has no entry to collapse them", async () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Solo" })} />)
        fireEvent.contextMenu(document.querySelector('[data-task-id="10"]') as HTMLElement)
        await screen.findByRole("menuitem", { name: "Aggiungi sottotask" })
        expect(screen.queryByRole("menuitem", { name: "Comprimi sottotask" })).not.toBeInTheDocument()
        expect(screen.queryByRole("menuitem", { name: "Espandi sottotask" })).not.toBeInTheDocument()
    })

    it("adding a subtask to a closed task opens it first", async () => {
        closedTasks.add(10)
        const user = userEvent.setup()
        renderTasks(<Task task={parent} />)
        await user.click(screen.getAllByRole("button", { name: "Aggiungi sottotask" })[0])
        expect(patchTask).toHaveBeenCalledWith(10, { collapsed: false })
    })

    it("draws the tree connectors only for subtasks", () => {
        const { container } = renderTasks(<>
            <Task task={makeTask({ id: 10, text: "Primo" })} />
            <Task task={makeTask({ id: 11, text: "Sotto" })} depth={1} />
        </>)
        const subtaskBlocks = container.querySelectorAll('[class~="group/subtask"]')
        expect(subtaskBlocks).toHaveLength(1)
        const spans = subtaskBlocks[0].querySelectorAll(":scope > span[aria-hidden]")
        expect(spans).toHaveLength(3)
        // The horizontal tick is always visible: there is no drag handle to make room for
        expect(spans[2].className).not.toContain("opacity-0")
    })

    it("hides the line of the last subtask only on its own level, not on the levels below it", () => {
        const { container } = renderTasks(<Task task={makeTask({ id: 11, text: "Sotto" })} depth={1} />)
        const [through, elbow] = container.querySelectorAll('[class~="group/subtask"] > span[aria-hidden]')
        // A "group-last" variant also matches the descendants of a last subtask: the lines of a deeper level would disappear
        for (const span of [through, elbow]) expect(span.className).not.toContain("group-last")
        expect(through.className).toContain("[.subtask:last-child>&]:hidden")
        expect(elbow.className).toContain("[.subtask:last-child>&]:bg-muted-foreground/45")
    })
})

describe("Task description icon", () => {
    const withSubtasks = [makeTask({ id: 11, text: "Uno", completed: true }), makeTask({ id: 12, text: "Due" })]
    const indicator = () => screen.queryByTestId("description-indicator")

    it("shows an indicator, next to the subtask counter, when the task has a description", () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Genitore", description: "Dettagli", subtasks: withSubtasks })} />)
        expect(indicator()).not.toBeNull()
        expect(indicator()!.querySelector("svg.lucide-align-left")).not.toBeNull()
        // Same group as the counter of the subtasks, and no line of text under the task
        expect(indicator()!.parentElement).toContainElement(screen.getByTitle("1 di 2 sottotask completati"))
        expect(screen.queryByText("Dettagli")).not.toBeInTheDocument()
    })

    it("has the same button in the toolbar that shows on hover, once for the screen readers", () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Genitore", description: "Dettagli" })} />)
        const buttons = screen.getAllByRole("button", { name: "Mostra la descrizione" })
        // The indicator is aria-hidden: only the button of the toolbar is exposed
        expect(buttons).toHaveLength(1)
        expect(buttons[0]).not.toBe(indicator())
        expect(buttons[0].parentElement).toContainElement(screen.getByRole("button", { name: "Aggiungi sottotask" }))
        expect(indicator()).toHaveAttribute("aria-hidden", "true")
        // Decorative: not a control, so nothing aria-hidden can take the focus
        expect(indicator()!.tagName).toBe("SPAN")
        expect(indicator()).not.toHaveAttribute("tabindex")
        expect(indicator()!.querySelector("button")).toBeNull()
    })

    it("has neither without a description, or with a blank one", () => {
        const { rerender } = renderTasks(<Task task={makeTask({ id: 10, text: "Genitore", description: "", subtasks: withSubtasks })} />)
        expect(indicator()).toBeNull()
        expect(screen.queryByRole("button", { name: "Mostra la descrizione" })).not.toBeInTheDocument()
        rerender(
            <TabsProvider notes={[makeNote({ id: 1 }), makeNote({ id: 2 })]} workspaceId={null}>
                <PreferencesContext.Provider value={{ showTaskInsertLine: true, taskDensity: "normal" } as never}>
                    <OpenNote id={1}><Task task={makeTask({ id: 10, text: "Genitore", description: "  \n  ", subtasks: withSubtasks })} /></OpenNote>
                </PreferencesContext.Provider>
            </TabsProvider>,
        )
        expect(indicator()).toBeNull()
        expect(screen.queryByRole("button", { name: "Mostra la descrizione" })).not.toBeInTheDocument()
    })

    it("is shown alone on a task without subtasks, and also when the subtask counter is turned off", () => {
        const { unmount } = renderTasks(<Task task={makeTask({ id: 10, text: "Solo", description: "Dettagli" })} />)
        expect(indicator()).not.toBeNull()
        unmount()

        renderTasks(<Task task={makeTask({ id: 10, text: "Genitore", description: "Dettagli", subtasks: withSubtasks })} showSubtaskCount={false} />)
        expect(indicator()).not.toBeNull()
        expect(screen.queryByTitle(/sottotask completati/)).not.toBeInTheDocument()
    })

    it("opens the description from the toolbar button and from the indicator", async () => {
        const user = userEvent.setup()
        renderTasks(<Task task={makeTask({ id: 10, text: "Genitore", description: "Dettagli" })} />)
        expect(screen.queryByText("description dialog")).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Mostra la descrizione" }))
        expect(screen.getByText("description dialog")).toBeInTheDocument()
    })

    it("opens the description from the indicator too", async () => {
        const user = userEvent.setup()
        renderTasks(<Task task={makeTask({ id: 10, text: "Genitore", description: "Dettagli" })} />)
        await user.click(indicator()!)
        expect(screen.getByText("description dialog")).toBeInTheDocument()
    })
})

describe("Task rendering", () => {
    it("renders its own subtasks, hiding the completed ones only when asked", () => {
        const parent = makeTask({ id: 10, text: "Genitore", subtasks: [makeTask({ id: 11, text: "Uno", completed: true }), makeTask({ id: 12, text: "Due" })] })
        const { unmount } = renderTasks(<Task task={parent} />)
        expect(screen.getByText("Uno")).toBeInTheDocument()
        unmount()
        renderTasks(<Task task={parent} hideCompleted />)
        expect(screen.queryByText("Uno")).not.toBeInTheDocument()
        expect(screen.getByText("Due")).toBeInTheDocument()
    })

    it("does not re-render a sibling parent when a leaf of another one changes", () => {
        const leaf = makeTask({ id: 11, text: "Foglia", sectionID: 1 })
        const a = makeTask({ id: 10, text: "A", subtasks: [leaf] })
        const b = makeTask({ id: 20, text: "B", subtasks: [makeTask({ id: 21, text: "Altra foglia" })] })
        const ui = (x: typeof a) => (
            <PreferencesContext.Provider value={{ showTaskInsertLine: true, taskDensity: "normal" } as never}>
                <TabsProvider notes={[makeNote({ id: 1 })]} workspaceId={null}>
                    <Task task={x} />
                    <Task task={b} />
                </TabsProvider>
            </PreferencesContext.Provider>
        )
        const { rerender } = render(ui(a))
        const rendersOf = (id: number) => vi.mocked(useNoteDrop).mock.calls.filter(call => call[1] === id).length
        const before = { a: rendersOf(10), b: rendersOf(20), bLeaf: rendersOf(21) }
        // Structural sharing: only the changed leaf and its ancestor are new objects
        rerender(ui({ ...a, subtasks: [{ ...leaf, completed: true }] }))
        expect(rendersOf(10)).toBeGreaterThan(before.a)
        expect(rendersOf(11)).toBeGreaterThan(0)
        expect(rendersOf(20)).toBe(before.b)
        expect(rendersOf(21)).toBe(before.bLeaf)
    })
})

describe("Task priority flag", () => {
    // SQLite returns the flags as 0/1: a 0 must not be rendered as text next to the task
    it("shows nothing for a priority read from the database as 0", () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo", priority: 0 as unknown as boolean })} />)
        expect(screen.queryByText("0")).not.toBeInTheDocument()
        expect(screen.queryByRole("img", { name: "Priorità alta" })).not.toBeInTheDocument()
    })

    it("shows the flag for a priority read from the database as 1", () => {
        renderTasks(<Task task={makeTask({ id: 10, text: "Primo", priority: 1 as unknown as boolean })} />)
        expect(screen.getByRole("img", { name: "Priorità alta" })).toBeInTheDocument()
    })
})

describe("Task search", () => {
    const task = makeTask({ id: 10, text: "Compra il Latte" })
    const group = makeGroup({ sections: [makeSection({ tasks: [task] })] })

    it("keeps the textarea when the text does not match", () => {
        renderTasks(
            <NoteSearchContext.Provider value={searchingStore([group], "zzz")}><Task task={task} /></NoteSearchContext.Provider>,
        )
        expect(screen.getByRole("textbox", { name: "Modifica il testo del task" })).toHaveValue("Compra il Latte")
        expect(document.querySelector("mark")).toBeNull()
    })

    it("shows the text with the matches marked, and a click still starts the rename", async () => {
        renderTasks(
            <NoteSearchContext.Provider value={searchingStore([group], "latte")}><Task task={task} /></NoteSearchContext.Provider>,
        )
        const mark = document.querySelector("mark") as HTMLElement
        expect(mark).toHaveTextContent("Latte")
        expect(mark).toHaveAttribute("data-active", "true")
        await userEvent.click(screen.getByRole("textbox", { name: "Modifica il testo del task" }))
        expect(screen.getByRole("textbox")).toHaveValue("Compra il Latte")
        expect(document.querySelector("mark")).toBeNull()
    })
})

describe("Task insert lines between subtasks", () => {
    let store!: ReturnType<typeof useTaskInsertStore>
    function Grab() {
        const current = useTaskInsertStore()
        useEffect(() => { store = current }, [current])
        return null
    }
    const renderTree = (task: ReturnType<typeof makeTask>, hideCompleted = false) => renderTasks(
        <TaskInsertProvider><Grab /><Task task={task} hideCompleted={hideCompleted} /></TaskInsertProvider>,
    )
    const zones = () => screen.getAllByTestId("task-insert-zone")
    const plus = (index: number) => zones()[index].querySelector("button") as HTMLElement
    const fields = () => screen.queryAllByPlaceholderText(/Nuovo task/)
    const parent = (...subtasks: ReturnType<typeof makeTask>[]) => makeTask({ id: 10, text: "Padre", sectionID: 1, subtasks })
    const rowOfText = (text: string) => screen.getAllByLabelText("Modifica il testo del task").find(node => (node as HTMLTextAreaElement).value === text)!

    it("has a line above every subtask (also the first) and none under the last", () => {
        renderTree(parent(makeTask({ id: 11 }), makeTask({ id: 12 }), makeTask({ id: 13 })))
        expect(zones()).toHaveLength(3)
    })

    it("a click on a line opens the field there: above the first, or under the task above", () => {
        renderTree(parent(makeTask({ id: 11, text: "Uno" }), makeTask({ id: 12, text: "Due" })))
        fireEvent.click(plus(0))
        expect(store.getState()).toEqual({ listKey: "t-10", afterTaskId: null })
        expect(fields()).toHaveLength(1)
        expect(fields()[0].compareDocumentPosition(rowOfText("Uno")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        fireEvent.click(plus(1))
        expect(store.getState()).toEqual({ listKey: "t-10", afterTaskId: 11 })
        expect(fields()).toHaveLength(1)
        expect(rowOfText("Uno").compareDocumentPosition(fields()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(fields()[0].compareDocumentPosition(rowOfText("Due")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("with the completed hidden, the line above the first visible subtask inserts right before it", () => {
        renderTree(parent(makeTask({ id: 11, completed: true }), makeTask({ id: 12 }), makeTask({ id: 13, completed: true }), makeTask({ id: 14 })), true)
        expect(zones()).toHaveLength(2)
        fireEvent.click(plus(0))
        // The hidden subtask 11 is the one before the first visible one (12)
        expect(store.getState()).toEqual({ listKey: "t-10", afterTaskId: 11 })
        fireEvent.click(plus(1))
        expect(store.getState()).toEqual({ listKey: "t-10", afterTaskId: 12 })
    })

    it("with the completed hidden and nothing hidden before the first one, the top line is the first place", () => {
        renderTree(parent(makeTask({ id: 11 }), makeTask({ id: 12, completed: true })), true)
        fireEvent.click(plus(0))
        expect(store.getState()).toEqual({ listKey: "t-10", afterTaskId: null })
    })

    it("hovering a line does not re-render the rows", () => {
        renderTree(parent(makeTask({ id: 11 }), makeTask({ id: 12 })))
        const calls = vi.mocked(useNoteDrop).mock.calls.length
        const zone = zones()[1]
        fireEvent.mouseEnter(zone)
        fireEvent.mouseOver(zone)
        fireEvent.mouseLeave(zone)
        expect(vi.mocked(useNoteDrop).mock.calls.length).toBe(calls)
    })
})

describe("Task insertion line", () => {
    const renderWith = (liveDrag: boolean) => {
        vi.mocked(useNoteDrop).mockReturnValue({ setNodeRef: () => { }, zone: "before", active: { kind: "task" } } as never)
        return renderTasks(
            <PreferencesContext.Provider value={{ showTaskInsertLine: true, taskDensity: "normal", liveDrag } as never}>
                <Task task={makeTask({ id: 10, text: "Primo" })} />
            </PreferencesContext.Provider>,
        )
    }
    const line = () => document.querySelector("[data-task-id='10'] > div.bg-primary")

    it("is hidden while the live drag is on", () => {
        renderWith(true)
        expect(line()).toBeNull()
    })

    it("is drawn when the live drag is off", () => {
        renderWith(false)
        expect(line()).not.toBeNull()
    })
})
