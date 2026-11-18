import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PaneContext } from "@/contexts/layout-context-object"
import { makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import type { NoteDataTree } from "@/types/types"
import { TaskSelectionProvider } from "./task-selection-context"
import { useIsInTaskMultiSelection, useIsTaskMultiSelected, useSelectedTaskKeys, useTaskSelectionStore } from "./use-task-selection"

let activeId: number | null = 1
let hideCompleted = false
// What the search has opened in the note (temporary): "kind-id"
const revealed = new Set<string>()
const listeners = new Set<() => void>()
const uiStore = {
    isRevealed: (_note: number, kind: string, id: number) => revealed.has(`${kind}-${id}`),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
}
const emitUi = () => act(() => listeners.forEach(listener => listener()))

let tree: NoteDataTree | null
vi.mock("@/contexts/use-tabs", () => ({ useActiveNoteId: () => activeId, useTabUiStore: () => uiStore }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: tree }) }))
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => ({ hideCompletedTasks: hideCompleted }) }))

const makeTree = (): NoteDataTree => ({
    groups: [makeGroup({
        id: 1,
        sections: [
            makeSection({ id: 10, tasks: [makeTask({ id: 1 }), makeTask({ id: 2, completed: true })] }),
            makeSection({ id: 11, tasks: [makeTask({ id: 3 })] }),
        ],
    })],
})

function Probe() {
    const store = useTaskSelectionStore()!
    const keys = useSelectedTaskKeys()
    return (
        <>
            <output data-testid="keys">{[...keys].sort().join(",")}</output>
            <output data-testid="one">{String(useIsTaskMultiSelected(1))}</output>
            <output data-testid="multi">{String(useIsInTaskMultiSelection(1))}</output>
            <button onClick={() => store.toggle("task-1")}>t1</button>
            <button onClick={() => store.toggle("task-2")}>t2</button>
            <button onClick={() => store.toggle("task-3")}>t3</button>
            <button onClick={() => store.toggle("task-5")}>t5</button>
            <button onClick={() => store.selectRange("task-3")}>range3</button>
            <input aria-label="campo" />
        </>
    )
}

const setup = () => render(<TaskSelectionProvider><Probe /></TaskSelectionProvider>)
const keys = () => screen.getByTestId("keys").textContent

beforeEach(() => {
    activeId = 1
    hideCompleted = false
    revealed.clear()
    tree = makeTree()
})

describe("a left click outside the tasks clears the selection", () => {
    const press = (target: Element, init: PointerEventInit = {}) => fireEvent.pointerDown(target, { button: 0, ...init })
    const selectTwo = () => { fireEvent.click(screen.getByText("t1")); fireEvent.click(screen.getByText("t3")) }
    const menuOpen = () => {
        const menu = document.body.appendChild(document.createElement("div"))
        menu.setAttribute("role", "menu")
        menu.setAttribute("data-state", "open")
        return menu
    }

    it("clears on the page, not on a task, the selection bar, a menu, a dialog or a toast", () => {
        setup()
        const task = document.body.appendChild(document.createElement("div"))
        task.setAttribute("role", "treeitem")
        task.setAttribute("data-task-id", "1")
        const bar = document.body.appendChild(document.createElement("div"))
        bar.setAttribute("data-task-selection-bar", "")
        const toast = document.body.appendChild(document.createElement("li"))
        toast.setAttribute("data-sonner-toast", "")
        selectTwo()
        for (const keep of [task, bar, toast]) {
            press(keep)
            expect(keys()).toBe("task-1,task-3")
        }
        press(screen.getByLabelText("campo"))
        expect(keys()).toBe("")
        for (const el of [task, bar, toast]) el.remove()
    })

    it("does nothing with Ctrl, Cmd or Shift, with the right button, or while a menu or dialog is open", () => {
        setup()
        selectTwo()
        const field = screen.getByLabelText("campo")
        press(field, { ctrlKey: true })
        press(field, { metaKey: true })
        press(field, { shiftKey: true })
        fireEvent.pointerDown(field, { button: 2 })
        expect(keys()).toBe("task-1,task-3")
        const menu = menuOpen()
        press(field)
        expect(keys()).toBe("task-1,task-3")
        menu.remove()
        press(field)
        expect(keys()).toBe("")
    })
})

describe("TaskSelectionProvider", () => {
    it("tells whether a task is selected and whether it is part of a multi-selection", () => {
        setup()
        fireEvent.click(screen.getByText("t1"))
        expect(screen.getByTestId("one")).toHaveTextContent("true")
        expect(screen.getByTestId("multi")).toHaveTextContent("false")
        fireEvent.click(screen.getByText("t3"))
        expect(screen.getByTestId("multi")).toHaveTextContent("true")
    })

    it("selects the range in the visible order, skipping the hidden completed tasks", () => {
        hideCompleted = true
        setup()
        fireEvent.click(screen.getByText("t1"))
        fireEvent.click(screen.getByText("range3"))
        expect(keys()).toBe("task-1,task-3")
    })

    it("a range crosses the sections, completed tasks included when they are shown", () => {
        setup()
        fireEvent.click(screen.getByText("t1"))
        fireEvent.click(screen.getByText("range3"))
        expect(keys()).toBe("task-1,task-2,task-3")
    })

    it("drops the tasks of a section that gets closed and the ones that disappear from the note", () => {
        const { rerender } = setup()
        fireEvent.click(screen.getByText("t1"))
        fireEvent.click(screen.getByText("t3"))
        // The closed state is the saved one, in the data of the note
        tree = makeTree()
        tree.groups[0].sections[1].collapsed = 1
        rerender(<TaskSelectionProvider><Probe /></TaskSelectionProvider>)
        expect(keys()).toBe("task-1")
        tree = { groups: [makeGroup({ id: 1, sections: [makeSection({ id: 10, tasks: [] })] })] }
        rerender(<TaskSelectionProvider><Probe /></TaskSelectionProvider>)
        expect(keys()).toBe("")
    })

    it("a range skips the tasks of a closed group", () => {
        tree = makeTree()
        tree.groups.push(makeGroup({ id: 2, position: 1, collapsed: true, sections: [makeSection({ id: 20, groupID: 2, tasks: [makeTask({ id: 4 })] })] }))
        setup()
        fireEvent.click(screen.getByText("t1"))
        fireEvent.click(screen.getByText("range3"))
        expect(keys()).toBe("task-1,task-2,task-3")
    })

    it("the subtasks of a closed task are out of the selection, and back in when the task opens", () => {
        const withSubtasks = (collapsed: boolean) => ({ groups: [makeGroup({ id: 1, sections: [makeSection({ id: 10, tasks: [
            makeTask({ id: 1, collapsed, subtasks: [makeTask({ id: 5, taskID: 1 })] }), makeTask({ id: 3 }),
        ] })] })] })
        tree = withSubtasks(false)
        const { rerender } = setup()
        fireEvent.click(screen.getByText("t1"))
        fireEvent.click(screen.getByText("t5"))
        expect(keys()).toBe("task-1,task-5")
        tree = withSubtasks(true)
        rerender(<TaskSelectionProvider><Probe /></TaskSelectionProvider>)
        expect(keys()).toBe("task-1")
        // a range does not step into the hidden subtasks either
        fireEvent.keyDown(window, { key: "Escape" })
        fireEvent.click(screen.getByText("t1"))
        fireEvent.click(screen.getByText("range3"))
        expect(keys()).toBe("task-1,task-3")
    })

    it("what the search has opened counts as open", () => {
        tree = makeTree()
        tree.groups[0].sections[1].collapsed = true
        revealed.add("section-11")
        setup()
        fireEvent.click(screen.getByText("t1"))
        fireEvent.click(screen.getByText("range3"))
        expect(keys()).toBe("task-1,task-2,task-3")
        revealed.clear()
        emitUi()
        expect(keys()).toBe("task-1,task-2")
    })

    it("Esc clears the selection", () => {
        setup()
        fireEvent.click(screen.getByText("t1"))
        fireEvent.keyDown(window, { key: "Escape" })
        expect(keys()).toBe("")
    })

    it("Esc leaves the selection when the focus is in a field or the key was already used", () => {
        setup()
        fireEvent.click(screen.getByText("t1"))
        fireEvent.keyDown(screen.getByLabelText("campo"), { key: "Escape" })
        expect(keys()).toBe("task-1")
        const used = new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
        used.preventDefault()
        act(() => { window.dispatchEvent(used) })
        expect(keys()).toBe("task-1")
    })

    it("is cleared when another note becomes the active one", () => {
        const { rerender } = setup()
        fireEvent.click(screen.getByText("t1"))
        expect(keys()).toBe("task-1")
        activeId = 2
        rerender(<TaskSelectionProvider><Probe /></TaskSelectionProvider>)
        expect(keys()).toBe("")
    })
})

describe("TaskSelectionProvider in two panes", () => {
    it("Esc clears only the selection of the pane that has the focus", () => {
        const focus: { current: 0 | 1 } = { current: 1 }
        const pane = (index: 0 | 1) => (
            <PaneContext.Provider value={{ pane: index, focused: focus.current === index, isFocused: () => focus.current === index, rootRef: { current: null } }}>
                <section aria-label={`area ${index}`}><TaskSelectionProvider><Probe /></TaskSelectionProvider></section>
            </PaneContext.Provider>
        )
        render(<>{pane(0)}{pane(1)}</>)
        const left = within(screen.getByLabelText("area 0"))
        const right = within(screen.getByLabelText("area 1"))
        fireEvent.click(left.getByText("t1"))
        fireEvent.click(right.getByText("t1"))
        fireEvent.keyDown(document.body, { key: "Escape" })
        expect(left.getByTestId("keys")).toHaveTextContent("task-1")
        expect(right.getByTestId("keys")).toHaveTextContent("")
        focus.current = 0
        fireEvent.keyDown(document.body, { key: "Escape" })
        expect(left.getByTestId("keys")).toHaveTextContent("")
    })
})
