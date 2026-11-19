import { LoadingDots } from "@/components/loading-dots"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useActiveNote } from "@/contexts/use-active-note"
import { useSelectedTask, useTabs } from "@/contexts/use-tabs"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { findTask } from "@/contexts/note-tree-ops"
import { taskSections } from "@/lib/group-sections"
import { countTasks } from "../../groups/group-progress"
import { ColorField, Dates, Field, ProgressBar } from "./fields"
import { TaskDetails } from "./TaskDetails"

/**
 * The details of the selected task of the active note or, without selection, of the note itself (top half of the panel).
 * @category RightPanel
 */
export function NoteOrTaskDetails() {
    const { t } = useTranslation()
    const { currentNote } = useTabs()
    const { noteDataTree } = useActiveNote()
    const { updateItemColor } = useWorkspaceActions()
    const [selectedId] = useSelectedTask(currentNote?.id ?? null)
    const stats = useMemo(() => {
        if (!noteDataTree) return null
        return {
            sectionCount: noteDataTree.groups.flatMap(group => group.sections).length,
            // The tasks directly in the groups count too (they live in the hidden default sections, which are not counted as sections)
            counts: countTasks(noteDataTree.groups.flatMap(taskSections).flatMap(section => section.tasks)),
        }
    }, [noteDataTree])

    if (!currentNote) return <p role="status" className="p-3 text-sm text-muted-foreground">{t("details.emptyNote")}</p>
    if (!noteDataTree) return <p role="status" className="p-3 text-sm text-muted-foreground">{t("details.loading")}<LoadingDots /></p>

    const task = selectedId !== null ? findTask(noteDataTree, selectedId)?.task : undefined
    if (task) {
        return (
            <div className="p-3">
                <TaskDetails task={task} tree={noteDataTree} noteName={currentNote.name} />
            </div>
        )
    }

    const { sectionCount, counts } = stats!
    return (
        <div className="flex flex-col gap-4 p-3">
            <h2 className="text-base font-semibold break-words"><span className="sr-only">{t("details.noteTitle")} </span>{currentNote.name}</h2>
            <Field label={t("details.stats")}>
                <ul className="flex flex-col gap-0.5">
                    <li>{t("common.counts.group", { count: noteDataTree.groups.length })}</li>
                    <li>{t("common.counts.section", { count: sectionCount })}</li>
                    <li>{t("common.counts.task", { count: counts.total })}</li>
                </ul>
            </Field>
            <Field label={t("details.progress")}>
                {counts.total === 0
                    ? <span className="text-muted-foreground">{t("details.noTasks")}</span>
                    : <ProgressBar done={counts.done} total={counts.total} label={t("details.tasksProgress", { done: counts.done, total: counts.total })} />}
            </Field>
            {/* The cached sidebar tree is patched by updateItemColor, and the open note reads its color from it */}
            <ColorField item={currentNote} itemType="note" addColorItem={updateItemColor} getItemId={currentNote.id} />
            {/* The draft of a template has no dates (empty strings): "Created on at" would be shown */}
            {currentNote.creation_date !== "" && (
                <Dates creationDate={currentNote.creation_date} creationTime={currentNote.creation_time} editDate={currentNote.edit_date} editTime={currentNote.edit_time} />
            )}
        </div>
    )
}
