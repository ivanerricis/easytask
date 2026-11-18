import { memo } from "react"
import { useTranslation } from "react-i18next"
import type { Task as TaskType } from "@/types/types"
import { usePreference } from "@/contexts/use-preference"
import { Task } from "./Task"
import { TaskTree } from "./TaskTree"
import { useTaskDensity } from "./task-density"
import { taskRowsWithInsert } from "./task-insert-rows"
import { effectiveTaskOrder, isTaskOrderLocked, type TaskOrder } from "@/lib/task-order"
import { countHiddenCompleted, orderedVisibleTasks } from "../section/hide-completed"

type TaskListProps = {
    /** The top level tasks of a section (the default section of a group included), in order. */
    tasks: TaskType[]
    /** Identifies the list for the field of a new task ("s-<sectionId>"). */
    listKey: string
    /** The section that holds the tasks (a primitive, so the memo holds). */
    sectionId: number
    /** The order chosen for the section (null: follow the preference "completed tasks last"; the direct tasks of a group have none). */
    sectionOrder?: TaskOrder | null
    /** The list is the first thing of a box that clips its content (the line above the first task stays inside). */
    clipped?: boolean
    /** Accessible name of the list ("Tasks of <section>"). */
    label?: string
}

/**
 * The rows of the top level tasks of a section, with the "hide completed" rule and its "N hidden" note.
 * Tasks are nested recursively: each Task renders its own subtasks (at any depth), so its memo holds. Only a fully completed
 * subtree is hidden (see isHiddenTask): a completed task with an open descendant stays, and its subtasks are filtered by the
 * same rule. The Task still receives the full task (its progress counts every subtask).
 * @category Note
 */
export const TaskList = memo(({ tasks, listKey, sectionId, sectionOrder, clipped, label }: TaskListProps) => {
    const { t } = useTranslation()
    const hideCompletedTasks = usePreference(p => p.hideCompletedTasks)
    const completedTasksLast = usePreference(p => p.completedTasksLast) ?? false
    const showSubtaskCount = usePreference(p => p.showSubtaskCount) ?? true
    const renameOnClick = usePreference(p => p.renameOnClick) ?? true
    const density = useTaskDensity()
    const hiddenCount = hideCompletedTasks ? countHiddenCompleted(tasks) : 0
    const order = effectiveTaskOrder(sectionOrder, completedTasksLast)
    const orderLocked = isTaskOrderLocked(sectionOrder)
    const visible = orderedVisibleTasks(tasks, { hideCompleted: hideCompletedTasks, order })

    return (
        <>
            {visible.length > 0 && <TaskTree listKey={listKey} label={label ?? t("tasks.list")}>
                {taskRowsWithInsert({
                all: tasks,
                visible,
                listKey,
                parent: { sectionId },
                depth: 0,
                clipped,
                order,
                renderTask: task => <Task key={task.id} task={task} treeKey={listKey} isFirst={task === visible[0]} showSubtaskCount={showSubtaskCount} hideCompleted={hideCompletedTasks} order={order} orderLocked={orderLocked} renameOnClick={renameOnClick} density={density} />,
                })}
            </TaskTree>}
            {hiddenCount > 0 &&
                <p className="px-2 py-1 text-xs text-muted-foreground" data-testid="hidden-completed">
                    {t("tasks.hiddenCompleted", { count: hiddenCount })}
                </p>}
        </>
    )
})
