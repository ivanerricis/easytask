import type { NoteDataTree, Task } from "@/types/types"
import { taskSections } from "@/lib/group-sections"
import { dueStatus } from "@/lib/due-date"
import { isNotified, type NotifiedMap } from "@/lib/due-notifications"

type Overdue = Task & { due_date: string }

/** The open tasks of a note (subtasks included) whose due date or time has passed, and that were not handled yet for that due date. */
export function newlyOverdueTasks(tree: NoteDataTree, handled: NotifiedMap, now: Date): Overdue[] {
    const found: Overdue[] = []
    const visit = (tasks: Task[]) => {
        for (const task of tasks) {
            if (task.due_date && dueStatus(task, now) === "overdue" && !isNotified(handled, { id: task.id, due_date: task.due_date, due_time: task.due_time ?? null }))
                found.push(task as Overdue)
            visit(task.subtasks)
        }
    }
    for (const group of tree.groups)
        for (const section of taskSections(group)) visit(section.tasks)
    return found
}
