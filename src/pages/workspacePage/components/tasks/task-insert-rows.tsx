import type { ReactNode } from "react"
import type { Task as TaskType } from "@/types/types"
import { TaskInsertLine } from "./TaskInsertLine"
import { InsertTaskInput } from "./InsertTaskInput"
import type { TaskOrder } from "@/lib/task-order"

type InsertParent = { sectionId: number } | { parentTaskId: number }

/**
 * The task each "+" line of a list inserts after, one per visible task (the line above it). The line above the first visible
 * task inserts right before it: the task before it in the complete list (null = first place), so the hidden completed ones
 * stay where they are. Every other line inserts after the visible task above it.
 * A new task is open, so it could not stay among the completed ones of a sorted list (no line, `undefined`, there):
 * - "open-first": the line above the first completed task inserts after the last open one (the task above it in the drawn
 *   order), and there is none between two completed tasks;
 * - "done-first": there is none above a completed task, and the line above the first open task inserts right before it (the
 *   task before it in the complete list).
 * @category Tasks
 */
export const insertAnchors = (all: TaskType[], visible: TaskType[], order: TaskOrder = "manual"): (number | null | undefined)[] =>
    visible.map((task, index) => {
        if (order === "done-first" && task.completed) return undefined
        if (index > 0) {
            if (order === "open-first" && task.completed && visible[index - 1].completed) return undefined
            if (order === "done-first" && visible[index - 1].completed) {
                const stored = all.indexOf(task)
                return stored > 0 ? all[stored - 1].id : null
            }
            return visible[index - 1].id
        }
        const firstIndex = all.indexOf(visible[0])
        return firstIndex > 0 ? all[firstIndex - 1].id : null
    })

type RowsOptions = {
    /** The complete list of the siblings, hidden ones included. */
    all: TaskType[]
    visible: TaskType[]
    listKey: string
    parent: InsertParent
    /** Nesting level of the tasks of the list (the field of a new one is indented like them). */
    depth: number
    /** The first line of a list that clips its content: its zone does not stick out above. */
    clipped?: boolean
    /** The order the tasks are drawn in (see insertAnchors). */
    order?: TaskOrder
    renderTask: (task: TaskType) => ReactNode
}

/**
 * The flat rows of a list of tasks: for each visible task a "+" line above it, the task, and the field of a new task right
 * under it (shown only while that place is the open one). No Fragments and stable keys: React moves a field instead of
 * mounting it again. Nothing goes under the last task (the button of a new task is there), and the field for the top of the
 * list sits before the first row.
 * @category Tasks
 */
export const taskRowsWithInsert = ({ all, visible, listKey, parent, depth, clipped, order = "manual", renderTask }: RowsOptions): ReactNode[] => {
    if (visible.length === 0) return []
    const anchors = insertAnchors(all, visible, order)
    const rows: ReactNode[] = [
        <InsertTaskInput key="insert-top" listKey={listKey} afterTaskId={anchors[0] ?? null} parent={parent} depth={depth} />,
    ]
    visible.forEach((task, index) => {
        const anchor = anchors[index]
        // No anchor, no line (where a new open task could not stay, between the completed tasks of a sorted list)
        if (anchor !== undefined) rows.push(<TaskInsertLine key={"line-" + task.id} listKey={listKey} afterTaskId={anchor} first={clipped && index === 0} />)
        rows.push(renderTask(task))
        // The field right under a task: below the last one too, where it appears when the open place moves after a new task
        rows.push(<InsertTaskInput key={"insert-" + task.id} listKey={listKey} afterTaskId={task.id} parent={parent} depth={depth} />)
    })
    return rows
}
