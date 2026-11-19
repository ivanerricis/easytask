import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TagPicker } from "./TagPicker"

type DialogGroupTagsProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The group whose tags are edited. */
    groupId: number
}

/** The tags of a group: the checkable list of the workspace tags (see TagPicker). Changes apply at once. */
export const DialogGroupTags = ({ open, onOpenChange, groupId }: DialogGroupTagsProps) => {
    const { t } = useTranslation()
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* The dialog is in a portal but React events still bubble to the group and the note: keep them out */}
            <DialogContent className="sm:max-w-md" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>{t("tags.groupDialogTitle")}</DialogTitle>
                    <DialogDescription>{t("tags.groupDialogDescription")}</DialogDescription>
                </DialogHeader>
                <TagPicker groupIds={[groupId]} />
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>{t("tags.done")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
