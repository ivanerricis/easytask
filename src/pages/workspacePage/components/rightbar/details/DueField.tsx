import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { Task } from "@/types/types"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DueBadge } from "@/components/due/DueBadge"
import { DueEditor } from "@/components/due/DueEditor"
import { useSetTaskDue } from "@/components/due/use-set-task-due"
import { sectionTitle } from "./fields"

/** The due date of a task in the details panel: the badge (or "no due date") that opens the picker. */
export const DueField = ({ task }: { task: Task }) => {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const setDue = useSetTaskDue()
    const run = async (date: string | null, time: string | null) => {
        if (await setDue(task, { date, time })) setOpen(false)
    }
    return (
        <div className="flex items-center justify-between gap-2">
            <h3 className={sectionTitle}>{t("tasks.due.title")}</h3>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" aria-label={t("tasks.due.title")} data-testid="details-due">
                        {task.due_date ? <DueBadge task={task} /> : <span className="text-xs">{t("tasks.due.none")}</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto" align="end">
                    <DueEditor
                        key={`${task.due_date ?? ""}${task.due_time ?? ""}`}
                        value={{ date: task.due_date ?? null, time: task.due_time ?? null }}
                        onSave={value => { void run(value.date, value.time) }}
                        onClear={() => { void run(null, null) }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}
