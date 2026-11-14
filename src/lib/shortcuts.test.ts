import { describe, expect, it } from "vitest"
import {
    SHORTCUTS, SHORTCUT_CATEGORIES, type Binding, bindingEquals, categoryLabel, keyLabel, bindingFromEvent, findConflictsFor, formatBinding, getDefaultBindings, isValidBinding, matchBinding,
} from "./shortcuts"

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init)

/** Every pair of ids sharing a binding within overlapping scopes (a test helper: the app only checks one binding at a time). */
const findConflicts = (bindings: Record<string, Binding>): [string, string][] => {
    const ids = Object.keys(bindings)
    return ids.flatMap((id, i) => findConflictsFor(id, bindings[id], bindings).filter(other => ids.indexOf(other) > i).map((other): [string, string] => [id, other]))
}

describe("matchBinding", () => {
    it("matches ctrl or meta, case-insensitively", () => {
        const b = { key: "n", ctrl: true }
        expect(matchBinding(key({ key: "n", ctrlKey: true }), b)).toBe(true)
        expect(matchBinding(key({ key: "N", metaKey: true }), b)).toBe(true)
        expect(matchBinding(key({ key: "n" }), b)).toBe(false)
        expect(matchBinding(key({ key: "n", ctrlKey: true, altKey: true }), b)).toBe(false)
        expect(matchBinding(key({ key: "n", ctrlKey: true, shiftKey: true }), b)).toBe(false)
    })

    it("requires alt exactly and ignores shift for symbols", () => {
        expect(matchBinding(key({ key: "n", altKey: true }), { key: "n", alt: true })).toBe(true)
        expect(matchBinding(key({ key: "n", ctrlKey: true }), { key: "n", alt: true })).toBe(false)
        expect(matchBinding(key({ key: "?", shiftKey: true }), { key: "?" })).toBe(true)
        expect(matchBinding(key({ key: "?", ctrlKey: true }), { key: "?" })).toBe(false)
    })
})

describe("formatBinding", () => {
    it("uses Italian labels", () => {
        expect(formatBinding({ key: "n", ctrl: true })).toEqual(["Ctrl", "N"])
        expect(formatBinding({ key: "Enter", shift: true })).toEqual(["Maiusc", "Invio"])
        expect(formatBinding({ key: "Escape", alt: true })).toEqual(["Alt", "Esc"])
    })
})

describe("bindingEquals and conflicts", () => {
    it("compares bindings ignoring key case and missing flags", () => {
        expect(bindingEquals({ key: "N", ctrl: true }, { key: "n", ctrl: true, alt: false })).toBe(true)
        expect(bindingEquals({ key: "n", ctrl: true }, { key: "n", alt: true })).toBe(false)
    })

    it("default bindings have no conflicts although Ctrl+N is used in two scopes", () => {
        expect(findConflicts(getDefaultBindings())).toEqual([])
        expect(SHORTCUTS.filter(s => s.defaultBinding?.key === "n" && s.defaultBinding.ctrl)).toHaveLength(2)
    })

    it("detects a clash inside a scope and with global shortcuts", () => {
        const bindings = { ...getDefaultBindings(), "go-home": { key: "k", ctrl: true } }
        expect(findConflicts(bindings)).toEqual([["go-home", "search-notes"]])
        expect(findConflictsFor("new-workspace", { key: "?" }, getDefaultBindings())).toEqual(["show-shortcuts"])
        expect(findConflictsFor("new-workspace", { key: "m", ctrl: true }, getDefaultBindings())).toEqual([])
    })

    it("search in the note is Ctrl+F, editable, and clashes with nothing by default", () => {
        const shortcut = SHORTCUTS.find(s => s.id === "search-in-note")
        expect(shortcut).toMatchObject({ defaultBinding: { key: "f", ctrl: true }, editable: true, scope: "workspace", category: "notes" })
        expect(findConflictsFor("search-in-note", { key: "f", ctrl: true }, getDefaultBindings())).toEqual([])
        expect(findConflictsFor("search-in-note", { key: "k", ctrl: true }, getDefaultBindings())).toEqual(["search-notes"])
    })
})

describe("undo and redo shortcuts", () => {
    const bindings = getDefaultBindings()

    it("undo is Ctrl+Z, redo is Ctrl+Y and Ctrl+Shift+Z is a fixed alternative of redo", () => {
        expect(bindings.undo).toEqual({ key: "z", ctrl: true })
        expect(bindings.redo).toEqual({ key: "y", ctrl: true })
        expect(bindings["redo-alt"]).toEqual({ key: "z", ctrl: true, shift: true })
        expect(SHORTCUTS.find(s => s.id === "undo")?.editable).toBe(true)
        expect(SHORTCUTS.find(s => s.id === "redo")?.editable).toBe(true)
        expect(SHORTCUTS.find(s => s.id === "redo-alt")?.editable).toBe(false)
    })

    it("Ctrl+Z and Ctrl+Shift+Z never match each other", () => {
        const plain = key({ key: "z", ctrlKey: true })
        const shifted = key({ key: "Z", ctrlKey: true, shiftKey: true })
        expect(matchBinding(plain, bindings.undo)).toBe(true)
        expect(matchBinding(shifted, bindings.undo)).toBe(false)
        expect(matchBinding(shifted, bindings["redo-alt"])).toBe(true)
        expect(matchBinding(plain, bindings["redo-alt"])).toBe(false)
        expect(matchBinding(key({ key: "y", ctrlKey: true }), bindings.redo)).toBe(true)
    })

    it("have no clash with the other defaults, and a rebinding onto them is a conflict", () => {
        expect(findConflicts(bindings)).toEqual([])
        expect(findConflictsFor("new-note", { key: "z", ctrl: true }, bindings)).toEqual(["undo"])
        expect(findConflictsFor("undo", { key: "y", ctrl: true }, bindings)).toEqual(["redo"])
        expect(findConflictsFor("redo", { key: "z", ctrl: true, shift: true }, bindings)).toEqual(["redo-alt"])
    })
})

describe("recording helpers", () => {
    it("builds bindings from events and skips modifier-only presses", () => {
        expect(bindingFromEvent(key({ key: "Control", ctrlKey: true }))).toBeNull()
        expect(bindingFromEvent(key({ key: "K", ctrlKey: true, shiftKey: true }))).toEqual({ key: "k", ctrl: true, shift: true })
    })

    it("needs ctrl or alt unless it is a function key", () => {
        expect(isValidBinding({ key: "k" })).toBe(false)
        expect(isValidBinding({ key: "k", shift: true })).toBe(false)
        expect(isValidBinding({ key: "k", alt: true })).toBe(true)
        expect(isValidBinding({ key: "F2" })).toBe(true)
    })
})

describe("task keyboard entries", () => {
    const ids = ["task-navigate", "task-expand", "task-move", "task-toggle", "task-rename", "task-menu", "task-extend-selection", "task-toggle-selection"]

    it("are documentation-only entries of the tasks category", () => {
        for (const id of ids) {
            const s = SHORTCUTS.find(x => x.id === id)
            expect(s, id).toMatchObject({ category: "tasks", scope: "workspace", editable: false })
            expect(s?.defaultBinding).toBeUndefined()
            expect(s?.keys?.length).toBeGreaterThan(0)
        }
        expect(SHORTCUT_CATEGORIES).toContain("tasks")
    })

    it("have a name, a category and key labels in both languages", async () => {
        const { it: itLocale } = await import("@/i18n/locales/it")
        const { en } = await import("@/i18n/locales/en")
        for (const locale of [itLocale, en]) {
            const sh = locale.shortcuts as unknown as { categories: Record<string, string>, items: Record<string, string>, keys: Record<string, string> }
            expect(sh.categories.tasks).toBeTruthy()
            for (const id of ids) {
                expect(sh.items[id], id).toBeTruthy()
                for (const k of SHORTCUTS.find(x => x.id === id)?.keys ?? []) expect(sh.keys[k], id + ":" + k).toBeTruthy()
            }
        }
        expect(keyLabel("arrowup")).toBe("↑")
        expect(keyLabel("f10")).toBe("F10")
        expect(categoryLabel("tasks")).toBe("Task da tastiera")
    })
})
