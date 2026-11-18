import { useTranslation } from "react-i18next"
import { useState, type ReactElement } from "react"
import { ButtonInPopover } from "@/components/button-in-popover"
import { ColorSubmenu } from "../ColorSubmenu"
import type { Section } from "@/types/types"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { Separator } from "@/components/ui/separator"
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete"
import { useDeleteRequest } from "@/components/dialogs/use-delete-item"
import { sectionHasContent } from "@/lib/delete-content"
import { SectionMoveSubmenu } from "../NoteMoveSubmenus"
import { SectionStepMoves } from "../NoteStepMoves"
import { MenuGroup } from "@/components/menu-kind"
import { ItemMenu } from "@/components/item-menu"
import { useItemMenuState } from "@/hooks/use-item-menu-state"
import { useItemMutations } from "@/hooks/use-item-mutations"
import { useRenameAfterClose } from "@/hooks/use-rename-after-close"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { getErrorMessage } from "@/lib/utils"
import { reportError } from "@/lib/report-error"
import { toast } from "sonner"
import { SectionTaskOrderSubmenu } from "./SectionTaskOrderSubmenu"
import { LazyDialogAutomations } from "./LazyDialogAutomations"
import { LazyMount } from "@/components/lazy-mount"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { useIsActiveDraft } from "@/contexts/use-template-drafts"

type ButtonMenuSectionProps = {
    section: Section
    /** Starts the inline edit of the title (once the menu has given the focus back). */
    onRename?: () => void
    /** The section header: right click on it opens this menu, its <ItemMenuButton /> opens it below the button. */
    children: ReactElement
}

export const ButtonMenuSection = ({ section, onRename, children }: ButtonMenuSectionProps) => {
    const { t } = useTranslation()
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const [isAutomationsOpen, setAutomationsOpen] = useState(false)
    const noteId = useActiveNoteId()
    const isDraft = useIsActiveDraft()
    const menu = useItemMenuState()
    const { requestRename, onCloseAutoFocus } = useRenameAfterClose(onRename)
    const { duplicateSection } = useWorkspaceActions()
    const { patchSection, removeSection, refreshActiveNote } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    const { addColorItem, archive } = useItemMutations("section", patchSection, removeSection)
    const { request: requestDelete } = useDeleteRequest({
        item: section,
        itemType: "section",
        optimistic: () => removeSection(section.id),
        hasContent: () => sectionHasContent(section),
        openDialog: () => setDeleteOpen(true),
    })

    // The copy is placed right after the original: reload the open note to show it
    const handleDuplicate = async () => {
        menu.close()
        try {
            const id = await duplicateSection(section.id)
            recorder.create("section", id, null)
            await refreshActiveNote()
            toast.success(t("duplicate.sectionDone"))
        } catch (error) {
            reportError(error, getErrorMessage(error))
        }
    }

    // Removed from the open note at once (put back if the write fails); no confirmation, undo brings it back
    const handleArchive = () => {
        menu.close()
        return archive(section.id, section.title)
    }

    // Groups, apart by a separator: add, edit, move, the rest, delete (the same order in the menus of groups and tasks)
    const items = (
        <MenuGroup className="flex flex-col gap-1">
            <ButtonInPopover
                text={t("menu.duplicate")}
                type="duplicate"
                onClick={handleDuplicate}
            />
            <Separator />
            <ButtonInPopover
                text={t("common.rename")}
                type="rename"
                onClick={() => {
                    requestRename()
                    menu.close()
                }}
            />
            <ColorSubmenu
                item={section}
                itemType="section"
                addColorItem={addColorItem}
                onDone={menu.close}
            />
            <SectionTaskOrderSubmenu section={section} onDone={menu.close} />
            <Separator />
            <SectionStepMoves sectionId={section.id} onDone={menu.close} />
            <SectionMoveSubmenu sectionId={section.id} onDone={menu.close} />
            {!isDraft && <Separator />}
            {noteId !== null && !isDraft && <ButtonInPopover
                text={t("automations.menu")}
                type="automations"
                onClick={() => {
                    setAutomationsOpen(true)
                    menu.close()
                }}
            />}
            {!isDraft && <ButtonInPopover
                text={t("menu.archive")}
                type="archive"
                onClick={handleArchive}
            />}
            <Separator />
            <ButtonInPopover
                text={t("common.delete")}
                type="delete"
                destructive
                onClick={() => {
                    requestDelete()
                    menu.close()
                }}
            />
        </MenuGroup>
    )

    const dialogs = (
        <>
            {noteId !== null && !isDraft && <LazyMount active={isAutomationsOpen}>
                <LazyDialogAutomations
                    noteId={noteId}
                    sectionId={section.id}
                    isOpen={isAutomationsOpen}
                    onOpenChange={setAutomationsOpen}
                />
            </LazyMount>}
            {isDeleteOpen && <DialogDeleteItem
                item={section}
                itemType="section"
                isOpen={isDeleteOpen}
                onOpenChange={setDeleteOpen}
                optimistic={() => removeSection(section.id)}
            />}
        </>
    )

    return (
        <ItemMenu state={menu} items={items} dialogs={dialogs} contentClassName="p-1 rounded-xs" onCloseAutoFocus={onCloseAutoFocus}>
            {children}
        </ItemMenu>
    )
}
