import { memo, type ReactNode } from "react"
import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Folder, Note } from "@/types/types"
import { makeNote } from "@/test/ui-fixtures"
import { FileTree } from "./FileTree"
import type { TreeData } from "./tree-dnd"

const dates = { creation_date: "", creation_time: "", edit_date: "", edit_time: "" }
const folder = (id: number, name: string, folderID: number | null, subfolders: Folder[] = [], notes: Note[] = []): Folder => ({
    id, workspaceID: 1, folderID, name, position: 0, ...dates, subfolders, notes,
})
const tree: TreeData = {
    rootFolders: [folder(10, "Lavoro", null, [], [makeNote({ id: 2, name: "Dentro", folderID: 10 })])],
    rootNotes: [makeNote({ id: 1, name: "Radice", folderID: null })],
}

const renders = { menu: 0, folder: 0, note: 0 }

vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1, name: "Area" } }) }))
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceData: () => ({ workspaceDataTree: tree, getWorkspaceData: vi.fn(), moveTreeItem: vi.fn() }),
}))
vi.mock("@/contexts/undo/use-undo", async () => (await import("@/test/mocks")).undoModuleMock())
vi.mock("@/contexts/use-color-alpha", () => ({ useColorAlpha: () => ({ item: () => "#000" }) }))
vi.mock("./item-size", () => ({ TREE_ROW_GAP: 4, useItemSize: () => ({ row: "", text: "" }) }))
// Counters: the menu is rendered by FileTree itself, the rows only when their own props change
vi.mock("./TreeBackgroundMenu", () => ({
    TreeBackgroundMenu: ({ children }: { children: ReactNode }) => { renders.menu++; return <>{children}</> },
}))
vi.mock("../folder/Folder", () => ({
    ItemFolder: memo(({ folder, children }: { folder: Folder, children?: ReactNode }) => {
        renders.folder++
        return <div><div role="treeitem" tabIndex={0} data-row-key={`folder-${folder.id}`}>{folder.name}</div>{children}</div>
    }),
}))
vi.mock("../note/Note", () => ({
    ItemNote: memo(({ note }: { note: Note }) => {
        renders.note++
        return <div role="treeitem" tabIndex={0} data-row-key={`note-${note.id}`}>{note.name}</div>
    }),
}))

const props = { collapsedIds: new Set<number>(), onToggleFolder: vi.fn(), onExpandFolder: vi.fn() }

describe("FileTree renders", () => {
    beforeEach(() => { renders.menu = renders.folder = renders.note = 0 })

    it("a focus move does not re-render the tree nor its rows", () => {
        render(<FileTree {...props} />)
        const before = { ...renders }
        act(() => screen.getByRole("treeitem", { name: "Radice" }).focus())
        act(() => screen.getByRole("treeitem", { name: "Dentro" }).focus())
        expect(renders).toEqual(before)
    })

    it("a re-render of the tree with the same data leaves the unchanged rows alone", () => {
        const { rerender } = render(<FileTree {...props} />)
        const before = { ...renders }
        rerender(<FileTree {...props} onRevealed={() => { }} />)
        expect(renders.menu).toBeGreaterThan(before.menu)
        expect(renders.folder).toBe(before.folder)
        expect(renders.note).toBe(before.note)
    })
})
