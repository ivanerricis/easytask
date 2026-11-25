import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DueAgenda } from "@/components/due/DueAgenda"
import { useWorkspace } from "@/contexts/use-workspace"
import { requestOpenTask } from "@/lib/open-task-request"

type DialogDueProps = {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

/** The due tasks of the workspace as an agenda by day, in a dialog like the trash and the archive; a task opens its note on it. */
export const DialogDue = ({ isOpen, onOpenChange }: DialogDueProps) => {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t("tasks.dueView.title")}</DialogTitle>
                    <DialogDescription className="sr-only">{t("tasks.dueView.description")}</DialogDescription>
                </DialogHeader>
                <DueAgenda
                    workspaceId={currentWorkspace?.id}
                    onOpenTask={task => {
                        requestOpenTask({ workspaceId: task.workspaceID, noteId: task.noteID, taskId: task.id })
                        onOpenChange(false)
                    }}
                />
            </DialogContent>
        </Dialog>
    )
}
