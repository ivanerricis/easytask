import { useCallback, useMemo } from "react"
import { emptyDBTrash, getDBTrash, getDBTrashCount, purgeDBItem, restoreDBItem } from "@/db/queries/trash"
import { deleteDBItem, type DBItemType } from "@/db/queries/shared_queries"
import { forgetOpenGroupWidth } from "@/lib/group-widths"
import { removeThenWrite } from "./remove-optimistic"
import type { Runtime, WorkspaceActionsType } from "./types"

type TrashActions = Pick<WorkspaceActionsType, "deleteItem" | "getTrash" | "getTrashCount" | "restoreItem" | "purgeItem" | "emptyTrash">

/**
 * Delete (move to trash), restore, purge and empty. Every write that changes the trash bumps the trash version.
 * @category WorkspaceData Context
 */
export function useTrashActions(rt: Runtime): TrashActions {
    const { withLoading, withTrashChange, bumpAudioVersion, bumpTemplates, afterItemChange } = rt
    /**
     * Delete an item from the workspace (moves it to the trash). A folder or a note is removed from the sidebar tree
     * at once and put back if the write fails; the tabs of deleted notes (or of notes inside a deleted folder) are
     * closed by the tabs module as the tree changes (and reopened if the write fails). Deleting a folder clears the current folder if it was affected.
     * Sections, groups and tasks are removed from the open note by the caller.
     * @param itemType - The type of the item to delete (e.g., "folder", "note", "section", "task").
     * @param itemID - The ID of the item to delete.
     * @throws Will throw an error if the item cannot be deleted.
     * @category Workspace Data Context
     */
    const deleteItem = useCallback((itemType: DBItemType, itemID: number) => withTrashChange(() =>
        // Folders and notes leave the sidebar tree at once (and their open tabs close with them); restored on failure
        removeThenWrite(rt, itemType, itemID, () => deleteDBItem(itemType, itemID), () => { afterItemChange(itemType); if (itemType === "section_group") forgetOpenGroupWidth(itemID) })
    ), [rt, withTrashChange, afterItemChange])

    /**
     * Retrieves the trashed items of a workspace. Does not touch the context state.
     * @param workspaceID - The ID of the workspace.
     * @category Workspace Data Context
     */
    const getTrash = useCallback((workspaceID: number) =>
        withLoading(() => getDBTrash(workspaceID)), [withLoading])

    /**
     * The number of items in the trash of a workspace. Does not touch the context state (and does not raise isLoading,
     * so a badge can ask for it often).
     * @category Workspace Data Context
     */
    const getTrashCount = useCallback((workspaceID: number) => getDBTrashCount(workspaceID), [])

    /**
     * Restores an item and its deleted ancestors. Does not reload the data: the caller must call
     * getWorkspaceData (and getNoteData if the current note may be affected).
     * @category Workspace Data Context
     */
    const restoreItem = useCallback((itemType: DBItemType, itemID: number) =>
        withTrashChange(async () => {
            await restoreDBItem(itemType, itemID)
            // Restoring a section or a task can bring back its deleted group too
            afterItemChange(itemType, true)
        }), [withTrashChange, afterItemChange])

    /**
     * Permanently deletes a trashed item. Does not reload the data.
     * @category Workspace Data Context
     */
    const purgeItem = useCallback((itemType: DBItemType, itemID: number) =>
        withTrashChange(async () => {
            await purgeDBItem(itemType, itemID)
            if (itemType === "section_group") forgetOpenGroupWidth(itemID)
            afterItemChange(itemType)
        }), [withTrashChange, afterItemChange])

    /**
     * Permanently deletes every trashed item of a workspace. Does not reload the data.
     * @category Workspace Data Context
     */
    const emptyTrash = useCallback((workspaceID: number) =>
        withTrashChange(async () => {
            await emptyDBTrash(workspaceID)
            bumpTemplates()
            bumpAudioVersion()
        }), [withTrashChange, bumpAudioVersion, bumpTemplates])

    return useMemo(() => ({ deleteItem, getTrash, getTrashCount, restoreItem, purgeItem, emptyTrash }), [ deleteItem, getTrash, getTrashCount, restoreItem, purgeItem, emptyTrash ])
}
