import { useCallback, useMemo } from "react"
import { useWorkspace } from "@/contexts/use-workspace"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { useWorkspaceActions, useWorkspaceTags } from "@/contexts/workspace-data"
import { reportError } from "@/lib/report-error"
import { patchTagOnGroups, patchTagOnTasks, type TagTarget } from "@/lib/task-tags"
import type { StoredTagShape } from "@/lib/tag-shapes"
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
    const { createTag, renameTag, updateTagColor, updateTagShape, deleteTag, setTaskTag, setGroupTag } = useWorkspaceActions()
    const note = useActiveNoteActions()
    const { refreshActiveNote } = note
    const recorder = useUndoRecorder()
    const tags = useWorkspaceTags()

    /** Gives the tag to the tasks or groups of the target (or takes it away); only the ones that change are written and recorded. */
    const assign = useCallback(async (tag: Pick<Tag, "id" | "name">, target: readonly number[] | TagTarget, assigned: boolean) => {
        const { kind, ids } = Array.isArray(target) ? { kind: "tasks" as const, ids: target as readonly number[] } : target as TagTarget
        const { changed, rollback } = kind === "groups" ? patchTagOnGroups(note, tag.id, ids, assigned) : patchTagOnTasks(note, tag.id, ids, assigned)
        if (changed.length === 0) return
        try {
            await (kind === "groups" ? setGroupTag : setTaskTag)(tag.id, changed, assigned)
        } catch (error) {
            rollback()
            throw error
        }
        if (kind === "groups") recorder.tagAssignGroups(tag, changed, assigned)
        else recorder.tagAssign(tag, changed, assigned)
    }, [note, setTaskTag, setGroupTag, recorder])

    /** Creates the tag and gives it to the tasks or groups as one step; a name that exists (the case ignored) just gives that tag. */
    const create = useCallback(async (name: string, target: readonly number[] | TagTarget): Promise<Tag | null> => {
        const clean = name.trim()
        if (!clean || workspaceId === null) return null
        const existing = tags.find(tag => tag.name.toLowerCase() === clean.toLowerCase())
        if (existing) {
            await assign(existing, target, true)
            return existing
        }
        const { kind, ids } = Array.isArray(target) ? { kind: "tasks" as const, ids: target as readonly number[] } : target as TagTarget
        const tag = await createTag(workspaceId, clean)
        let linked: number[] = []
        const { changed, rollback } = kind === "groups" ? patchTagOnGroups(note, tag.id, ids, true) : patchTagOnTasks(note, tag.id, ids, true)
        if (changed.length > 0) {
            try {
                await (kind === "groups" ? setGroupTag : setTaskTag)(tag.id, changed, true)
                linked = changed
            } catch (error) {
                rollback()
                reportError(error, i18n.t("tags.errors.assign", { message: getErrorMessage(error) }))
            }
        }
        recorder.tagCreate(tag, kind === "groups" ? { groupIds: linked } : { taskIds: linked })
        return tag
    }, [workspaceId, tags, assign, createTag, note, setTaskTag, setGroupTag, recorder])

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

    const reshape = useCallback(async (tag: Tag, shape: StoredTagShape) => {
        if ((tag.shape ?? null) === shape) return
        await updateTagShape(tag.id, shape)
        recorder.tagShape(tag.id, tag.name, tag.shape ?? null, shape)
    }, [updateTagShape, recorder])

    const remove = useCallback(async (tag: Tag) => {
        const links = await deleteTag(tag.id)
        recorder.tagDelete(tag, links)
        // The tasks of the open note carry the tag id: the note is read again
        refreshActiveNote().catch(error => reportError(error))
    }, [deleteTag, recorder, refreshActiveNote])

    return useMemo(() => ({ assign, create, rename, recolor, reshape, remove }), [assign, create, rename, recolor, reshape, remove])
}
