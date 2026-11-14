import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { FolderInput, Palette } from "lucide-react"
import { ButtonInPopover } from "@/components/button-in-popover"
import { DialogAddColor } from "@/components/dialogs/dialog-add-color"
import { MenuGroup, MenuItem, MenuSub, MenuSubContent, MenuSubTrigger } from "@/components/menu-kind"
import { Separator } from "@/components/ui/separator"
import { useActiveNote } from "@/contexts/use-active-note"
import { useIsActiveDraft } from "@/contexts/use-template-drafts"
import type { ItemMenuState } from "@/hooks/use-item-menu-state"
import { useSelectedTaskKeys, useTaskSelectionActions } from "./use-task-selection"
import { getTaskDestinations, getTopMostTasks, parseTaskKey } from "./task-selection"

/**
 * Entries of the menu of a selected task while 2 or more tasks are selected: move, color, archive and delete, all applied
 * to the whole selection (see {@link TaskSelectionActionsProvider}). Written once for the "…" button and the right click.
 */
export const TaskSelectionMenuItems = ({ menu }: { menu: ItemMenuState }) => {
    const { t } = useTranslation()
    const actions = useTaskSelectionActions()
    const { noteDataTree } = useActiveNote()
    const selected = useSelectedTaskKeys()
    const isDraft = useIsActiveDraft()

    const destinations = useMemo(() => noteDataTree ? getTaskDestinations(noteDataTree) : [], [noteDataTree])
    // A selected task stands for its subtasks: the count is of the tasks the actions really apply to
    const count = useMemo(
        () => noteDataTree ? getTopMostTasks(noteDataTree, [...selected].flatMap(key => parseTaskKey(key) ?? [])).length : 0,
        [selected, noteDataTree],
    )
    if (!actions) return null

    return (
        <MenuGroup className="flex flex-col gap-1">
            {destinations.length > 0 && (
                <MenuSub>
                    <MenuSubTrigger>
                        <FolderInput className="size-4" />
                        {t("tasks.selection.move")}
                    </MenuSubTrigger>
                    <MenuSubContent className="max-h-64 min-w-48 max-w-80 overflow-y-auto">
                        {destinations.map(destination => (
                            <MenuItem
                                key={destination.key}
                                className="text-xs"
                                onSelect={() => { menu.close(); void actions.moveTo(destination.sectionId) }}
                            >
                                <span className="truncate" title={destination.label}>{destination.label}</span>
                                <span className="ml-auto shrink-0 text-muted-foreground">{destination.groupLabel}</span>
                            </MenuItem>
                        ))}
                    </MenuSubContent>
                </MenuSub>
            )}
            <MenuSub>
                <MenuSubTrigger>
                    <Palette className="size-4" />
                    {t("tasks.selection.color")}
                </MenuSubTrigger>
                <MenuSubContent>
                    <DialogAddColor onPick={color => actions.applyColor(color)} setDropDownOpen={menu.close} />
                </MenuSubContent>
            </MenuSub>
            <ButtonInPopover
                text={t("tags.menu")}
                type="tags"
                onClick={() => { menu.close(); actions.requestTags() }}
            />
            {!isDraft && <ButtonInPopover
                text={t("tasks.selection.archive", { count })}
                type="archive"
                onClick={() => { menu.close(); void actions.archiveSelection() }}
            />}
            <Separator />
            <ButtonInPopover
                text={t("tasks.selection.delete", { count })}
                type="delete"
                destructive
                onClick={() => { menu.close(); actions.requestDelete() }}
            />
        </MenuGroup>
    )
}
