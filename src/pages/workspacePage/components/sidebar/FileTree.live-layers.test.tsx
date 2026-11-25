import { render } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Folder, Note } from "@/types/types"
import { FileTreeItem } from "./FileTreeParts"
import { applyTreeShifts, clearTreeShifts, hasTreeRows, SHIFT_LAYER_ATTR, treeShiftOf } from "./tree-live-shift"

// The rows are the real ones; what they need around them is not
vi.mock("@/hooks/use-inline-rename", () => ({
    useInlineRename: () => ({ editing: false, error: null, start: () => {}, inputProps: {} }),
}))
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => ({ sidebarItemSize: "normal" }) }))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote: vi.fn() }), useActiveNoteSelector: (select: (id: number | null) => unknown) => select(null) }))
vi.mock("../folder/ButtonMenuFolder", () => ({ ButtonMenuFolder: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("../note/ButtonMenuNote", () => ({ ButtonMenuNote: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/tooltip-custom", () => ({ TooltipCustom: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

let frames: FrameRequestCallback[] = []

beforeEach(() => {
    frames = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal("cancelAnimationFrame", () => { frames = [] })
})
afterEach(() => {
    clearTreeShifts(false)
    vi.unstubAllGlobals()
})

const note = (id: number, name: string) => ({ id, name, color: null }) as unknown as Note
const inner = { id: 2, name: "Interna", color: null, notes: [note(3, "Profonda")], subfolders: [] } as unknown as Folder
const outer = { id: 1, name: "Esterna", color: null, notes: [note(4, "Figlia")], subfolders: [inner] } as unknown as Folder

const renderSmallTree = () => render(
    <DndContext>
        <div role="tree">
            <FileTreeItem item={outer} collapsedIds={new Set()} onToggleFolder={() => { }} />
            <FileTreeItem item={note(5, "Radice")} collapsedIds={new Set()} onToggleFolder={() => { }} />
        </div>
    </DndContext>,
)

const layerOf = (container: HTMLElement, name: string) =>
    container.querySelector(`[role=treeitem][aria-label="${name}"]`)!.closest<HTMLElement>(`[${SHIFT_LAYER_ATTR}]`)

describe("the recursive tree (below the virtualization threshold) takes part in the live drag", () => {
    it("registers every row, so the live drag has rows to move", () => {
        const { container, unmount } = renderSmallTree()
        expect(hasTreeRows()).toBe(true)
        expect(container.querySelectorAll(`[${SHIFT_LAYER_ATTR}]`)).toHaveLength(5)
        unmount()
        expect(hasTreeRows()).toBe(false)
    })

    it("moves a row by its own layer: a folder does not drag its children along", () => {
        const { container } = renderSmallTree()
        applyTreeShifts({ dyOf: key => (key === "folder-1" ? 32 : 0), isHidden: () => false })
        frames.forEach(callback => callback(0))
        expect(layerOf(container, "Esterna")!.style.transform).toBe("translate3d(0, 32px, 0)")
        for (const name of ["Interna", "Profonda", "Figlia", "Radice"]) expect(layerOf(container, name)!.style.transform).toBe("")
        // The droppable of the row is measured without its shift
        expect(treeShiftOf(container.querySelector<HTMLElement>("[role=treeitem][aria-label=Esterna]")!)).toBe(32)
        expect(treeShiftOf(container.querySelector<HTMLElement>("[role=treeitem][aria-label=Figlia]")!)).toBe(0)
    })

    it("a row carries the guides of its ancestors, and the folders draw none of their own", () => {
        const { container } = renderSmallTree()
        const guides = (name: string) => layerOf(container, name)!.querySelectorAll("[data-testid='tree-guide']").length
        expect([guides("Esterna"), guides("Interna"), guides("Profonda"), guides("Figlia"), guides("Radice")]).toEqual([0, 1, 2, 1, 0])
        expect(container.querySelector(".bg-foreground\\/25")).toBeNull()
    })

    // The content of a folder clips (the open/close animation): its box must reach the left edge of the tree, or the guides of the
    // levels above it (drawn left of that box) are cut and only the one of the parent folder shows
    it("the content of a folder starts at the left edge of the tree (negative margin and padding of its depth)", () => {
        const { container } = renderSmallTree()
        const contents = [...container.querySelectorAll<HTMLElement>("[data-slot='collapsible-content']")]
        expect(contents.map(content => [content.style.marginLeft, content.style.paddingLeft])).toEqual([["", ""], ["-20px", "20px"]])
    })
})
