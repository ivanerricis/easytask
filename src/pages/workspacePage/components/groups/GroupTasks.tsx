import { memo, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import type { Group, Section } from "@/types/types"
import { cn } from "@/lib/utils"
import { reportError } from "@/lib/report-error"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { ensureDBDefaultSection } from "@/db/queries/task"
import { useNoteDndSelector, useNoteDrop } from "../note-dnd-state"
import { AddTask } from "../tasks/AddTask"
import { DropLine } from "../sidebar/DropLine"
import { TaskList } from "../tasks/TaskList"

type DirectTasksProps = {
    section: Section
}

/**
 * The tasks created directly in a group (the ones of its hidden default section) and the "New task" button right under them.
 * The area is a droppable of the default section: a task dropped on it goes at the end; a dragged section is dropped before (top half)
 * or after (bottom half) the whole area, like on a section card (the list itself cannot be dragged: it moves from the menu of the group).
 */
const DirectTasks = memo(({ section }: DirectTasksProps) => {
    const { t } = useTranslation()
    const { setNodeRef, zone, active } = useNoteDrop("section", section.id)
    const draggingSection = active?.kind === "section"
    const taskDestination = useNoteDndSelector(state => state.active?.kind === "task" && state.hover.targetSectionId === section.id)

    return (
        <div
            ref={setNodeRef}
            data-direct-tasks
            className={cn("relative flex flex-col gap-1 w-full rounded-xs", !draggingSection && (zone || taskDestination) && "ring-2 ring-primary")}
        >
            {/* Drawn inside the box: the list can be the first or the last item of the group, where a line outside would be cut by the scrolling area */}
            {draggingSection && <DropLine zone={zone} />}
            {/* Without tasks only the button is left: the empty box would just be a double border */}
            {section.tasks.length > 0 &&
                <div className="flex flex-col w-full border bg-secondary">
                    <TaskList tasks={section.tasks} listKey={`s-${section.id}`} sectionId={section.id} clipped label={t("tasks.selection.directTasks")} />
                </div>}
            {/* Like the "Add a card" of Trello: when the tasks are more than the group can show, the button stays at the bottom of the
                scrolling area instead of scrolling away (the 4px are the offset of the scrolling area, taller than the group) */}
            <div className="sticky bottom-1 z-10 bg-background">
                <AddTask sectionId={section.id} inGroup />
            </div>
        </div>
    )
})

type GroupTasksProps = {
    group: Group
}

/**
 * Direct tasks of an open group. Every group has a default section; if one is missing (it should not happen) it is created
 * once and the note is reloaded, so the group is never left without a way to add a task.
 * @category Groups
 */
export const GroupTasks = memo(({ group }: GroupTasksProps) => {
    const { refreshActiveNote } = useActiveNoteActions()
    const repaired = useRef<number | null>(null)
    const missing = !group.defaultSection

    useEffect(() => {
        if (!missing || repaired.current === group.id) return
        repaired.current = group.id
        ensureDBDefaultSection(group.id)
            .then(refreshActiveNote)
            .catch(error => reportError(error, i18n.t("tasks.errors.createTask")))
    }, [missing, group.id, refreshActiveNote])

    return group.defaultSection ? <DirectTasks section={group.defaultSection} /> : null
})
