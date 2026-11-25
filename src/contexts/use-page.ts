import { useCallback, useContext, useMemo, useSyncExternalStore } from "react"
import { WorkspaceStateContext } from "@/contexts/workspace-data/context"
import { findTreeItem } from "@/contexts/workspace-tree-ops"
import type { Note, NoteKind } from "@/types/types"
import { ActiveIdContext, TabUiContext, type PageMode } from "./tabs-context-object"

const NEVER = () => () => {}

/**
 * What a note is: a "page" (Markdown text) or a plain "note" (also for an id that is not in the sidebar tree, like a template draft).
 * It follows the tree, so a page shows as one as soon as it is created.
 * @param noteId The ID of the note (null = none).
 * @category Hooks
 */
export function useNoteKind(noteId: number | null): NoteKind {
    // Without a provider (a pane drawn alone) every note is a plain note
    const workspaceDataTree = useContext(WorkspaceStateContext)?.workspaceDataTree
    return useMemo(() => {
        if (noteId === null || !workspaceDataTree) return "note"
        return (findTreeItem(workspaceDataTree, "note", noteId)?.item as Note | undefined)?.kind === "page" ? "page" : "note"
    }, [workspaceDataTree, noteId])
}

/** Whether the note open in this pane is a page. */
export function useIsActivePage(): boolean {
    return useNoteKind(useContext(ActiveIdContext)) === "page"
}

/**
 * How the page open in this pane is shown, and a setter: the text ("edit", the default) or the formatted preview.
 * Per pane and per page, kept while its tab is open and not saved.
 */
export function usePageMode(): [PageMode, (mode: PageMode) => void] {
    const store = useContext(TabUiContext)
    const noteId = useContext(ActiveIdContext)
    const mode = useSyncExternalStore(
        store?.subscribe ?? NEVER,
        useCallback(() => store && noteId !== null ? store.getPageMode(noteId) : "edit", [store, noteId]),
    )
    const setMode = useCallback((next: PageMode) => { if (store && noteId !== null) store.setPageMode(noteId, next) }, [store, noteId])
    return [mode, setMode]
}
