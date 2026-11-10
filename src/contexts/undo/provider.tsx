import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { PreferencesContext } from "../preferences-context-object"
import { useShortcut } from "@/hooks/use-shortcut"
import { reportError } from "@/lib/report-error"
import { useWorkspace } from "../use-workspace"
import { useActiveNoteId } from "../use-tabs"
import { TabsContext } from "../tabs-context-object"
import { useTemplateDrafts } from "../use-template-drafts"
import { useActiveNoteActions } from "../use-active-note"
import { useWorkspaceActions } from "../workspace-data"
import { createUndoCommands, createUndoRecorder } from "./commands"
import { UndoContext, UndoRecorderContext, type UndoContextType } from "./context"
import { runHistory, runHistoryTo } from "./run-history"
import { UNDO_LIMIT, createUndoHistory, type UndoCommand } from "./stack"

/**
 * Keeps the undo/redo history of the open workspace (it is emptied when the workspace changes) and binds the
 * `undo`/`redo` shortcuts. It must be inside the WorkspaceDataProvider (it uses the workspace and active note actions).
 * Undo and redo show a toast with the action and the button to go the other way.
 * @category Undo
 */
export function UndoProvider({ children }: { children: React.ReactNode }) {
    const { currentWorkspace } = useWorkspace()
    const workspaceActions = useWorkspaceActions()
    const noteActions = useActiveNoteActions()
    // Optional: without preferences the default limit applies
    const undoLimit = useContext(PreferencesContext)?.undoLimit ?? UNDO_LIMIT
    const activeNoteId = useActiveNoteId()
    const drafts = useTemplateDrafts()
    // Every note open in any pane (outside the tabs provider: none)
    const openIds = useContext(TabsContext)?.openIds
    const openIdsRef = useRef<number[]>([])
    // The action of a template draft is undone only from its editor: the history reads the active note when it runs
    const activeNoteIdRef = useRef(activeNoteId)
    const draftIdsRef = useRef<number[]>([])
    const [history] = useState(() => createUndoHistory(undoLimit))
    const workspaceId = currentWorkspace?.id ?? null
    const workspaceIdRef = useRef(workspaceId)

    // The history belongs to one workspace
    useEffect(() => {
        workspaceIdRef.current = workspaceId
        history.clear()
    }, [workspaceId, history])

    useEffect(() => {
        activeNoteIdRef.current = activeNoteId
        history.setIsBlocked(command => command.scopeNoteId !== undefined && command.scopeNoteId !== activeNoteIdRef.current)
    }, [activeNoteId, history])

    useEffect(() => { openIdsRef.current = openIds ?? [] }, [openIds])

    // The note of a draft is deleted when it closes: its actions can no longer be undone or redone
    useEffect(() => {
        const ids = drafts.map(draft => draft.noteId)
        for (const id of draftIdsRef.current) if (!ids.includes(id)) history.dropScope(id)
        draftIdsRef.current = ids
    }, [drafts, history])

    // The limit can change in the settings: the history is trimmed at once
    useEffect(() => { history.setLimit(undoLimit) }, [history, undoLimit])

    const snapshot = useSyncExternalStore(history.subscribe, history.getSnapshot)

    // The id of the active note when it is a template draft (the actions done there are scoped to it)
    const getScope = useCallback(() => {
        const id = activeNoteIdRef.current
        return id !== null && draftIdsRef.current.includes(id) ? id : undefined
    }, [])

    // Undo/redo of an action done in a note that is open in a pane without the focus reloads that note (the focused one is
    // refreshed by its own optimistic update path); a note that is not open has nothing cached to refresh
    const getNoteData = noteActions.getNoteData
    useEffect(() => {
        history.setOnApplied(command => {
            const id = command.noteId
            if (id === undefined || id === activeNoteIdRef.current || !openIdsRef.current.includes(id)) return
            return getNoteData(id).catch(error => reportError(error))
        })
    }, [history, getNoteData])

    // The commands read the ref only when they run (never during render)
    const recorder = useMemo(() => createUndoRecorder(
        // eslint-disable-next-line react-hooks/refs
        createUndoCommands({ getWorkspaceId: () => workspaceIdRef.current, workspace: workspaceActions, note: noteActions }),
        history.record,
        history.track,
        // eslint-disable-next-line react-hooks/refs
        getScope,
        // eslint-disable-next-line react-hooks/refs
        () => activeNoteIdRef.current,
    ), [history, workspaceActions, noteActions, getScope])

    const isLatest = useCallback((command: UndoCommand) => history.isLatest(command), [history])
    const clear = useCallback(() => history.clear(), [history])
    const undo = useCallback(() => runHistory(history, "undo"), [history])
    const redo = useCallback(() => runHistory(history, "redo"), [history])
    const undoTo = useCallback((index: number) => runHistoryTo(history, "undo", index), [history])
    const redoTo = useCallback((index: number) => runHistoryTo(history, "redo", index), [history])

    // Not active in text fields (the fields have their own undo)
    useShortcut("undo", () => { void undo() })
    useShortcut("redo", () => { void redo() })
    useShortcut("redo-alt", () => { void redo() })

    const entries = useSyncExternalStore(history.subscribe, history.getEntries)

    const value = useMemo<UndoContextType>(
        () => ({ ...snapshot, entries, undo, redo, undoTo, redoTo, isLatest, clear, recorder }),
        [snapshot, entries, isLatest, clear, undo, redo, undoTo, redoTo, recorder],
    )

    return (
        <UndoRecorderContext.Provider value={recorder}>
            <UndoContext.Provider value={value}>{children}</UndoContext.Provider>
        </UndoRecorderContext.Provider>
    )
}
