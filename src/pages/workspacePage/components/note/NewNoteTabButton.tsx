import { useCallback, useState } from "react"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import { Button } from "@/components/ui/button"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceActions, useWorkspaceState } from "@/contexts/workspace-data"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { useTabsActions } from "@/contexts/use-tabs"
import { usePane } from "@/contexts/use-layout"
import { uniqueName } from "@/db/queries/names"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { requestTabRename } from "@/lib/pending-rename"

/** Attempts at a free name before giving up (the names of trashed notes are not in the tree but can still clash). */
const MAX_ATTEMPTS = 20

/**
 * The "+" at the right of the tabs of a pane: creates a note in the root of the tree with a provisional name, opens it in this pane
 * and puts its tab straight into inline rename (Enter confirms, Escape keeps the provisional name).
 */
export function NewNoteTabButton() {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    const { workspaceDataTree } = useWorkspaceState()
    const { createWorkspaceNote } = useWorkspaceActions()
    const recorder = useUndoRecorder()
    const { openNote } = useTabsActions()
    const pane = usePane()?.pane ?? 0
    const [busy, setBusy] = useState(false)
    const label = t("notes.newNote")

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
                    recorder.create("note", id, name)
                    openNote(id)
                    requestTabRename(id, pane)
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

    return (
        <TooltipCustom text={label}>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={label}
                disabled={busy}
                onClick={() => void create()}
                className="mx-1 my-auto shrink-0 text-muted-foreground"
            >
                <Plus />
            </Button>
        </TooltipCustom>
    )
}
