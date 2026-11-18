import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Folder, Note } from "@/types/types"
import type { SidebarItemSize } from "@/lib/store/preferences"
import { ItemFolder } from "../folder/Folder"
import { ItemNote } from "../note/Note"
import { ITEM_SIZES } from "./item-size"

// The rename field needs the workspace data; the rows are tested without it
vi.mock("@/hooks/use-inline-rename", () => ({
    useInlineRename: () => ({ editing: false, error: null, start: () => {}, inputProps: {} }),
}))

let size: SidebarItemSize = "normal"

vi.mock("@/contexts/use-preferences", () => ({
    usePreferences: () => ({ sidebarItemSize: size }),
}))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote: vi.fn() }), useActiveNoteId: () => null, useActiveNoteSelector: (select: (id: number | null) => unknown) => select(null) }))
vi.mock("../folder/ButtonMenuFolder", () => ({ ButtonMenuFolder: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("../note/ButtonMenuNote", () => ({ ButtonMenuNote: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/tooltip-custom", () => ({
    TooltipCustom: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("./tree-row", () => ({
    useTreeRow: () => ({ ref: vi.fn(), attributes: {}, listeners: {}, isDragging: false }),
    useTreeDropZone: () => null,
    useIsTreeTabStop: () => true,
    isInsideZone: () => false,
    stopDragActivation: {},
    wasTreeJustDragged: () => false,
    treeRowKey: (type: string, id: number) => `${type}-${id}`,
    treeRowKeyDown: () => undefined,
    openOnKeyboardFocus: () => undefined,
}))

const folder = { id: 1, name: "Cartella", color: "#ff0000" } as unknown as Folder
const note = { id: 2, name: "Nota", color: "#00ff00" } as unknown as Note

const expected: Record<SidebarItemSize, { row: string, text: string, icon: string }> = {
    compact: { row: "h-6", text: "text-xs", icon: "size-3.5" },
    normal: { row: "h-7", text: "text-sm", icon: "size-4" },
    large: { row: "h-9", text: "text-base", icon: "size-5" },
}

describe.each(["compact", "normal", "large"] as const)("sidebar rows at size %s", (value) => {
    beforeEach(() => { size = value })

    it("ItemNote uses the size classes", () => {
        render(<ItemNote note={note} />)
        expect(screen.getByRole("treeitem")).toHaveClass(expected[value].row)
        expect(screen.getByText("Nota")).toHaveClass(expected[value].text)
        // No icon: the name is the first thing of the row
        expect(screen.getByText("Nota").previousElementSibling).toBeNull()
    })

    it("ItemFolder uses the size classes, guide and indent", () => {
        const { container } = render(
            <ItemFolder folder={folder} isOpen onToggle={vi.fn()}><div>child</div></ItemFolder>
        )
        expect(screen.getAllByRole("treeitem")[0]).toHaveClass(expected[value].row)
        expect(screen.getByText("Cartella")).toHaveClass(expected[value].text)
        expect(container.querySelector("svg")).toHaveClass(expected[value].icon)
        expect(container.querySelector(`.${CSS.escape(ITEM_SIZES[value].guide)}`)).not.toBeNull()
        expect(screen.getByText("child").parentElement).toHaveClass(ITEM_SIZES[value].indent)
    })
})

describe("menu button size per density", () => {
    it("fits the row: icon-xs in compact rows, icon-sm otherwise", () => {
        expect(ITEM_SIZES.compact.menu).toBe("icon-xs")
        expect(ITEM_SIZES.normal.menu).toBe("icon-sm")
        expect(ITEM_SIZES.large.menu).toBe("icon-sm")
    })
})

describe("sidebar rows without a color", () => {
    // A removed color must clear the background: an invalid value ("undefined") would be dropped by the browser, which keeps the old one
    it("clears the background of a note when its color is removed", () => {
        const { rerender } = render(<ItemNote note={note} />)
        const row = screen.getByRole("treeitem")
        expect(row.style.backgroundColor).not.toBe("")
        rerender(<ItemNote note={{ ...note, color: undefined }} />)
        expect(row.style.backgroundColor).toBe("")
    })

    it("clears the background of a folder when its color is removed", () => {
        const { rerender } = render(<ItemFolder folder={folder} isOpen={false} onToggle={() => { }} />)
        const row = screen.getByRole("treeitem")
        expect(row.style.backgroundColor).not.toBe("")
        rerender(<ItemFolder folder={{ ...folder, color: undefined }} isOpen={false} onToggle={() => { }} />)
        expect(row.style.backgroundColor).toBe("")
    })

    it("shows no folder or note icon", () => {
        const { container } = render(<><ItemFolder folder={folder} isOpen={false} onToggle={() => { }} /><ItemNote note={note} /></>)
        // The folder keeps its chevron (lucide names every icon with a class)
        expect(container.querySelector(".lucide-chevron-down")).not.toBeNull()
        expect(container.querySelector(".lucide-folder, .lucide-folder-open, .lucide-file")).toBeNull()
    })
})
