import type { TaskMoveTarget } from "@/db/queries/move"
import { withRollback } from "../../with-rollback"
import type { UndoCommand } from "../stack"
import { makeLabel, manyCommand, type UndoHelpers } from "./helpers"
import type { TaskMoveStep, TaskPlace } from "./types"

/** The commands on tasks: completion, priority, description and moves. */
export function taskCommands(h: UndoHelpers) {
    const { workspace, note, reloadNote, manyLabel } = h

    const moveTaskTo = async (taskId: number, target: TaskMoveTarget, index: number) => {
        await withRollback(note.applyTaskMove(taskId, target, index), () => workspace.moveTask(taskId, target, index))
    }

    const setTaskFlag = (key: "completed" | "priority", taskId: number) => async (value: boolean) => {
        await withRollback(note.patchTask(taskId, { [key]: value }), () =>
            key === "completed" ? workspace.updateTaskCompletion(taskId, value) : workspace.updateTaskPriority(taskId, value))
    }

    const setTaskDescription = (taskId: number) => async (description: string) => {
        await withRollback(note.patchTask(taskId, { description }), () =>
            workspace.updateTaskDescription(taskId, description !== "" ? description : undefined))
    }

    return {
        taskCompletion: (taskId: number, name: string, before: boolean, after: boolean): UndoCommand => {
            const apply = setTaskFlag("completed", taskId)
            return {
                label: makeLabel(after ? "complete" : "reopen", "task", name),
                undo: () => apply(before),
                redo: () => apply(after),
            }
        },

        taskPriority: (taskId: number, name: string, before: boolean, after: boolean): UndoCommand => {
            const apply = setTaskFlag("priority", taskId)
            return {
                label: makeLabel(after ? "addPriority" : "removePriority", "task", name),
                undo: () => apply(before),
                redo: () => apply(after),
            }
        },

        taskDescription: (taskId: number, name: string, before: string, after: string): UndoCommand => {
            const apply = setTaskDescription(taskId)
            return {
                label: makeLabel("description", "task", name),
                undo: () => apply(before),
                redo: () => apply(after),
            }
        },

        /**
         * Move of several tasks as ONE step. `steps` are in the order they were run, each with the place the task had right
         * before its step: undone by running them backwards, redone in order (the open note is reloaded once at the end).
         */
        taskMoveMany: (steps: TaskMoveStep[]): UndoCommand => manyCommand({
            label: manyLabel("moveMany", steps.length),
            items: steps,
            undoEach: step => moveTaskTo(step.id, { sectionId: step.from.sectionId, parentTaskId: step.from.parentTaskId }, step.from.index),
            redoEach: step => moveTaskTo(step.id, { sectionId: step.to.sectionId, parentTaskId: step.to.parentTaskId }, step.to.index),
            reloadUndo: reloadNote,
            reloadRedo: reloadNote,
            reloadEvenOnFailure: true,
        }),

        /** Move of a task (with its subtasks) to another section or parent task. */
        taskMove: (taskId: number, name: string, from: TaskPlace, to: TaskPlace): UndoCommand => ({
            label: makeLabel("move", "task", name),
            undo: () => moveTaskTo(taskId, { sectionId: from.sectionId, parentTaskId: from.parentTaskId }, from.index),
            redo: () => moveTaskTo(taskId, { sectionId: to.sectionId, parentTaskId: to.parentTaskId }, to.index),
        }),
    }
}
