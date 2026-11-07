import { act, render, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useContext } from "react"
import { TabsProvider } from "./tabs-context"
import { FocusedPaneStoreContext, PaneTabsContext } from "./layout-context-object"
import { TabUiContext } from "./tabs-context-object"
import { useLayout, useLayoutActions } from "./use-layout"
import type { TabsBridge } from "./workspace-data/types"
import { useActiveNoteId, useActiveNoteSelector, useIsTaskSelected, useSelectTask, useSelectedTask, useTabs, useTabsActions } from "./use-tabs"
import { getReopenNotes } from "@/lib/store/preferences"
import { getWorkspaceTabs, saveWorkspaceTabs } from "@/lib/store/tabs"
import { makeNote } from "@/test/ui-fixtures"
import type { Note } from "@/types/types"
import type { LayoutState } from "@/lib/tabs/layout-reducer"
import { WHATS_NEW_TAB_ID } from "@/lib/tabs/virtual-tabs"

vi.mock("@/lib/store/preferences", () => ({ getReopenNotes: vi.fn() }))
vi.mock("@/lib/store/tabs", () => ({ getWorkspaceTabs: vi.fn(), saveWorkspaceTabs: vi.fn() }))

/** A saved layout with a single pane. */
const single = (openIds: number[], activeId: number | null): LayoutState => ({ left: { openIds, activeId }, right: null, focused: 0 })

const notesOf = (...ids: number[]) => ids.map(id => makeNote({ id, name: `Nota ${id}` }))

type Props = { notes: Note[], workspaceId: number | null }

/** Renders the provider with a probe; the props can be changed through update (renderHook cannot change the wrapper props). */
function harness(initial: Props) {
    const latest: { current: ReturnType<typeof useAllHooks> } = { current: undefined as never }
    function useAllHooks() {
        return { ...useTabs(), ...useTabsActions() }
    }
    function Probe() {
        latest.current = useAllHooks()
        return null
    }
    const ui = (props: Props) => <TabsProvider notes={props.notes} workspaceId={props.workspaceId}><Probe /></TabsProvider>
    const view = render(ui(initial))
    return { latest, update: (props: Props) => view.rerender(ui(props)) }
}

describe("TabsProvider", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.mocked(getReopenNotes).mockResolvedValue(true)
        vi.mocked(getWorkspaceTabs).mockResolvedValue(single([], null))
        vi.mocked(saveWorkspaceTabs).mockResolvedValue(undefined)
    })

    it("throws when the hooks are used outside the provider", () => {
        expect(() => renderHook(() => useTabs())).toThrow(/TabsProvider/)
        expect(() => renderHook(() => useTabsActions())).toThrow(/TabsProvider/)
        expect(renderHook(() => useActiveNoteId()).result.current).toBeNull()
    })

    it("opens, activates and closes tabs, deriving the notes from the live list", () => {
        const { latest } = harness({ notes: notesOf(1, 2, 3), workspaceId: null })

        act(() => { latest.current.openNote(1); latest.current.openNote(2); latest.current.openNote(3) })
        expect(latest.current.tabs.map(n => n.id)).toEqual([1, 2, 3])
        expect(latest.current.currentNote?.id).toBe(3)

        act(() => latest.current.activateNote(1))
        expect(latest.current.activeId).toBe(1)

        act(() => latest.current.closeNote(1))
        expect(latest.current.tabs.map(n => n.id)).toEqual([2, 3])
        expect(latest.current.activeId).toBe(2)

        act(() => latest.current.reorderTabs(0, 1))
        expect(latest.current.openIds).toEqual([3, 2])

        act(() => latest.current.closeAllNotes())
        expect(latest.current.tabs).toEqual([])
        expect(latest.current.currentNote).toBeNull()
    })

    it("keeps the What's new tab (not a note) among the tabs, with no current note, when the notes list changes", () => {
        const { latest, update } = harness({ notes: notesOf(1, 2), workspaceId: null })
        act(() => { latest.current.openNote(1); latest.current.openNote(WHATS_NEW_TAB_ID) })

        expect(latest.current.openIds).toEqual([1, WHATS_NEW_TAB_ID])
        expect(latest.current.tabs.map(n => n.id)).toEqual([1, WHATS_NEW_TAB_ID])
        expect(latest.current.activeId).toBe(WHATS_NEW_TAB_ID)
        expect(latest.current.currentNote).toBeNull()

        // A note leaves the list: the prune must not close the virtual tab
        update({ workspaceId: null, notes: notesOf(2) })
        expect(latest.current.openIds).toEqual([WHATS_NEW_TAB_ID])
        expect(latest.current.activeId).toBe(WHATS_NEW_TAB_ID)
    })

    it("drops a saved What's new tab when the tabs are restored", async () => {
        vi.mocked(getWorkspaceTabs).mockResolvedValue(single([1, WHATS_NEW_TAB_ID], WHATS_NEW_TAB_ID))
        const { latest } = harness({ notes: notesOf(1), workspaceId: 1 })
        await waitFor(() => expect(latest.current.restored).toBe(true))
        expect(latest.current.openIds).toEqual([1])
        expect(latest.current.activeId).toBe(1)
    })

    it("reflects a rename or a recolor of an open note in its tab", () => {
        const { latest, update } = harness({ notes: notesOf(1, 2), workspaceId: null })
        act(() => { latest.current.openNote(1); latest.current.openNote(2) })
        expect(latest.current.tabs[1].name).toBe("Nota 2")

        update({ workspaceId: null, notes: [makeNote({ id: 1, name: "Nota 1" }), makeNote({ id: 2, name: "Rinominata", color: "#ff0000" })] })

        expect(latest.current.tabs.map(n => n.name)).toEqual(["Nota 1", "Rinominata"])
        expect(latest.current.currentNote?.name).toBe("Rinominata")
        expect(latest.current.currentNote?.color).toBe("#ff0000")
    })

    it("closes the tabs of notes that disappear from the list, picking the neighbour", () => {
        const { latest, update } = harness({ notes: notesOf(1, 2, 3), workspaceId: null })
        act(() => { latest.current.openNote(1); latest.current.openNote(2); latest.current.openNote(3); latest.current.activateNote(2) })

        update({ workspaceId: null, notes: notesOf(1, 3) })

        expect(latest.current.openIds).toEqual([1, 3])
        expect(latest.current.activeId).toBe(3)
    })

    it("keeps the action identities stable across state changes", () => {
        const { latest } = harness({ notes: notesOf(1, 2), workspaceId: null })
        const before = { ...latest.current }
        act(() => latest.current.openNote(1))
        act(() => latest.current.openNote(2))
        for (const key of ["openNote", "closeNote", "closeNotes", "closeActiveNote", "closeAllNotes", "reorderTabs", "activateNote"] as const)
            expect(latest.current[key]).toBe(before[key])
    })

    describe("persistence", () => {
        it("restores the saved tabs and the active one, dropping the notes that no longer exist", async () => {
            vi.mocked(getWorkspaceTabs).mockResolvedValue(single([3, 99, 1], 1))
            const { latest } = harness({ notes: notesOf(1, 2, 3), workspaceId: 7 })

            await waitFor(() => expect(latest.current.openIds).toEqual([3, 1]))
            expect(getWorkspaceTabs).toHaveBeenCalledWith(7)
            expect(latest.current.activeId).toBe(1)
        })

        it("reports restored once the saved tabs have been read, also when the preference is off", async () => {
            let release!: (tabs: LayoutState) => void
            vi.mocked(getWorkspaceTabs).mockReturnValue(new Promise(resolve => { release = resolve }))
            const { latest, update } = harness({ notes: notesOf(1, 2), workspaceId: 7 })
            expect(latest.current.restored).toBe(false)

            await act(async () => { release(single([1], 1)) })
            await waitFor(() => expect(latest.current.restored).toBe(true))
            expect(latest.current.openIds).toEqual([1])

            // Another workspace starts again from not restored
            vi.mocked(getReopenNotes).mockResolvedValue(false)
            update({ notes: notesOf(1, 2), workspaceId: 8 })
            expect(latest.current.restored).toBe(false)
            await waitFor(() => expect(latest.current.restored).toBe(true))
        })

        it("falls back to the first tab when the saved active note no longer exists", async () => {
            vi.mocked(getWorkspaceTabs).mockResolvedValue(single([2, 3], 99))
            const { latest } = harness({ notes: notesOf(1, 2, 3), workspaceId: 7 })

            await waitFor(() => expect(latest.current.openIds).toEqual([2, 3]))
            expect(latest.current.activeId).toBe(2)
        })

        it("does not restore when the preference is off, but still saves the tabs", async () => {
            vi.mocked(getReopenNotes).mockResolvedValue(false)
            vi.mocked(getWorkspaceTabs).mockResolvedValue(single([1], 1))
            const { latest } = harness({ notes: notesOf(1, 2), workspaceId: 7 })

            await waitFor(() => expect(getReopenNotes).toHaveBeenCalled())
            await act(async () => { await Promise.resolve() })
            expect(getWorkspaceTabs).not.toHaveBeenCalled()
            expect(latest.current.openIds).toEqual([])

            act(() => latest.current.openNote(2))
            await waitFor(() => expect(saveWorkspaceTabs).toHaveBeenLastCalledWith(7, single([2], 2)))
        })

        it("saves every change per workspace, and never before the saved tabs have been read", async () => {
            let release!: (tabs: LayoutState) => void
            vi.mocked(getWorkspaceTabs).mockReturnValue(new Promise(resolve => { release = resolve }))
            const { latest } = harness({ notes: notesOf(1, 2), workspaceId: 7 })

            act(() => latest.current.openNote(2))
            await act(async () => { await Promise.resolve() })
            expect(saveWorkspaceTabs).not.toHaveBeenCalled()

            await act(async () => { release(single([1], 1)) })
            // The tab opened by the user in the meantime wins over the saved ones
            await waitFor(() => expect(saveWorkspaceTabs).toHaveBeenLastCalledWith(7, single([2], 2)))
            expect(latest.current.openIds).toEqual([2])
        })

        it("resets and restores again when the workspace changes", async () => {
            vi.mocked(getWorkspaceTabs).mockImplementation(async id =>
                id === 7 ? single([1], 1) : single([11], 11))
            const { latest, update } = harness({ notes: notesOf(1), workspaceId: 7 })
            await waitFor(() => expect(latest.current.openIds).toEqual([1]))

            update({ notes: notesOf(11, 12), workspaceId: 8 })

            await waitFor(() => expect(latest.current.openIds).toEqual([11]))
            expect(latest.current.activeId).toBe(11)
            // The tabs of workspace 7 are not saved under workspace 8
            expect(saveWorkspaceTabs).not.toHaveBeenCalledWith(8, single([1], 1))
        })

        it("closes every tab when the workspace is unloaded", async () => {
            vi.mocked(getWorkspaceTabs).mockResolvedValue(single([1, 2], 2))
            const { latest, update } = harness({ notes: notesOf(1, 2), workspaceId: 7 })
            await waitFor(() => expect(latest.current.openIds).toEqual([1, 2]))

            update({ notes: notesOf(1, 2), workspaceId: null })

            await waitFor(() => expect(latest.current.openIds).toEqual([]))
            expect(saveWorkspaceTabs).not.toHaveBeenCalledWith(7, single([], null))
        })

        it("survives a store failure", async () => {
            vi.mocked(getWorkspaceTabs).mockRejectedValue(new Error("store down"))
            const { latest } = harness({ notes: notesOf(1), workspaceId: 7 })

            await waitFor(() => expect(console.error).toHaveBeenCalled())
            act(() => latest.current.openNote(1))
            expect(latest.current.openIds).toEqual([1])
        })
    })

    describe("task selection", () => {
        const wrapper = ({ children }: { children: ReactNode }) =>
            <TabsProvider notes={notesOf(1, 2)} workspaceId={null}>{children}</TabsProvider>
        const useAll = () => {
            const { activeId } = useTabs()
            return { activeId, selected: useSelectedTask(activeId), is7: useIsTaskSelected(7), is8: useIsTaskSelected(8), select: useSelectTask(), ...useTabsActions() }
        }

        it("is empty without an active note and ignores selecting", () => {
            const { result } = renderHook(useAll, { wrapper })
            expect(result.current.selected[0]).toBeNull()
            act(() => result.current.select(7))
            expect(result.current.selected[0]).toBeNull()
        })

        it("selects one task at a time and clears with null", () => {
            const { result } = renderHook(useAll, { wrapper })
            act(() => result.current.openNote(1))
            act(() => result.current.select(7))
            expect(result.current.selected[0]).toBe(7)
            expect(result.current.is7).toBe(true)
            expect(result.current.is8).toBe(false)

            act(() => result.current.selected[1](8))
            expect(result.current.is7).toBe(false)
            expect(result.current.is8).toBe(true)

            act(() => result.current.select(null))
            expect(result.current.selected[0]).toBeNull()
            expect(result.current.is8).toBe(false)
        })

        it("does not notify when the selection does not change", () => {
            let renders = 0
            const { result } = renderHook(() => { renders++; return useAll() }, { wrapper })
            act(() => result.current.openNote(1))
            act(() => result.current.select(7))
            const before = renders
            act(() => result.current.select(7))
            act(() => result.current.select(null))
            act(() => result.current.select(null))
            expect(renders).toBe(before + 1)
        })

        it("is kept per note and dropped when the tab is closed", () => {
            const { result } = renderHook(useAll, { wrapper })
            act(() => result.current.openNote(1))
            act(() => result.current.select(7))
            act(() => result.current.openNote(2))
            expect(result.current.selected[0]).toBeNull()
            act(() => result.current.select(8))

            act(() => result.current.activateNote(1))
            expect(result.current.selected[0]).toBe(7)

            act(() => result.current.closeNote(1))
            act(() => result.current.openNote(1))
            expect(result.current.selected[0]).toBeNull()
        })
    })
})

describe("useActiveNoteSelector", () => {
    it("re-renders a row only when its own answer changes", () => {
        vi.mocked(getReopenNotes).mockResolvedValue(false)
        const renders = { one: 0, two: 0 }
        const answers = { one: false, two: false }
        const Row = ({ id, name }: { id: number, name: "one" | "two" }) => {
            answers[name] = useActiveNoteSelector(activeId => activeId === id)
            renders[name]++
            return null
        }
        let actions: ReturnType<typeof useTabsActions>
        const Grab = () => { actions = useTabsActions(); return null }
        render(<TabsProvider notes={notesOf(1, 2, 3)} workspaceId={null}><Grab /><Row id={1} name="one" /><Row id={2} name="two" /></TabsProvider>)
        act(() => actions.openNote(1))
        expect(answers).toEqual({ one: true, two: false })
        const twoBefore = renders.two
        act(() => actions.openNote(3))
        expect(answers).toEqual({ one: false, two: false })
        // Row 2 was inactive before and after the switch to note 3: no re-render for it
        expect(renders.two).toBe(twoBefore)
        act(() => actions.openNote(2))
        expect(answers).toEqual({ one: false, two: true })
    })
})

describe("TabsProvider split workspace", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.mocked(getReopenNotes).mockResolvedValue(true)
        vi.mocked(getWorkspaceTabs).mockResolvedValue(single([], null))
        vi.mocked(saveWorkspaceTabs).mockResolvedValue(undefined)
    })

    function splitHarness(initial: Props) {
        const bridgeRef: { current: TabsBridge | null } = { current: null }
        const latest: { current: ReturnType<typeof useAll> } = { current: undefined as never }
        function useAll() {
            return {
                ...useTabs(), ...useTabsActions(), layout: useLayout(), layoutActions: useLayoutActions(),
                panes: useContext(PaneTabsContext)!, focusedStore: useContext(FocusedPaneStoreContext), ui: useContext(TabUiContext)!,
            }
        }
        function Probe() {
            latest.current = useAll()
            return null
        }
        const ui = (props: Props) => <TabsProvider notes={props.notes} workspaceId={props.workspaceId} bridgeRef={bridgeRef}><Probe /></TabsProvider>
        const view = render(ui(initial))
        return { latest, bridgeRef, update: (props: Props) => view.rerender(ui(props)) }
    }

    /** Notes 1 and 2 in the left pane, 3 and 4 in the right one (focused). */
    function splitSetup(workspaceId: number | null = null) {
        const h = splitHarness({ notes: notesOf(1, 2, 3, 4, 5), workspaceId })
        act(() => { h.latest.current.openNote(1); h.latest.current.openNote(2) })
        act(() => h.latest.current.layoutActions.split())
        act(() => { h.latest.current.layoutActions.openInPane(3, 1); h.latest.current.layoutActions.openInPane(4, 1) })
        return h
    }

    it("exposes the union of the panes and the focused pane's active note", () => {
        const { latest } = splitSetup()
        expect(latest.current.layout.isSplit).toBe(true)
        expect(latest.current.openIds).toEqual([1, 2, 3, 4])
        expect(latest.current.tabs.map(n => n.id)).toEqual([1, 2, 3, 4])
        expect(latest.current.activeId).toBe(4)
        expect(latest.current.currentNote?.id).toBe(4)

        act(() => latest.current.layoutActions.focusPane(0))
        expect(latest.current.activeId).toBe(2)
        expect(latest.current.currentNote?.id).toBe(2)
        expect(latest.current.layout.focused).toBe(0)
    })

    it("builds the pane values and per-pane active stores, with an empty state for an absent right pane", () => {
        const { latest } = splitSetup()
        const [leftPane, rightPane] = latest.current.panes
        expect(leftPane.tabs.openIds).toEqual([1, 2])
        expect(leftPane.tabs.activeId).toBe(2)
        expect(leftPane.tabs.currentNote?.id).toBe(2)
        expect(rightPane.tabs.tabs.map(n => n.id)).toEqual([3, 4])
        expect(leftPane.activeStore.getState()).toBe(2)
        expect(rightPane.activeStore.getState()).toBe(4)
        expect(latest.current.focusedStore.getState()).toBe(1)

        act(() => latest.current.layoutActions.unsplit())
        expect(latest.current.panes[1].tabs.openIds).toEqual([])
        expect(latest.current.panes[1].tabs.currentNote).toBeNull()
        expect(latest.current.panes[1].activeStore.getState()).toBeNull()
        expect(latest.current.focusedStore.getState()).toBe(0)
        expect(latest.current.openIds).toEqual([1, 2])
    })

    it("opens in the focused pane, activates in the pane that holds the note and moves it with openInPane/moveToPane", () => {
        const { latest } = splitSetup()
        act(() => latest.current.layoutActions.focusPane(0))
        act(() => latest.current.openNote(5))
        expect(latest.current.panes[0].tabs.openIds).toEqual([1, 2, 5])

        act(() => latest.current.activateNote(3))
        expect(latest.current.layout.focused).toBe(1)
        expect(latest.current.panes[1].tabs.activeId).toBe(3)

        act(() => latest.current.layoutActions.openInPane(1, 1))
        expect(latest.current.panes[0].tabs.openIds).toEqual([2, 5])
        expect(latest.current.panes[1].tabs.openIds).toEqual([3, 4, 1])

        act(() => latest.current.layoutActions.moveToPane(4, 0, 0))
        expect(latest.current.panes[0].tabs.openIds).toEqual([4, 2, 5])
        expect(latest.current.panes[1].tabs.openIds).toEqual([3, 1])
        expect(latest.current.layout.focused).toBe(0)
    })

    it("closes a note in any pane, and the active/cycle/reorder actions follow the focused pane", () => {
        const { latest } = splitSetup()
        act(() => latest.current.closeNote(1))
        expect(latest.current.panes[0].tabs.openIds).toEqual([2])

        act(() => latest.current.reorderTabs(0, 1))
        expect(latest.current.panes[1].tabs.openIds).toEqual([4, 3])
        act(() => latest.current.cycleNote(1))
        expect(latest.current.panes[1].tabs.activeId).toBe(4)
        act(() => latest.current.closeActiveNote())
        expect(latest.current.panes[1].tabs.openIds).toEqual([3])

        act(() => latest.current.closeNotes([2, 3]))
        expect(latest.current.layout.isSplit).toBe(false)
        expect(latest.current.openIds).toEqual([])
    })

    it("closeAllNotes closes both panes and goes back to a single one", () => {
        const { latest } = splitSetup()
        act(() => latest.current.closeAllNotes())
        expect(latest.current.layout.isSplit).toBe(false)
        expect(latest.current.openIds).toEqual([])
    })

    it("toggles the split and unsplit closes the right tabs", () => {
        const { latest } = splitSetup()
        act(() => latest.current.layoutActions.toggleSplit())
        expect(latest.current.layout.isSplit).toBe(false)
        expect(latest.current.openIds).toEqual([1, 2])
        act(() => latest.current.layoutActions.toggleSplit())
        expect(latest.current.layout.isSplit).toBe(true)
        expect(latest.current.panes[1].tabs.openIds).toEqual([])
    })

    it("has pane-bound actions that focus their pane and close the tabs of that pane only", () => {
        const { latest } = splitSetup()
        act(() => latest.current.panes[0].actions.activateNote(1))
        expect(latest.current.layout.focused).toBe(0)
        expect(latest.current.panes[0].tabs.activeId).toBe(1)

        act(() => latest.current.panes[1].actions.openNote(5))
        expect(latest.current.panes[1].tabs.openIds).toEqual([3, 4, 5])
        expect(latest.current.layout.focused).toBe(1)

        act(() => latest.current.panes[1].actions.reorderTabs(2, 0))
        expect(latest.current.panes[1].tabs.openIds).toEqual([5, 3, 4])
        act(() => latest.current.panes[0].actions.cycleNote(1))
        expect(latest.current.panes[0].tabs.activeId).toBe(2)
        expect(latest.current.layout.focused).toBe(0)

        act(() => latest.current.panes[0].actions.closeActiveNote())
        expect(latest.current.panes[0].tabs.openIds).toEqual([1])
        act(() => latest.current.panes[1].actions.closeNote(5))
        expect(latest.current.panes[1].tabs.openIds).toEqual([3, 4])
        act(() => latest.current.panes[1].actions.closeNotes([3]))
        expect(latest.current.panes[1].tabs.openIds).toEqual([4])

        act(() => latest.current.panes[1].actions.closeAllNotes())
        expect(latest.current.layout.isSplit).toBe(false)
        expect(latest.current.openIds).toEqual([1])
        // Closing all of an absent or empty pane does nothing
        act(() => latest.current.panes[1].actions.closeAllNotes())
        expect(latest.current.openIds).toEqual([1])
    })

    it("keeps identities stable across unrelated renders", () => {
        const { latest, update } = splitSetup()
        const before = latest.current
        update({ notes: latest.current.tabs.length ? notesOf(1, 2, 3, 4, 5) : [], workspaceId: null })
        // New notes array of equal content: the pane values change, but actions, stores and layout actions do not
        for (const pane of [0, 1] as const) {
            expect(latest.current.panes[pane].actions).toBe(before.panes[pane].actions)
            expect(latest.current.panes[pane].activeStore).toBe(before.panes[pane].activeStore)
        }
        expect(latest.current.layoutActions).toBe(before.layoutActions)
        expect(latest.current.layout).toBe(before.layout)
        expect(latest.current.focusedStore).toBe(before.focusedStore)
    })

    it("keeps the UI state of the notes open in either pane and drops it on close", () => {
        const { latest } = splitSetup()
        act(() => {
            latest.current.ui.setSelectedItem(1, { type: "task", id: 10 })
            latest.current.ui.setSelectedItem(4, { type: "task", id: 40 })
        })
        act(() => latest.current.layoutActions.moveToPane(1, 1))
        expect(latest.current.ui.getSelectedItem(1)).toEqual({ type: "task", id: 10 })
        expect(latest.current.ui.getSelectedItem(4)).toEqual({ type: "task", id: 40 })

        act(() => latest.current.closeNote(4))
        expect(latest.current.ui.getSelectedItem(4)).toBeNull()
        expect(latest.current.ui.getSelectedItem(1)).toEqual({ type: "task", id: 10 })
    })

    it("prunes the tabs of deleted notes in both panes", () => {
        const { latest, update } = splitSetup()
        update({ notes: notesOf(2, 3), workspaceId: null })
        expect(latest.current.panes[0].tabs.openIds).toEqual([2])
        expect(latest.current.panes[1].tabs.openIds).toEqual([3])
        update({ notes: notesOf(2), workspaceId: null })
        expect(latest.current.layout.isSplit).toBe(false)
        expect(latest.current.openIds).toEqual([2])
    })

    it("snapshots and reopens the whole layout through the bridge", () => {
        const { latest, bridgeRef, update } = splitSetup()
        const snapshot = bridgeRef.current!.snapshot()
        expect(snapshot.left.openIds).toEqual([1, 2])
        expect(snapshot.right?.openIds).toEqual([3, 4])
        expect(snapshot.focused).toBe(1)

        update({ notes: notesOf(1, 2), workspaceId: null })
        expect(latest.current.layout.isSplit).toBe(false)

        update({ notes: notesOf(1, 2, 3, 4, 5), workspaceId: null })
        act(() => bridgeRef.current!.reopen(snapshot))
        expect(latest.current.panes[0].tabs.openIds).toEqual([1, 2])
        expect(latest.current.panes[1].tabs.openIds).toEqual([3, 4])
    })

    describe("persistence", () => {
        it("restores a saved split layout, dropping missing notes in every pane", async () => {
            vi.mocked(getWorkspaceTabs).mockResolvedValue({ left: { openIds: [1, 99], activeId: 99 }, right: { openIds: [3, 98], activeId: 3 }, focused: 1 })
            const { latest } = splitHarness({ notes: notesOf(1, 2, 3), workspaceId: 7 })

            await waitFor(() => expect(latest.current.layout.isSplit).toBe(true))
            expect(latest.current.panes[0].tabs.openIds).toEqual([1])
            expect(latest.current.panes[0].tabs.activeId).toBe(1)
            expect(latest.current.panes[1].tabs.openIds).toEqual([3])
            expect(latest.current.layout.focused).toBe(1)
            expect(latest.current.activeId).toBe(3)
        })

        it("collapses the saved split when the right pane has no existing note left", async () => {
            vi.mocked(getWorkspaceTabs).mockResolvedValue({ left: { openIds: [1], activeId: 1 }, right: { openIds: [99], activeId: 99 }, focused: 1 })
            const { latest } = splitHarness({ notes: notesOf(1), workspaceId: 7 })
            await waitFor(() => expect(latest.current.restored).toBe(true))
            expect(latest.current.openIds).toEqual([1])
            expect(latest.current.layout.focused).toBe(0)
        })

        it("does not restore the split when the preference is off, and saves the layout afterwards", async () => {
            vi.mocked(getReopenNotes).mockResolvedValue(false)
            vi.mocked(getWorkspaceTabs).mockResolvedValue({ left: { openIds: [1], activeId: 1 }, right: { openIds: [2], activeId: 2 }, focused: 1 })
            const { latest } = splitHarness({ notes: notesOf(1, 2), workspaceId: 7 })
            await waitFor(() => expect(latest.current.restored).toBe(true))
            expect(getWorkspaceTabs).not.toHaveBeenCalled()
            expect(latest.current.layout.isSplit).toBe(false)

            act(() => latest.current.openNote(1))
            act(() => latest.current.layoutActions.split())
            await waitFor(() => expect(saveWorkspaceTabs).toHaveBeenLastCalledWith(7, {
                left: { openIds: [1], activeId: 1 }, right: { openIds: [], activeId: null }, focused: 1,
            }))
        })

        it("never saves before the saved layout has been read", async () => {
            let release!: (layout: LayoutState) => void
            vi.mocked(getWorkspaceTabs).mockReturnValue(new Promise(resolve => { release = resolve }))
            const { latest } = splitHarness({ notes: notesOf(1, 2), workspaceId: 7 })
            act(() => latest.current.layoutActions.split())
            await act(async () => { await Promise.resolve() })
            expect(saveWorkspaceTabs).not.toHaveBeenCalled()

            await act(async () => { release(single([1], 1)) })
            await waitFor(() => expect(saveWorkspaceTabs).toHaveBeenCalled())
        })
    })
})
