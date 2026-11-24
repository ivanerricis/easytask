import { createContext } from "react"
import type { Note } from "@/types/types"
import { createExternalStore, type ExternalStore } from "@/lib/external-store"

export type TabsContextType = {
    /** Ids of the open notes, in tab order. */
    openIds: number[]
    /** Id of the active tab, if any. */
    activeId: number | null
    /** The open notes, derived from the live notes list (ids not found are dropped). */
    tabs: Note[]
    /** The active note, derived from the live notes list. */
    currentNote: Note | null
    /** True once the tabs saved for the loaded workspace have been read (and reopened, if the preference is on). */
    restored: boolean
}

export type TabsActionsType = {
    /** Opens the note in a tab (if not already open) and makes it the active one. */
    openNote: (noteId: number) => void
    /** Closes a tab; when it is the active one the neighbour tab becomes active. */
    closeNote: (noteId: number) => void
    /** Closes several tabs at once. */
    closeNotes: (noteIds: readonly number[]) => void
    /** Closes the active tab. */
    closeActiveNote: () => void
    /** Closes every tab. */
    closeAllNotes: () => void
    /** Moves a tab from an index to another one and activates it. */
    reorderTabs: (from: number, to: number) => void
    /** Makes an open tab the active one. */
    activateNote: (noteId: number) => void
    /** Activates the next (1) or previous (-1) tab, wrapping around the ends. */
    cycleNote: (direction: 1 | -1) => void
}

/** What is selected in a note (shown in the details panel). */
export type SelectedItem = { type: "task", id: number }

export type ScrollPosition = { left: number, top: number }

/** The elements that can be closed (their state is saved in the database). */
export type RevealKind = "group" | "section" | "task"

/**
 * Per-note UI state that must survive tab switches (selection, scroll position, elements the search has opened).
 * It is a plain external store: it never triggers a re-render of the whole tabs tree.
 * The saved open/closed state of groups, sections and tasks is NOT here: it is the `collapsed` column of the note data.
 * @category Tabs
 */
export type TabUiStore = {
    /** Whether the search has opened a closed element just to show a match (temporary: nothing is saved). */
    isRevealed: (noteId: number, kind: RevealKind, id: number) => boolean
    setRevealed: (noteId: number, kind: RevealKind, id: number, revealed: boolean) => void
    /** Closes again everything the search had opened in a note. */
    clearRevealed: (noteId: number) => void
    getSelectedItem: (noteId: number) => SelectedItem | null
    setSelectedItem: (noteId: number, item: SelectedItem | null) => void
    /** The tags the note is filtered by (a view of the note, kept while its tab is open; not saved). Empty: no filter. A stable array until it changes. */
    getTagFilter: (noteId: number) => readonly number[]
    setTagFilter: (noteId: number, tagIds: readonly number[]) => void
    getScroll: (noteId: number) => ScrollPosition | undefined
    setScroll: (noteId: number, position: ScrollPosition) => void
    /** Drops the UI state of the notes that are not in `keep` (closed tabs). */
    retain: (keep: readonly number[]) => void
    subscribe: (listener: () => void) => () => void
}

export const TabsContext = createContext<TabsContextType | null>(null)
export const TabsActionsContext = createContext<TabsActionsType | null>(null)
export const ActiveIdContext = createContext<number | null>(null)
/** The active note id as a store: a row reads only whether it is the active one, so a tab switch re-renders just the rows that change. */
export const ActiveIdStoreContext = createContext<ExternalStore<number | null>>(createExternalStore<number | null>(null))
export const TabUiContext = createContext<TabUiStore | null>(null)
