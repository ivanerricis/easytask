import { render, screen } from "@testing-library/react"
import { act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setVeilLiftedPane } from "../note-dnd-veil"
import type { Note } from "@/types/types"
import { PaneContext } from "@/contexts/layout-context-object"
import { NoteList } from "./NoteList"
import { TabsDndProvider } from "./TabsDndProvider"

const tabs = [{ id: 1, name: "Uno" }, { id: 2, name: "Due" }] as unknown as Note[]

vi.mock("@/contexts/use-tabs", () => ({
    useTabs: () => ({ tabs }),
    useActiveNoteId: () => 1,
    useTabsActions: () => ({ reorderTabs: vi.fn(), activateNote: vi.fn() }),
}))
vi.mock("./NewNoteTabButton", () => ({ NewNoteTabButton: () => <button type="button">+</button> }))
vi.mock("./NoteHeader", () => ({
    NoteHeader: ({ note }: { note: Note }) => <button role="tab" data-note-id={note.id}>{note.name}</button>,
}))

afterEach(() => setVeilLiftedPane(null))

describe("NoteList veil of the pane without the focus", () => {
    const inPane = (focused: boolean, split: boolean) => {
        const value = { pane: 1 as const, focused, isFocused: () => focused, rootRef: { current: null } }
        return render(
            <PaneContext.Provider value={value}>
                <TabsDndProvider split={split}><NoteList /></TabsDndProvider>
            </PaneContext.Provider>,
        )
    }

    it("dims the tab bar of the split pane that has not the focus, letting the pointer through to the tabs", () => {
        inPane(false, true)
        const dim = screen.getByTestId("tabbar-dim")
        expect(dim).toHaveAttribute("data-dimmed", "true")
        expect(dim.className).toContain("pointer-events-none")
        expect(dim.className).toContain("opacity-100")
        expect(dim.className).toContain("bg-background/35")
    })

    it("does not dim the focused pane", () => {
        inPane(true, true)
        expect(screen.getByTestId("tabbar-dim")).toHaveAttribute("data-dimmed", "false")
    })

    it("does not dim the only bar of a workspace that is not split", () => {
        inPane(false, false)
        expect(screen.getByTestId("tabbar-dim")).toHaveAttribute("data-dimmed", "false")
    })

    it("lifts the veil of the bar while a cross-note drag is over its pane, and puts it back after", () => {
        inPane(false, true)
        act(() => setVeilLiftedPane(1))
        expect(screen.getByTestId("tabbar-dim")).toHaveAttribute("data-dimmed", "false")
        act(() => setVeilLiftedPane(0))
        expect(screen.getByTestId("tabbar-dim")).toHaveAttribute("data-dimmed", "true")
    })
})
