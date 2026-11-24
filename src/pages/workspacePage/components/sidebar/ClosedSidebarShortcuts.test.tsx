import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeWorkspace } from "@/test/ui-fixtures"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"
import { useShortcut } from "@/hooks/use-shortcut"
import { pendingRename } from "@/lib/pending-rename"
import { ClosedSidebarShortcuts } from "./ClosedSidebarShortcuts"

const createWorkspaceNote = vi.fn()
const openNote = vi.fn()
const create = vi.fn()

vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: makeWorkspace({ id: 4 }) }) }))
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceState: () => ({ workspaceDataTree: { rootFolders: [], rootNotes: [] } }),
    useWorkspaceActions: () => ({ createWorkspaceNote }),
}))
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => ({ create }) }))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote }) }))
vi.mock("@/contexts/use-layout", () => ({ usePane: () => null, useLayout: () => ({ focused: 1 }), usePaneFocusGetter: () => () => true }))
vi.mock("../AddFolderDialog", () => ({
    AddFolderDialog: ({ open }: { open: boolean }) => open ? <div>dialog cartella</div> : null,
}))

// What the sidebar button does while the sidebar is open
function OpenSidebarButton({ onOpen }: { onOpen: () => void }) {
    useShortcut("new-note", onOpen)
    return null
}

const ctrl = (key: string) => fireEvent.keyDown(document.body, { key, ctrlKey: true })

beforeEach(() => {
    vi.clearAllMocks()
    pendingRename.set(null)
    createWorkspaceNote.mockResolvedValue(9)
})

describe("ClosedSidebarShortcuts", () => {
    it("Ctrl+N creates the note at once, in the focused pane, with the sidebar closed", async () => {
        render(<ShortcutsProvider><ClosedSidebarShortcuts sidebarOpen={false} /></ShortcutsProvider>)
        ctrl("n")
        await waitFor(() => expect(openNote).toHaveBeenCalledWith(9))
        expect(createWorkspaceNote).toHaveBeenCalledWith(4, "Nuova nota")
        expect(pendingRename.getState()).toEqual({ noteId: 9, pane: 1, onKeep: expect.any(Function) })
    })

    it("leaves Ctrl+N to the sidebar button while the sidebar is open (one handler only)", () => {
        const open = vi.fn()
        render(<ShortcutsProvider><ClosedSidebarShortcuts sidebarOpen /><OpenSidebarButton onOpen={open} /></ShortcutsProvider>)
        ctrl("n")
        expect(open).toHaveBeenCalledTimes(1)
        expect(createWorkspaceNote).not.toHaveBeenCalled()
    })

    it("Ctrl+M opens the folder dialog with the sidebar closed, and nothing while it is open", () => {
        const { rerender } = render(<ShortcutsProvider><ClosedSidebarShortcuts sidebarOpen={false} /></ShortcutsProvider>)
        expect(screen.queryByText("dialog cartella")).not.toBeInTheDocument()
        ctrl("m")
        expect(screen.getByText("dialog cartella")).toBeInTheDocument()
        rerender(<ShortcutsProvider><ClosedSidebarShortcuts sidebarOpen /></ShortcutsProvider>)
        expect(screen.queryByText("dialog cartella")).not.toBeInTheDocument()
    })
})
