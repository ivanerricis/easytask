import i18n from "@/i18n"
import { reportError } from "@/lib/report-error"
import type { DBItemType } from "@/db/queries/shared_queries"
import type { TaskMoveTarget } from "@/db/queries/move"
import type { ArchiveItemType, NoteDataTree, Tag, WorkspaceDataTree } from "@/types/types"
import type { PreviousColor, WorkspaceActionsType } from "../workspace-data"
import type { ActiveNoteActionsType } from "../active-note-context-object"
import { findSection, findTask } from "../note-tree-ops"
import { findTreeItem, type TreeItemType } from "../workspace-tree-ops"
import { withRollback } from "../with-rollback"
import { patchTagOnTasks } from "@/lib/task-tags"
import type { UndoCommand } from "./stack"

/**
 * What the commands need from the rest of the app. Everything is stable (the actions never change identity), so a
 * command stays valid after the component that recorded it has unmounted.
 * @category Undo
 */
export type UndoDeps = {
    /** The workspace the history belongs to (null outside a workspace). */
    getWorkspaceId: () => number | null
    workspace: Pick<WorkspaceActionsType,
        "renameItem" | "updateItemColor" | "updateNoteBackground" | "deleteItem" | "restoreItem" | "archiveItem" | "unarchiveItem" | "moveTreeItem" | "moveSection" | "moveDirectSection" | "moveTask" |
        "updateTaskCompletion" | "updateTaskPriority" | "updateTaskDescription" | "updateFolderColorContent" | "getWorkspaceData" |
        "renameTag" | "updateTagColor" | "deleteTag" | "restoreTag" | "setTaskTag">
    note: Pick<ActiveNoteActionsType,
        "patchTask" | "patchSection" | "patchGroup" | "removeGroup" | "removeSection" | "removeTask" |
        "applySectionMove" | "applyDirectSectionMove" | "applyTaskMove" | "refreshActiveNote" | "getNoteTree">
}

/** The types of item whose actions are undoable (folders and notes live in the sidebar tree, the others in the open note). */
type UndoItemType = "folder" | "note" | "section_group" | "section" | "task"

const UNDOABLE: readonly DBItemType[] = ["folder", "note", "section_group", "section", "task"]

/** Whether the actions on this type of item can be undone. */
export const isUndoableType = (itemType: DBItemType): itemType is UndoItemType => UNDOABLE.includes(itemType)

const isTreeType = (itemType: UndoItemType): itemType is TreeItemType => itemType === "folder" || itemType === "note"

/** Where a folder or a note sits: the parent folder (null = workspace root) and the index among its siblings of the same type. */
type TreePlace = { folderId: number | null, index: number }
/** One item of a multi-selection action, with its name for the label. */
export type TreeItemRef = { itemType: TreeItemType, id: number, name: string | null | undefined }
/** One item of a multi-selection action on folders, notes or tasks (a task action reloads the open note, not the tree). */
export type ManyItemRef = { itemType: TreeItemType | "task", id: number, name: string | null | undefined }
/** One color change of a multi-selection action. */
export type ColorChange = ManyItemRef & { before: string | null | undefined, after: string | null | undefined }
/** One step of a multi move of tasks: the task and where it is before / after the step. */
export type TaskMoveStep = { id: number, name: string, from: TaskPlace, to: TaskPlace }
/** One step of a multi move: the item and where it is before / after the step. */
export type TreeMoveStep = { itemType: TreeItemType, id: number, name: string, from: TreePlace, to: TreePlace }
/**
 * Where a section sits in the open note. `listIndex` is the place of the list of the direct tasks of that group when the place was
 * captured (how many sections come before it): a section index alone cannot tell on which side of the list the section was,
 * so undoing a move puts the list back too.
 */
type SectionPlace = { groupId: number, index: number, listIndex?: number, beforeList?: boolean }
/** Where a task sits in the open note: a section (top level, parentTaskId null; also the default section of a group) or under another task. */
type TaskPlace = { sectionId: number, parentTaskId: number | null, index: number }

/** Awaits `fn` on each item, one after the other: in order, or from the last to the first (the inverse of a sequence). */
export async function eachInOrder<T>(items: readonly T[], reverse: boolean, fn: (item: T) => Promise<unknown>): Promise<void> {
    for (const item of reverse ? [...items].reverse() : items) await fn(item)
}

type ManyCommandOptions<T> = {
    label: string
    items: readonly T[]
    /** Inverts one item (the items are undone from the last to the first). */
    undoEach: (item: T) => Promise<unknown>
    /** Applies one item again (the items are redone in order). */
    redoEach: (item: T) => Promise<unknown>
    /** Runs once after all the items were undone / redone (omitted: nothing runs). */
    reloadUndo?: () => Promise<unknown>
    reloadRedo?: () => Promise<unknown>
    /** Runs the reload also when an item failed (the items before it were applied: what changed must still be shown). */
    reloadEvenOnFailure?: boolean
}

/** A command that applies the same step to several items as ONE history entry, with one reload at the end. */
export function manyCommand<T>({ label, items, undoEach, redoEach, reloadUndo, reloadRedo, reloadEvenOnFailure = false }: ManyCommandOptions<T>): UndoCommand {
    const run = async (reverse: boolean, each: (item: T) => Promise<unknown>, reload?: () => Promise<unknown>) => {
        if (!reload) return eachInOrder(items, reverse, each)
        if (!reloadEvenOnFailure) {
            await eachInOrder(items, reverse, each)
            await reload()
            return
        }
        try {
            await eachInOrder(items, reverse, each)
        } finally {
            await reload()
        }
    }
    return {
        label,
        undo: () => run(true, undoEach, reloadUndo),
        redo: () => run(false, redoEach, reloadRedo),
    }
}

const NAME_MAX = 40

const shorten = (name: string | null | undefined) => {
    const value = (name ?? "").replace(/\s+/g, " ").trim()
    return value.length > NAME_MAX ? `${value.slice(0, NAME_MAX - 1)}…` : value
}

const typeName = (itemType: DBItemType) => i18n.t(`undo.itemTypes.${itemType}`)

type LabelKey = "rename" | "color" | "complete" | "reopen" | "addPriority" | "removePriority" | "description" | "delete" | "create" | "move" | "moveDirect" | "colorContent" | "background" | "archive" | "unarchive"

/** The translated description of an action on an item, with the (shortened) name of the item when it has one. */
export function makeLabel(key: LabelKey, itemType: DBItemType, name: string | null | undefined): string {
    const label = i18n.t(`undo.labels.${key}`, { type: typeName(itemType) })
    const short = shorten(name)
    return short ? i18n.t("undo.named", { label, name: short }) : label
}

/** The display name of an item of any type (name, section title or task text). */
export function getItemName(item: object): string | undefined {
    const { name, title, text } = item as { name?: string | null, title?: string, text?: string }
    return name ?? title ?? text ?? undefined
}

/** Where a folder or a note currently sits in the sidebar tree. */
export function captureTreePlace(tree: WorkspaceDataTree | null | undefined, itemType: TreeItemType, id: number): (TreePlace & { name: string }) | null {
    const found = tree ? findTreeItem(tree, itemType, id) : undefined
    return found ? { folderId: found.parentId, index: found.index, name: found.item.name } : null
}

/** Where a section currently sits in the note (null for the hidden default section of a group, which never moves). */
export function captureSectionPlace(tree: NoteDataTree | null | undefined, sectionId: number): (SectionPlace & { name: string }) | null {
    const found = tree ? findSection(tree, sectionId) : undefined
    if (!found || found.index < 0) return null
    const listIndex = tree?.groups.find(group => group.id === found.groupId)?.defaultIndex
    return { groupId: found.groupId, index: found.index, ...(listIndex === undefined ? {} : { listIndex }), name: found.section.title }
}

/** Where a task currently sits in the note. */
export function captureTaskPlace(tree: NoteDataTree | null | undefined, taskId: number): (TaskPlace & { name: string }) | null {
    const found = tree ? findTask(tree, taskId) : undefined
    if (!found) return null
    const sectionId = "parentTaskId" in found.parent ? found.task.sectionID : found.parent.sectionId
    if (sectionId === null) return null
    return {
        sectionId,
        parentTaskId: "parentTaskId" in found.parent ? found.parent.parentTaskId : null,
        index: found.index,
        name: found.task.text,
    }
}

/**
 * Builds the commands (an action and its inverse, both on stable ids) of every undoable user action.
 * Every inverse applies the same optimistic update as the original action, so no full reload is needed, and
 * rolls it back when the write fails (the error then reaches the history, which reports it).
 * @category Undo
 */
export function createUndoCommands(deps: UndoDeps) {
    const { workspace, note, getWorkspaceId } = deps

    /** A failed refresh must not turn an applied change into a failed command. */
    const reloadTree = async () => {
        const workspaceId = getWorkspaceId()
        if (workspaceId === null) return
        try {
            await workspace.getWorkspaceData(workspaceId)
        } catch (error) {
            reportError(error, i18n.t("errors.refreshTree"))
        }
    }
    const reloadNote = async () => {
        try {
            await note.refreshActiveNote()
        } catch (error) {
            reportError(error, i18n.t("errors.refreshNote"))
        }
    }

    /** Applies a rename/color change to the cached note data (folders and notes are patched by the workspace actions). */
    const patchNoteItem = (itemType: UndoItemType, id: number, key: "name" | "color", value: string | null) => {
        if (itemType === "task") return note.patchTask(id, key === "name" ? { text: value ?? "" } : { color: value })
        if (itemType === "section") return note.patchSection(id, key === "name" ? { title: value ?? "" } : { color: value })
        if (itemType === "section_group") return note.patchGroup(id, key === "name" ? { name: value?.trim() || null } : { color: value })
        return null
    }

    const removeFromNote = (itemType: UndoItemType, id: number) => {
        if (itemType === "section_group") return note.removeGroup(id)
        if (itemType === "section") return note.removeSection(id)
        if (itemType === "task") return note.removeTask(id)
        return null
    }

    /** Soft delete with the same optimistic removal as the delete dialog (folders and notes are removed by deleteItem). */
    const removeItem = async (itemType: UndoItemType, id: number) => {
        await withRollback(removeFromNote(itemType, id), () => workspace.deleteItem(itemType, id))
    }

    /** Restores from the trash (the ids are the same, so every reference stays valid) and reloads what changed. */
    const restoreItem = async (itemType: UndoItemType, id: number) => {
        await workspace.restoreItem(itemType, id)
        if (isTreeType(itemType)) await reloadTree()
        else await reloadNote()
    }

    /** Archives with the same optimistic removal as the archive action (folders and notes are removed by archiveItem). */
    const archiveOne = async (itemType: ArchiveItemType, id: number) => {
        await withRollback(removeFromNote(itemType, id), () => workspace.archiveItem(itemType, id))
    }

    /** Unarchives (the ids are the same, so every reference stays valid) and reloads what changed. */
    const unarchiveOne = async (itemType: ArchiveItemType, id: number) => {
        await workspace.unarchiveItem(itemType, id)
        if (isTreeType(itemType)) await reloadTree()
        else await reloadNote()
    }

    /** Reloads what a multi action touched: the tree for folders/notes, the open note for tasks (each only when needed). */
    const reloadFor = async (items: ManyItemRef[]) => {
        if (items.some(item => item.itemType !== "task")) await reloadTree()
        if (items.some(item => item.itemType === "task")) await reloadNote()
    }

    const setName = (itemType: UndoItemType, id: number) => async (name: string) => {
        await withRollback(patchNoteItem(itemType, id, "name", name), () => workspace.renameItem(itemType, id, name))
    }

    const setColor = (itemType: UndoItemType, id: number) => async (color: string | null) => {
        await withRollback(patchNoteItem(itemType, id, "color", color), () => workspace.updateItemColor(itemType, id, color ?? undefined))
    }

    const setBackground = (id: number) => (color: string | null) => workspace.updateNoteBackground(id, color ?? undefined)

    const moveTreeTo = (itemType: TreeItemType, id: number) => async (place: TreePlace) => {
        await workspace.moveTreeItem(itemType, id, place.folderId, place.index)
        await reloadTree()
    }

    const moveSectionTo = async (sectionId: number, groupId: number, index: number, beforeList?: boolean) => {
        // The flag is only passed when set, so the calls without it stay what they were
        const flag = beforeList ? [true] as const : [] as const
        await withRollback(note.applySectionMove(sectionId, groupId, index, ...flag), () => workspace.moveSection(sectionId, groupId, index, ...flag))
    }

    /** Moves the list of the direct tasks of a group; nothing is written when it already is there. */
    const moveListTo = async (groupId: number, index: number) => {
        const group = note.getNoteTree()?.groups.find(candidate => candidate.id === groupId)
        if (group && (group.defaultIndex ?? 0) === index) return
        await withRollback(note.applyDirectSectionMove(groupId, index), () => workspace.moveDirectSection(groupId, index))
    }

    /** Moves a section back to the place it had, and the list of its group next to it where it was. */
    const putSectionBack = async (sectionId: number, from: SectionPlace) => {
        await moveSectionTo(sectionId, from.groupId, from.index)
        if (from.listIndex !== undefined) await moveListTo(from.groupId, from.listIndex)
    }

    const moveTaskTo = async (taskId: number, target: TaskMoveTarget, index: number) => {
        await withRollback(note.applyTaskMove(taskId, target, index), () => workspace.moveTask(taskId, target, index))
    }

    const setTaskFlag = (key: "completed" | "priority", taskId: number) => async (value: boolean) => {
        await withRollback(note.patchTask(taskId, { [key]: value }), () =>
            key === "completed" ? workspace.updateTaskCompletion(taskId, value) : workspace.updateTaskPriority(taskId, value))
    }

    const setTaskDescription = (taskId: number) => async (description: string) => {
        await withRollback(note.patchTask(taskId, { description }), () =>
            workspace.updateTaskDescription(taskId, description !== "" ? description : undefined))
    }

    /** Gives a tag to tasks (or takes it away) in the cached note, then writes it; the cache is put back if the write fails. */
    const setTagOn = async (tagId: number, taskIds: readonly number[], assigned: boolean) => {
        const { rollback } = patchTagOnTasks(note, tagId, taskIds, assigned)
        await withRollback(rollback, () => workspace.setTaskTag(tagId, taskIds, assigned))
    }

    /** Deletes a tag (its links go with it) and refreshes the open note, which carries the tag ids of its tasks. */
    const deleteTagOf = async (tagId: number) => {
        await workspace.deleteTag(tagId)
        await reloadNote()
    }

    /** Puts a tag back with its links and refreshes the open note. */
    const restoreTagOf = async (tag: Tag, taskIds: readonly number[]) => {
        await workspace.restoreTag(tag, taskIds)
        await reloadNote()
    }

    /** The label of an action on a tag, with its name. */
    const tagLabel = (key: "createTag" | "renameTag" | "colorTag" | "deleteTag" | "assignTag" | "unassignTag", name: string) =>
        i18n.t("undo.named", { label: i18n.t(`undo.labels.${key}`), name: shorten(name) })

    /** The same label for every multi-selection action: the translated count ("Delete 3 items"). */
    const manyLabel = (key: "deleteMany" | "colorMany" | "moveMany" | "archiveMany", count: number) => i18n.t(`undo.labels.${key}`, { count })

    return {
        /** Rename of a folder, note, group, section or task. */
        rename: (itemType: UndoItemType, id: number, before: string, after: string): UndoCommand => {
            const apply = setName(itemType, id)
            return {
                label: makeLabel("rename", itemType, before),
                undo: () => apply(before),
                redo: () => apply(after),
            }
        },

        /** Color change (null = no color). */
        color: (itemType: UndoItemType, id: number, name: string | null | undefined, before: string | null | undefined, after: string | null | undefined): UndoCommand => {
            const apply = setColor(itemType, id)
            return {
                label: makeLabel("color", itemType, name),
                undo: () => apply(before ?? null),
                redo: () => apply(after ?? null),
            }
        },

        /** Background color of a note (null = default background). */
        background: (noteId: number, name: string | null | undefined, before: string | null | undefined, after: string | null | undefined): UndoCommand => {
            const apply = setBackground(noteId)
            return {
                label: makeLabel("background", "note", name),
                undo: () => apply(before ?? null),
                redo: () => apply(after ?? null),
            }
        },

        taskCompletion: (taskId: number, name: string, before: boolean, after: boolean): UndoCommand => {
            const apply = setTaskFlag("completed", taskId)
            return {
                label: makeLabel(after ? "complete" : "reopen", "task", name),
                undo: () => apply(before),
                redo: () => apply(after),
            }
        },

        taskPriority: (taskId: number, name: string, before: boolean, after: boolean): UndoCommand => {
            const apply = setTaskFlag("priority", taskId)
            return {
                label: makeLabel(after ? "addPriority" : "removePriority", "task", name),
                undo: () => apply(before),
                redo: () => apply(after),
            }
        },

        taskDescription: (taskId: number, name: string, before: string, after: string): UndoCommand => {
            const apply = setTaskDescription(taskId)
            return {
                label: makeLabel("description", "task", name),
                undo: () => apply(before),
                redo: () => apply(after),
            }
        },

        /** Move to the trash: undone by restoring the item, with the same id and the same position. */
        remove: (itemType: UndoItemType, id: number, name: string | null | undefined): UndoCommand => ({
            label: makeLabel("delete", itemType, name),
            undo: () => restoreItem(itemType, id),
            redo: () => removeItem(itemType, id),
        }),

        /** Creation: undone by moving the new item to the trash, redone by restoring it (the id never changes). */
        create: (itemType: UndoItemType, id: number, name: string | null | undefined): UndoCommand => ({
            label: makeLabel("create", itemType, name),
            undo: () => removeItem(itemType, id),
            redo: () => restoreItem(itemType, id),
        }),

        /** Move of a folder or a note in the sidebar tree. */
        treeMove: (itemType: TreeItemType, id: number, name: string, from: TreePlace, to: TreePlace): UndoCommand => {
            const apply = moveTreeTo(itemType, id)
            return {
                label: makeLabel("move", itemType, name),
                undo: () => apply(from),
                redo: () => apply(to),
            }
        },

        /**
         * Move to the trash of several folders/notes as ONE step: undone by restoring them all (the tree is reloaded once),
         * redone by trashing them again in the same order.
         */
        removeMany: (items: ManyItemRef[]): UndoCommand => manyCommand({
            label: manyLabel("deleteMany", items.length),
            items,
            undoEach: item => workspace.restoreItem(item.itemType, item.id),
            redoEach: item => removeItem(item.itemType, item.id),
            reloadUndo: () => reloadFor(items),
        }),

        /** Archive of a folder, note, group or section: undone by unarchiving it (same id, same position). */
        archive: (itemType: ArchiveItemType, id: number, name: string | null | undefined): UndoCommand => ({
            label: makeLabel("archive", itemType, name),
            undo: () => unarchiveOne(itemType, id),
            redo: () => archiveOne(itemType, id),
        }),

        /** Unarchive of a folder, note, group or section (from the archive dialog): undone by archiving it again. */
        unarchive: (itemType: ArchiveItemType, id: number, name: string | null | undefined): UndoCommand => ({
            label: makeLabel("unarchive", itemType, name),
            undo: () => archiveOne(itemType, id),
            redo: () => unarchiveOne(itemType, id),
        }),

        /**
         * Archive of several folders/notes as ONE step: undone by unarchiving them all (the tree is reloaded once),
         * redone by archiving them again in the same order.
         */
        archiveMany: (items: ManyItemRef[]): UndoCommand => manyCommand({
            label: manyLabel("archiveMany", items.length),
            items,
            undoEach: item => workspace.unarchiveItem(item.itemType, item.id),
            redoEach: item => archiveOne(item.itemType, item.id),
            reloadUndo: () => reloadFor(items),
        }),

        /** Color change of several folders/notes as ONE step (null = no color). */
        colorMany: (changes: ColorChange[]): UndoCommand => manyCommand({
            label: manyLabel("colorMany", changes.length),
            items: changes,
            undoEach: change => setColor(change.itemType, change.id)(change.before ?? null),
            redoEach: change => setColor(change.itemType, change.id)(change.after ?? null),
        }),

        /**
         * "Color content" of a folder (the folder, its subfolders and their notes) as ONE step: undone by giving every
         * touched item its previous color, redone by coloring the whole content again.
         * @param previous The previous colors, as returned by `updateFolderColorContent`.
         */
        colorContent: (folderId: number, name: string | null | undefined, color: string | null | undefined, previous: PreviousColor[]): UndoCommand => ({
            label: makeLabel("colorContent", "folder", name),
            undo: () => eachInOrder(previous, true, item => setColor(item.itemType, item.id)(item.before ?? null)),
            redo: () => workspace.updateFolderColorContent(folderId, color ?? undefined).then(() => undefined),
        }),

        /**
         * Move of several folders/notes as ONE step. `steps` are in the order they were run, each with the place the item
         * had right before its step: undone by running them backwards (one reload), redone in order.
         */
        treeMoveMany: (steps: TreeMoveStep[]): UndoCommand => manyCommand({
            label: manyLabel("moveMany", steps.length),
            items: steps,
            undoEach: step => workspace.moveTreeItem(step.itemType, step.id, step.from.folderId, step.from.index),
            redoEach: step => workspace.moveTreeItem(step.itemType, step.id, step.to.folderId, step.to.index),
            reloadUndo: reloadTree,
            reloadRedo: reloadTree,
            reloadEvenOnFailure: true,
        }),

        /** Move of a section into another group (or elsewhere in its group). */
        sectionMove: (sectionId: number, name: string, from: SectionPlace, to: SectionPlace): UndoCommand => ({
            label: makeLabel("move", "section", name),
            undo: () => putSectionBack(sectionId, from),
            redo: () => moveSectionTo(sectionId, to.groupId, to.index, to.beforeList),
        }),

        /** Move of the list of the direct tasks of a group among its sections (`from` and `to` count the sections before the list). */
        directMove: (groupId: number, name: string, from: number, to: number): UndoCommand => ({
            label: makeLabel("moveDirect", "section_group", name),
            undo: () => moveListTo(groupId, from),
            redo: () => moveListTo(groupId, to),
        }),

        /**
         * Move of a section into a group that the move itself created (`newGroupId`): undone by moving the section back
         * and trashing the empty group, redone by restoring the same group and moving the section into it.
         */
        sectionMoveToNewGroup: (sectionId: number, name: string, newGroupId: number, from: SectionPlace): UndoCommand => ({
            label: makeLabel("move", "section", name),
            undo: async () => {
                await putSectionBack(sectionId, from)
                await removeItem("section_group", newGroupId)
            },
            redo: async () => {
                await workspace.restoreItem("section_group", newGroupId)
                await workspace.moveSection(sectionId, newGroupId, 0)
                await reloadNote()
            },
        }),

        /**
         * Move of several tasks as ONE step. `steps` are in the order they were run, each with the place the task had right
         * before its step: undone by running them backwards, redone in order (the open note is reloaded once at the end).
         */
        taskMoveMany: (steps: TaskMoveStep[]): UndoCommand => manyCommand({
            label: manyLabel("moveMany", steps.length),
            items: steps,
            undoEach: step => moveTaskTo(step.id, { sectionId: step.from.sectionId, parentTaskId: step.from.parentTaskId }, step.from.index),
            redoEach: step => moveTaskTo(step.id, { sectionId: step.to.sectionId, parentTaskId: step.to.parentTaskId }, step.to.index),
            reloadUndo: reloadNote,
            reloadRedo: reloadNote,
            reloadEvenOnFailure: true,
        }),

        /**
         * Creation of a tag, possibly together with giving it to tasks (`taskIds`): undone by deleting it (the links go with it),
         * redone by putting it back with the same id and links.
         */
        tagCreate: (tag: Tag, taskIds: readonly number[] = []): UndoCommand => ({
            label: tagLabel("createTag", tag.name),
            undo: () => deleteTagOf(tag.id),
            redo: () => restoreTagOf(tag, taskIds),
        }),

        /** Deletion of a tag: undone by putting it back with the same id, place and links (`taskIds` are the tasks that had it). */
        tagDelete: (tag: Tag, taskIds: readonly number[]): UndoCommand => ({
            label: tagLabel("deleteTag", tag.name),
            undo: () => restoreTagOf(tag, taskIds),
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

        /** A tag given to (or taken from) one or more tasks as ONE step; `taskIds` are the tasks that really changed. */
        tagAssign: (tag: Pick<Tag, "id" | "name">, taskIds: readonly number[], assigned: boolean): UndoCommand => ({
            label: taskIds.length === 1
                ? tagLabel(assigned ? "assignTag" : "unassignTag", tag.name)
                : i18n.t("undo.named", { label: i18n.t(assigned ? "undo.labels.assignTagMany" : "undo.labels.unassignTagMany", { count: taskIds.length }), name: shorten(tag.name) }),
            undo: () => setTagOn(tag.id, taskIds, !assigned),
            redo: () => setTagOn(tag.id, taskIds, assigned),
        }),

        /** Move of a task (with its subtasks) to another section or parent task. */
        taskMove: (taskId: number, name: string, from: TaskPlace, to: TaskPlace): UndoCommand => ({
            label: makeLabel("move", "task", name),
            undo: () => moveTaskTo(taskId, { sectionId: from.sectionId, parentTaskId: from.parentTaskId }, from.index),
            redo: () => moveTaskTo(taskId, { sectionId: to.sectionId, parentTaskId: to.parentTaskId }, to.index),
        }),
    }
}

type UndoCommands = ReturnType<typeof createUndoCommands>

type RecorderOf<T> = { [K in keyof T]: T[K] extends (...args: infer A) => UndoCommand ? (...args: A) => void : never }

/** The same builders, but each call also records the command in the history. */
export type UndoRecorder = RecorderOf<UndoCommands> & {
    /** Records a command built by the caller (for the actions that need the state of their own component). */
    record: (command: UndoCommand) => void
    /** Marks a write that records its command when it ends, so that an undo asked meanwhile waits for it. */
    track: <T>(write: Promise<T>) => Promise<T>
}

/** Wraps the builders so that every call records the command. */
export function createUndoRecorder(commands: UndoCommands, record: (command: UndoCommand) => void, track: UndoRecorder["track"] = write => write, getScope?: () => number | undefined, getNoteId?: () => number | null | undefined): UndoRecorder {
    // Every command is stamped with the template draft it is done in (if any), so it is only undone from that draft
    const scoped = (command: UndoCommand) => {
        const scope = getScope?.()
        if (scope !== undefined && command.scopeNoteId === undefined) command.scopeNoteId = scope
        // ...and with the note that was active (in the focused pane) when it was done, so undo/redo can refresh that note
        const noteId = getNoteId?.()
        if (noteId != null && command.noteId === undefined) command.noteId = noteId
        record(command)
    }
    const entries = Object.entries(commands).map(([name, build]) =>
        [name, (...args: never[]) => scoped((build as (...a: never[]) => UndoCommand)(...args))] as const)
    return { ...Object.fromEntries(entries), record: scoped, track } as UndoRecorder
}

/** A recorder that does nothing (outside an UndoProvider, e.g. in isolated component tests). */
const noop = () => {}
export const NOOP_RECORDER: UndoRecorder = {
    rename: noop, color: noop, background: noop, taskCompletion: noop, taskPriority: noop, taskDescription: noop, remove: noop, create: noop,
    archive: noop, unarchive: noop, archiveMany: noop, treeMove: noop, removeMany: noop, colorMany: noop, colorContent: noop, treeMoveMany: noop, sectionMove: noop, directMove: noop, sectionMoveToNewGroup: noop, taskMove: noop, taskMoveMany: noop, tagCreate: noop, tagDelete: noop, tagRename: noop, tagColor: noop, tagAssign: noop, record: noop, track: write => write,
}
