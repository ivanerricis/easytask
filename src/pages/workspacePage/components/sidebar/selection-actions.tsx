/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useWorkspaceData } from "@/contexts/workspace-data"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import type { ColorChange, TreeItemRef, TreeMoveStep } from "@/contexts/undo/commands"
import { DialogDeleteSelection } from "@/components/dialogs/dialog-delete-selection"
import { useItemTransfer } from "@/hooks/use-workspace-transfer"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { getTopMostItems } from "./selection"
import { useSelectionStore } from "./selection-context"
import { listTreeItems, type DropZone, type TreeData, type TreeRef } from "./tree-dnd"
import { useTreeData } from "./use-tree-data"
import { useRefreshTree } from "./use-move-tree-item"
import { planMultiMove, type PlannedMove } from "./tree-multi-move"

export type SelectionActions = {
    /** The items the actions apply to: the selected ones without those inside another selected folder, in tree order. */
    getTargets: () => TreeItemRef[]
    /** Opens the confirmation to move the selection to the trash. */
    requestDelete: () => void
    /** Archives the selection (no confirmation) in one undo step, then clears the selection. */
    archiveSelection: () => Promise<void>
    /** Sets (or, with null, removes) the color of every selected item; one undo step. */
    applyColor: (color: string | null) => Promise<void>
    /** Moves the selection to the end of a folder (null = workspace root); one undo step. */
    moveTo: (folderId: number | null) => Promise<void>
    /** Runs a plan of {@link planMultiMove} (a drop); one undo step. */
    executeMove: (plan: PlannedMove[]) => Promise<void>
    /** Plans the drop of the selection onto a row / the root area. Pass `targets` (from getTargets) to skip recomputing them on every pointer move. */
    planDrop: (over: TreeRef | null, zone: DropZone, targets?: TreeRef[]) => PlannedMove[] | null
    /** Exports the selection in one file. */
    exportSelection: () => Promise<void>
}

const SelectionActionsContext = createContext<SelectionActions | null>(null)

/** The actions on the multi-selection (null outside a SelectionActionsProvider). */
export const useSelectionActions = () => useContext(SelectionActionsContext)

const describe = (tree: TreeData, refs: TreeRef[]): TreeItemRef[] => {
    const { folders, notes } = listTreeItems(tree)
    return refs.flatMap(ref => {
        const item = ref.type === "folder" ? folders.get(ref.id) : notes.get(ref.id)
        return item ? [{ itemType: ref.type, id: ref.id, name: item.name }] : []
    })
}

/**
 * Implements what the menu of a multi-selection does (delete, archive, move, color, export) and renders the delete confirmation.
 * Every action is ONE undo step, even if it touches many items. It must be inside a SelectionProvider.
 */
export function SelectionActionsProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
    const store = useSelectionStore()
    const { updateItemColor, moveTreeItem, archiveItem } = useWorkspaceData()
    const recorder = useUndoRecorder()
    const { exportItems } = useItemTransfer()
    const [deleting, setDeleting] = useState<{ items: TreeItemRef[], open: boolean }>({ items: [], open: false })

    const tree = useTreeData()
    const refreshTree = useRefreshTree()

    const getTargets = useCallback(
        () => describe(tree, getTopMostItems(tree, store?.getRefs() ?? [])),
        [tree, store],
    )

    const requestDelete = useCallback(() => {
        const targets = getTargets()
        if (targets.length > 0) setDeleting({ items: targets, open: true })
    }, [getTargets])

    const archiveSelection = useCallback(async () => {
        const done: TreeItemRef[] = []
        try {
            for (const item of getTargets()) {
                await archiveItem(item.itemType, item.id)
                done.push(item)
            }
        } catch (error) {
            reportError(error, getErrorMessage(error))
        }
        if (done.length > 0) recorder.archiveMany(done)
        store?.reset()
    }, [getTargets, archiveItem, recorder, store])

    // Tracked: an undo asked while the writes run (or right after the last one, before the command is recorded) waits for them
    const applyColor = useCallback((color: string | null) => recorder.track((async () => {
        const { folders, notes } = listTreeItems(tree)
        const changes: ColorChange[] = []
        try {
            // Every selected item, also one inside a selected folder: a color change never touches the content of a folder
            for (const ref of store?.getRefs() ?? []) {
                const item = ref.type === "folder" ? folders.get(ref.id) : notes.get(ref.id)
                if (!item || (item.color ?? null) === color) continue
                await updateItemColor(ref.type, ref.id, color ?? undefined)
                changes.push({ itemType: ref.type, id: ref.id, name: item.name, before: item.color ?? null, after: color })
            }
        } catch (error) {
            reportError(error, getErrorMessage(error))
        }
        if (changes.length > 0) recorder.colorMany(changes)
    })()), [tree, store, updateItemColor, recorder])

    const executeMove = useCallback(async (plan: PlannedMove[]) => {
        const done: TreeMoveStep[] = []
        try {
            for (const step of plan) {
                await moveTreeItem(step.type, step.id, step.to.folderId, step.to.index)
                done.push({ itemType: step.type, id: step.id, name: step.name, from: step.from, to: step.to })
            }
        } catch (error) {
            reportError(error, getErrorMessage(error))
        }
        if (done.length > 0) recorder.treeMoveMany(done)
        await refreshTree()
    }, [moveTreeItem, recorder, refreshTree])

    const planDrop = useCallback((over: TreeRef | null, zone: DropZone, targets?: TreeRef[]) =>
        planMultiMove(tree, targets ?? getTargets().map(item => ({ type: item.itemType, id: item.id })), over, zone),
    [tree, getTargets])

    const moveTo = useCallback(async (folderId: number | null) => {
        const plan = planDrop(folderId === null ? null : { type: "folder", id: folderId }, "inside")
        if (plan) await executeMove(plan)
    }, [planDrop, executeMove])

    const exportSelection = useCallback(async () => {
        const targets = getTargets()
        if (targets.length === 0) return
        const name = targets.length === 1 ? targets[0].name ?? "" : t("transfer.itemsFileName", { count: targets.length })
        await exportItems(targets.map(item => ({ type: item.itemType, id: item.id })), name)
    }, [getTargets, exportItems, t])

    const value = useMemo<SelectionActions>(
        () => ({ getTargets, requestDelete, archiveSelection, applyColor, moveTo, executeMove, planDrop, exportSelection }),
        [getTargets, requestDelete, archiveSelection, applyColor, moveTo, executeMove, planDrop, exportSelection],
    )

    return (
        <SelectionActionsContext.Provider value={value}>
            {children}
            <DialogDeleteSelection
                items={deleting.items}
                isOpen={deleting.open}
                onOpenChange={(open) => setDeleting(prev => ({ ...prev, open }))}
            />
        </SelectionActionsContext.Provider>
    )
}
