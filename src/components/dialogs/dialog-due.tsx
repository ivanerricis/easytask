import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DueTasksList } from "@/components/due/DueTasksList"
import { useWorkspace } from "@/contexts/use-workspace"

type DialogDueProps = {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

/** The tasks of the workspace that are overdue or due within a week, in a dialog like the trash and the archive. */
export const DialogDue = ({ isOpen, onOpenChange }: DialogDueProps) => {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t("tasks.dueView.title")}</DialogTitle>
                    <DialogDescription>{t("tasks.dueView.description")}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <DueTasksList workspaceId={currentWorkspace?.id} />
                </div>
            </DialogContent>
        </Dialog>
    )
}
