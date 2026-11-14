import type { ReactNode } from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Folder, Note } from "@/types/types"
import { makeNote } from "@/test/ui-fixtures"
import { SideBarLeft } from "./SideBarLeft"
import type { TreeData } from "./tree-dnd"

const dates = { creation_date: "", creation_time: "", edit_date: "", edit_time: "" }
const folder = (id: number, name: string, folderID: number | null, subfolders: Folder[] = [], notes: Note[] = []): Folder => ({
    id, workspaceID: 1, folderID, name, position: 0, ...dates, subfolders, notes,
})

// Lavoro { Progetti { Nidificata } }, Radice
const nested = makeNote({ id: 2, name: "Nidificata", folderID: 11 })
const tree: TreeData = {
    rootFolders: [folder(10, "Lavoro", null, [folder(11, "Progetti", 10, [], [nested])])],
    rootNotes: [makeNote({ id: 1, name: "Radice", folderID: null })],
}

const prefs = { sidebarItemSize: "normal", sidebarLeftOpen: true, setSideBarLeftOpen: vi.fn(), sidebarLeftWidth: 280, setSidebarLeftWidth: vi.fn() }

// The rename field needs the workspace data; the rows are tested without it
vi.mock("@/hooks/use-inline-rename", () => ({
    useInlineRename: () => ({ editing: false, error: null, start: () => {}, inputProps: {} }),
}))
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1, name: "Area" } }) }))
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceData: () => ({
        folders: [], workspaceDataTree: tree, getWorkspaceData: vi.fn().mockResolvedValue(undefined), moveTreeItem: vi.fn(),
    }),
}))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote: vi.fn() }), useActiveNoteId: () => null, useActiveNoteSelector: (select: (id: number | null) => unknown) => select(null) }))
vi.mock("@/contexts/undo/use-undo", async () => (await import("@/test/mocks")).undoModuleMock())
vi.mock("@/hooks/use-workspace-transfer", () => ({ useWorkspaceTransfer: () => ({ exportWorkspace: vi.fn(), isBusy: false }) }))
vi.mock("@/hooks/use-shortcut", () => ({ useShortcut: () => {} }))
vi.mock("@/contexts/use-shortcuts", () => ({ useShortcutLabel: () => "" }))
vi.mock("@/components/dialogs/dialog-settings", () => ({ DialogSettings: () => null }))
vi.mock("./selection-actions", () => ({ SelectionActionsProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useSelectionActions: () => null }))
vi.mock("./SidebarDialogs", () => ({ SidebarDialogs: () => null }))
vi.mock("./TreeBackgroundMenu", () => ({ TreeBackgroundMenu: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("./ButtonTrash", () => ({ ButtonTrash: () => null }))
vi.mock("./ButtonArchive", () => ({ ButtonArchive: () => null }))
vi.mock("./ButtonTemplates", () => ({ ButtonTemplates: () => null }))
vi.mock("./DialogAddFolder", () => ({ DialogAddFolder: () => null }))
vi.mock("./DialogAddNote", () => ({ DialogAddNote: () => null }))
vi.mock("./ButtonNoteFromTemplate", () => ({ ButtonNoteFromTemplate: () => null }))
vi.mock("./ButtonImportItems", () => ({ ButtonImportItems: () => null }))
vi.mock("./ButtonCollapseItems", () => ({ ButtonCollapseItems: () => null }))
vi.mock("../ButtonCloseNotes", () => ({ ButtonCloseNotes: () => null }))
vi.mock("../combobox-workspace", () => ({ ComboboxWorkspace: () => null }))
vi.mock("../folder/ButtonMenuFolder", () => ({ ButtonMenuFolder: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("../note/ButtonMenuNote", () => ({ ButtonMenuNote: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@/components/tooltip-custom", () => ({ TooltipCustom: ({ children }: { children: ReactNode }) => <>{children}</> }))
// Radix tooltips and the virtualizer measure with a ResizeObserver, which jsdom lacks
vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } })


const originalWidth = window.innerWidth
const row = (name: RegExp) => screen.getByRole("treeitem", { name })
const tabbable = () => screen.getAllByRole("treeitem").filter(item => item.tabIndex === 0).map(item => item.getAttribute("aria-label"))

// Rows in order: Lavoro, Progetti, Nidificata, Radice
describe("SideBarLeft tree keyboard", () => {
    beforeEach(() => {
        window.innerWidth = 1400
        prefs.sidebarLeftOpen = true
        Element.prototype.scrollIntoView = vi.fn()
    })
    afterEach(() => { window.innerWidth = originalWidth })

    it("has a single tab stop: the first row, then the one that was focused", async () => {
        render(<SideBarLeft />)
        expect(tabbable()).toEqual(["Lavoro"])
        act(() => row(/Radice/).focus())
        expect(tabbable()).toEqual(["Radice"])
    })

    it("moves the focus (and the tab stop) with Down, Up, End and Home", async () => {
        render(<SideBarLeft />)
        act(() => row(/Lavoro/).focus())
        await userEvent.keyboard("{ArrowDown}")
        expect(row(/Progetti/)).toHaveFocus()
        expect(tabbable()).toEqual(["Progetti"])
        await userEvent.keyboard("{ArrowUp}")
        expect(row(/Lavoro/)).toHaveFocus()
        await userEvent.keyboard("{End}")
        expect(row(/Radice/)).toHaveFocus()
        await userEvent.keyboard("{ArrowDown}")
        expect(row(/Radice/)).toHaveFocus()
        await userEvent.keyboard("{Home}")
        expect(row(/Lavoro/)).toHaveFocus()
    })

    it("closes and opens a folder with Left and Right, and goes into it and back to the parent", async () => {
        render(<SideBarLeft />)
        act(() => row(/Progetti/).focus())
        await userEvent.keyboard("{ArrowLeft}")
        expect(row(/Progetti/)).toHaveAttribute("aria-expanded", "false")
        expect(screen.queryByRole("treeitem", { name: /Nidificata/ })).toBeNull()
        await userEvent.keyboard("{ArrowRight}")
        expect(row(/Progetti/)).toHaveAttribute("aria-expanded", "true")
        expect(row(/Nidificata/)).toBeInTheDocument()
        await userEvent.keyboard("{ArrowRight}")
        expect(row(/Nidificata/)).toHaveFocus()
        await userEvent.keyboard("{ArrowLeft}")
        expect(row(/Progetti/)).toHaveFocus()
        // On a closed folder Left goes to the parent
        await userEvent.keyboard("{ArrowLeft}{ArrowLeft}")
        expect(row(/Lavoro/)).toHaveFocus()
    })

    it("still opens the note with Enter and leaves the other keys alone", async () => {
        render(<SideBarLeft />)
        act(() => row(/Radice/).focus())
        const event = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true })
        row(/Radice/).dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
    })

    it("leaves Ctrl + arrow to the shortcuts", async () => {
        render(<SideBarLeft />)
        act(() => row(/Lavoro/).focus())
        await userEvent.keyboard("{Control>}{ArrowDown}{/Control}")
        expect(row(/Lavoro/)).toHaveFocus()
    })
})
