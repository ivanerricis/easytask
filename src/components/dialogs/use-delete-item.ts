import { useTranslation } from "react-i18next"
import { useContext } from "react"
import { PreferencesContext } from "@/contexts/preferences-context-object"
import { useSubmitOnce } from "@/hooks/use-submit-once"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useOptionalUndo, useUndoRecorder } from "@/contexts/undo/use-undo"
import { getItemName, isUndoableRemoveType } from "@/contexts/undo/commands"
import type { DBItemType } from "@/db/queries/shared_queries"
import { useIsActiveDraft } from "@/contexts/use-template-drafts"
import { toastTrashed } from "@/lib/toast-trashed"
import { useConfirmSkipped } from "./use-skipped-confirm"

type DeleteItemOptions<T extends { id: number }> = {
    item: T
    itemType: DBItemType
    /** Id passed to `getItemData` (the item id when missing). */
    getItemId?: number | undefined
    /** Reloads the data after the delete (when the removal is not applied optimistically). */
    getItemData?: (id: number) => Promise<void>
    /** Removes the item from the cached data before the write; returns the function that restores it if the write fails. */
    optimistic?: () => () => void
}

/**
 * Moves an item to the trash: optimistic removal, delete, undo record and toast.
 * @returns A function that does it; when the write fails the optimistic removal is rolled back and the error is rethrown.
 */
export const useDeleteItem = <T extends { id: number }>({ item, itemType, getItemId, getItemData, optimistic }: DeleteItemOptions<T>) => {
    const { deleteItem } = useWorkspaceActions()
    const recorder = useUndoRecorder()
    const undo = useOptionalUndo()?.undo
    const isDraft = useIsActiveDraft()

    return async (): Promise<void> => {
        const rollback = optimistic?.()
        try {
            await deleteItem(itemType, item.id)
            // Without an explicit id the reload gets the deleted item's own (e.g. the home reloads its workspaces)
            await getItemData?.(getItemId ?? item.id)
            const undoable = isUndoableRemoveType(itemType)
            if (undoable) recorder.remove(itemType, item.id, getItemName(item))
            toastTrashed(1, undoable ? undo : undefined, isDraft)
        } catch (error) {
            rollback?.()
            throw error
        }
    }
}

type DeleteRequestOptions<T extends { id: number }> = DeleteItemOptions<T> & {
    /** Tells whether the item holds something worth a confirmation (a rejection counts as yes). */
    hasContent: () => boolean | Promise<boolean>
    /** Opens the confirmation dialog. */
    openDialog: () => void
}

/**
 * Entry point of the delete menus of notes, sections and groups: asks for the confirmation only when needed.
 * With the preference on the dialog opens only for an item with content; with it off the item is never confirmed.
 * Without confirmation the item goes to the trash at once (undo toast included); a failure is reported with an error toast.
 * @returns `request` to call from the menu entry.
 */
export const useDeleteRequest = <T extends { id: number }>({ hasContent, openDialog, ...deleteOptions }: DeleteRequestOptions<T>) => {
    const { t } = useTranslation()
    // Read straight from the context: outside a provider (menus rendered alone) the default applies, which is to ask
    const confirmDeleteWithContent = useContext(PreferencesContext)?.confirmDeleteWithContent
    const deleteNow = useDeleteItem(deleteOptions)
    const { run } = useSubmitOnce()

    const request = () => {
        void run(async () => {
            let confirm = false
            if (confirmDeleteWithContent !== false) {
                try {
                    confirm = await hasContent()
                } catch (error) {
                    reportError(error)
                    confirm = true
                }
            }
            if (confirm) {
                openDialog()
                return
            }
            try {
                await deleteNow()
            } catch (error) {
                reportError(error, t("dialogs.delete.error", { message: getErrorMessage(error) }))
            }
        })
    }

    return { request }
}

type SkippableDeleteOptions<T extends { id: number }> = DeleteItemOptions<T> & {
    /** The key of the confirmation (see `SKIP_KEYS`): once the user chose "Non chiedermelo più" for it, the item goes to the trash at once. */
    skipKey: string
    /** Opens the confirmation dialog. */
    openDialog: () => void
}

/**
 * Entry point of a delete menu entry whose confirmation can be silenced: opens the dialog, or, when the user chose
 * "Non chiedermelo più" (only for actions with the undo toast), moves the item to the trash at once with the toast that
 * undoes it; a failure is reported with an error toast.
 * @returns `request` to call from the menu entry.
 */
export const useSkippableDelete = <T extends { id: number }>({ skipKey, openDialog, ...deleteOptions }: SkippableDeleteOptions<T>) => {
    const { t } = useTranslation()
    const skipped = useConfirmSkipped(skipKey)
    const deleteNow = useDeleteItem(deleteOptions)
    const { run } = useSubmitOnce()

    const request = () => {
        if (!skipped) {
            openDialog()
            return
        }
        void run(async () => {
            try {
                await deleteNow()
            } catch (error) {
                reportError(error, t("dialogs.delete.error", { message: getErrorMessage(error) }))
            }
        })
    }

    return { request }
}
