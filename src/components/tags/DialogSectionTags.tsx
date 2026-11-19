import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogFooterActions, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TagPicker } from "./TagPicker"

type DialogSectionTagsProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The section whose tags are edited. */
    sectionId: number
}

/** The tags of a section: the checkable list of the workspace tags (see TagPicker). Changes apply at once. */
export const DialogSectionTags = ({ open, onOpenChange, sectionId }: DialogSectionTagsProps) => {
    const { t } = useTranslation()
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* The dialog is in a portal but React events still bubble to the section and the note: keep them out */}
            <DialogContent className="sm:max-w-md" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>{t("tags.sectionDialogTitle")}</DialogTitle>
                    <DialogDescription>{t("tags.sectionDialogDescription")}</DialogDescription>
                </DialogHeader>
                <TagPicker sectionIds={[sectionId]} />
                <DialogFooter>
                    <DialogFooterActions>
                        <Button onClick={() => onOpenChange(false)}>{t("tags.done")}</Button>
                    </DialogFooterActions>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
