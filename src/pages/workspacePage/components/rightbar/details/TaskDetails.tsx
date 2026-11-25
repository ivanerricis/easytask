import { useMemo, useState } from "react"
import { linkHint, openLinkAtCaret } from "@/lib/link-click"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { NoteDataTree, Task } from "@/types/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useTaskDescriptionWriter } from "@/hooks/use-task-description"
import { DescriptionPreview } from "../../tasks/DescriptionPreview"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { getErrorMessage } from "@/lib/utils"
import { reportError } from "@/lib/report-error"
import { useItemMutations } from "@/hooks/use-item-mutations"
import { useSubmitOnce } from "@/hooks/use-submit-once"
import { isDefaultSection, taskSections } from "@/lib/group-sections"
import { getSectionLabel } from "../../section/section-label"
import { getGroupLabel } from "../../groups/group-label"
import { countTasks } from "../../groups/group-progress"
import { DueField } from "./DueField"
import { TaskFilesList } from "../../tasks/TaskFilesButton"
import { ColorField, Dates, Field, ProgressBar, TagsField, sectionTitle } from "./fields"

const containsTask = (tasks: Task[], taskId: number): boolean =>
    tasks.some(task => task.id === taskId || containsTask(task.subtasks, taskId))

/** "Group › Section" of a task, found in the tree of its note ("Group" only for a task directly in the group). */
const findTaskPlace = (tree: NoteDataTree, taskId: number): { group: string, section: string } | null => {
    for (const [groupIndex, group] of tree.groups.entries())
        for (const section of taskSections(group))
            if (containsTask(section.tasks, taskId))
                return { group: getGroupLabel(group, groupIndex), section: isDefaultSection(section) ? "" : getSectionLabel(section) }
    return null
}

/**
 * Editable description. Not being edited it is drawn from its Markdown (click to edit, checklist boxes tick and save at once);
 * being edited it is a textarea, saved only with "Save" (same flow as the description dialog).
 */
const TaskDescription = ({ task }: { task: Task }) => {
    const { t } = useTranslation()
    const { write, toggleItem } = useTaskDescriptionWriter(task)
    // null = not being edited: the field follows the task (so an undo shows up at once)
    const [draft, setDraft] = useState<string | null>(null)
    const [editing, setEditing] = useState(false)
    const { saving, run } = useSubmitOnce()
    const value = draft ?? task.description ?? ""
    const dirty = draft !== null && draft !== (task.description ?? "")

    const stopEditing = () => { setDraft(null); setEditing(false) }

    const save = async () => {
        if (draft === null) return
        await run(async () => {
            try {
                await write(draft)
                stopEditing()
            } catch (err) {
                reportError(err, getErrorMessage(err))
            }
        })
    }

    const toggle = (line: number) => {
        void run(async () => {
            try {
                await toggleItem(line)
            } catch (err) {
                reportError(err, getErrorMessage(err))
            }
        })
    }

    return (
        <div className="flex flex-col gap-1">
            <Label htmlFor="details-description" className={sectionTitle}>{t("sidebar.info.description")}</Label>
            {editing || dirty
                ? <Textarea
                    id="details-description"
                    rows={4}
                    autoFocus={editing}
                    value={value}
                    placeholder={t("sidebar.info.placeholder")}
                    onChange={e => setDraft(e.target.value)}
                    // Leaving the field untouched goes back to the rendered text; with changes it stays until Save or Cancel
                    onBlur={() => { if (!dirty) stopEditing() }}
                    onClick={openLinkAtCaret}
                    title={linkHint(value, t("tasks.openLink"))}
                    className="min-h-24 resize-y bg-background px-2 py-1 text-sm md:text-sm"
                />
                : <DescriptionPreview
                    text={value}
                    placeholder={t("sidebar.info.placeholder")}
                    label={t("sidebar.info.description")}
                    onEdit={() => setEditing(true)}
                    onToggle={toggle}
                    className="min-h-24"
                />}
            {dirty && (
                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" disabled={saving} onClick={stopEditing}>{t("common.cancel")}</Button>
                    <Button size="sm" disabled={saving} onClick={() => { void save() }}>{t("common.save")}</Button>
                </div>
            )}
        </div>
    )
}

export const TaskDetails = ({ task, tree, noteName }: { task: Task, tree: NoteDataTree, noteName: string }) => {
    const { t } = useTranslation()
    const activeId = useActiveNoteId()
    const { updateTaskPriority } = useWorkspaceActions()
    const { patchTask, removeTask } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    // The color is applied to the cached tree at once and restored if the write fails
    const { addColorItem } = useItemMutations("task", patchTask, removeTask)
    const place = useMemo(() => findTaskPlace(tree, task.id), [tree, task.id])
    const subtasks = countTasks(task.subtasks)
    const path = [noteName, place?.group, place?.section].filter(Boolean).join(t("details.pathSeparator"))

    const togglePriority = async () => {
        // Optimistic: the cached tree is updated at once and restored if the write fails
        const rollback = patchTask(task.id, { priority: !task.priority })
        try {
            await updateTaskPriority(task.id, !task.priority)
            recorder.taskPriority(task.id, task.text, !!task.priority, !task.priority)
        } catch {
            rollback()
            toast.error(t("tasks.errors.priority"))
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold break-words"><span className="sr-only">{t("details.taskTitle")} </span>{task.text}</h2>
            <Field label={t("details.path")}>{path}</Field>
            <Field label={t("details.status")}>{task.completed ? t("details.completed") : t("details.pending")}</Field>
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor="details-priority" className={sectionTitle}>{t("details.priority")}</Label>
                <Switch id="details-priority" checked={!!task.priority} onCheckedChange={() => { void togglePriority() }} />
            </div>
            <DueField task={task} />
            <ColorField
                item={task}
                itemType="task"
                addColorItem={addColorItem}
                getItemId={activeId ?? undefined}
            />
            <TagsField taskId={task.id} tagIDs={task.tagIDs} />
            <Field label={t("taskFiles.title")}><TaskFilesList task={task} /></Field>
            <TaskDescription key={task.id} task={task} />
            <Field label={t("details.subtasks")}>
                {subtasks.total === 0
                    ? <span className="text-muted-foreground">{t("details.noSubtasks")}</span>
                    : <ProgressBar done={subtasks.done} total={subtasks.total} label={t("details.subtasksProgress", { done: subtasks.done, total: subtasks.total })} />}
            </Field>
            <Dates creationDate={task.creation_date} creationTime={task.creation_time} editDate={task.edit_date} editTime={task.edit_time} />
        </div>
    )
}
