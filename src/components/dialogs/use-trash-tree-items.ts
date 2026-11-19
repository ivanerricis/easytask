import { useCallback } from "react"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useOptionalUndo, useUndoRecorder } from "@/contexts/undo/use-undo"
import type { TreeItemRef } from "@/contexts/undo/commands"
import { useIsActiveDraft } from "@/contexts/use-template-drafts"
import { toastTrashed } from "@/lib/toast-trashed"

/**
 * Moves folders and notes to the trash as ONE undo step, with the toast that undoes it. On a failure it rethrows the error
 * (the items trashed so far stay trashed and undoable); `trashed` remembers them, so that a retry of the same list skips them.
 */
export const useTrashTreeItems = () => {
    const { deleteItem } = useWorkspaceActions()
    const recorder = useUndoRecorder()
    const undo = useOptionalUndo()?.undo
    const isDraft = useIsActiveDraft()

    return useCallback(async (items: TreeItemRef[], trashed = new Set<string>()) => {
        const done: TreeItemRef[] = []
        try {
            for (const item of items) {
                const key = `${item.itemType}-${item.id}`
                if (trashed.has(key)) continue
                await deleteItem(item.itemType, item.id)
                trashed.add(key)
                done.push(item)
            }
            trashed.clear()
            toastTrashed(items.length, undo, isDraft)
        } finally {
            if (done.length > 0) recorder.removeMany(done)
        }
    }, [deleteItem, recorder, undo, isDraft])
}

