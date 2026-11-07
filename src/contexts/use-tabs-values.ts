import { useMemo } from "react"
import i18n from "@/i18n"
import { WHATS_NEW_TAB_ID, isWhatsNewTab, whatsNewTabNote } from "@/lib/tabs/virtual-tabs"
import type { Dispatch, MutableRefObject } from "react"
import type { Note } from "@/types/types"
import type { LayoutActionsType, LayoutContextType, PaneTabsValue } from "./layout-context-object"
import { paneOf, unionOpenIds, type LayoutAction, type LayoutState, type PaneIndex } from "@/lib/tabs/layout-reducer"
import { initialTabsState, type TabsState } from "@/lib/tabs/tabs-reducer"
import type { TabsActionsType, TabsContextType } from "./tabs-context-object"
import type { ExternalStore } from "@/lib/external-store"

/** The value of the tabs context for a pane (an absent pane is the empty state). */
function paneTabsValue(tabs: TabsState | null, byId: ReadonlyMap<number, Note>, restored: boolean): TabsContextType {
    const state = tabs ?? initialTabsState
    return {
        openIds: state.openIds,
        activeId: state.activeId,
        tabs: state.openIds.flatMap(id => byId.get(id) ?? []),
        // The "What's new" tab is not a note: there is no current note while it is the active one
        currentNote: state.activeId !== null && !isWhatsNewTab(state.activeId) ? byId.get(state.activeId) ?? null : null,
        restored,
    }
}

type PaneAction = Extract<LayoutAction, { type: "pane" }>["action"]

/**
 * The tab actions bound to a pane. `getPane` gives the pane they act on (the focused one for the top-level actions).
 * Scoped (pane-bound) actions open, close the active tab of, activate in and cycle within that pane, and close only its
 * tabs for "close all"; the top-level ones act on the whole layout. Closing and reordering are the same for both.
 */
function buildTabsActions(
    dispatch: Dispatch<LayoutAction>,
    getState: () => LayoutState,
    getPane: () => PaneIndex,
    scoped: boolean,
): TabsActionsType {
    const inPane = (action: PaneAction) => dispatch({ type: "pane", pane: getPane(), action })
    return {
        openNote: id => scoped ? inPane({ type: "open", id }) : dispatch({ type: "open", id }),
        closeNote: id => dispatch({ type: "close", id }),
        closeNotes: ids => dispatch({ type: "closeMany", ids }),
        closeActiveNote: () => scoped ? inPane({ type: "closeActive" }) : dispatch({ type: "closeActive" }),
        closeAllNotes: () => {
            if (!scoped) return dispatch({ type: "closeAll" })
            const ids = paneOf(getState(), getPane())?.openIds
            if (ids?.length) dispatch({ type: "closeMany", ids })
        },
        reorderTabs: (from, to) => inPane({ type: "reorder", from, to }),
        activateNote: id => scoped ? inPane({ type: "activate", id }) : dispatch({ type: "activate", id }),
        cycleNote: direction => scoped ? inPane({ type: "cycle", direction }) : dispatch({ type: "cycle", direction }),
    }
}

/** The memoised values of the tabs and layout contexts. */
export type TabsValues = {
    /** The ids open in either pane. */
    openIds: readonly number[]
    actions: TabsActionsType
    layoutActions: LayoutActionsType
    layout: LayoutContextType
    paneTabs: readonly [PaneTabsValue, PaneTabsValue]
    value: TabsContextType
}

/**
 * Builds the memoised context values: the union tabs, the per-pane values and the actions (via `buildTabsActions`).
 * @param state The layout state.
 * @param dispatch The layout dispatcher.
 * @param stateRef Ref to the latest layout state, read only when an action runs.
 * @param notes The live notes.
 * @param restored Whether the layout of the workspace has been restored.
 * @param paneStores The per-pane active-id stores.
 * @returns The values.
 * @category Tabs
 */
export function useTabsValues(
    state: LayoutState,
    dispatch: Dispatch<LayoutAction>,
    stateRef: MutableRefObject<LayoutState>,
    notes: Note[],
    restored: boolean,
    paneStores: readonly [ExternalStore<number | null>, ExternalStore<number | null>],
): TabsValues {
    const { left, right, focused } = state
    const openIds = useMemo(() => unionOpenIds({ left, right, focused: 0 }), [left, right])

    // The actions only read the ref when they run (never during render)
    /* eslint-disable react-hooks/refs */
    const actions = useMemo(
        () => buildTabsActions(dispatch, () => stateRef.current, () => stateRef.current.focused, false),
        [dispatch, stateRef],
    )

    const layoutActions = useMemo<LayoutActionsType>(() => ({
        split: () => dispatch({ type: "split" }),
        unsplit: () => dispatch({ type: "unsplit" }),
        toggleSplit: () => dispatch({ type: stateRef.current.right ? "unsplit" : "split" }),
        focusPane: pane => dispatch({ type: "focus", pane }),
        openInPane: (noteId, pane) => dispatch({ type: "pane", pane, action: { type: "open", id: noteId } }),
        moveToPane: (noteId, pane, index) => dispatch({ type: "moveToPane", id: noteId, pane, index }),
        getLayout: () => {
            const { left, right, focused } = stateRef.current
            return { left, right, focused, isSplit: right !== null }
        },
    }), [dispatch, stateRef])

    const paneActions = useMemo(
        () => ([0, 1] as const).map(pane => buildTabsActions(dispatch, () => stateRef.current, () => pane, true)),
        [dispatch, stateRef],
    )
    /* eslint-enable react-hooks/refs */

    // The "What's new" tab is listed with the notes, as a stand-in note that only has an id and a name
    const byId = useMemo(() => {
        const map = new Map(notes.map(note => [note.id, note]))
        map.set(WHATS_NEW_TAB_ID, whatsNewTabNote(i18n.t("settings.about.update.notes")))
        return map
    }, [notes])

    const leftValue = useMemo(() => paneTabsValue(left, byId, restored), [left, byId, restored])
    const rightValue = useMemo(() => paneTabsValue(right, byId, restored), [right, byId, restored])

    const value = useMemo<TabsContextType>(() => {
        if (!right) return leftValue
        const focusedValue = focused === 0 ? leftValue : rightValue
        return {
            openIds,
            activeId: focusedValue.activeId,
            tabs: [...leftValue.tabs, ...rightValue.tabs],
            currentNote: focusedValue.currentNote,
            restored,
        }
    }, [right, focused, leftValue, rightValue, openIds, restored])

    const layout = useMemo<LayoutContextType>(() => ({ left, right, focused, isSplit: right !== null }), [left, right, focused])

    const paneTabs = useMemo<readonly [PaneTabsValue, PaneTabsValue]>(() => [
        { tabs: leftValue, actions: paneActions[0], activeStore: paneStores[0] },
        { tabs: rightValue, actions: paneActions[1], activeStore: paneStores[1] },
    ], [leftValue, rightValue, paneActions, paneStores])

    return { openIds, actions, layoutActions, layout, paneTabs, value }
}
