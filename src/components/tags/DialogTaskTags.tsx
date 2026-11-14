import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TagPicker } from "./TagPicker"

type DialogTaskTagsProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The tasks whose tags are edited (one task, or the selected ones). */
    taskIds: readonly number[]
}

/** The tags of one task or of the selected tasks: the checkable list of the workspace tags (see TagPicker). Changes apply at once. */
export const DialogTaskTags = ({ open, onOpenChange, taskIds }: DialogTaskTagsProps) => {
    const { t } = useTranslation()
    const many = taskIds.length > 1
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" onClick={event => event.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>{many ? t("tags.dialogTitleMany", { count: taskIds.length }) : t("tags.dialogTitle")}</DialogTitle>
                    <DialogDescription>{many ? t("tags.dialogDescriptionMany") : t("tags.dialogDescription")}</DialogDescription>
                </DialogHeader>
                <TagPicker taskIds={taskIds} />
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>{t("tags.done")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
