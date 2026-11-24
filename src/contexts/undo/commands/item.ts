import type { ArchiveItemType } from "@/types/types"
import type { PreviousColor } from "../../workspace-data"
import type { UndoCommand } from "../stack"
import { withRollback } from "../../with-rollback"
import { eachInOrder, makeLabel, manyCommand, type UndoHelpers } from "./helpers"
import type { ColorChange, ManyItemRef, UndoItemType, UndoRemoveType } from "./types"

/** The commands on any item: rename, color, background, trash, creation, archive, and their multi-selection versions. */
export function itemCommands(h: UndoHelpers) {
    const { workspace, patchNoteItem, removeItem, restoreItem, archiveOne, unarchiveOne, reloadFor, setColor, manyLabel } = h

    const setName = (itemType: UndoItemType, id: number) => async (name: string) => {
        await withRollback(patchNoteItem(itemType, id, "name", name), () => workspace.renameItem(itemType, id, name))
    }

    const setBackground = (id: number) => (color: string | null) => workspace.updateNoteBackground(id, color ?? undefined)

    const setBackgroundImage = (id: number) => (path: string | null) => workspace.updateNoteBackgroundImage(id, path ?? undefined)

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

        /** Background image of a note (null = no image); it has the same label as the color. */
        backgroundImage: (noteId: number, name: string | null | undefined, before: string | null | undefined, after: string | null | undefined): UndoCommand => {
            const apply = setBackgroundImage(noteId)
            return {
                label: makeLabel("background", "note", name),
                undo: () => apply(before ?? null),
                redo: () => apply(after ?? null),
            }
        },

        /** Move to the trash: undone by restoring the item, with the same id and the same position. */
        remove: (itemType: UndoRemoveType, id: number, name: string | null | undefined): UndoCommand => ({
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

        /**
         * Creation of several tasks at once (a paste) as ONE step: undone by moving the new tasks to the trash (from the last to the
         * first), redone by restoring them (the ids never change); the open note is reloaded once at the end.
         */
        createMany: (items: ManyItemRef[]): UndoCommand => manyCommand({
            label: manyLabel("pasteMany", items.length),
            items,
            undoEach: item => removeItem(item.itemType as UndoItemType, item.id),
            redoEach: item => workspace.restoreItem(item.itemType, item.id),
            reloadRedo: () => reloadFor(items),
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
    }
}
