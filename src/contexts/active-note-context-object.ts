import { createContext } from "react"
import type { NoteDataTree } from "@/types/types"
import type { NoteOptimisticActions } from "./note-optimistic"

type ActiveNoteContextType = {
    /** Data of the active note (null while it is loaded for the first time, or without active note). */
    noteDataTree: NoteDataTree | null
}

export type ActiveNoteActionsType = NoteOptimisticActions & {
    /** Reloads the data of the active note from the database (rejects if the query fails). */
    refreshActiveNote: () => Promise<void>
    /** Reloads the data of an open note from the database and updates its cache entry (rejects if the query fails). */
    getNoteData: (noteId: number) => Promise<void>
    /**
     * Replaces the cached data of a note (optimistic updates): the active one of this instance unless `noteId` is given,
     * which lets a caller that holds a note id write it whichever note has the focus by the time it runs.
     */
    setNoteDataTree: (tree: NoteDataTree | null, noteId?: number) => void
    /** The cached data of the active note right now (not the render snapshot), null without active note or cached data. */
    getNoteTree: () => NoteDataTree | null
    /** The cached data of an open note (null when not cached): unlike getNoteTree it follows the id the caller renders with, never the one of the previous commit. */
    getCachedNoteTree: (noteId: number) => NoteDataTree | null
    /** Calls the listener after every change of the cached note data (any note); returns the unsubscribe. For rows that read one value of the tree. */
    subscribeNoteTree: (listener: () => void) => () => void
    /**
     * Calls the listener with the id of a note every time its cached data is replaced (optimistic update, undo, reload),
     * including a reload that brings the same data; the second argument tells a `load` (read from the database) from an `edit`. Returns the function that stops listening.
     */
    subscribeNoteChanges: (listener: (noteId: number, source: "load" | "edit") => void) => () => void
}

export const ActiveNoteContext = createContext<ActiveNoteContextType | null>(null)
export const ActiveNoteActionsContext = createContext<ActiveNoteActionsType | null>(null)
