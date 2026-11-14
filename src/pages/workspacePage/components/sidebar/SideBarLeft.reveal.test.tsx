import type { ReactNode } from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Folder, Note } from "@/types/types"
import { makeNote } from "@/test/ui-fixtures"
import { requestTreeReveal } from "@/lib/tree-reveal"
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
const scrollIntoView = vi.fn()

const flushFrames = async () => {
    // The reveal waits for animation frames (the row may mount later, the focus a frame after it)
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(null))) })
}

describe("SideBarLeft reveal", () => {
    beforeEach(() => {
        window.innerWidth = 1400
        prefs.sidebarLeftOpen = true
        prefs.setSideBarLeftOpen.mockReset()
        scrollIntoView.mockReset()
        Element.prototype.scrollIntoView = scrollIntoView
    })
    afterEach(() => { window.innerWidth = originalWidth })

    it("expands the collapsed folders above a note, then selects, scrolls to and focuses its row", async () => {
        render(<SideBarLeft />)
        // Collapse the top folder: the note disappears
        await userEvent.click(screen.getByRole("treeitem", { name: /Lavoro/ }))
        expect(screen.queryByRole("treeitem", { name: /Nidificata/ })).toBeNull()

        act(() => requestTreeReveal({ type: "note", id: 2 }))
        await flushFrames()

        const row = screen.getByRole("treeitem", { name: /Nidificata/ })
        expect(screen.getByRole("treeitem", { name: /Lavoro/ })).toHaveAttribute("aria-expanded", "true")
        expect(row).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("treeitem", { name: /Radice/ })).toHaveAttribute("aria-selected", "false")
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" })
        expect(row).toHaveFocus()
    })

    it("does not collapse or toggle the folder that is revealed", async () => {
        render(<SideBarLeft />)
        act(() => requestTreeReveal({ type: "folder", id: 10 }))
        await flushFrames()
        const row = screen.getByRole("treeitem", { name: /Lavoro/ })
        expect(row).toHaveAttribute("aria-expanded", "true")
        expect(row).toHaveAttribute("aria-selected", "true")
    })

    it("opens a closed sidebar (the preference, when docked)", () => {
        prefs.sidebarLeftOpen = false
        render(<SideBarLeft />)
        act(() => requestTreeReveal({ type: "note", id: 1 }))
        expect(prefs.setSideBarLeftOpen).toHaveBeenCalledWith(true)
    })

    it("opens the closed overlay sidebar of a compact window and reveals the row in it", async () => {
        window.innerWidth = 700
        render(<SideBarLeft />)
        expect(screen.queryByRole("tree")).toBeNull()

        act(() => requestTreeReveal({ type: "note", id: 2 }))
        await flushFrames()

        expect(await screen.findByRole("treeitem", { name: /Nidificata/ })).toHaveAttribute("aria-selected", "true")
        expect(prefs.setSideBarLeftOpen).not.toHaveBeenCalled()
    })
})
