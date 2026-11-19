import { createExternalStore } from "@/lib/external-store"

/** A tab waiting to be put into inline rename: the note and the pane whose tab bar shows it. */
export type RenameRequest = { noteId: number, pane: number }

/**
 * "Rename this note's tab as soon as it is shown": set by whoever creates a note and opens it (nothing else can reach the inline
 * rename of a tab from outside), consumed by the `NoteHeader` of that note in that pane.
 */
export const pendingRename = createExternalStore<RenameRequest | null>(null)

/** Asks for the tab of `noteId` in `pane` to start the inline rename once it is rendered. */
export const requestTabRename = (noteId: number, pane: number) => pendingRename.set({ noteId, pane })

/** True (and the request is forgotten) when the pending request is for this note in this pane; false otherwise. */
export function consumeTabRename(noteId: number, pane: number): boolean {
    const request = pendingRename.getState()
    if (!request || request.noteId !== noteId || request.pane !== pane) return false
    pendingRename.set(null)
    return true
}
