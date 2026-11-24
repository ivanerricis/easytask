import i18n from "@/i18n"
import { reportError } from "@/lib/report-error"
import type { DBItemType } from "@/db/queries/shared_queries"
import type { ArchiveItemType, NoteDataTree, WorkspaceDataTree } from "@/types/types"
import { findSection, findTask } from "../../note-tree-ops"
import { findTreeItem, type TreeItemType } from "../../workspace-tree-ops"
import { withRollback } from "../../with-rollback"
import type { UndoCommand } from "../stack"
import type { ManyItemRef, SectionPlace, TaskPlace, TreePlace, UndoDeps, UndoItemType, UndoRemoveType } from "./types"
import { isTreeType } from "./types"

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

export const shorten = (name: string | null | undefined) => {
    const value = (name ?? "").replace(/\s+/g, " ").trim()
    return value.length > NAME_MAX ? `${value.slice(0, NAME_MAX - 1)}…` : value
}

const typeName = (itemType: DBItemType) => i18n.t(`undo.itemTypes.${itemType}`)

type LabelKey = "rename" | "color" | "complete" | "reopen" | "addPriority" | "removePriority" | "description" | "delete" | "create" | "move" | "moveDirect" | "colorContent" | "background" | "archive" | "unarchive" | "copy"

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
 * The helpers shared by the commands of every area (reloads, trash, archive, color), built on the stable actions of `deps`.
 * @category Undo
 */
export function createUndoHelpers(deps: UndoDeps) {
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

    const removeFromNote = (itemType: UndoRemoveType, id: number) => {
        if (itemType === "section_group") return note.removeGroup(id)
        if (itemType === "section") return note.removeSection(id)
        if (itemType === "task") return note.removeTask(id)
        return null
    }

    /** Soft delete with the same optimistic removal as the delete dialog (folders and notes are removed by deleteItem). */
    const removeItem = async (itemType: UndoRemoveType, id: number) => {
        await withRollback(removeFromNote(itemType, id), () => workspace.deleteItem(itemType, id))
    }

    /** Restores from the trash (the ids are the same, so every reference stays valid) and reloads what changed. */
    const restoreItem = async (itemType: UndoRemoveType, id: number) => {
        await workspace.restoreItem(itemType, id)
        if (isTreeType(itemType)) await reloadTree()
        // The files of a group are listed again by the workspace data itself (the audio version is bumped)
        else if (itemType !== "audio_file" && itemType !== "media_file") await reloadNote()
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

    const setColor = (itemType: UndoItemType, id: number) => async (color: string | null) => {
        await withRollback(patchNoteItem(itemType, id, "color", color), () => workspace.updateItemColor(itemType, id, color ?? undefined))
    }

    /** The same label for every multi-selection action: the translated count ("Delete 3 items"). */
    const manyLabel = (key: "deleteMany" | "colorMany" | "moveMany" | "archiveMany" | "pasteMany", count: number) => i18n.t(`undo.labels.${key}`, { count })

    return { workspace, note, reloadTree, reloadNote, patchNoteItem, removeItem, restoreItem, archiveOne, unarchiveOne, reloadFor, setColor, manyLabel }
}

export type UndoHelpers = ReturnType<typeof createUndoHelpers>
