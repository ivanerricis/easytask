import { useTranslation } from "react-i18next"
import type { Task } from "@/types/types"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DueEditor } from "./DueEditor"
import { useSetTaskDue } from "./use-set-task-due"

type DialogTaskDueProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    task: Pick<Task, "id" | "text" | "due_date" | "due_time">
}

/** The due date of a task, from its menu: pick a date and an optional time, or remove it. */
export const DialogTaskDue = ({ open, onOpenChange, task }: DialogTaskDueProps) => {
    const { t } = useTranslation()
    const setDue = useSetTaskDue()
    const run = async (date: string | null, time: string | null) => {
        if (await setDue(task, { date, time })) onOpenChange(false)
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* The dialog is in a portal but React events still bubble to the row: keep them out */}
            <DialogContent className="sm:max-w-xs" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>{t("tasks.due.title")}</DialogTitle>
                    <DialogDescription className="truncate">{task.text}</DialogDescription>
                </DialogHeader>
                <DueEditor
                    value={{ date: task.due_date ?? null, time: task.due_time ?? null }}
                    onSave={value => { void run(value.date, value.time) }}
                    onClear={() => { void run(null, null) }}
                />
            </DialogContent>
        </Dialog>
    )
}
