import { describe, expect, it } from "vitest"
import { taskKeyAction, type TaskKeyEvent, type TaskKeyRow } from "./task-keyboard"

/* A, B (open: B1, B2), C (closed, has children), D */
const rows: TaskKeyRow[] = [
    { key: "a", level: 0, parentKey: null, hasChildren: false, expanded: false },
    { key: "b", level: 0, parentKey: null, hasChildren: true, expanded: true },
    { key: "b1", level: 1, parentKey: "b", hasChildren: false, expanded: false },
    { key: "b2", level: 1, parentKey: "b", hasChildren: false, expanded: false },
    { key: "c", level: 0, parentKey: null, hasChildren: true, expanded: false },
    { key: "d", level: 0, parentKey: null, hasChildren: false, expanded: false },
]
const ev = (key: string, mods: Partial<TaskKeyEvent> = {}): TaskKeyEvent => ({ key, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...mods })
const act = (current: string, key: string, mods?: Partial<TaskKeyEvent>) => taskKeyAction(rows, current, ev(key, mods))

describe("taskKeyAction", () => {
    it("moves between the visible rows, subtasks included", () => {
        expect(act("a", "ArrowDown")).toEqual({ type: "focus", key: "b" })
        expect(act("b", "ArrowDown")).toEqual({ type: "focus", key: "b1" })
        expect(act("b2", "ArrowUp")).toEqual({ type: "focus", key: "b1" })
        expect(act("c", "ArrowUp")).toEqual({ type: "focus", key: "b2" })
    })

    it("stays on the row at the edges of the list", () => {
        expect(act("a", "ArrowUp")).toEqual({ type: "focus", key: "a" })
        expect(act("d", "ArrowDown")).toEqual({ type: "focus", key: "d" })
    })

    it("goes to the first / last row with Home / End", () => {
        expect(act("c", "Home")).toEqual({ type: "focus", key: "a" })
        expect(act("b", "End")).toEqual({ type: "focus", key: "d" })
    })

    it("Right opens a closed task, enters an open one, and does nothing on a task without subtasks", () => {
        expect(act("c", "ArrowRight")).toEqual({ type: "expand", key: "c" })
        expect(act("b", "ArrowRight")).toEqual({ type: "focusFirstChild", key: "b1" })
        expect(act("a", "ArrowRight")).toEqual({ type: "focus", key: "a" })
        expect(act("b1", "ArrowRight")).toEqual({ type: "focus", key: "b1" })
    })

    it("Right on an open task whose subtasks are not in the rows stays put", () => {
        const odd: TaskKeyRow[] = [{ key: "x", level: 0, parentKey: null, hasChildren: true, expanded: true }]
        expect(taskKeyAction(odd, "x", ev("ArrowRight"))).toEqual({ type: "focus", key: "x" })
    })

    it("Left closes an open task, otherwise goes to the parent, otherwise stays", () => {
        expect(act("b", "ArrowLeft")).toEqual({ type: "collapse", key: "b" })
        expect(act("b2", "ArrowLeft")).toEqual({ type: "focusParent", key: "b" })
        expect(act("c", "ArrowLeft")).toEqual({ type: "focus", key: "c" })
        expect(act("a", "ArrowLeft")).toEqual({ type: "focus", key: "a" })
    })

    it("Space toggles, Enter renames, Shift+F10 and the menu key open the menu", () => {
        expect(act("a", " ")).toEqual({ type: "toggle" })
        expect(act("a", "Enter")).toEqual({ type: "rename" })
        expect(act("a", "F10", { shiftKey: true })).toEqual({ type: "menu" })
        expect(act("a", "ContextMenu")).toEqual({ type: "menu" })
    })

    it("Alt+Up / Alt+Down move the task one step", () => {
        expect(act("b", "ArrowUp", { altKey: true })).toEqual({ type: "move", step: -1 })
        expect(act("b", "ArrowDown", { altKey: true })).toEqual({ type: "move", step: 1 })
    })

    it("ignores every other key and modifier", () => {
        expect(act("a", "ArrowLeft", { altKey: true })).toBeNull()
        expect(act("a", "ArrowRight", { altKey: true })).toBeNull()
        expect(act("a", "ArrowDown", { altKey: true, shiftKey: true })).toBeNull()
        expect(act("a", "ArrowLeft", { shiftKey: true })).toBeNull()
        expect(act("a", " ", { ctrlKey: true, shiftKey: true })).toBeNull()
        expect(act("a", " ", { ctrlKey: true, altKey: true })).toBeNull()
        expect(act("a", "Enter", { ctrlKey: true })).toBeNull()
        expect(act("a", "Home", { metaKey: true })).toBeNull()
        expect(act("a", "ArrowDown", { ctrlKey: true })).toBeNull()
        expect(act("a", "ArrowDown", { metaKey: true })).toBeNull()
        expect(act("a", "Enter", { shiftKey: true })).toBeNull()
        expect(act("a", "F10")).toBeNull()
        expect(act("a", "x")).toBeNull()
        expect(act("a", "Tab")).toBeNull()
    })

    it("Shift+Up / Shift+Down extend the selection to the neighbouring row, clamped at the edges", () => {
        expect(act("a", "ArrowDown", { shiftKey: true })).toEqual({ type: "extend", key: "b" })
        expect(act("b", "ArrowDown", { shiftKey: true })).toEqual({ type: "extend", key: "b1" })
        expect(act("c", "ArrowUp", { shiftKey: true })).toEqual({ type: "extend", key: "b2" })
        expect(act("d", "ArrowDown", { shiftKey: true })).toEqual({ type: "extend", key: "d" })
        expect(act("a", "ArrowUp", { shiftKey: true })).toEqual({ type: "extend", key: "a" })
    })

    it("Shift+Home / Shift+End extend the selection to the first / last row", () => {
        expect(act("c", "Home", { shiftKey: true })).toEqual({ type: "extend", key: "a" })
        expect(act("b", "End", { shiftKey: true })).toEqual({ type: "extend", key: "d" })
    })

    it("Delete trashes, Ctrl/Cmd+C copies and Ctrl/Cmd+V pastes (only with exactly that modifier)", () => {
        expect(act("a", "Delete")).toEqual({ type: "delete" })
        expect(act("a", "c", { ctrlKey: true })).toEqual({ type: "copy" })
        expect(act("a", "C", { metaKey: true })).toEqual({ type: "copy" })
        expect(act("a", "v", { ctrlKey: true })).toEqual({ type: "paste" })
        expect(act("a", "c")).toBeNull()
        expect(act("a", "v", { ctrlKey: true, shiftKey: true })).toBeNull()
        expect(act("a", "c", { ctrlKey: true, altKey: true })).toBeNull()
        expect(act("a", "Delete", { shiftKey: true })).toBeNull()
        expect(act("a", "Delete", { ctrlKey: true })).toBeNull()
    })

    it("Ctrl+Space and Cmd+Space toggle the selection of the row", () => {
        expect(act("b", " ", { ctrlKey: true })).toEqual({ type: "toggleSelect" })
        expect(act("b", " ", { metaKey: true })).toEqual({ type: "toggleSelect" })
    })

    it("Shift+F10 still opens the menu and Alt+Shift stays free", () => {
        expect(act("a", "F10", { shiftKey: true })).toEqual({ type: "menu" })
        expect(act("a", "ArrowUp", { altKey: true, shiftKey: true })).toBeNull()
    })

    it("returns null for an unknown row", () => {
        expect(act("zzz", "ArrowDown")).toBeNull()
    })
})
