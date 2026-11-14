import type { ReactNode } from "react"
import { fireEvent, render, screen, act } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Folder, Note } from "@/types/types"
import { ItemFolder } from "../folder/Folder"
import { ItemNote } from "../note/Note"
import { SelectionContext } from "./selection-context-object"
import { createSelectionStore } from "./selection"

// The rename field needs the workspace data; the rows are tested without it
vi.mock("@/hooks/use-inline-rename", () => ({
    useInlineRename: () => ({ editing: false, error: null, start: () => {}, inputProps: {} }),
}))

const openNote = vi.fn()
const onToggle = vi.fn()

vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => ({ sidebarItemSize: "normal" }) }))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote }), useActiveNoteId: () => null, useActiveNoteSelector: (select: (id: number | null) => unknown) => select(null) }))
vi.mock("../folder/ButtonMenuFolder", () => ({ ButtonMenuFolder: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("../note/ButtonMenuNote", () => ({ ButtonMenuNote: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@/components/tooltip-custom", () => ({ TooltipCustom: ({ children }: { children: ReactNode }) => <>{children}</> }))

const folder = { id: 1, name: "Lavoro", color: null } as unknown as Folder
const note = { id: 1, name: "Spesa", color: null } as unknown as Note

let store: ReturnType<typeof createSelectionStore>

const renderRows = () => render(
    <DndContext>
        <SelectionContext.Provider value={store}>
            <ItemFolder folder={folder} isOpen={false} onToggle={onToggle} />
            <ItemNote note={note} />
            <ItemNote note={{ ...note, id: 2, name: "Altra" }} />
        </SelectionContext.Provider>
    </DndContext>,
)

beforeEach(() => {
    openNote.mockClear()
    onToggle.mockClear()
    store = createSelectionStore()
    // Rows in view: the folder (id 1) and the notes 1 and 2 (the ids collide across types)
    store.sync(["folder-1", "note-1", "note-2"])
})

describe("note row click", () => {
    it("a plain click opens the note and clears the selection", () => {
        renderRows()
        act(() => store.toggle("folder-1"))
        fireEvent.click(screen.getByRole("treeitem", { name: /Spesa/ }))
        expect(openNote).toHaveBeenCalledWith(1)
        expect(store.getSelected().size).toBe(0)
    })

    it("Ctrl+click and Cmd+click select without opening the note, and click again deselects", () => {
        renderRows()
        const row = screen.getByRole("treeitem", { name: /Spesa/ })
        fireEvent.click(row, { ctrlKey: true })
        expect([...store.getSelected()]).toEqual(["note-1"])
        expect(row).toHaveAttribute("aria-selected", "true")
        expect(screen.getAllByTestId("selection-mark")).toHaveLength(1)
        fireEvent.click(row, { metaKey: true })
        expect(store.getSelected().size).toBe(0)
        expect(row).toHaveAttribute("aria-selected", "false")
        expect(openNote).not.toHaveBeenCalled()
    })

    it("Shift+click selects the range from the last clicked row without opening anything", () => {
        renderRows()
        fireEvent.click(screen.getByRole("treeitem", { name: /Lavoro/ }), { ctrlKey: true })
        fireEvent.click(screen.getByRole("treeitem", { name: /Altra/ }), { shiftKey: true })
        expect([...store.getSelected()].sort()).toEqual(["folder-1", "note-1", "note-2"])
        expect(openNote).not.toHaveBeenCalled()
        expect(onToggle).not.toHaveBeenCalled()
    })

    it("marks only the selected note when a folder has the same id", () => {
        renderRows()
        act(() => store.toggle("folder-1"))
        expect(screen.getByRole("treeitem", { name: /Lavoro/ })).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("treeitem", { name: /Spesa/ })).toHaveAttribute("aria-selected", "false")
    })

    it("Enter still opens the note and clears the selection", () => {
        renderRows()
        act(() => store.toggle("note-2"))
        fireEvent.keyDown(screen.getByRole("treeitem", { name: /Spesa/ }), { key: "Enter" })
        expect(openNote).toHaveBeenCalledWith(1)
        expect(store.getSelected().size).toBe(0)
    })

    it("works without a selection provider", () => {
        render(<DndContext><ItemNote note={note} /></DndContext>)
        fireEvent.click(screen.getByRole("treeitem", { name: /Spesa/ }), { ctrlKey: true })
        expect(openNote).toHaveBeenCalledWith(1)
    })
})

describe("folder row click", () => {
    it("a plain click toggles the folder and clears the selection", () => {
        renderRows()
        act(() => store.toggle("note-1"))
        fireEvent.click(screen.getByRole("treeitem", { name: /Lavoro/ }))
        expect(onToggle).toHaveBeenCalledWith(1)
        expect(store.getSelected().size).toBe(0)
    })

    it("Ctrl+click and Shift+click select without toggling the folder", () => {
        renderRows()
        const row = screen.getByRole("treeitem", { name: /Lavoro/ })
        fireEvent.click(row, { ctrlKey: true })
        expect(row).toHaveAttribute("aria-selected", "true")
        fireEvent.click(screen.getByRole("treeitem", { name: /Altra/ }), { shiftKey: true })
        expect([...store.getSelected()].sort()).toEqual(["folder-1", "note-1", "note-2"])
        expect(onToggle).not.toHaveBeenCalled()
    })

    it("Enter toggles the folder and clears the selection", () => {
        renderRows()
        act(() => store.toggle("note-2"))
        fireEvent.keyDown(screen.getByRole("treeitem", { name: /Lavoro/ }), { key: "Enter" })
        expect(onToggle).toHaveBeenCalledWith(1)
        expect(store.getSelected().size).toBe(0)
    })
})
