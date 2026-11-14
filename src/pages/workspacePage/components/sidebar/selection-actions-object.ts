import { createContext, useContext } from "react"
import type { TreeItemRef } from "@/contexts/undo/commands"
import type { DropZone, TreeRef } from "./tree-dnd"
import type { PlannedMove } from "./tree-multi-move"

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

export const SelectionActionsContext = createContext<SelectionActions | null>(null)

/** The actions on the multi-selection (null outside a SelectionActionsProvider). */
export const useSelectionActions = () => useContext(SelectionActionsContext)
