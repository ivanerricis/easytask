import { createExternalStore } from "@/lib/external-store"

/** A tab waiting to be put into inline rename: the note and the pane whose tab bar shows it. */
export type RenameRequest = {
    noteId: number
    pane: number
    /**
     * Set when the note was just created and still has a provisional name: Escape in the name field then cancels the creation
     * (the note is deleted for good), anything else keeps the note and calls `onKeep` (which records the creation for the undo).
     */
    onKeep?: () => void
}

/**
 * "Rename this note's tab as soon as it is shown": set by whoever creates a note and opens it (nothing else can reach the inline
 * rename of a tab from outside), consumed by the `NoteHeader` of that note in that pane.
 */
export const pendingRename = createExternalStore<RenameRequest | null>(null)

/** Asks for the tab of `noteId` in `pane` to start the inline rename once it is rendered. */
export const requestTabRename = (noteId: number, pane: number, onKeep?: () => void) => pendingRename.set({ noteId, pane, onKeep })

/** The pending request (which is forgotten) when it is for this note in this pane; null otherwise. */
export function consumeTabRename(noteId: number, pane: number): RenameRequest | null {
    const request = pendingRename.getState()
    if (!request || request.noteId !== noteId || request.pane !== pane) return null
    pendingRename.set(null)
    return request
}
