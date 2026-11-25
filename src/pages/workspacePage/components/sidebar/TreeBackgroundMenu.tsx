import type { ReactElement } from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ButtonInPopover } from "@/components/button-in-popover"
import { ItemMenu } from "@/components/item-menu"
import { MenuGroup, MenuSeparator } from "@/components/menu-kind"
import { useItemMenuState } from "@/hooks/use-item-menu-state"
import { useItemTransfer } from "@/hooks/use-workspace-transfer"
import { requestAppCommand } from "@/lib/app-commands"
import { AddFolderDialog } from "../AddFolderDialog"
import { AddNoteDialog } from "../AddNoteDialog"

type TreeBackgroundMenuProps = {
    /** Whether the folders are all collapsed: the entry then expands them. */
    allCollapsed: boolean
    /** Expands or collapses every folder (the entry is disabled without folders). */
    onToggleAll?: () => void
    hasFolders: boolean
    /** The tree area: a right click on it, where no row takes it, opens this menu. */
    children: ReactElement
}

/**
 * Right click on the empty space of the sidebar tree: what the buttons of the sidebar header do (a note or a folder in the
 * root of the workspace, a note from a template, import, collapse all). A row has its own menu, which wins over this one.
 * @category Sidebar
 */
export const TreeBackgroundMenu = ({ allCollapsed, onToggleAll, hasFolders, children }: TreeBackgroundMenuProps) => {
    const { t } = useTranslation()
    const menu = useItemMenuState()
    const [noteOpen, setNoteOpen] = useState(false)
    const [pageOpen, setPageOpen] = useState(false)
    const [folderOpen, setFolderOpen] = useState(false)
    const { importItems, isBusy } = useItemTransfer()

    const items = (
        <MenuGroup className="flex flex-col gap-1 p-1">
            <ButtonInPopover text={t("menu.newNote")} type="addNote" onClick={() => { setNoteOpen(true); menu.close() }} />
            <ButtonInPopover text={t("menu.newPage")} type="addPage" onClick={() => { setPageOpen(true); menu.close() }} />
            <ButtonInPopover text={t("menu.newFolder")} type="addFolder" onClick={() => { setFolderOpen(true); menu.close() }} />
            <ButtonInPopover text={t("sidebar.addNoteFromTemplate")} type="createTemplate" onClick={() => { menu.close(); requestAppCommand("note-from-template") }} />
            <MenuSeparator />
            <ButtonInPopover text={t("sidebar.importItems")} type="import" disabled={isBusy} onClick={() => { menu.close(); void importItems(null) }} />
            {onToggleAll && (
                <ButtonInPopover
                    text={allCollapsed ? t("sidebar.expandAll") : t("sidebar.collapseAll")}
                    type={allCollapsed ? "expandAll" : "collapseAll"}
                    disabled={!hasFolders}
                    onClick={() => { menu.close(); onToggleAll() }}
                />
            )}
        </MenuGroup>
    )

    const dialogs = (
        <>
            <AddNoteDialog open={noteOpen} onOpenChange={setNoteOpen} parentId={null} withColor />
            <AddNoteDialog kind="page" open={pageOpen} onOpenChange={setPageOpen} parentId={null} withColor />
            <AddFolderDialog open={folderOpen} onOpenChange={setFolderOpen} parentId={null} withColor />
        </>
    )

    return <ItemMenu state={menu} items={items} dialogs={dialogs}>{children}</ItemMenu>
}
