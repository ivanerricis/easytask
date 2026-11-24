import { useCallback } from "react"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { usePreferences } from "@/contexts/use-preferences"
import { useTagFilter } from "@/contexts/use-tag-filter"
import { useNoteMoves } from "./note-dnd-state"
import { getTaskStep, type Step } from "./note-steps"

/**
 * One step of any task among its siblings, for the keyboard (Alt+Up / Alt+Down) of a whole list. Reads the tree lazily when
 * called, so the list does not re-render with every change of the note. Resolves to whether the task moved (false at the
 * edge of the list).
 */
export function useTaskStepMover(): (taskId: number, step: Step) => Promise<boolean> {
    const { getNoteTree } = useActiveNoteActions()
    const { hideCompletedTasks, completedTasksLast } = usePreferences()
    const tagFilter = useTagFilter()
    const { moveTaskTo } = useNoteMoves()
    return useCallback(async (taskId: number, step: Step) => {
        const tree = getNoteTree()
        const target = tree ? getTaskStep(tree, taskId, step, hideCompletedTasks, completedTasksLast, tagFilter) : null
        if (!target) return false
        await moveTaskTo(taskId, target)
        return true
    }, [getNoteTree, hideCompletedTasks, completedTasksLast, tagFilter, moveTaskTo])
}

/** {@link useTaskStepMover} for one task. */
export function useTaskStepMove(taskId: number): (step: Step) => Promise<boolean> {
    const move = useTaskStepMover()
    return useCallback((step: Step) => move(taskId, step), [move, taskId])
}
