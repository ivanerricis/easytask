import { useEffect, useReducer, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import type { Note } from "@/types/types"
import type { TabsBridge } from "./workspace-data/types"
import { initialLayoutState, layoutReducer, type LayoutState } from "@/lib/tabs/layout-reducer"
import { WHATS_NEW_TAB_ID } from "@/lib/tabs/virtual-tabs"
import { createTabUiStore } from "./tab-ui-store"
import { TabsProviders } from "./tabs-providers"
import { useLayoutPersistence } from "./use-layout-persistence"
import { useTabStores } from "./use-tab-stores"
import { useTabsValues } from "./use-tabs-values"

type TabsProviderProps = {
    /** The live notes of the loaded workspace: the tabs are derived from it. */
    notes: Note[]
    /** The ID of the loaded workspace (null when none), used to save and restore the open tabs. */
    workspaceId: number | null
    /** Filled with the tabs bridge (layout snapshot and reopen), for the module that deletes notes. Optional. */
    bridgeRef?: MutableRefObject<TabsBridge | null>
    children: React.ReactNode
}

/** A key of the SET of note ids (order independent), to detect real additions and removals. */
const noteIdsKey = (notes: Note[]): string => notes.map(note => note.id).sort((a, b) => a - b).join(",")

/**
 * Manages the open note tabs of the (possibly split) workspace: up to two panes, each with its tabs (ids only, reducer
 * based). It restores them per workspace at startup and keeps the per-note UI state. Split in several contexts so
 * consumers re-render only for what they use. Outside the panes the tabs hooks see the union of the open notes and the
 * focused pane's active note; `PaneTabsContext` holds the values and the actions bound to each pane.
 * @category Tabs
 */
export function TabsProvider({ notes, workspaceId, bridgeRef, children }: TabsProviderProps) {
    const [state, dispatch] = useReducer(layoutReducer, initialLayoutState)
    const [uiStore] = useState(createTabUiStore)
    const stateRef = useRef<LayoutState>(state)
    const notesSeen = useRef(false)
    const lastNotesKey = useRef<string | null>(null)

    const { activeStore, focusedStore, isSplitStore, paneStores, active } = useTabStores(state)

    useEffect(() => {
        stateRef.current = state
    }, [state])

    useEffect(() => {
        if (!bridgeRef) return
        bridgeRef.current = {
            snapshot: () => stateRef.current,
            reopen: snapshot => dispatch({ type: "reopen", state: snapshot }),
        }
        return () => { bridgeRef.current = null }
    }, [bridgeRef])

    // Tabs of notes that no longer exist (deleted, trashed, other workspace) are closed with the usual neighbour rule.
    // Only a change of the set of note ids matters (not a new list identity, e.g. after an edit or a draft).
    useEffect(() => {
        const key = noteIdsKey(notes)
        const first = !notesSeen.current
        notesSeen.current = true
        const changed = key !== lastNotesKey.current
        lastNotesKey.current = key
        // Nothing to prune before the first notes list arrives
        if (first || !changed) return
        dispatch({ type: "prune", existing: new Set([WHATS_NEW_TAB_ID, ...notes.map(note => note.id)]) })
    }, [notes])

    const restored = useLayoutPersistence(state, dispatch, workspaceId, notes)
    const values = useTabsValues(state, dispatch, stateRef, notes, restored, paneStores)

    // The UI state of closed tabs is dropped (a note open in either pane keeps its state)
    useEffect(() => {
        uiStore.retain(values.openIds)
    }, [uiStore, values.openIds])

    return (
        <TabsProviders
            values={values} uiStore={uiStore} active={active}
            activeStore={activeStore} focusedStore={focusedStore} isSplitStore={isSplitStore}
        >
            {children}
        </TabsProviders>
    )
}
