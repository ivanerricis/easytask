import type { UndoCommand } from "../stack"
import type { TreeItemType } from "../../workspace-tree-ops"
import { makeLabel, manyCommand, type UndoHelpers } from "./helpers"
import type { TreeMoveStep, TreePlace } from "./types"

/** The commands that move folders and notes in the sidebar tree. */
export function treeCommands(h: UndoHelpers) {
    const { workspace, reloadTree, manyLabel } = h

    const moveTreeTo = (itemType: TreeItemType, id: number) => async (place: TreePlace) => {
        await workspace.moveTreeItem(itemType, id, place.folderId, place.index)
        await reloadTree()
    }

    return {
        /** Move of a folder or a note in the sidebar tree. */
        treeMove: (itemType: TreeItemType, id: number, name: string, from: TreePlace, to: TreePlace): UndoCommand => {
            const apply = moveTreeTo(itemType, id)
            return {
                label: makeLabel("move", itemType, name),
                undo: () => apply(from),
                redo: () => apply(to),
            }
        },

        /**
         * Move of several folders/notes as ONE step. `steps` are in the order they were run, each with the place the item
         * had right before its step: undone by running them backwards (one reload), redone in order.
         */
        treeMoveMany: (steps: TreeMoveStep[]): UndoCommand => manyCommand({
            label: manyLabel("moveMany", steps.length),
            items: steps,
            undoEach: step => workspace.moveTreeItem(step.itemType, step.id, step.from.folderId, step.from.index),
            redoEach: step => workspace.moveTreeItem(step.itemType, step.id, step.to.folderId, step.to.index),
            reloadUndo: reloadTree,
            reloadRedo: reloadTree,
            reloadEvenOnFailure: true,
        }),
    }
}
