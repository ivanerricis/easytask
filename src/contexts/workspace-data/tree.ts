import { useCallback, useMemo } from "react"
import { createDBNoteInFolder, createDBWorkspaceNote, updateDBNoteBackground } from "@/db/queries/note"
import { createDBSubFolder, createDBWorkspaceFolder, updateDBFolderColorContent } from "@/db/queries/folder"
import { withRollback } from "../with-rollback"
import { moveDBTreeItem } from "@/db/queries/tree"
import { duplicateDBNote } from "@/db/queries/duplicate"
import { renameDBItem, updateDBColor, type DBItemType } from "@/db/queries/shared_queries"
import {
    buildFolder, buildNote, colorFolderContent, findTreeItem, getFolderNotes, getSubfolders,
    insertTreeItem, patchTreeItem, removeTreeItem,
} from "../workspace-tree-ops"
import type { Folder, Note } from "@/types/types"
import type { PreviousColor, Runtime, WorkspaceActionsType } from "./types"

type TreeActions = Pick<WorkspaceActionsType,
    "createWorkspaceFolder" | "createWorkspaceNote" | "createSubFolder" | "createNoteInFolder" |
    "renameItem" | "updateItemColor" | "updateNoteBackground" | "updateFolderColorContent" | "moveTreeItem" | "duplicateNote">

/** The colors of a folder, of its subfolders and of their notes (the folder first, then its notes and subfolders depth first). */
const collectColors = (folder: Folder): PreviousColor[] => [
    { itemType: "folder", id: folder.id, name: folder.name, before: folder.color },
    ...folder.notes.map((note): PreviousColor => ({ itemType: "note", id: note.id, name: note.name, before: note.color })),
    ...folder.subfolders.flatMap(collectColors),
]

/**
 * Folders and notes of the workspace tree: creations, rename/color (optimistic on the sidebar tree) and moves.
 * @category WorkspaceData Context
 */
export function useTreeActions(rt: Runtime): TreeActions {
    const { withLoading, applyTree, getTree, getWorkspaceData, reloadTreeInBackground } = rt

    /**
     * Adds the created item to the sidebar tree. Without the new id, or when the parent is not in the tree,
     * the tree is reloaded in background instead.
     */
    const addToTree = useCallback((type: "folder" | "note", workspaceID: number, parentId: number | null, id: unknown, name: string, color?: string): number | null => {
        const applied = typeof id === "number" && applyTree(
            tree => insertTreeItem(
                tree, type,
                type === "folder"
                    ? buildFolder(id, workspaceID, parentId, name, color, getSubfolders(tree, parentId))
                    : buildNote(id, workspaceID, parentId, name, color, getFolderNotes(tree, parentId)),
                parentId),
            tree => removeTreeItem(tree, type, id))
        if (!applied) reloadTreeInBackground(workspaceID)
        return typeof id === "number" ? id : null
    }, [applyTree, reloadTreeInBackground])

    const createWorkspaceFolder = useCallback((workspaceID: number, name: string, color?: string) =>
        withLoading(async () => {
            return addToTree("folder", workspaceID, null, await createDBWorkspaceFolder(workspaceID, name, color), name, color)
        }), [withLoading, addToTree])

    const createWorkspaceNote = useCallback((workspaceID: number, name: string, color?: string) =>
        withLoading(async () => {
            return addToTree("note", workspaceID, null, await createDBWorkspaceNote(workspaceID, name, color), name, color)
        }), [withLoading, addToTree])

    const createSubFolder = useCallback((workspaceID: number, folderID: number, name: string) =>
        withLoading(async () => {
            return addToTree("folder", workspaceID, folderID, await createDBSubFolder(workspaceID, folderID, name), name)
        }), [withLoading, addToTree])

    const createNoteInFolder = useCallback((workspaceID: number, folderID: number, name: string) =>
        withLoading(async () => {
            return addToTree("note", workspaceID, folderID, await createDBNoteInFolder(workspaceID, folderID, name), name)
        }), [withLoading, addToTree])

    /**
     * Patches a folder/note of the sidebar tree before running the write and restores the previous value
     * when the write fails. Other item types are not part of the workspace tree: the write runs as is.
     */
    const patchThenWrite = useCallback(async (
        itemType: DBItemType, itemID: number, key: "name" | "color", value: string | undefined, write: () => Promise<void>,
    ) => {
        const tree = getTree()
        const found = tree && (itemType === "folder" || itemType === "note") ? findTreeItem(tree, itemType, itemID) : undefined
        const rollback = found && (itemType === "folder" || itemType === "note")
            ? applyTree(
                t => patchTreeItem(t, itemType, itemID, { [key]: value }),
                t => patchTreeItem(t, itemType, itemID, { [key]: found.item[key] }))
            : null
        await withRollback(rollback, write)
    }, [applyTree, getTree])

    /**
     * Rename an item in the workspace (folders and notes are updated in the sidebar tree at once).
     * @param itemType - The type of the item to rename (e.g., "folder", "note", "section", "task").
     * @param itemID - The ID of the item to rename.
     * @param name - The new name for the item.
     * @throws Will throw an error if the item cannot be renamed.
     * @category Workspace Data Context
     */
    const renameItem = useCallback((itemType: DBItemType, itemID: number, name: string) =>
        withLoading(() => patchThenWrite(itemType, itemID, "name", name, () => renameDBItem(itemType, itemID, name))),
        [withLoading, patchThenWrite])

    /**
     * Update the color of an item in the workspace (folders and notes are updated in the sidebar tree at once).
     * @param itemType - The type of the item to update (e.g., "folder", "note", "section", "task").
     * @param itemID - The ID of the item to update.
     * @param color - The new color for the item (optional).
     * @throws Will throw an error if the item color cannot be updated.
     * @category Workspace Data Context
     */
    const updateItemColor = useCallback((itemType: DBItemType, itemID: number, color?: string) =>
        withLoading(() => patchThenWrite(itemType, itemID, "color", color, () => updateDBColor(itemType, itemID, color))),
        [withLoading, patchThenWrite])

    /**
     * Update the background color of a note (updated in the sidebar tree at once, where the open note reads it).
     * @param noteID - The ID of the note.
     * @param color - The new background (hex), undefined for the default background.
     * @throws Will throw an error if the background cannot be saved.
     * @category Workspace Data Context
     */
    const updateNoteBackground = useCallback((noteID: number, color?: string) => withLoading(async () => {
        const tree = getTree()
        const before = (tree ? findTreeItem(tree, "note", noteID)?.item as Note | undefined : undefined)?.bg_color ?? null
        const rollback = applyTree(
            t => patchTreeItem(t, "note", noteID, { bg_color: color ?? null }),
            t => patchTreeItem(t, "note", noteID, { bg_color: before }))
        await withRollback(rollback, () => updateDBNoteBackground(noteID, color))
    }), [withLoading, applyTree, getTree])

    /**
     * Update the color of a folder and of everything it contains (updated in the sidebar tree at once).
     * @param folderID - The ID of the folder to update.
     * @param color - The new color for the folder (optional).
     * @returns The previous color of the folder and of every folder and note it touched (the folder itself first), to undo the change.
     * @throws Will throw an error if the folder color cannot be updated.
     * @category Workspace Data Context
     */
    const updateFolderColorContent = useCallback((folderID: number, color?: string) => withLoading(async () => {
        const tree = getTree()
        const found = tree ? findTreeItem(tree, "folder", folderID) : undefined
        const previous = found ? collectColors(found.item as Folder) : []
        const rollback = applyTree(t => colorFolderContent(t, folderID, color))
        await withRollback(rollback, () => updateDBFolderColorContent(folderID, color))
        return previous
    }), [withLoading, applyTree, getTree])

    /**
     * Moves a folder or a note to another folder (null = workspace root) at the given index among its
     * new siblings of the same type. It does NOT reload the data: the caller must call getWorkspaceData.
     * @param itemType - "folder" or "note".
     * @param itemId - The ID of the item to move.
     * @param targetFolderId - The destination folder ID, or null for the workspace root.
     * @param targetIndex - The index among the destination siblings (clamped).
     * @throws Will throw an error if the move is invalid (e.g. folder into its own descendant) or a name conflict occurs.
     * @category Workspace Data Context
     */
    const moveTreeItem = useCallback((itemType: "folder" | "note", itemId: number, targetFolderId: number | null, targetIndex: number) =>
        withLoading(() => moveDBTreeItem(itemType, itemId, targetFolderId, targetIndex)), [withLoading])

    /**
     * Duplicates a note right after the original (same folder, same color, content included) and reloads the
     * sidebar tree, because the following siblings shift by one position.
     * @param noteID - The ID of the note to duplicate.
     * @returns The ID of the copy.
     * @throws Will throw an error if the note no longer exists or the copy cannot be written.
     * @category Workspace Data Context
     */
    const duplicateNote = useCallback((noteID: number) => withLoading(async () => {
        const tree = getTree()
        const workspaceID = tree ? findTreeItem(tree, "note", noteID)?.item.workspaceID : null
        const id = await duplicateDBNote(noteID)
        if (typeof workspaceID === "number") await getWorkspaceData(workspaceID)
        return id
    }), [withLoading, getTree, getWorkspaceData])

    return useMemo(() => ({ createWorkspaceFolder, createWorkspaceNote, createSubFolder, createNoteInFolder, renameItem, updateItemColor, updateNoteBackground, updateFolderColorContent, moveTreeItem, duplicateNote }), [ createWorkspaceFolder, createWorkspaceNote, createSubFolder, createNoteInFolder, renameItem, updateItemColor, updateNoteBackground, updateFolderColorContent, moveTreeItem, duplicateNote ])
}
