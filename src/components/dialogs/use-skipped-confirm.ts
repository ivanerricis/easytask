import { useContext } from "react"
import { PreferencesContext } from "@/contexts/preferences-context-object"

/**
 * The keys of the confirmations that can be silenced with "Non chiedermelo più". RULE: a confirmation gets a key only when
 * its action shows an undo toast ("Annulla"), so skipping the question never loses data for good. Irreversible actions
 * (empty the trash, delete for good, delete a workspace...) never have one.
 */
export const SKIP_KEYS = {
    taskTrash: "task-trash",
    folderTrash: "folder-trash",
    treeSelectionTrash: "tree-selection-trash",
    mediaRemove: "media-remove",
    tagDelete: "tag-delete",
    automationDelete: "automation-delete",
} as const

/** Whether the user chose not to be asked again for this confirmation (false outside a preferences provider: it asks). */
export const useConfirmSkipped = (key: string): boolean =>
    (useContext(PreferencesContext)?.skippedConfirms ?? []).includes(key)
