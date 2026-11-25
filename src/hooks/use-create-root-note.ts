import { useCallback, useState } from "react"
import i18n from "@/i18n"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceActions, useWorkspaceState } from "@/contexts/workspace-data"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { useTabsActions } from "@/contexts/use-tabs"
import { useLayout, usePane } from "@/contexts/use-layout"
import { uniqueName } from "@/db/queries/names"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { requestTabRename } from "@/lib/pending-rename"

/** Attempts at a free name before giving up (the names of trashed notes are not in the tree but can still clash). */
const MAX_ATTEMPTS = 20

/**
 * Creates a note in the root of the tree with a provisional name, opens it and puts its tab straight into inline rename
 * (Enter or blur keeps the note and records its creation for the undo; Escape cancels the creation: the note is deleted for good, with no undo step). Inside a pane the note opens there; elsewhere (the
 * shortcut with the sidebar closed) in the pane that has the focus. `busy` is true while one is being created.
 */
export function useCreateRootNote() {
    const { currentWorkspace } = useWorkspace()
    const { workspaceDataTree } = useWorkspaceState()
    const { createWorkspaceNote } = useWorkspaceActions()
    const recorder = useUndoRecorder()
    const { openNote } = useTabsActions()
    const own = usePane()?.pane
    const focused = useLayout().focused
    const pane = own ?? focused
    const [busy, setBusy] = useState(false)

    const create = useCallback(async () => {
        const workspaceId = currentWorkspace?.id
        if (!workspaceId || busy) return
        setBusy(true)
        try {
            const taken = (workspaceDataTree?.rootNotes ?? []).map(note => note.name)
            const base = i18n.t("notes.defaultName")
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                const name = uniqueName(base, taken, (original, n) => `${original} (${n + 1})`, { caseInsensitive: true })
                try {
                    const id = await createWorkspaceNote(workspaceId, name)
                    if (typeof id !== "number") return
                    openNote(id)
                    // The creation is recorded for the undo only when the note is kept: Escape in the name field deletes it
                    requestTabRename(id, pane, () => recorder.create("note", id, name))
                    return
                } catch (err) {
                    if ((err as { code?: string } | null)?.code !== "NOTE_EXISTS") throw err
                    taken.push(name)
                }
            }
        } catch (err) {
            reportError(err, getErrorMessage(err))
        } finally {
            setBusy(false)
        }
    }, [currentWorkspace?.id, busy, workspaceDataTree, createWorkspaceNote, recorder, openNote, pane])

    return { create, busy }
}
