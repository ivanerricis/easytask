import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager"
import type { Tag, Task } from "@/types/types"
import type { TemplateTask } from "@/types/template"
import { createSectionSnapshotter } from "@/db/queries/template"

/**
 * What the last Ctrl+C on the tasks put in the system clipboard: the plain text of the tasks (what other apps get) and
 * the full copy, kept in memory (the clipboard holds text only). It is only used while the clipboard still has that text.
 */
let copied: { text: string, tasks: TemplateTask[] } | null = null

/** A task with its subtasks as a snapshot (description, color, priority, completed state and tags by name). */
export function snapshotTasks(tasks: readonly Task[], tags: readonly Tag[]): TemplateTask[] {
    // The snapshotter reads flat rows: the tree is flattened, with the parent of every subtask
    const rows: Task[] = []
    const add = (task: Task, parentId: number | null) => {
        rows.push({ ...task, sectionID: 0, taskID: parentId })
        task.subtasks.forEach(subtask => add(subtask, task.id))
    }
    tasks.forEach(task => add(task, null))
    return createSectionSnapshotter(rows, tags)({ id: 0, title: "", color: null, archived_at: null, position: 0 }).tasks
}

/** Whether any of the tasks (or their subtasks) has a tag. */
export const usesTags = (tasks: readonly TemplateTask[]): boolean =>
    tasks.some(task => (task.tags?.length ?? 0) > 0 || usesTags(task.subtasks))

/** The text of the tasks, one per line, the subtasks indented by two spaces per level. */
export function tasksToText(tasks: readonly TemplateTask[], depth = 0): string {
    return tasks.map(task => [`${"  ".repeat(depth)}${task.text}`, ...(task.subtasks.length > 0 ? [tasksToText(task.subtasks, depth + 1)] : [])].join("\n")).join("\n")
}

/**
 * Copies tasks: their text goes to the system clipboard and the full copy stays in memory for {@link readCopiedTasks}.
 * @returns false when the clipboard could not be written (nothing is kept).
 */
export async function copyTasks(tasks: readonly TemplateTask[]): Promise<boolean> {
    if (tasks.length === 0) return false
    const text = tasksToText(tasks)
    try {
        await writeText(text)
    } catch {
        copied = null
        return false
    }
    copied = { text, tasks: structuredClone(tasks) as TemplateTask[] }
    return true
}

/** The tasks copied by EasyTask, or null when the clipboard no longer has the text of that copy (something else was copied since). */
export async function readCopiedTasks(): Promise<TemplateTask[] | null> {
    if (!copied) return null
    try {
        if ((await readText()) !== copied.text) return null
    } catch {
        return null
    }
    return structuredClone(copied.tasks) as TemplateTask[]
}

/** Forgets the copy (for the tests). */
export function clearCopiedTasks() {
    copied = null
}
