import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { usePreference } from "@/contexts/use-preference"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { useState, useRef, useEffect, useCallback } from "react"
import { useAutomations } from "@/hooks/use-automations"
import { TASK_DENSITIES, useTaskDensity } from "./task-density"
import { AddButton } from "../section/AddButton"
import { NewTaskCheckbox } from "./NewTaskCheckbox"
import { useNewTaskField } from "./use-new-task-field"
import { useEndFieldReplaced, useTaskInsertStore } from "./task-insert-state"

type AddTaskProps = {
    /** Section of the new task; ignored for subtasks, which inherit the section of their parent. */
    sectionId: number | null
    /** When set, the input creates a subtask of this task and starts open (no "+" placeholder). */
    parentTaskId?: number
    /** Called when the input is dismissed (only meaningful with parentTaskId). */
    onClose?: () => void
    /** The task goes directly in a group: the closed state is a dashed "New task" button instead of the "+" of a section. */
    inGroup?: boolean
    /** The section has no task yet: its "New task" row is always shown instead of only on hover. */
    emptySection?: boolean
}

/**
 * Inline "new subtask" row, laid out like a subtask row of Task.tsx (same padding, indent and font size). It follows the same
 * rule as the field of a new task:
 * - Enter adds the subtask. With keepAddingTasks the input stays open and focused for the next one, and Enter on the empty
 *   input closes it; without it the input closes after adding.
 * - Escape closes it (discarding the text). There are no add/close buttons: Enter and Escape are the only controls.
 * - Blur / click outside closes it only when empty: typed text is never lost silently.
 * While saving the input is read-only (not disabled, so it keeps focus) and further submits are ignored.
 */
const SubtaskInput = ({ parentTaskId, sectionId, onClose }: { parentTaskId: number, sectionId: number | null, onClose?: () => void }) => {
    const { t } = useTranslation()
    const { createSubTask } = useWorkspaceActions()
    const { appendTask, applyTaskMove } = useActiveNoteActions()
    const newTaskPosition = usePreference(p => p.newTaskPosition)
    const sizes = TASK_DENSITIES[useTaskDensity()]
    const recorder = useUndoRecorder()
    const insertStore = useTaskInsertStore()
    const listKey = `t-${parentTaskId}`
    const replaced = useEndFieldReplaced(listKey)

    const close = () => {
        insertStore.releaseEnd(listKey)
        onClose?.()
    }
    // Only one field of a new task is open at a time: a "+" line (or another bottom field) opened elsewhere closes this one
    useEffect(() => { if (replaced) onClose?.() }, [replaced, onClose])

    const { inputProps, onSubmit, saving } = useNewTaskField({
        onClose: close,
        errorFallback: t("tasks.errors.createSubtask"),
        create: async (value, { next }) => {
            const id = await createSubTask(parentTaskId, value, newTaskPosition)
            next()
            appendTask(id, { parentTaskId }, value)
            // The cache appends it: at the top it moves before its siblings, as the database ordered it
            if (newTaskPosition === "top" && sectionId !== null) applyTaskMove(id, { sectionId, parentTaskId }, 0)
            recorder.create("task", id, value)
        },
    })

    return (
        <form onSubmit={onSubmit} className="w-full border-b">
            <div className={cn("flex items-start w-full px-1", sizes.padding)}>
                <div className="flex items-start gap-2 ml-4 w-full">
                    <NewTaskCheckbox className={sizes.checkbox} />
                    <Input
                        {...inputProps}
                        placeholder={t("tasks.newSubtaskPlaceholder")}
                        aria-label={t("tasks.newSubtask")}
                        autoFocus
                        className={cn("flex-1 px-1 py-0 shadow-none", sizes.input, saving && "opacity-60")}
                    />
                </div>
            </div>
        </form>
    )
}

/** The focus is on nothing, or still on the form: nothing else claimed it. */
const focusIsFree = (form: HTMLElement | null) => {
    const active = document.activeElement
    return !active || active === document.body || !!form?.contains(active)
}

const TopLevelAddTask = ({ sectionId, inGroup, emptySection }: { sectionId: number | null, inGroup?: boolean, emptySection?: boolean }) => {
    const { t } = useTranslation()
    const [isOpen, setOpen] = useState(false)
    const { createTask } = useWorkspaceActions()
    const { appendTask, applyTaskMove } = useActiveNoteActions()
    const newTaskPosition = usePreference(p => p.newTaskPosition)
    const recorder = useUndoRecorder()
    const { dispatch } = useAutomations()
    const formRef = useRef<HTMLFormElement>(null)
    const insertStore = useTaskInsertStore()
    const listKey = `s-${sectionId}`

    // Escape closes the row and discards the text.
    // With keepAddingTasks, Enter on an empty field closes it too (there is nothing to submit).
    const { inputProps, onSubmit, text, setText } = useNewTaskField({
        onClose: () => closeField(),
        errorFallback: t("tasks.errors.createTask"),
        stopEscape: true,
        closeOnBlur: false,
        canSubmit: sectionId !== null,
        // The task is created a moment later: if the focus went elsewhere meanwhile (a menu just opened) it is not taken back
        shouldRefocus: () => focusIsFree(formRef.current),
        create: async (value, { next }) => {
            if (sectionId === null) return
            const id = await createTask(sectionId, value, newTaskPosition)
            next()
            appendTask(id, { sectionId }, value)
            // The cache appends it: at the top it moves before its siblings, as the database ordered it
            if (newTaskPosition === "top") applyTaskMove(id, { sectionId, parentTaskId: null }, 0)
            recorder.create("task", id, value)
            void dispatch({ type: "task.created", taskId: id })
        },
    })

    const closeField = useCallback(() => {
        insertStore.releaseEnd(listKey)
        setOpen(false)
        setText("")
    }, [insertStore, listKey, setText])
    // Only one field of a new task is open at a time: a "+" line (or another bottom field) opened elsewhere closes this one, text discarded
    useEffect(() => insertStore.subscribe(() => {
        const slot = insertStore.getState()
        if (slot && !(slot.end && slot.listKey === listKey)) { setOpen(false); setText("") }
    }), [insertStore, listKey, setText])

    // The listener reads the text through a ref, so it is not registered again at every keystroke
    const textRef = useRef(text)
    useEffect(() => { textRef.current = text }, [text])

    useEffect(() => {
        if (!isOpen) return
        const handleClickOutside = (event: MouseEvent) => {
            // Typed text is never lost with a click elsewhere: only an empty field closes
            if (formRef.current && !formRef.current.contains(event.target as Node) && !textRef.current.trim()) closeField()
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [isOpen, closeField])

    const handleOpen = () => {
        if (isOpen) { closeField(); return }
        insertStore.claimEnd(listKey)
        setOpen(true)
        setText("")
    }

    return (
        !isOpen ? (
            inGroup ? (
                <AddButton onClick={handleOpen} label={t("groups.addTask")} />
            ) : (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleOpen}
                    aria-label={t("tasks.add")}
                    title={t("tasks.add")}
                    // A quiet row that shows on the hover of its section (or with the focus); always there in an empty section
                    className={cn(
                        "w-full h-8 justify-start gap-1.5 px-2.5 rounded-xs font-normal text-xs text-muted-foreground hover:text-foreground",
                        !emptySection && "opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100",
                    )}
                >
                    <Plus className="size-3.5" />
                    {t("tasks.add")}
                </Button>
            )
        ) : (
            <form
                ref={formRef}
                onSubmit={onSubmit}
                className="flex flex-col items-center justify-center w-full"
            >
                <div className="flex items-center justify-center w-full bg-background">
                    <Input
                        {...inputProps}
                        placeholder={t("tasks.placeholder")}
                        aria-label={t("tasks.add")}
                        autoFocus
                        className="rounded-none border-none text-sm"
                    />
                </div>
            </form>
        )
    )
}

export const AddTask = ({ sectionId, parentTaskId, onClose, inGroup, emptySection }: AddTaskProps) =>
    parentTaskId !== undefined
        ? <SubtaskInput parentTaskId={parentTaskId} sectionId={sectionId} onClose={onClose} />
        : <TopLevelAddTask sectionId={sectionId} inGroup={inGroup} emptySection={emptySection} />
