import { render, screen } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { Note } from "@/types/types"
import { flattenTree } from "./flat-tree"
import { VirtualTree } from "./VirtualTree"

// The rename field needs the workspace data; the rows are tested without it
vi.mock("@/hooks/use-inline-rename", () => ({
    useInlineRename: () => ({ editing: false, error: null, start: () => {}, inputProps: {} }),
}))

vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => ({ sidebarItemSize: "normal" }) }))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote: vi.fn() }), useActiveNoteId: () => null, useActiveNoteSelector: (select: (id: number | null) => unknown) => select(null) }))
vi.mock("../folder/ButtonMenuFolder", () => ({ ButtonMenuFolder: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("../note/ButtonMenuNote", () => ({ ButtonMenuNote: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/tooltip-custom", () => ({ TooltipCustom: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

beforeAll(() => {
    // jsdom has no layout: give every element a 600px viewport
    Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 600, top: 0, left: 0, right: 200, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 600 })
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 200 })
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 })
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 200 })
})

describe("VirtualTree", () => {
    it("renders only the rows near the viewport", () => {
        const notes = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `Nota ${i + 1}`, color: "#000000" }) as unknown as Note)
        const rows = flattenTree({ rootFolders: [], rootNotes: notes }, new Set())
        const scroller = document.createElement("div")
        document.body.appendChild(scroller)
        render(
            <DndContext>
                <VirtualTree
                    rows={rows}
                    collapsedIds={new Set()}
                    onToggleFolder={() => { }}
                    activeKey="note-400"
                    getScrollElement={() => scroller}
                />
            </DndContext>,
        )
        const rendered = screen.getAllByTestId("tree-row").length
        expect(rendered).toBeGreaterThan(0)
        expect(rendered).toBeLessThan(100)
        // The dragged row stays mounted although far outside the viewport
        expect(screen.getByText("Nota 400")).toBeTruthy()
    })

    it("draws one indent guide per level of depth, none for the root rows", () => {
        const note = (id: number, name: string) => ({ id, name, color: null }) as unknown as Note
        const inner = { id: 2, name: "Interna", color: null, notes: [note(3, "Profonda")], subfolders: [] }
        const outer = { id: 1, name: "Esterna", color: null, notes: [note(4, "Figlia")], subfolders: [inner] }
        const rows = flattenTree({ rootFolders: [outer as never], rootNotes: [note(5, "Radice")] }, new Set())
        const scroller = document.createElement("div")
        document.body.appendChild(scroller)
        render(
            <DndContext>
                <VirtualTree rows={rows} collapsedIds={new Set()} onToggleFolder={() => { }} activeKey={null} getScrollElement={() => scroller} />
            </DndContext>,
        )
        const guides = (name: string) => screen.getByText(name).closest("[data-testid='tree-row']")!.querySelectorAll("[data-testid='tree-guide']").length
        expect(guides("Esterna")).toBe(0)
        expect(guides("Radice")).toBe(0)
        expect(guides("Interna")).toBe(1)
        expect(guides("Figlia")).toBe(1)
        expect(guides("Profonda")).toBe(2)
    })
})
