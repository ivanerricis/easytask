import { useCallback, useMemo } from "react"
import { useWorkspace } from "@/contexts/use-workspace"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { useWorkspaceActions, useWorkspaceTags } from "@/contexts/workspace-data"
import { reportError } from "@/lib/report-error"
import { patchTagOnTasks } from "@/lib/task-tags"
import { getErrorMessage } from "@/lib/utils"
import i18n from "@/i18n"
import type { Tag } from "@/types/types"

/**
 * What the tag menus do: give a tag to tasks or take it away, create a tag (and give it to the tasks), rename it, recolor it,
 * delete it. Giving and taking is applied to the cached note at once and put back if the write fails; every action is ONE undo
 * step. The functions reject with the error of the failed write (the caller shows it where it fits: inline or a toast).
 * @category Hooks
 */
export function useTagMutations() {
    const { currentWorkspace } = useWorkspace()
    const workspaceId = currentWorkspace?.id ?? null
    const { createTag, renameTag, updateTagColor, deleteTag, setTaskTag } = useWorkspaceActions()
    const note = useActiveNoteActions()
    const { refreshActiveNote } = note
    const recorder = useUndoRecorder()
    const tags = useWorkspaceTags()

    /** Gives the tag to the tasks (or takes it away); only the tasks that change are written and recorded. */
    const assign = useCallback(async (tag: Pick<Tag, "id" | "name">, taskIds: readonly number[], assigned: boolean) => {
        const { changed, rollback } = patchTagOnTasks(note, tag.id, taskIds, assigned)
        if (changed.length === 0) return
        try {
            await setTaskTag(tag.id, changed, assigned)
        } catch (error) {
            rollback()
            throw error
        }
        recorder.tagAssign(tag, changed, assigned)
    }, [note, setTaskTag, recorder])

    /** Creates the tag and gives it to the tasks as one step; a name that exists (the case ignored) just gives that tag. */
    const create = useCallback(async (name: string, taskIds: readonly number[]): Promise<Tag | null> => {
        const clean = name.trim()
        if (!clean || workspaceId === null) return null
        const existing = tags.find(tag => tag.name.toLowerCase() === clean.toLowerCase())
        if (existing) {
            await assign(existing, taskIds, true)
            return existing
        }
        const tag = await createTag(workspaceId, clean)
        let linked: number[] = []
        const { changed, rollback } = patchTagOnTasks(note, tag.id, taskIds, true)
        if (changed.length > 0) {
            try {
                await setTaskTag(tag.id, changed, true)
                linked = changed
            } catch (error) {
                rollback()
                reportError(error, i18n.t("tags.errors.assign", { message: getErrorMessage(error) }))
            }
        }
        recorder.tagCreate(tag, linked)
        return tag
    }, [workspaceId, tags, assign, createTag, note, setTaskTag, recorder])

    const rename = useCallback(async (tag: Tag, name: string) => {
        const clean = name.trim()
        if (!clean || clean === tag.name) return
        await renameTag(tag.id, clean)
        recorder.tagRename(tag.id, tag.name, clean)
    }, [renameTag, recorder])

    const recolor = useCallback(async (tag: Tag, color: string | null) => {
        if ((tag.color ?? null) === color) return
        await updateTagColor(tag.id, color)
        recorder.tagColor(tag.id, tag.name, tag.color ?? null, color)
    }, [updateTagColor, recorder])

    const remove = useCallback(async (tag: Tag) => {
        const taskIds = await deleteTag(tag.id)
        recorder.tagDelete(tag, taskIds)
        // The tasks of the open note carry the tag id: the note is read again
        refreshActiveNote().catch(error => reportError(error))
    }, [deleteTag, recorder, refreshActiveNote])

    return useMemo(() => ({ assign, create, rename, recolor, remove }), [assign, create, rename, recolor, remove])
}
