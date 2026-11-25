import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { toggleChecklistItem } from "@/lib/markdown-lite"
import type { Task } from "@/types/types"

/**
 * The one way a task description is written: the cached tree is updated at once and restored if the write fails (the error is
 * thrown), and a change is recorded for undo. The description dialog, the details panel and a click on a checklist box all use it.
 */
export function useTaskDescriptionWriter(task: Task) {
    const { updateTaskDescription } = useWorkspaceActions()
    const { patchTask } = useActiveNoteActions()
    const recorder = useUndoRecorder()

    const write = async (value: string) => {
        const before = task.description ?? ""
        const rollback = patchTask(task.id, { description: value })
        try {
            await updateTaskDescription(task.id, value !== "" ? value : undefined)
        } catch (err) {
            rollback()
            throw err
        }
        if (value !== before) recorder.taskDescription(task.id, task.text, before, value)
    }

    /** Ticks or unticks the checklist item at `line` of the saved description. */
    const toggleItem = async (line: number) => {
        const next = toggleChecklistItem(task.description ?? "", line)
        if (next !== null) await write(next)
    }

    return { write, toggleItem }
}
