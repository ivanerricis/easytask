import { useState } from "react"
import { useShortcut } from "@/hooks/use-shortcut"
import { useCreateRootNote } from "@/hooks/use-create-root-note"
import { AddFolderDialog } from "../AddFolderDialog"

/**
 * The shortcuts to create a note and a folder in the root while the sidebar is closed. With the sidebar open its buttons
 * (AddRootItemButton) own the same shortcuts and open their dialogs, so these are off then: one handler at a time.
 * New note creates it at once, like the "+" of the tabs; new folder opens the same dialog as the sidebar button.
 */
export function ClosedSidebarShortcuts({ sidebarOpen }: { sidebarOpen: boolean }) {
    const { create } = useCreateRootNote()
    const [folderOpen, setFolderOpen] = useState(false)

    useShortcut("new-note", () => { void create() }, { enabled: !sidebarOpen })
    useShortcut("new-folder", () => setFolderOpen(true), { enabled: !sidebarOpen })

    return <AddFolderDialog open={folderOpen && !sidebarOpen} onOpenChange={setFolderOpen} parentId={null} withColor />
}
