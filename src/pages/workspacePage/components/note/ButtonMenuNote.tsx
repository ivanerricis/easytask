import { useTranslation } from "react-i18next"
import { lazyNamed, preloadWhenIdle } from "@/lib/lazy-preload"
import { useContext, useState, type ReactElement } from "react"
import type { Note } from "@/types/types"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useTabs, useTabsActions } from "@/contexts/use-tabs"
import { usePaneOfNote } from "@/contexts/use-layout"
import { PaneTabsContext } from "@/contexts/layout-context-object"
import { ButtonInPopover } from "@/components/button-in-popover"
import { LazyMount } from "@/components/lazy-mount"
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete"
import { useDeleteRequest } from "@/components/dialogs/use-delete-item"
import { noteHasContent } from "@/db/queries/note"
import { Separator } from "@/components/ui/separator"
import { OpenInPaneItem } from "../OpenInPaneItem"
import { ColorSubmenu } from "../ColorSubmenu"
import { MoveToSubmenu } from "../MoveToSubmenu"
import { MenuGroup } from "@/components/menu-kind"
import { ItemMenu } from "@/components/item-menu"
import { useIsInMultiSelection } from "../sidebar/selection-context-object"
import { SelectionMenuItems } from "../sidebar/SelectionMenu"
import { useItemMenuState } from "@/hooks/use-item-menu-state"
import { useRenameAfterClose } from "@/hooks/use-rename-after-close"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { getErrorMessage } from "@/lib/utils"
import { reportError } from "@/lib/report-error"
import { toast } from "sonner"
import { useItemTransfer } from "@/hooks/use-workspace-transfer"

const DialogAutomations = lazyNamed(() => import("@/components/dialogs/dialog-automations"), "DialogAutomations")
const DialogCreateTemplate = lazyNamed(() => import("@/components/dialogs/dialog-create-template"), "DialogCreateTemplate")
preloadWhenIdle(DialogAutomations, DialogCreateTemplate)

/**
 * The tab moves are the keyboard way to reorder the tabs. Kept apart so the tabs are read only while the menu is open, not by every sidebar row.
 * When the workspace is split they act on the tab bar of the pane that holds the note.
 */
const TabMoveItems = ({ noteId, onDone }: { noteId: number, onDone: () => void }) => {
    const { t } = useTranslation()
    const { tabs: allTabs } = useTabs()
    const { reorderTabs: reorderFocused } = useTabsActions()
    const pane = usePaneOfNote(noteId)
    const paneTabs = useContext(PaneTabsContext)
    const own = pane !== null && paneTabs ? paneTabs[pane] : null
    const tabs = own ? own.tabs.tabs : allTabs
    const reorderTabs = own ? own.actions.reorderTabs : reorderFocused
    // Position of the note among the open tabs of its bar (-1 when it is not open)
    const tabIndex = tabs.findIndex(tab => tab.id === noteId)
    if (tabIndex < 0) return null
    return (
        <>
            <ButtonInPopover
                text={t("notes.moveTabLeft")}
                type="moveLeft"
                disabled={tabIndex === 0}
                onClick={() => { onDone(); reorderTabs(tabIndex, tabIndex - 1) }}
            />
            <ButtonInPopover
                text={t("notes.moveTabRight")}
                type="moveRight"
                disabled={tabIndex === tabs.length - 1}
                onClick={() => { onDone(); reorderTabs(tabIndex, tabIndex + 1) }}
            />
        </>
    )
}
type ButtonMenuNoteProps = {
    note: Note
    /** Starts the inline edit of the name (once the menu has given the focus back). */
    onRename?: () => void
    /** The note row or tab: right click on it opens this menu, its <ItemMenuButton /> opens it below the button. */
    children: ReactElement
}

export const ButtonMenuNote = ({ note, onRename, children }: ButtonMenuNoteProps) => {
    const { t } = useTranslation()
    const [isDeleteOpen, setDeleteOpen] = useState(false);
    const [isTemplateOpen, setTemplateOpen] = useState(false);
    const [isAutomationsOpen, setAutomationsOpen] = useState(false);
    const menu = useItemMenuState()
    const { requestRename, onCloseAutoFocus } = useRenameAfterClose(onRename)
    const multi = useIsInMultiSelection("note", note.id)
    const { updateItemColor, duplicateNote, archiveItem } = useWorkspaceActions()
    const { openNote } = useTabsActions()
    const recorder = useUndoRecorder()
    const { exportItem } = useItemTransfer()
    const { request: requestDelete } = useDeleteRequest({
        item: note,
        itemType: "note",
        hasContent: () => noteHasContent(note.id),
        openDialog: () => setDeleteOpen(true),
    })

    // Closes the menu, runs the action and reports a failure
    const runAction = async (action: () => Promise<void>) => {
        menu.close()
        try {
            await action()
        } catch (error) {
            reportError(error, getErrorMessage(error))
        }
    }

    // The copy is added to the tree by the context: open it in a tab and make the creation undoable
    const handleDuplicate = () => runAction(async () => {
        const id = await duplicateNote(note.id)
        recorder.create("note", id, null)
        openNote(id)
        toast.success(t("duplicate.noteDone"))
    })

    // No confirmation: the note leaves the sidebar and the archive dialog (or undo) brings it back
    const handleArchive = () => runAction(async () => {
        await archiveItem("note", note.id)
        recorder.archive("note", note.id, note.name)
    })

    const singleItems = () => (
        <MenuGroup className="flex flex-col gap-1">
            <ButtonInPopover
                text={t("menu.open")}
                type="open"
                onClick={() => { openNote(note.id); menu.close() }}
            />
            <OpenInPaneItem noteId={note.id} onDone={menu.close} />
            <ButtonInPopover
                text={t("common.rename")}
                type="rename"
                onClick={() => { requestRename(); menu.close() }}
            />
            <ButtonInPopover
                text={t("menu.duplicate")}
                type="duplicate"
                onClick={handleDuplicate}
            />
            <Separator />
            <ColorSubmenu
                item={note}
                itemType="note"
                addColorItem={updateItemColor}
                onDone={menu.close}
            />
            <MoveToSubmenu
                itemType="note"
                itemId={note.id}
                folderID={note.folderID}
                onDone={menu.close}
            />
            <TabMoveItems noteId={note.id} onDone={menu.close} />
            <Separator />
            <ButtonInPopover
                text={t("menu.createTemplate")}
                type="createTemplate"
                onClick={() => { setTemplateOpen(true); menu.close() }}
            />
            <ButtonInPopover
                text={t("automations.menu")}
                type="automations"
                onClick={() => { setAutomationsOpen(true); menu.close() }}
            />
            <ButtonInPopover
                text={t("menu.export")}
                type="export"
                onClick={() => { menu.close(); void exportItem("note", note) }}
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
                onClick={() => { requestDelete(); menu.close() }}
            />
        </MenuGroup>
    )

    // A selected row of a multi-selection acts on the whole selection
    const items = multi ? () => <SelectionMenuItems menu={menu} /> : singleItems

    const dialogs = (
        <>
            <LazyMount active={isTemplateOpen}>
                <DialogCreateTemplate
                    note={note}
                    isOpen={isTemplateOpen}
                    onOpenChange={setTemplateOpen}
                />
            </LazyMount>
            <LazyMount active={isAutomationsOpen}>
                <DialogAutomations
                    noteId={note.id}
                    isOpen={isAutomationsOpen}
                    onOpenChange={setAutomationsOpen}
                />
            </LazyMount>
            {isDeleteOpen && <DialogDeleteItem
                item={note}
                itemType="note"
                isOpen={isDeleteOpen}
                onOpenChange={setDeleteOpen}
            />}
        </>
    )

    return (
        <ItemMenu state={menu} items={items} dialogs={dialogs} contentClassName="p-1 rounded-xs" onCloseAutoFocus={onCloseAutoFocus}>
            {children}
        </ItemMenu>
    )
}
