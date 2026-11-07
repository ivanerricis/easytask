import i18n from "@/i18n"
import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createEmitter } from "@/lib/emitter"
import { isWhatsNewTab } from "@/lib/tabs/virtual-tabs"
import { reportError } from "@/lib/report-error"
import type { NoteDataTree } from "@/types/types"
import { useActiveNoteId, useTabs } from "./use-tabs"
import { ActiveNoteActionsContext, ActiveNoteContext, type ActiveNoteActionsType } from "./active-note-context-object"
import { fetchNoteTree } from "./tree-builders"
import { PaneNoteActionsContext, PaneNoteTreesContext, PaneTabsContext } from "./layout-context-object"
import { createNoteOptimisticActions, type NoteOptimisticActions, type Rollback } from "./note-optimistic"

/* ------------------------------------------------------------------------------------ */

/**
 * External store with the note data of the open tabs, so that a switch to a cached tab is instant
 * and the entries of closed tabs can be evicted without going through React state.
 * @category ActiveNote Context
 */
type NoteCache = {
    get: (noteId: number) => NoteDataTree | undefined
    set: (noteId: number, tree: NoteDataTree) => void
    /** Evicts the entries of the notes that are not in `keep`. */
    retain: (keep: readonly number[]) => void
    subscribe: (listener: () => void) => () => void
    /** Listens to the notes whose entry is replaced (see `ActiveNoteActionsType.subscribeNoteChanges`). */
    subscribeChanges: (listener: (noteId: number) => void) => () => void
}

/**
 * Creates the cache of the note data of the open tabs.
 * @returns The cache.
 * @category ActiveNote Context
 */
function createNoteCache(): NoteCache {
    const entries = new Map<number, NoteDataTree>()
    const { subscribe, emit } = createEmitter()
    const changeListeners = new Set<(noteId: number) => void>()

    return {
        get: noteId => entries.get(noteId),
        set: (noteId, tree) => {
            entries.set(noteId, tree)
            emit()
            changeListeners.forEach(listener => listener(noteId))
        },
        retain: keep => {
            const keepSet = new Set(keep)
            let removed = false
            for (const id of [...entries.keys()]) {
                if (!keepSet.has(id)) {
                    entries.delete(id)
                    removed = true
                }
            }
            if (removed) emit()
        },
        subscribe,
        subscribeChanges: listener => {
            changeListeners.add(listener)
            return () => { changeListeners.delete(listener) }
        },
    }
}

/* ------------------------------------------------------------------------------------ */

/**
 * Single place that loads the data of the active notes. It loads on every activation (effect on the active id of each pane),
 * shows the cached data instantly and revalidates in background, and ignores stale responses
 * (a response is used only if no newer request for the same note started and, to be displayed, the note is still active).
 * With a split workspace both panes' active notes are loaded and the cache keeps the notes open in either pane.
 * It provides the actions of the focused pane (`ActiveNoteActionsContext`) and of each pane (`PaneNoteActionsContext`).
 * @category ActiveNote Context
 */
export function ActiveNoteProvider({ children }: { children: React.ReactNode }) {
    const focusedId = useActiveNoteId()
    const { openIds } = useTabs()
    const paneTabs = useContext(PaneTabsContext)
    const [cache] = useState(createNoteCache)

    // Outside the layout provider the single active note is the one of pane 0
    const id0 = paneTabs ? paneTabs[0].tabs.activeId : focusedId
    const id1 = paneTabs ? paneTabs[1].tabs.activeId : null

    const activeIdRef = useRef(focusedId)
    const id0Ref = useRef(id0)
    const id1Ref = useRef(id1)
    const openIdsRef = useRef(openIds)
    const requestSeq = useRef(new Map<number, number>())

    useEffect(() => {
        activeIdRef.current = focusedId
        id0Ref.current = id0
        id1Ref.current = id1
        openIdsRef.current = openIds
    }, [focusedId, id0, id1, openIds])

    // Evict the cache entries of closed tabs (the union of the panes)
    useEffect(() => {
        cache.retain(openIds)
    }, [cache, openIds])

    const nextSeq = useCallback((noteId: number) => {
        const seq = (requestSeq.current.get(noteId) ?? 0) + 1
        requestSeq.current.set(noteId, seq)
        return seq
    }, [])

    const loadNote = useCallback(async (noteId: number) => {
        // The "What's new" tab is not a note: there is nothing to load
        if (isWhatsNewTab(noteId)) return
        const seq = nextSeq(noteId)
        const tree = await fetchNoteTree(noteId)
        // Superseded by a newer request/optimistic update, or the tab has been closed meanwhile
        if (requestSeq.current.get(noteId) !== seq || !openIdsRef.current.includes(noteId)) return
        cache.set(noteId, tree)
    }, [cache, nextSeq])

    useEffect(() => {
        if (id0 === null) return
        loadNote(id0).catch(error => {
            reportError(error, i18n.t("errors.loadNote"))
        })
    }, [id0, loadNote])

    useEffect(() => {
        // id0 is read from its ref: a change of the other pane must not reload this one
        if (id1 === null || id1 === id0Ref.current) return
        loadNote(id1).catch(error => {
            reportError(error, i18n.t("errors.loadNote"))
        })
    }, [id1, loadNote])

    const treeOf = useCallback((id: number | null) => () => id !== null ? cache.get(id) ?? null : null, [cache])
    const getFocusedTree = useMemo(() => treeOf(focusedId), [treeOf, focusedId])
    const getTree0 = useMemo(() => treeOf(id0), [treeOf, id0])
    const getTree1 = useMemo(() => treeOf(id1), [treeOf, id1])
    const noteDataTree = useSyncExternalStore(cache.subscribe, getFocusedTree)
    const tree0 = useSyncExternalStore(cache.subscribe, getTree0)
    const tree1 = useSyncExternalStore(cache.subscribe, getTree1)

    const commit = useCallback((noteId: number, tree: NoteDataTree) => {
        nextSeq(noteId) // an in-flight reload would overwrite this newer data
        cache.set(noteId, tree)
    }, [cache, nextSeq])

    /** The actions bound to the note that `getActiveId` returns when an action runs. */
    const buildActions = useCallback((getActiveId: () => number | null): ActiveNoteActionsType => {
        const getActive = () => {
            const id = getActiveId()
            const tree = id !== null ? cache.get(id) : undefined
            return id !== null && tree ? { id, tree } : null
        }
        const refreshActiveNote = async () => {
            const id = getActiveId()
            if (id !== null) await loadNote(id)
        }
        const setNoteDataTree = (tree: NoteDataTree | null, noteId?: number) => {
            const id = noteId ?? getActiveId()
            if (id === null || !tree) return
            commit(id, tree)
        }
        const base = createNoteOptimisticActions({ active: getActive, get: cache.get, commit })
        // A creation that cannot be applied locally falls back to a background reload (never awaited by the UI)
        const withReload = <A extends unknown[]>(append: (...args: A) => Rollback | null) => (...args: A): Rollback => {
            const rollback = append(...args)
            if (!rollback) refreshActiveNote().catch(error => reportError(error, i18n.t("errors.refreshNote")))
            return rollback ?? (() => {})
        }
        const optimistic: NoteOptimisticActions = {
            ...base,
            appendGroup: withReload(base.appendGroup),
            appendSection: withReload(base.appendSection),
            appendTask: withReload(base.appendTask),
            applySectionMoveToNewGroup: withReload(base.applySectionMoveToNewGroup),
        }
        return {
            refreshActiveNote,
            getNoteData: loadNote,
            setNoteDataTree,
            getNoteTree: () => getActive()?.tree ?? null,
            getCachedNoteTree: noteId => cache.get(noteId) ?? null,
            subscribeNoteTree: cache.subscribe,
            subscribeNoteChanges: cache.subscribeChanges,
            ...optimistic,
        }
    }, [cache, loadNote, commit])

    // The store only reads the refs when an action runs (never during render)
    /* eslint-disable react-hooks/refs */
    const actions = useMemo(() => ({
        focused: buildActions(() => activeIdRef.current),
        pane0: buildActions(() => id0Ref.current),
        pane1: buildActions(() => id1Ref.current),
    }), [buildActions])
    /* eslint-enable react-hooks/refs */

    const value = useMemo(() => ({ noteDataTree }), [noteDataTree])
    const paneActions = useMemo(() => [actions.pane0, actions.pane1] as const, [actions])
    const paneTrees = useMemo(() => [tree0, tree1] as const, [tree0, tree1])

    return (
        <ActiveNoteActionsContext.Provider value={actions.focused}>
            <PaneNoteActionsContext.Provider value={paneActions}>
                <PaneNoteTreesContext.Provider value={paneTrees}>
                    <ActiveNoteContext.Provider value={value}>
                        {children}
                    </ActiveNoteContext.Provider>
                </PaneNoteTreesContext.Provider>
            </PaneNoteActionsContext.Provider>
        </ActiveNoteActionsContext.Provider>
    )
}
