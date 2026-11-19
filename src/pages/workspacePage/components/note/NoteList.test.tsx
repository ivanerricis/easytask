import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Note } from "@/types/types"
import { NoteList } from "./NoteList"

const tabs = [{ id: 1, name: "Uno" }, { id: 2, name: "Due" }, { id: 3, name: "Tre" }] as unknown as Note[]
const activateNote = vi.fn()

let activeId: number | null = 2
vi.mock("@/contexts/use-tabs", () => ({
    useTabs: () => ({ tabs }),
    useActiveNoteId: () => activeId,
    useTabsActions: () => ({ reorderTabs: vi.fn(), activateNote }),
}))
// The "+" has its own test (it needs the workspace data)
vi.mock("./NewNoteTabButton", () => ({ NewNoteTabButton: () => <button type="button">+</button> }))
// The tab itself: only what the keyboard handler of the list reads
vi.mock("./NoteHeader", () => ({
    NoteHeader: ({ note }: { note: Note }) => <button role="tab" data-note-id={note.id}>{note.name}</button>,
}))

describe("NoteList active tab in view", () => {
    it("scrolls the active tab into view when it changes", () => {
        const scrolled: string[] = []
        const original = Element.prototype.scrollIntoView
        Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
            scrolled.push(`${this.getAttribute("data-note-id")}:${JSON.stringify(options)}`)
        }
        try {
            activeId = 2
            const { rerender } = render(<NoteList />)
            expect(scrolled).toEqual(['2:{"inline":"nearest","block":"nearest"}'])
            activeId = 3
            rerender(<NoteList />)
            expect(scrolled[scrolled.length - 1]).toBe('3:{"inline":"nearest","block":"nearest"}')
        } finally {
            Element.prototype.scrollIntoView = original
            activeId = 2
        }
    })
})

describe("NoteList keyboard", () => {
    beforeEach(() => activateNote.mockClear())

    it("moves to the next and previous tab with the arrows", () => {
        render(<NoteList />)
        fireEvent.keyDown(screen.getByRole("tab", { name: "Due" }), { key: "ArrowRight" })
        expect(activateNote).toHaveBeenLastCalledWith(3)
        fireEvent.keyDown(screen.getByRole("tab", { name: "Uno" }), { key: "ArrowLeft" })
        expect(activateNote).toHaveBeenLastCalledWith(3)
    })

    it.each([
        ["Ctrl", { ctrlKey: true }],
        ["Cmd", { metaKey: true }],
        ["Alt", { altKey: true }],
        ["Shift", { shiftKey: true }],
    ])("leaves %s + arrow to the shortcuts", (_, modifier) => {
        render(<NoteList />)
        const tab = screen.getByRole("tab", { name: "Due" })
        const event = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true, ...modifier })
        tab.dispatchEvent(event)
        expect(activateNote).not.toHaveBeenCalled()
        expect(event.defaultPrevented).toBe(false)
    })
})

describe("NoteList on its own", () => {
    it("labels the bar without a pane and keeps its height to the tabs", () => {
        render(<NoteList />)
        const bar = screen.getByRole("tablist", { name: "Note aperte" })
        expect(bar.className).not.toContain("min-h-")
        expect(screen.queryByTestId("tab-drag-overlay")).toBeNull()
    })
})
