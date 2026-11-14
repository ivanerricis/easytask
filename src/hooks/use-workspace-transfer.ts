import i18n from "@/i18n"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { useTemplateDraftActions } from "@/contexts/use-template-drafts"
import { reportError } from "@/lib/report-error"
import { exportItemToFile, exportItemsToFile, exportWorkspaceToFile, importItemsFromFile, importWorkspaceFromFile } from "@/lib/workspace-transfer"
import { getErrorMessage } from "@/lib/utils"
import { useImportNames } from "@/contexts/import-names-context-object"

/**
 * Click handlers for the workspace export/import, with their toasts. Shared by the menus and the settings.
 * @category Hooks
 */
export function useWorkspaceTransfer() {
    const { getWorkspaces } = useWorkspace()
    const chooseNames = useImportNames()
    const { flushAll } = useTemplateDraftActions()
    const [isBusy, setBusy] = useState(false)

    const exportWorkspace = useCallback(async (workspace: { id: number, name: string }) => {
        setBusy(true)
        try {
            // The templates are part of the export: the changes of an open template editor are saved first
            await flushAll()
            if (await exportWorkspaceToFile(workspace)) toast.success(i18n.t("transfer.exported"))
        } catch (error) {
            reportError(error, getErrorMessage(error))
        } finally {
            setBusy(false)
        }
    }, [flushAll])

    const importWorkspace = useCallback(async () => {
        setBusy(true)
        try {
            const result = await importWorkspaceFromFile(chooseNames)
            if (!result) return
            await getWorkspaces()
            toast.success(result.skippedAudio > 0 ? i18n.t("transfer.importedSkipped", { count: result.skippedAudio }) : i18n.t("transfer.imported"))
        } catch (error) {
            reportError(error, getErrorMessage(error))
        } finally {
            setBusy(false)
        }
    }, [getWorkspaces, chooseNames])

    return { exportWorkspace, importWorkspace, isBusy }
}

/**
 * Click handlers for the export/import of single notes and folders, with their toasts. Used inside an open workspace
 * (it needs the workspace data and undo providers): the import refreshes the sidebar tree and is undoable.
 * @category Hooks
 */
export function useItemTransfer() {
    const { currentWorkspace } = useWorkspace()
    const { getWorkspaceData } = useWorkspaceActions()
    const recorder = useUndoRecorder()
    const chooseNames = useImportNames()
    const [isBusy, setBusy] = useState(false)

    const exportItem = useCallback(async (itemType: "note" | "folder", item: { id: number, name: string }) => {
        setBusy(true)
        try {
            if (await exportItemToFile(itemType, item)) toast.success(i18n.t("transfer.exportedItem"))
        } catch (error) {
            reportError(error, getErrorMessage(error))
        } finally {
            setBusy(false)
        }
    }, [])

    /** Exports several notes and folders in one file (the name is the default file name). */
    const exportItems = useCallback(async (items: { type: "note" | "folder", id: number }[], name: string) => {
        setBusy(true)
        try {
            if (await exportItemsToFile(items, name)) toast.success(i18n.t("transfer.exportedItem"))
        } catch (error) {
            reportError(error, getErrorMessage(error))
        } finally {
            setBusy(false)
        }
    }, [])

    /** Imports a note or folder file into a folder (null = workspace root) of the current workspace. */
    const importItems = useCallback(async (parentFolderId: number | null) => {
        if (!currentWorkspace) return
        setBusy(true)
        try {
            const result = await importItemsFromFile(currentWorkspace.id, parentFolderId, chooseNames)
            if (!result) return
            // The new rows are on disk: a failing refresh must not hide the success
            await getWorkspaceData(currentWorkspace.id).catch(error => reportError(error, i18n.t("errors.refreshTree")))
            for (const item of result.items) recorder.create(item.type, item.id, item.name)
            toast.success(result.skippedAudio > 0
                ? i18n.t("transfer.importedItemsSkipped", { count: result.skippedAudio })
                : i18n.t("transfer.importedItems"))
        } catch (error) {
            reportError(error, getErrorMessage(error))
        } finally {
            setBusy(false)
        }
    }, [currentWorkspace, getWorkspaceData, recorder, chooseNames])

    return { exportItem, exportItems, importItems, isBusy }
}
