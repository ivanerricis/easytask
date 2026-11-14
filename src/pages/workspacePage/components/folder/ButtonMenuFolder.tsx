import { useTranslation } from "react-i18next"
import type { Folder } from "@/types/types"
import { getErrorMessage } from "@/lib/utils"
import { reportError } from "@/lib/report-error"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { AddFolderDialog } from "../AddFolderDialog"
import { AddNoteDialog } from "../AddNoteDialog"
import { useState, type ReactElement } from "react"
import { ButtonInPopover } from "@/components/button-in-popover"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { Separator } from "@/components/ui/separator"
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete"
import { MoveToSubmenu } from "../MoveToSubmenu"
import { ColorSubmenu } from "../ColorSubmenu"
import { MenuGroup } from "@/components/menu-kind"
import { ItemMenu } from "@/components/item-menu"
import { useIsInMultiSelection } from "../sidebar/selection-context-object"
import { SelectionMenuItems } from "../sidebar/SelectionMenu"
import { useItemMenuState } from "@/hooks/use-item-menu-state"
import { useRenameAfterClose } from "@/hooks/use-rename-after-close"
import { useItemTransfer } from "@/hooks/use-workspace-transfer"

type ButtonMenuFolderProps = {
    folder: Folder
    /** The folder row: right click on it opens this menu, its <ItemMenuButton /> opens it below the button. */
    /** Starts the inline edit of the name (once the menu has given the focus back). */
    onRename?: () => void
    children: ReactElement
}

export const ButtonMenuFolder = ({ folder, onRename, children }: ButtonMenuFolderProps) => {
    const { t } = useTranslation()
    const [isAddSubFolderOpen, setAddSubFolderOpen] = useState(false);
    const [isAddNoteOpen, setAddNoteOpen] = useState(false);
    const [isDeleteFolderOpen, setDeleteFolderOpen] = useState(false);
    const menu = useItemMenuState()
    const { requestRename, onCloseAutoFocus } = useRenameAfterClose(onRename)
    const multi = useIsInMultiSelection("folder", folder.id)
    const { exportItem, importItems } = useItemTransfer()
    // Rename, color and delete are applied to the sidebar tree by the context: the dialogs need no reload
    const { updateFolderColorContent, updateItemColor, archiveItem } = useWorkspaceActions()
    const recorder = useUndoRecorder()

    const handleColorContent = async () => {
        try {
            // Applied to the sidebar tree by the context
            const previous = await updateFolderColorContent(folder.id, folder.color ?? undefined)
            recorder.colorContent(folder.id, folder.name, folder.color, previous)
        } catch (err) {
            reportError(err, getErrorMessage(err))
        }
    }

    // No confirmation: the folder (with what it contains) leaves the sidebar and the archive dialog (or undo) brings it back
    const handleArchive = async () => {
        menu.close()
        try {
            await archiveItem("folder", folder.id)
            recorder.archive("folder", folder.id, folder.name)
        } catch (err) {
            reportError(err, getErrorMessage(err))
        }
    }

    const singleItems = (
        <MenuGroup className="flex flex-col gap-1 p-1">
            <ButtonInPopover
                text={t("menu.newNote")}
                type="addNote"
                onClick={() => { setAddNoteOpen(true); menu.close() }}
            />
            <ButtonInPopover
                text={t("menu.newFolder")}
                type="addFolder"
                onClick={() => { setAddSubFolderOpen(true); menu.close() }}
            />
            <ButtonInPopover
                text={t("common.rename")}
                type="rename"
                onClick={() => { requestRename(); menu.close() }}
            />
            <ButtonInPopover
                text={t("menu.colorContent")}
                type="colorContent"
                onClick={() => { handleColorContent(); menu.close() }}
            />
            <ColorSubmenu
                item={folder}
                itemType="folder"
                addColorItem={updateItemColor}
                onDone={menu.close}
            />
            <MoveToSubmenu
                itemType="folder"
                itemId={folder.id}
                folderID={folder.folderID}
                onDone={menu.close}
            />
            <ButtonInPopover
                text={t("menu.importHere")}
                type="import"
                onClick={() => { menu.close(); void importItems(folder.id) }}
            />
            <ButtonInPopover
                text={t("menu.export")}
                type="export"
                onClick={() => { menu.close(); void exportItem("folder", folder) }}
            />
            <ButtonInPopover
                text={t("menu.archive")}
                type="archive"
                onClick={handleArchive}
            />
            <Separator />
            <ButtonInPopover
                text={t("common.delete")}
                type="delete"
                destructive
                onClick={() => { setDeleteFolderOpen(true); menu.close() }}
            />
        </MenuGroup>
    )

    // A selected row of a multi-selection acts on the whole selection
    const items = multi ? <SelectionMenuItems menu={menu} /> : singleItems

    const dialogs = (
        <>
            {isAddNoteOpen && <AddNoteDialog
                parentId={folder.id}
                open={isAddNoteOpen}
                onOpenChange={setAddNoteOpen}
            />}
            {isAddSubFolderOpen && <AddFolderDialog
                parentId={folder.id}
                open={isAddSubFolderOpen}
                onOpenChange={setAddSubFolderOpen}
            />}
            {isDeleteFolderOpen && <DialogDeleteItem
                item={folder}
                itemType="folder"
                isOpen={isDeleteFolderOpen}
                onOpenChange={setDeleteFolderOpen}
            />}
        </>
    )

    return (
        <ItemMenu state={menu} items={items} dialogs={dialogs} contentClassName="rounded-xs" onCloseAutoFocus={onCloseAutoFocus}>
            {children}
        </ItemMenu>
    )
}
