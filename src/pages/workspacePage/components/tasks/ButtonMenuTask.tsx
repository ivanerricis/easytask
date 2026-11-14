import { useTranslation } from "react-i18next"
import { getErrorMessage } from "@/lib/utils"
import type { Task } from "@/types/types"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { reportError } from "@/lib/report-error"
import { toast } from "sonner"
import { useState, type ReactElement } from "react"
import { ButtonInPopover } from "@/components/button-in-popover"
import { Separator } from "@/components/ui/separator"
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete"
import { ColorSubmenu } from "../ColorSubmenu"
import { MenuGroup } from "@/components/menu-kind"
import { ItemMenu } from "@/components/item-menu"
import { useAfterMenuClose } from "@/hooks/use-after-menu-close"
import { useItemMutations } from "@/hooks/use-item-mutations"
import { useItemMenuState } from "@/hooks/use-item-menu-state"
import { TaskMoveSubmenu } from "../NoteMoveSubmenus"
import { TaskStepMoves } from "../NoteStepMoves"
import { useShowTaskDetails } from "../rightbar/use-right-panel"
import { useActiveNoteId, useSelectTask } from "@/contexts/use-tabs"
import { useIsActiveDraft } from "@/contexts/use-template-drafts"
import { useIsInTaskMultiSelection } from "./use-task-selection"
import { TaskSelectionMenuItems } from "./TaskSelectionMenu"
import { DialogTaskTags } from "@/components/tags/DialogTaskTags"

type ButtonMenuTaskProps = {
    task: Task
    onAddSubtask?: () => void
    /** Starts the inline edit of the text (once the menu has given the focus back). */
    onRename?: () => void
    /** Opens the description dialog (owned by the row, which also opens it from its own buttons). */
    onEditDescription: () => void
    /** Whether the subtasks are shown; with {@link onToggleSubtasks} it gives the "Collapse / Expand subtasks" entry (only on a task that has subtasks). */
    subtasksOpen?: boolean
    onToggleSubtasks?: () => void
    /** The task row: right click on it opens this menu, its <ItemMenuButton /> opens it below the button. */
    children: ReactElement
}

export const ButtonMenuTask = ({ task, onAddSubtask, onRename, onEditDescription, subtasksOpen = true, onToggleSubtasks, children }: ButtonMenuTaskProps) => {
    const { t } = useTranslation()
    // The inline input is opened once the menu has given the focus back, otherwise the input would lose it
    const { request: requestAddSubtask, onCloseAutoFocus: addSubtaskAfterClose } = useAfterMenuClose(onAddSubtask)
    const { request: requestRename, onCloseAutoFocus: renameAfterClose } = useAfterMenuClose(onRename)
    const menu = useItemMenuState()
    const [isDeleteTaskOpen, setDeleteTaskOpen] = useState(false)
    const [isTagsOpen, setTagsOpen] = useState(false)
    const { updateTaskPriority, updateTaskDescription } = useWorkspaceActions()
    const activeId = useActiveNoteId()
    const isDraft = useIsActiveDraft()
    const { patchTask, removeTask } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    const { addColorItem, archive } = useItemMutations("task", patchTask, removeTask)
    const selectTask = useSelectTask()
    const showTaskDetails = useShowTaskDetails()
    const multi = useIsInTaskMultiSelection(task.id)

    const handleEditPriority = async () => {
        // Optimistic: the cached tree is updated at once and restored if the write fails
        const rollback = patchTask(task.id, { priority: !task.priority })
        try {
            await updateTaskPriority(task.id, !task.priority)
            recorder.taskPriority(task.id, task.text, !!task.priority, !task.priority)
        } catch {
            rollback()
            toast.error(t("tasks.errors.priority"))
        } finally {
            menu.close()
        }
    }

    const handleDescription = async () => {
        if (task.description) {
            const rollback = patchTask(task.id, { description: "" })
            try {
                await updateTaskDescription(task.id, undefined)
                recorder.taskDescription(task.id, task.text, task.description ?? "", "")
            } catch (err) {
                rollback()
                reportError(err, getErrorMessage(err))
            } finally {
                menu.close()
            }
        }
        else {
            menu.close()
            onEditDescription()
        }
    }

    // Removed from the open note at once (put back if the write fails), with its subtasks; no confirmation, undo brings it back
    const handleArchive = () => {
        menu.close()
        return archive(task.id, task.text)
    }

    // The dialogs call it after their write succeeded: the cached tree needs no reload
    const noReload = async () => { }

    // Groups, apart by a separator: add, edit, move, the rest, delete (the same order in the menus of sections and groups)
    const singleItems = (
        <MenuGroup className="flex flex-col gap-1">
            <ButtonInPopover
                text={t("tasks.addSubtask")}
                type="addSubtask"
                onClick={() => { requestAddSubtask(); menu.close() }}
            />
            {onToggleSubtasks && task.subtasks.length > 0 &&
                <ButtonInPopover
                    text={subtasksOpen ? t("tasks.menu.collapseSubtasks") : t("tasks.menu.expandSubtasks")}
                    type={subtasksOpen ? "collapseAll" : "expandAll"}
                    onClick={() => { onToggleSubtasks(); menu.close() }}
                />}
            <ButtonInPopover
                text={task.description ? t("tasks.menu.removeDescription") : t("tasks.menu.addDescription")}
                type={task.description ? 'removeDescription' : 'addDescription'}
                onClick={() => { handleDescription() }}
            />
            <ButtonInPopover
                text={task.priority ? t("tasks.menu.removePriority") : t("tasks.menu.addPriority")}
                type={task.priority ? 'removePriority' : 'addPriority'}
                onClick={() => { handleEditPriority(); menu.close() }}
            />
            <ButtonInPopover
                text={t("tags.menu")}
                type="tags"
                onClick={() => { setTagsOpen(true); menu.close() }}
            />
            <Separator />
            <ButtonInPopover
                text={t("common.rename")}
                type="rename"
                onClick={() => { requestRename(); menu.close() }}
            />
            <ColorSubmenu
                item={task}
                itemType="task"
                addColorItem={addColorItem}
                getItemId={activeId ?? undefined}
                getItemData={noReload}
                onDone={menu.close}
            />
            <Separator />
            <TaskStepMoves taskId={task.id} onDone={menu.close} />
            <TaskMoveSubmenu taskId={task.id} onDone={menu.close} />
            <Separator />
            <ButtonInPopover
                text={t("details.showTask")}
                type="details"
                onClick={() => { if (showTaskDetails) showTaskDetails(task.id); else selectTask(task.id); menu.close() }}
            />
            {!isDraft && <ButtonInPopover
                text={t("menu.archive")}
                type="archive"
                onClick={() => { void handleArchive() }}
            />}
            <Separator />
            <ButtonInPopover
                text={t("common.delete")}
                type="delete"
                destructive
                onClick={() => {
                    setDeleteTaskOpen(true)
                    menu.close()
                }}
            />
        </MenuGroup>
    )

    // A selected task of a multi-selection acts on the whole selection
    const items = multi ? <TaskSelectionMenuItems menu={menu} /> : singleItems

    const dialogs = (
        <>
            {isTagsOpen && <DialogTaskTags open={isTagsOpen} onOpenChange={setTagsOpen} taskIds={[task.id]} />}
            {isDeleteTaskOpen &&
                <DialogDeleteItem
                    item={task}
                    itemType="task"
                    isOpen={isDeleteTaskOpen}
                    onOpenChange={setDeleteTaskOpen}
                    getItemId={activeId ?? undefined}
                    getItemData={async () => { removeTask(task.id) }}
                />}
        </>
    )

    return (
        <ItemMenu
            state={menu}
            items={items}
            dialogs={dialogs}
            contentClassName="p-1 rounded-xs"
            onCloseAutoFocus={(e) => {
                renameAfterClose(e)
                addSubtaskAfterClose(e)
            }}
        >
            {children}
        </ItemMenu>
    )
}
