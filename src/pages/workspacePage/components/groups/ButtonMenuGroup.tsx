import { useTranslation } from "react-i18next"
import { ButtonInPopover } from "@/components/button-in-popover";
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete";
import { useDeleteRequest } from "@/components/dialogs/use-delete-item";
import { getDBGroupAudioFiles } from "@/db/queries/audio";
import { getDBGroupMediaFiles } from "@/db/queries/media";
import { groupHasContent } from "@/lib/delete-content";
import { MenuGroup, MenuItem } from "@/components/menu-kind";
import { Check, Gauge } from "lucide-react";
import { GROUP_COLOR_PROGRESS } from "@/lib/colors";
import { useUndoRecorder } from "@/contexts/undo/use-undo";
import { getItemName } from "@/contexts/undo/commands";
import { reportError } from "@/lib/report-error";
import { getErrorMessage } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ColorSubmenu } from "../ColorSubmenu";
import { ItemMenu } from "@/components/item-menu";
import { useItemMenuState } from "@/hooks/use-item-menu-state";
import { useItemMutations } from "@/hooks/use-item-mutations";
import { useAfterMenuClose } from "@/hooks/use-after-menu-close";
import { useRenameAfterClose } from "@/hooks/use-rename-after-close";
import { useActiveNoteActions } from "@/contexts/use-active-note";
import { useAudioActions } from "@/contexts/use-audio";
import { DirectStepMoves, GroupStepMoves } from "../NoteStepMoves";
import type { Group } from "@/types/types";
import { useState, type ReactElement } from "react";
import { LazyDialogAutomations } from "../section/LazyDialogAutomations";
import { LazyMount } from "@/components/lazy-mount";
import { DialogGroupTags } from "@/components/tags/DialogGroupTags";
import { useActiveNoteId } from "@/contexts/use-tabs";
import { useIsActiveDraft } from "@/contexts/use-template-drafts";

type Props = {
    group: Group
    /** Starts the inline edit of the name (once the menu has given the focus back). */
    onRename?: () => void
    /** Opens the form of a new section (once the menu has given the focus back). Without it the entry is not shown. */
    onAddSection?: () => void
    /** The group header: right click on it opens this menu, its <ItemMenuButton /> opens it below the button. */
    children: ReactElement
}

export const ButtonMenuGroup = ({ group, onRename, onAddSection, children }: Props) => {
    const { t } = useTranslation()
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const [isAutomationsOpen, setAutomationsOpen] = useState(false)
    const [isTagsOpen, setTagsOpen] = useState(false)
    const noteId = useActiveNoteId()
    const isDraft = useIsActiveDraft()
    const menu = useItemMenuState()
    // Both actions take the focus (an input), so each waits for the menu to give it back, or Radix would steal it again
    const { requestRename, onCloseAutoFocus: renameAfterClose } = useRenameAfterClose(onRename)
    const { request: requestAddSection, onCloseAutoFocus: addSectionAfterClose } = useAfterMenuClose(onAddSection)
    const onCloseAutoFocus = (e: Event) => {
        renameAfterClose(e)
        addSectionAfterClose(e)
    }
    const { patchGroup, removeGroup } = useActiveNoteActions()
    const { addFiles, addMediaFiles } = useAudioActions()
    const { addColorItem, archive } = useItemMutations("section_group", patchGroup, removeGroup)
    const recorder = useUndoRecorder()
    const isAutoColor = group.color === GROUP_COLOR_PROGRESS
    // "Automatic": the color follows the progress of the group until a fixed color (or none) is picked
    const pickAutoColor = async () => {
        menu.close()
        if (isAutoColor) return
        try {
            await addColorItem("section_group", group.id, GROUP_COLOR_PROGRESS)
            recorder.color("section_group", group.id, getItemName(group), group.color ?? null, GROUP_COLOR_PROGRESS)
        } catch (err) {
            reportError(err, getErrorMessage(err))
        }
    }
    const { request: requestDelete } = useDeleteRequest({
        item: group,
        itemType: "section_group",
        optimistic: () => removeGroup(group.id),
        hasContent: async () => groupHasContent(group, (await getDBGroupAudioFiles(group.id)).length + (await getDBGroupMediaFiles(group.id)).length),
        openDialog: () => setDeleteOpen(true),
    })

    // Removed from the open note at once (put back if the write fails); no confirmation, undo brings it back
    const handleArchive = () => {
        menu.close()
        return archive(group.id, group.name)
    }

    // Groups, apart by a separator: add, edit, move, the rest, delete (the same order in the menus of sections and tasks)
    const items = (
        <MenuGroup className="flex flex-col gap-1">
            {!isDraft && <ButtonInPopover
                text={t("audio.add")}
                type="addAudio"
                onClick={() => {
                    menu.close()
                    void addFiles(group.id)
                }}
            />}
            {!isDraft && <ButtonInPopover
                text={t("media.add")}
                type="addMedia"
                onClick={() => {
                    menu.close()
                    void addMediaFiles(group.id)
                }}
            />}
            {onAddSection && <ButtonInPopover
                text={t("sections.new")}
                type="addSection"
                onClick={() => {
                    requestAddSection()
                    menu.close()
                }}
            />}
            {/* Without sections the list has nowhere to go: the entries would be disabled for ever */}
            {group.sections.length > 0 && <DirectStepMoves groupId={group.id} onDone={menu.close} />}
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
                item={group}
                itemType="section_group"
                addColorItem={addColorItem}
                onDone={menu.close}
                header={<>
                    <MenuItem onSelect={() => { void pickAutoColor() }} className={isAutoColor ? "font-medium" : undefined}>
                        <Gauge />
                        {t("groups.progressColor.auto")}
                        {isAutoColor && <Check className="ml-auto" role="img" aria-label={t("groups.progressColor.active")} />}
                    </MenuItem>
                    <Separator className="my-1" />
                </>}
            />
            <ButtonInPopover
                text={t("tags.menu")}
                type="tags"
                onClick={() => {
                    menu.close()
                    setTagsOpen(true)
                }}
            />
            <Separator />
            <GroupStepMoves groupId={group.id} onDone={menu.close} />
            <Separator />
            {noteId !== null && <ButtonInPopover
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
            {noteId !== null && <LazyMount active={isAutomationsOpen}>
                <LazyDialogAutomations
                    noteId={noteId}
                    groupId={group.id}
                    isOpen={isAutomationsOpen}
                    onOpenChange={setAutomationsOpen}
                />
            </LazyMount>}
            {isTagsOpen && <DialogGroupTags open={isTagsOpen} onOpenChange={setTagsOpen} groupId={group.id} />}
            {isDeleteOpen && <DialogDeleteItem
                item={group}
                itemType="section_group"
                isOpen={isDeleteOpen}
                onOpenChange={setDeleteOpen}
                optimistic={() => removeGroup(group.id)}
            />}
        </>
    )

    return (
        <ItemMenu state={menu} items={items} dialogs={dialogs} contentClassName="p-1 rounded-xs" onCloseAutoFocus={onCloseAutoFocus}>
            {children}
        </ItemMenu>
    );
}
