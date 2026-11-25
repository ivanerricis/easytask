import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { isUndoableType } from "@/contexts/undo/commands"
import type { DBItemType } from "@/db/queries/shared_queries"
import { getErrorMessage } from "@/lib/utils"
import { useInlineEdit } from "@/hooks/use-inline-edit"

type InlineRenameOptions = {
    itemType: DBItemType
    id: number
    name: string
    /** Applies the new name to the cached data before the write; returns the function that undoes it if the write fails. */
    optimistic?: (name: string) => () => void
    /** Reloads the data after the rename (when the change is not applied optimistically). */
    reload?: () => Promise<void>
    /** Called after the write and just before its undo step is recorded. */
    beforeRecord?: () => void
}

/** Inline rename of a folder, note or workspace: the same write and undo entry the rename dialog used to make. */
export function useInlineRename({ itemType, id, name, optimistic, reload, beforeRecord }: InlineRenameOptions) {
    const { renameItem } = useWorkspaceActions()
    const recorder = useUndoRecorder()

    return useInlineEdit({
        value: name,
        errorMessage: getErrorMessage,
        onCommit: async next => {
            const rollback = optimistic?.(next)
            try {
                await renameItem(itemType, id, next)
                beforeRecord?.()
                if (isUndoableType(itemType)) recorder.rename(itemType, id, name, next)
                await reload?.()
            } catch (err) {
                rollback?.()
                throw err
            }
        },
    })
}
