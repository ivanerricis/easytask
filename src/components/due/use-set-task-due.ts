import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { Task } from "@/types/types"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import type { DueValue } from "@/lib/due-date"
import { markDueSeen } from "@/lib/due-notify"

/**
 * Returns the function that sets or clears the due date of a task: the open note is updated at once (restored with an error
 * toast if the write fails) and the change is undoable. Resolves to false when it failed.
 */
export function useSetTaskDue() {
    const { t } = useTranslation()
    const { updateTaskDue } = useWorkspaceActions()
    const { patchTask } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    return useCallback(async (task: Pick<Task, "id" | "text" | "due_date" | "due_time">, after: DueValue): Promise<boolean> => {
        const before: DueValue = { date: task.due_date ?? null, time: task.due_time ?? null }
        if (before.date === after.date && before.time === after.time) return true
        const rollback = patchTask(task.id, { due_date: after.date, due_time: after.time })
        try {
            await updateTaskDue(task.id, after.date, after.time)
            recorder.taskDue(task.id, task.text, before, after)
            if (after.date) void markDueSeen({ id: task.id, due_date: after.date, due_time: after.time })
            return true
        } catch {
            rollback()
            toast.error(t("tasks.errors.due"))
            return false
        }
    }, [patchTask, recorder, t, updateTaskDue])
}
