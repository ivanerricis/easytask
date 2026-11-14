import { usePreference } from "@/contexts/use-preference"
import type { TaskDensity } from "@/lib/store/preferences"

/**
 * Class names for the task rows of a note, one entry per density.
 * Full class names (no interpolation) so Tailwind can see them.
 * "normal" is the original look: py-1.5, text-sm.
 * The offsets of the tree connectors follow the padding and the line height of the text (they point at the checkbox).
 */
export type TaskDensityClasses = {
    /** Vertical padding of a task row. */
    padding: string
    /** Text of the task (and of the field that renames it). */
    text: string
    /** Space under the subtasks of a task. */
    subtasks: string
    /** Top margin that centers the checkbox of a task on the first line of its text. */
    checkbox: string
    /** Same for the smaller checkbox of a subtask. */
    subtaskCheckbox: string
    /** Horizontal tick of a subtask, at the middle of its checkbox. */
    tickTop: string
    /** The field of a new subtask. */
    input: string
}

export const TASK_DENSITIES: Record<TaskDensity, TaskDensityClasses> = {
    compact: {
        padding: "py-0.5",
        text: "text-xs",
        subtasks: "mb-0.5",
        checkbox: "mt-0",
        subtaskCheckbox: "mt-px",
        tickTop: "top-[10px]",
        input: "h-5 text-xs md:text-xs",
    },
    normal: {
        padding: "py-1.5",
        text: "text-sm",
        subtasks: "mb-1",
        checkbox: "mt-0.5",
        subtaskCheckbox: "mt-[3px]",
        tickTop: "top-[16px]",
        input: "h-6 text-sm md:text-sm",
    },
    large: {
        padding: "py-2.5",
        text: "text-base",
        subtasks: "mb-1.5",
        checkbox: "mt-1",
        subtaskCheckbox: "mt-[5px]",
        tickTop: "top-[22px]",
        input: "h-7 text-base md:text-base",
    },
}

/** Density chosen in the settings. */
export const useTaskDensity = (): TaskDensity => usePreference(p => p.taskDensity) ?? "normal"
