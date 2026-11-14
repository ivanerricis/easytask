import i18n from "@/i18n"
import { useCallback, useEffect, useState } from "react"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceData } from "@/contexts/workspace-data"
import { Separator } from "@/components/ui/separator"
import { DialogSettings } from "@/components/dialogs/dialog-settings"
import { reportError } from "@/lib/report-error"
import { SideBar } from "./SideBar"
import { SideBarContainer } from "./SideBarContainer"
import { SideBarHeader } from "./SideBarHeader"
import { FileTree } from "./FileTree"
import { SelectionProvider } from "./selection-context"
import { SelectionActionsProvider } from "./selection-actions"
import { ButtonTrash } from "./ButtonTrash"
import { ButtonArchive } from "./ButtonArchive"
import { ButtonTemplates } from "./ButtonTemplates"
import { DialogAddFolder } from "./DialogAddFolder"
import { DialogAddNote } from "./DialogAddNote"
import { ButtonNoteFromTemplate } from "./ButtonNoteFromTemplate"
import { SidebarDialogs } from "./SidebarDialogs"
import { ButtonImportItems } from "./ButtonImportItems"
import { ComboboxWorkspace } from "../combobox-workspace"
import { ButtonCloseNotes } from "../ButtonCloseNotes"
import { ButtonCollapseItems } from "./ButtonCollapseItems"
import { usePreferences } from "@/contexts/use-preferences"
import { useWorkspaceTransfer } from "@/hooks/use-workspace-transfer"
import { useShortcut } from "@/hooks/use-shortcut"
import { useAppCommand } from "@/lib/app-commands"
import { useCompactLayout } from "@/lib/sidebar-layout"
import { useTreeRevealRequest } from "@/lib/tree-reveal"
import { treeRowKey } from "./tree-row"
import { getAncestorFolderIds } from "./note-path"
import { useTreeData } from "./use-tree-data"

export const SideBarLeft = () => {
    const { currentWorkspace } = useWorkspace()
    const { folders, getWorkspaceData } = useWorkspaceData()
    const tree = useTreeData()
    const { sidebarLeftOpen, setSideBarLeftOpen, sidebarLeftWidth, setSidebarLeftWidth } = usePreferences()
    // Compact window: the sidebar is an overlay, closed by default, whose state is not persisted
    const compact = useCompactLayout()
    const [overlayOpen, setOverlayOpen] = useState(false)
    const [prevCompact, setPrevCompact] = useState(compact)
    if (prevCompact !== compact) {
        setPrevCompact(compact)
        setOverlayOpen(false)
    }
    const open = compact ? overlayOpen : sidebarLeftOpen
    const setOpen = useCallback((value: boolean) => {
        if (compact) setOverlayOpen(value)
        else setSideBarLeftOpen(value)
    }, [compact, setSideBarLeftOpen])
    useShortcut("toggle-sidebar", () => setOpen(!open), { allowInInputs: true })
    const { exportWorkspace, isBusy: isTransferring } = useWorkspaceTransfer()
    useAppCommand("export-workspace", () => { if (currentWorkspace) void exportWorkspace(currentWorkspace) }, { enabled: !!currentWorkspace && !isTransferring })

    useEffect(() => {
        if (currentWorkspace?.id) {
            getWorkspaceData(currentWorkspace.id).catch(error => reportError(error, i18n.t("errors.loadWorkspace")))
        }
    }, [currentWorkspace, getWorkspaceData])

    // Folders are expanded by default; only the collapsed ones are tracked
    const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set())

    const toggleFolder = useCallback((folderId: number) => {
        setCollapsedIds(prev => {
            const next = new Set(prev)
            if (!next.delete(folderId)) next.add(folderId)
            return next
        })
    }, [])

    const expandFolder = useCallback((folderId: number) => {
        setCollapsedIds(prev => {
            if (!prev.has(folderId)) return prev
            const next = new Set(prev)
            next.delete(folderId)
            return next
        })
    }, [])

    // A request to show an item: the sidebar opens and the folders above the item expand, then the tree selects and scrolls to its row
    const [reveal, setReveal] = useState<{ key: string, seq: number } | null>(null)
    useTreeRevealRequest(ref => {
        setOpen(true)
        getAncestorFolderIds(tree, ref).forEach(expandFolder)
        setReveal(prev => ({ key: treeRowKey(ref.type, ref.id), seq: (prev?.seq ?? 0) + 1 }))
    })
    const handleRevealed = useCallback(() => setReveal(null), [])

    const allCollapsed = folders.length > 0 && folders.every(folder => collapsedIds.has(folder.id))
    const toggleAll = useCallback(() => {
        setCollapsedIds(allCollapsed ? new Set() : new Set(folders.map(folder => folder.id)))
    }, [allCollapsed, folders])

    return (
        <SelectionProvider>
            <SelectionActionsProvider>
                <SideBar
                    position="left"
                    open={open}
                    onOpenChange={setOpen}
                    width={sidebarLeftWidth}
                    onWidthChange={setSidebarLeftWidth}
                    overlay={compact}
                    bottomContainer={<DialogSettings className="relative top-0 left-0" />}
                >
                    <SideBarContainer
                        // Three groups told apart by a divider: create, bring in files, change the view
                        header={<SideBarHeader className="border-b">
                            <div className="flex items-center gap-0.5">
                                <DialogAddFolder />
                                <DialogAddNote />
                                <ButtonNoteFromTemplate />
                            </div>
                            <Separator orientation="vertical" className="data-[orientation=vertical]:h-5 bg-foreground/30" />
                            <div className="flex items-center gap-0.5">
                                <ButtonImportItems />
                            </div>
                            <Separator orientation="vertical" className="data-[orientation=vertical]:h-5 bg-foreground/30" />
                            <div className="flex items-center gap-0.5">
                                <ButtonCollapseItems allCollapsed={allCollapsed} onToggle={toggleAll} disabled={folders.length === 0} />
                                <ButtonCloseNotes />
                            </div>
                        </SideBarHeader>}
                        footer={<div className="flex flex-col gap-1 border-t p-1 w-full">
                            <ButtonTemplates />
                            <ButtonArchive />
                            <ButtonTrash />
                            <ComboboxWorkspace />
                        </div>}
                    >
                        <FileTree collapsedIds={collapsedIds} onToggleFolder={toggleFolder} onExpandFolder={expandFolder} onToggleAll={toggleAll} allCollapsed={allCollapsed} reveal={reveal} onRevealed={handleRevealed} />
                    </SideBarContainer>
                </SideBar>
                <SidebarDialogs />
            </SelectionActionsProvider>
        </SelectionProvider>
    )
}