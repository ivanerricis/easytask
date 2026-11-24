/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useActiveNote } from "@/contexts/use-active-note"
import { usePaneRoot } from "@/contexts/use-layout"
import { useActiveNoteId, useTabUiStore } from "@/contexts/use-tabs"
import { usePreferences } from "@/contexts/use-preferences"
import { useTagFilter } from "@/contexts/use-tag-filter"
import { useStoreSelector } from "@/lib/external-store"
import { collectMatches, searchKey, type SearchMatch, type SearchMatchKind } from "./note-search"
import { activeMatch, activeOccurrenceOf, createNoteSearchStore, type NoteSearchStore } from "./note-search-store"

export const NoteSearchContext = createContext<NoteSearchStore | null>(null)

/** The search store of the open note (null outside a NoteSearchProvider: nothing is searched, no row highlights anything). */
export const useNoteSearchStore = () => useContext(NoteSearchContext)

const NEVER = () => () => {}

/** Typing waits this long before the note is scanned again (a big note is scanned in one go). */
const TYPING_DELAY_MS = 100

/** Frames to wait for the current match to be drawn after its ancestors have been opened. */
const REVEAL_FRAMES = 10

/**
 * Opens (for the time of the search only: nothing is saved) the closed groups, sections and tasks that hide a match: the
 * group and the section of a task, the parents of a subtask (a group name and a section title are always drawn). The
 * elements the search opened close again when the search is closed.
 */
function openAncestors(match: SearchMatch, noteId: number, ui: ReturnType<typeof useTabUiStore>) {
    if (match.kind !== "group") ui.setRevealed(noteId, "group", match.groupId, true)
    if (match.kind === "task" && match.sectionId !== undefined) ui.setRevealed(noteId, "section", match.sectionId, true)
    if (match.kind === "task") for (const taskId of match.taskPath) ui.setRevealed(noteId, "task", taskId, true)
}

/** Finds the matches of the query in the tree of the note, and brings the current one into view. Draws nothing. */
function NoteSearchEngine({ store }: { store: NoteSearchStore }) {
    const { noteDataTree } = useActiveNote()
    const noteId = useActiveNoteId()
    const uiStore = useTabUiStore()
    const { hideCompletedTasks, completedTasksLast } = usePreferences()
    const tagFilter = useTagFilter()
    const paneRoot = usePaneRoot()
    const open = useStoreSelector(store, s => s.open)
    const query = useStoreSelector(store, s => s.query)
    const revealTick = useStoreSelector(store, s => s.revealTick)
    // The query of the last scan: another one is a new search (back to the first match)
    const scanned = useRef("")

    useEffect(() => {
        if (!open) scanned.current = ""
        if (!open || !noteDataTree) return
        const fresh = scanned.current !== query
        const run = () => {
            scanned.current = query
            store.setMatches(collectMatches(noteDataTree, query, { hideCompleted: hideCompletedTasks, completedLast: completedTasksLast, tagFilter }), fresh)
        }
        // A new query waits for the typing to pause; a change of the tree is scanned at once
        if (!fresh || !query) { run(); return }
        const timer = setTimeout(run, TYPING_DELAY_MS)
        return () => clearTimeout(timer)
    }, [open, query, noteDataTree, hideCompletedTasks, completedTasksLast, tagFilter, store])

    // What the search opened closes again with it
    useEffect(() => {
        if (!open || noteId === null) return
        return () => uiStore.clearRevealed(noteId)
    }, [open, noteId, uiStore])

    useEffect(() => {
        if (revealTick === 0 || noteId === null) return
        const match = activeMatch(store.getState())
        if (!match) return
        openAncestors(match, noteId, uiStore)
        let frame = 0
        let attempts = 0
        // The ancestors are drawn on the next frames: look for the current mark until it exists
        const seek = () => {
            const mark = paneRoot().querySelector("mark[data-active]")
            if (mark) {
                mark.scrollIntoView?.({ block: "nearest", inline: "nearest" })
                return
            }
            if (++attempts < REVEAL_FRAMES) frame = requestAnimationFrame(seek)
        }
        frame = requestAnimationFrame(seek)
        return () => cancelAnimationFrame(frame)
    }, [revealTick, noteId, store, uiStore, paneRoot])

    return null
}

/**
 * Holds the search inside the open note: the field state, the matches in drawing order and the current one. The search
 * belongs to the active note (it closes and clears when another note becomes active).
 */
export function NoteSearchProvider({ children }: { children: ReactNode }) {
    const noteId = useActiveNoteId()
    const [store] = useState(createNoteSearchStore)

    useEffect(() => { store.close() }, [store, noteId])

    return (
        <NoteSearchContext.Provider value={store}>
            <NoteSearchEngine store={store} />
            {children}
        </NoteSearchContext.Provider>
    )
}

/** The keys of the items that hold a match, computed once per list of matches. */
const keyCache = new WeakMap<SearchMatch[], ReadonlySet<string>>()
const matchKeys = (matches: SearchMatch[]): ReadonlySet<string> => {
    let keys = keyCache.get(matches)
    if (!keys) {
        keys = new Set(matches.map(m => m.key))
        keyCache.set(matches, keys)
    }
    return keys
}

/**
 * What a row needs to highlight its text: the query when the item holds a match (an empty text otherwise, also while the
 * search is closed) and which of its occurrences is the current match (-1 when none). Primitive snapshots: only the rows
 * whose answer changes re-render.
 */
export function useSearchHighlight(kind: SearchMatchKind, id: number): { query: string, active: number } {
    const store = useNoteSearchStore()
    const key = searchKey(kind, id)
    const query = useSyncExternalStore(
        store?.subscribe ?? NEVER,
        () => {
            const state = store?.getState()
            return state && state.open && matchKeys(state.matches).has(key) ? state.query : ""
        },
    )
    const active = useSyncExternalStore(
        store?.subscribe ?? NEVER,
        () => { const state = store?.getState(); return state ? activeOccurrenceOf(state, kind, id) : -1 },
    )
    return { query, active }
}
