import { useTranslation } from "react-i18next"
import { useMemo } from "react"
import { ButtonInPopover } from "@/components/button-in-popover"
import { useActiveNote } from "@/contexts/use-active-note"
import { usePreferences } from "@/contexts/use-preferences"
import { useTagFilter } from "@/contexts/use-tag-filter"
import { useGroupMoves, useNoteMoves } from "./note-dnd-state"
import { getDirectStep, getGroupStep, getSectionStep, getTaskStep, type Step } from "./note-steps"
import { useTaskStepMove } from "./use-task-step-move"

type StepButtonsProps = {
    /** Vertical lists (tasks, sections) or the horizontal row of the groups. */
    direction?: "vertical" | "horizontal" | "direct"
    canMoveUp: boolean
    canMoveDown: boolean
    onMove: (step: Step) => void
}

/** The "Sposta su" / "Sposta giù" items ("a sinistra" / "a destra" for the groups); disabled when the item is already first / last. */
const StepButtons = ({ direction = "vertical", canMoveUp, canMoveDown, onMove }: StepButtonsProps) => {
    const { t } = useTranslation()
    const horizontal = direction === "horizontal"
    const direct = direction === "direct"
    return (
        <>
            <ButtonInPopover text={t(horizontal ? "menu.moveLeft" : direct ? "menu.moveDirectUp" : "menu.moveUp")} type={horizontal ? "moveLeft" : "moveUp"} disabled={!canMoveUp} onClick={() => onMove(-1)} />
            <ButtonInPopover text={t(horizontal ? "menu.moveRight" : direct ? "menu.moveDirectDown" : "menu.moveDown")} type={horizontal ? "moveRight" : "moveDown"} disabled={!canMoveDown} onClick={() => onMove(1)} />
        </>
    )
}

type StepMovesProps = {
    /** Called when a move is chosen (typically closes the parent menu). */
    onDone?: () => void
}

/**
 * "Sposta su / giù" of a task or subtask: one step among its siblings (accessible alternative to drag & drop,
 * next to "Sposta in…"). Completed siblings that are hidden are jumped over; with "completed tasks last" a step stays inside the open or the completed block.
 * @category Note DnD
 */
export const TaskStepMoves = ({ taskId, onDone }: StepMovesProps & { taskId: number }) => {
    const { noteDataTree } = useActiveNote()
    const { hideCompletedTasks, completedTasksLast } = usePreferences()
    const tagFilter = useTagFilter()
    const move = useTaskStepMove(taskId)

    const steps = useMemo(() => noteDataTree
        ? { up: getTaskStep(noteDataTree, taskId, -1, hideCompletedTasks, completedTasksLast, tagFilter), down: getTaskStep(noteDataTree, taskId, 1, hideCompletedTasks, completedTasksLast, tagFilter) }
        : { up: null, down: null }, [noteDataTree, taskId, hideCompletedTasks, completedTasksLast, tagFilter])

    return (
        <StepButtons
            canMoveUp={steps.up !== null}
            canMoveDown={steps.down !== null}
            onMove={step => {
                if (!(step < 0 ? steps.up : steps.down)) return
                onDone?.()
                void move(step)
            }}
        />
    )
}

/** "Sposta su / giù" of a section: one step among the rows of its group (the list of the direct tasks is one of them). */
export const SectionStepMoves = ({ sectionId, onDone }: StepMovesProps & { sectionId: number }) => {
    const { noteDataTree } = useActiveNote()
    const { moveSectionTo, moveDirectSectionTo } = useNoteMoves()

    const steps = useMemo(() => noteDataTree
        ? { up: getSectionStep(noteDataTree, sectionId, -1), down: getSectionStep(noteDataTree, sectionId, 1) }
        : { up: null, down: null }, [noteDataTree, sectionId])

    return (
        <StepButtons
            canMoveUp={steps.up !== null}
            canMoveDown={steps.down !== null}
            onMove={step => {
                const target = step < 0 ? steps.up : steps.down
                if (!target) return
                onDone?.()
                if (target.type === "direct") void moveDirectSectionTo(target.groupId, target.index)
                else void moveSectionTo(sectionId, target)
            }}
        />
    )
}

/**
 * "Sposta lista task su / giù": one step of the list of the direct tasks of a group among its sections (the list is not
 * draggable, it moves from the menu of the group). Disabled while it is first / last.
 */
export const DirectStepMoves = ({ groupId, onDone }: StepMovesProps & { groupId: number }) => {
    const { noteDataTree } = useActiveNote()
    const { moveDirectSectionTo } = useNoteMoves()

    const steps = useMemo(() => noteDataTree
        ? { up: getDirectStep(noteDataTree, groupId, -1), down: getDirectStep(noteDataTree, groupId, 1) }
        : { up: null, down: null }, [noteDataTree, groupId])

    return (
        <StepButtons
            direction="direct"
            canMoveUp={steps.up !== null}
            canMoveDown={steps.down !== null}
            onMove={step => {
                const index = step < 0 ? steps.up : steps.down
                if (index === null) return
                onDone?.()
                void moveDirectSectionTo(groupId, index)
            }}
        />
    )
}

/** "Sposta a sinistra / destra" of a group: one step among the groups of the note (they are laid out in a row). */
export const GroupStepMoves = ({ groupId, onDone }: StepMovesProps & { groupId: number }) => {
    const { noteDataTree } = useActiveNote()
    const { moveGroupTo } = useGroupMoves()

    const steps = useMemo(() => noteDataTree
        ? { up: getGroupStep(noteDataTree, groupId, -1), down: getGroupStep(noteDataTree, groupId, 1) }
        : { up: null, down: null }, [noteDataTree, groupId])

    return (
        <StepButtons
            direction="horizontal"
            canMoveUp={steps.up !== null}
            canMoveDown={steps.down !== null}
            onMove={step => {
                const index = step < 0 ? steps.up : steps.down
                if (index === null) return
                onDone?.()
                void moveGroupTo(groupId, index)
            }}
        />
    )
}
