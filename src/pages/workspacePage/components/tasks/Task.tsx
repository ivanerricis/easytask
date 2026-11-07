import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/ui/checkbox"
import type { Task as TaskType } from "@/types/types"
import { ButtonMenuTask } from "./ButtonMenuTask"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { reportError } from "@/lib/report-error"
import { withRollback } from "@/contexts/with-rollback"
import { useInlineEdit } from "@/hooks/use-inline-edit"
import { useAutomations } from "@/hooks/use-automations"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { cn, getErrorMessage, hexToRgba } from "@/lib/utils"
import React, { useCallback, useEffect, useRef, useState, type HTMLAttributes } from "react"
import { AddTask } from "./AddTask"
import { taskRowsWithInsert } from "./task-insert-rows"
import { useTaskInsertStore } from "./task-insert-state"
import { DialogTaskDescription } from "./DialogTaskDescription"
import { useNoteDrag, useNoteDrop } from "../note-dnd-state"
import { registerShiftNode, taskNodeKey } from "../note-dnd-shift"
import type { DropZone } from "../note-dnd"
import { useIsTaskSelected, useSubtasksOpen } from "@/contexts/use-tabs"
import { orderedVisibleTasks } from "../section/hide-completed"
import { DropLine } from "../sidebar/DropLine"
import type { TaskDensity } from "@/lib/store/preferences"
import { TASK_DENSITIES } from "./task-density"
import { SelectionMark } from "../sidebar/SelectionMark"
import { useIsTaskMultiSelected } from "./use-task-selection"
import { useSearchHighlight } from "../note-search-context"
import { useIsTaskTabStop } from "./task-tab-stop"
import { useTaskRowKeys } from "./use-task-row-keys"
import { useTaskRowPointer } from "./use-task-row-pointer"
import { TaskConnectors, TaskConnectorTick, TaskChildrenLine } from "./TaskConnectors"
import { TaskRowText } from "./TaskRowText"
import { TaskRowBadges } from "./TaskRowBadges"
import { TaskRowToolbar } from "./TaskRowToolbar"

type TaskProps = {
    task: TaskType
    /** Nesting level: 0 for a task of the section, 1+ for subtasks. */
    depth?: number
    /** Shows how many direct subtasks are completed (preference "Show completed subtasks"). */
    showSubtaskCount?: boolean
    /** Hides the fully completed subtasks (see isHiddenTask). Only primitive props: the subtasks are rendered here, so the memo holds. */
    hideCompleted?: boolean
    /** Shows the completed subtasks after the open ones (display only). A primitive, so the memo holds. */
    completedLast?: boolean
    /** Whether a click on the text starts the rename (preference "Rename on click"); otherwise only the menu does. */
    renameOnClick?: boolean
    /** Spacing and text size of the rows (preference "Task density"); a primitive prop, so the memo holds when other preferences change. */
    density?: TaskDensity
    /** The list (tree) the task belongs to, for its roving tabindex; the subtasks belong to the list of their ancestor. */
    treeKey?: string
    /** The first task of the list: the tab stop while no task has taken the focus. */
    isFirst?: boolean
}

type TaskRowProps = TaskProps & {
    /** Ref of the row: it is a drop target and a draggable (the hooks live in {@link Task}). */
    setRowRef: (node: HTMLElement | null) => void
    /** Ref of the outer wrapper (the row and its subtasks): the live drag moves it with a transform, see note-dnd-shift. */
    setWrapRef: (node: HTMLElement | null) => void
    dragProps: HTMLAttributes<HTMLElement>
    isDragging: boolean
    /**
     * Drop zone highlighted on this row while a task is dragged over it (null on every other row, also while a task is
     * dragged: a flag shared by all the rows would re-render all of them when a drag starts and ends).
     */
    dropZone: DropZone | null
}

/**
 * The drag & drop hooks of dnd-kit re-render the component that calls them every time the dragged item moves over another
 * one, so they live in this thin shell: the heavy row below is memoized and only re-renders when its own props change
 * (a note with hundreds of tasks would otherwise re-render every row on every step of a drag).
 */
export const Task = React.memo((props: TaskProps) => {
    const { setNodeRef: setDropRef, zone, active } = useNoteDrop("task", props.task.id)
    const { setNodeRef: setDragRef, dragProps, isDragging } = useNoteDrag("task", props.task.id)

    // The row (without its subtasks) is both a drop target and the dimmed source while it is dragged
    const setRowRef = useCallback((node: HTMLElement | null) => {
        setDropRef(node)
        setDragRef(node)
    }, [setDropRef, setDragRef])

    // The wrapper is registered by the shell, so the ref stays the same function and the memoized row does not re-render for it
    const taskId = props.task.id
    const setWrapRef = useCallback((node: HTMLElement | null) => registerShiftNode(taskNodeKey(taskId), node), [taskId])

    return <TaskRow {...props} setRowRef={setRowRef} setWrapRef={setWrapRef} dragProps={dragProps} isDragging={isDragging} dropZone={active?.kind === "task" ? zone : null} />
})

const TaskRow = React.memo(({ task, depth = 0, showSubtaskCount = true, hideCompleted = false, completedLast = false, renameOnClick = true, density = "normal", treeKey = "", isFirst = false, setRowRef, setWrapRef, dragProps, isDragging, dropZone }: TaskRowProps) => {
    const { t } = useTranslation()
    const [descriptionOpen, setDescriptionOpen] = useState(false)
    const [isAddingSubtask, setAddingSubtask] = useState(false)
    const { updateTaskCompletion, renameItem } = useWorkspaceActions()
    const { patchTask } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    const colorAlpha = useColorAlpha()
    const { dispatch } = useAutomations()
    const { editing: isTextAreaOpen, error, start: startEdit, inputProps } = useInlineEdit<HTMLTextAreaElement>({
        value: task.text,
        errorMessage: err => t("tasks.errors.rename", { message: getErrorMessage(err) }),
        onCommit: async next => {
            // Optimistic: the cached tree is updated at once and restored if the write fails
            await withRollback(patchTask(task.id, { text: next }), () => renameItem("task", task.id, next))
            recorder.rename("task", task.id, task.text, next)
        },
    })
    const selected = useIsTaskSelected(task.id)
    const search = useSearchHighlight("task", task.id)
    const insertStore = useTaskInsertStore()
    const multiSelected = useIsTaskMultiSelected(task.id)
    const pointer = useTaskRowPointer(task.id)
    // Roving tabindex of the list: one task is in the tab order, the others are reached with the arrows
    const tabStop = useIsTaskTabStop(treeKey, task.id, isFirst)
    // Only the tab stop of the list has its controls in the tab order: the other rows are reached with the arrows
    const inner = tabStop ? undefined : -1
    // Enter / Escape in the rename field give the focus back to the row (the field is removed, the focus would be lost)
    const rowElement = useRef<HTMLElement | null>(null)
    const refocusRow = useRef(false)
    const setRef = useCallback((node: HTMLElement | null) => {
        rowElement.current = node
        setRowRef(node)
    }, [setRowRef])
    const requestRefocus = useCallback(() => { refocusRow.current = true }, [])
    useEffect(() => {
        if (isTextAreaOpen || !refocusRow.current) return
        refocusRow.current = false
        if (!document.activeElement || document.activeElement === document.body) rowElement.current?.focus()
    }, [isTextAreaOpen])
    // Closed: the subtasks are not drawn (they stay in the note: counts, progress and "hide completed" still see them)
    const [subtasksOpen, toggleSubtasks] = useSubtasksOpen(task.id)
    const hasSubtasks = task.subtasks.length > 0
    const subtasksHidden = hasSubtasks && !subtasksOpen
    const isSubtask = depth > 0
    const sizes = TASK_DENSITIES[density]
    const doneSubtasks = task.subtasks.filter(subtask => subtask.completed).length
    const hasDescription = !!task.description?.trim()
    const showChildren = (hasSubtasks && subtasksOpen) || isAddingSubtask

    // A new subtask of a closed task opens it first, so that the new subtask is seen
    const startAddSubtask = () => {
        // The field at the bottom of the subtasks is the one open: a field of a "+" line elsewhere closes
        insertStore.claimEnd(`t-${task.id}`)
        if (!subtasksOpen) toggleSubtasks()
        setAddingSubtask(true)
    }

    const openDescription = useCallback(() => setDescriptionOpen(true), [])
    const closeAddSubtask = useCallback(() => setAddingSubtask(false), [])

    const handleCheckedChange = async () => {
        // Optimistic: the cached tree is updated at once and restored if the write fails
        const rollback = patchTask(task.id, { completed: !task.completed })
        try {
            await updateTaskCompletion(task.id, !task.completed)
            recorder.taskCompletion(task.id, task.text, !!task.completed, !task.completed)
            void dispatch({ type: task.completed ? "task.reopened" : "task.completed", taskId: task.id })
        } catch (err) {
            rollback()
            reportError(err, t("tasks.errors.update", { message: getErrorMessage(err) }))
        }
    }

    const onRowKeyDown = useTaskRowKeys({ taskId: task.id, taskText: task.text, subtasksOpen, onToggleSubtasks: toggleSubtasks, onToggleCompleted: () => { void handleCheckedChange() }, onRename: startEdit })

    return (
        <div ref={setWrapRef} data-task-wrap={task.id} data-task-section={task.sectionID ?? undefined} className={cn(
            "relative flex flex-col items-center w-full border border-transparent transition-none",
            isSubtask ? "group/subtask subtask" : "border-b-border",
            isTextAreaOpen && (error ? "border border-destructive rounded-xs" : "border border-primary rounded-xs")
        )}>
            {isSubtask && <TaskConnectors depth={depth} sizes={sizes} />}
            <ButtonMenuTask task={task} onAddSubtask={startAddSubtask} onRename={startEdit} onEditDescription={openDescription} subtasksOpen={subtasksOpen} onToggleSubtasks={toggleSubtasks}>
                <div
                    ref={setRef}
                    {...dragProps}
                    {...pointer}
                    role="treeitem"
                    aria-level={depth + 1}
                    aria-expanded={hasSubtasks ? subtasksOpen : undefined}
                    aria-selected={selected || multiSelected}
                    aria-checked={!!task.completed}
                    aria-label={task.text}
                    tabIndex={tabStop ? 0 : -1}
                    onKeyDown={onRowKeyDown}
                    data-task-id={task.id}
                    data-selected={selected ? "true" : undefined}
                    aria-current={selected ? "true" : undefined}
                    data-multi-selected={multiSelected ? "true" : undefined}
                    className={cn(
                        "peer/row relative flex flex-col items-center w-full touch-none cursor-grab active:cursor-grabbing focus-visible:outline-3 focus-visible:outline-offset-[-2px]",
                        // Selected: a 2px bar in the primary colour on the left and a tint stronger than the hover one
                        selected && "bg-accent shadow-[inset_2px_0_0_0_var(--primary)]",
                        isDragging && "opacity-40",
                        (dropZone === "inside" || dropZone === "inside-start") && "bg-primary/15 ring-1 ring-inset ring-primary",
                    )}
                >
                    <DropLine zone={dropZone} outside />
                    <SelectionMark selected={multiSelected} />
                    {showChildren && <TaskChildrenLine isSubtask={isSubtask} sizes={sizes} />}
                    <div className="flex flex-col w-full">
                        {/* The color tints the whole row (light) besides the side bar (full color) */}
                        {task.color && colorAlpha.taskBackground && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundColor: hexToRgba(colorAlpha.task(), task.color) }}></div>}
                        {task.color && <div className="w-1 absolute left-0 top-0 h-full self-stretch" style={{ backgroundColor: task.color }}></div>}

                        <div className={cn("relative group flex min-w-0 items-start justify-between w-full px-1", sizes.padding)}>
                            <div className="flex min-w-0 items-start justify-between gap-2 ml-4 w-full">
                                <Checkbox
                                    checked={!!task.completed}
                                    onCheckedChange={handleCheckedChange}
                                    tabIndex={inner}
                                    aria-label={t("tasks.toggleCompleted", { text: task.text })}
                                    className={isSubtask ? cn("size-3.5", sizes.subtaskCheckbox) : sizes.checkbox}
                                />
                                <TaskRowText
                                    text={task.text}
                                    completed={!!task.completed}
                                    textClass={sizes.text}
                                    editing={isTextAreaOpen}
                                    error={error}
                                    inputProps={inputProps}
                                    searchQuery={search.query}
                                    searchActive={search.active}
                                    renameOnClick={renameOnClick}
                                    startEdit={startEdit}
                                    inner={inner}
                                    onEditEnd={requestRefocus}
                                />
                            </div>
                            <TaskRowBadges
                                hasDescription={hasDescription}
                                showSubtaskCount={showSubtaskCount}
                                subtasksHidden={subtasksHidden}
                                doneSubtasks={doneSubtasks}
                                totalSubtasks={task.subtasks.length}
                                priority={!!task.priority}
                                onOpenDescription={openDescription}
                            />
                            <TaskRowToolbar taskText={task.text} hasDescription={hasDescription} inner={inner} onOpenDescription={openDescription} onAddSubtask={startAddSubtask} />
                        </div>
                    </div>
                    {descriptionOpen && <DialogTaskDescription task={task} open={descriptionOpen} onOpenChange={setDescriptionOpen} />}
                </div>
            </ButtonMenuTask>
            {isSubtask && <TaskConnectorTick depth={depth} sizes={sizes} />}
            {/* Subtasks hang from the checkbox of their parent (see the tree connectors above) */}
            {showChildren && <div role="group" className={cn("flex flex-col self-stretch", sizes.subtasks, isSubtask ? "ml-[22px]" : "ml-6")}>
                {taskRowsWithInsert({
                    all: task.subtasks,
                    visible: orderedVisibleTasks(task.subtasks, { hideCompleted, completedLast }),
                    listKey: `t-${task.id}`,
                    parent: { parentTaskId: task.id },
                    depth: depth + 1,
                    completedLast,
                    renderTask: subtask => <Task key={subtask.id} task={subtask} depth={depth + 1} treeKey={treeKey} showSubtaskCount={showSubtaskCount} hideCompleted={hideCompleted} completedLast={completedLast} renameOnClick={renameOnClick} density={density} />,
                })}
                {isAddingSubtask &&
                    <AddTask sectionId={task.sectionID} parentTaskId={task.id} onClose={closeAddSubtask} />}
            </div>}
        </div >
    )
})
