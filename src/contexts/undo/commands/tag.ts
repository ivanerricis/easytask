import i18n from "@/i18n"
import { patchTagOnGroups, patchTagOnSections, patchTagOnTasks } from "@/lib/task-tags"
import type { StoredTagShape } from "@/lib/tag-shapes"
import type { TagLinks } from "@/db/queries/tag"
import type { Tag } from "@/types/types"
import { withRollback } from "../../with-rollback"
import type { UndoCommand } from "../stack"
import { shorten, type UndoHelpers } from "./helpers"

/** The commands on tags: creation, deletion, rename, color, shape and assignment to tasks, groups and sections. */
export function tagCommands(h: UndoHelpers) {
    const { workspace, note, reloadNote } = h

    /** Gives a tag to tasks (or takes it away) in the cached note, then writes it; the cache is put back if the write fails. */
    const setTagOn = async (tagId: number, taskIds: readonly number[], assigned: boolean) => {
        const { rollback } = patchTagOnTasks(note, tagId, taskIds, assigned)
        await withRollback(rollback, () => workspace.setTaskTag(tagId, taskIds, assigned))
    }

    /** The same for groups. */
    const setTagOnGroups = async (tagId: number, groupIds: readonly number[], assigned: boolean) => {
        const { rollback } = patchTagOnGroups(note, tagId, groupIds, assigned)
        await withRollback(rollback, () => workspace.setGroupTag(tagId, groupIds, assigned))
    }

    /** The same for sections. */
    const setTagOnSections = async (tagId: number, sectionIds: readonly number[], assigned: boolean) => {
        const { rollback } = patchTagOnSections(note, tagId, sectionIds, assigned)
        await withRollback(rollback, () => workspace.setSectionTag(tagId, sectionIds, assigned))
    }

    /** Deletes a tag (its links go with it) and refreshes the open note, which carries the tag ids of its tasks and groups. */
    const deleteTagOf = async (tagId: number) => {
        await workspace.deleteTag(tagId)
        await reloadNote()
    }

    /** Puts a tag back with its links and refreshes the open note. */
    const restoreTagOf = async (tag: Tag, links: Partial<TagLinks>) => {
        await workspace.restoreTag(tag, links)
        await reloadNote()
    }

    /** The label of an action on a tag, with its name. */
    const tagLabel = (key: "createTag" | "renameTag" | "colorTag" | "shapeTag" | "deleteTag" | "assignTag" | "unassignTag" | "assignTagGroup" | "unassignTagGroup" | "assignTagSection" | "unassignTagSection", name: string) =>
        i18n.t("undo.named", { label: i18n.t(`undo.labels.${key}`), name: shorten(name) })

    return {
        /**
         * Creation of a tag, possibly together with giving it to tasks or groups (`links`): undone by deleting it (the links go with it),
         * redone by putting it back with the same id and links.
         */
        tagCreate: (tag: Tag, links: Partial<TagLinks> = {}): UndoCommand => ({
            label: tagLabel("createTag", tag.name),
            undo: () => deleteTagOf(tag.id),
            redo: () => restoreTagOf(tag, links),
        }),

        /** Deletion of a tag: undone by putting it back with the same id, place and links (`links` are the tasks, groups and sections that had it). */
        tagDelete: (tag: Tag, links: TagLinks): UndoCommand => ({
            label: tagLabel("deleteTag", tag.name),
            undo: () => restoreTagOf(tag, links),
            redo: () => deleteTagOf(tag.id),
        }),

        tagRename: (tagId: number, before: string, after: string): UndoCommand => ({
            label: tagLabel("renameTag", before),
            undo: () => workspace.renameTag(tagId, before),
            redo: () => workspace.renameTag(tagId, after),
        }),

        tagColor: (tagId: number, name: string, before: string | null, after: string | null): UndoCommand => ({
            label: tagLabel("colorTag", name),
            undo: () => workspace.updateTagColor(tagId, before),
            redo: () => workspace.updateTagColor(tagId, after),
        }),

        tagShape: (tagId: number, name: string, before: StoredTagShape, after: StoredTagShape): UndoCommand => ({
            label: tagLabel("shapeTag", name),
            undo: () => workspace.updateTagShape(tagId, before),
            redo: () => workspace.updateTagShape(tagId, after),
        }),

        /** A tag given to (or taken from) one or more groups as ONE step; `groupIds` are the groups that really changed. */
        tagAssignGroups: (tag: Pick<Tag, "id" | "name">, groupIds: readonly number[], assigned: boolean): UndoCommand => ({
            label: tagLabel(assigned ? "assignTagGroup" : "unassignTagGroup", tag.name),
            undo: () => setTagOnGroups(tag.id, groupIds, !assigned),
            redo: () => setTagOnGroups(tag.id, groupIds, assigned),
        }),

        /** A tag given to (or taken from) one or more sections as ONE step; `sectionIds` are the sections that really changed. */
        tagAssignSections: (tag: Pick<Tag, "id" | "name">, sectionIds: readonly number[], assigned: boolean): UndoCommand => ({
            label: tagLabel(assigned ? "assignTagSection" : "unassignTagSection", tag.name),
            undo: () => setTagOnSections(tag.id, sectionIds, !assigned),
            redo: () => setTagOnSections(tag.id, sectionIds, assigned),
        }),

        /** A tag given to (or taken from) one or more tasks as ONE step; `taskIds` are the tasks that really changed. */
        tagAssign: (tag: Pick<Tag, "id" | "name">, taskIds: readonly number[], assigned: boolean): UndoCommand => ({
            label: taskIds.length === 1
                ? tagLabel(assigned ? "assignTag" : "unassignTag", tag.name)
                : i18n.t("undo.named", { label: i18n.t(assigned ? "undo.labels.assignTagMany" : "undo.labels.unassignTagMany", { count: taskIds.length }), name: shorten(tag.name) }),
            undo: () => setTagOn(tag.id, taskIds, !assigned),
            redo: () => setTagOn(tag.id, taskIds, assigned),
        }),
    }
}
