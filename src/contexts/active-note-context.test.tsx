import { useContext } from "react"
import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { TabsProvider } from "./tabs-context"
import { useTabs, useTabsActions } from "./use-tabs"
import { ActiveNoteProvider } from "./active-note-context"
import { useActiveNote, useActiveNoteActions } from "./use-active-note"
import { getDBNoteData } from "@/db/queries/note"
import { deferred } from "@/test/ui-render"
import { SplitHarness } from "@/test/split-harness"
import type { SplitState } from "@/test/split-fixtures"
import type { ActiveNoteActionsType } from "./active-note-context-object"
import { PaneNoteActionsContext, PaneNoteTreesContext } from "./layout-context-object"
import { makeGroup, makeNote, makeSection, makeTask } from "@/test/ui-fixtures"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/queries/note", () => ({ getDBNoteData: vi.fn() }))

const notes = [1, 2, 3].map(id => makeNote({ id }))

/** The data of a note: one group (id = 10 * noteId) with one section and one task, so each note is recognizable. */
const dataOf = (noteId: number) => ({
    groups: [makeGroup({ id: noteId * 10, noteID: noteId })],
    sections: [makeSection({ id: noteId * 100, groupID: noteId * 10 })],
    tasks: [makeTask({ id: noteId * 1000, sectionID: noteId * 100, completed: false, priority: false })],
})

type Api = ReturnType<typeof useTabs> & ReturnType<typeof useTabsActions> & ReturnType<typeof useActiveNote> & ReturnType<typeof useActiveNoteActions>

function setup() {
    const latest: { current: Api } = { current: undefined as never }
    function Probe() {
        latest.current = { ...useTabs(), ...useTabsActions(), ...useActiveNote(), ...useActiveNoteActions() }
        return null
    }
    render(
        <TabsProvider notes={notes} workspaceId={null}>
            <ActiveNoteProvider><Probe /></ActiveNoteProvider>
        </TabsProvider>
    )
    return latest
}

const shownGroup = (latest: { current: Api }) => latest.current.noteDataTree?.groups[0]?.id ?? null

describe("ActiveNoteProvider", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.mocked(getDBNoteData).mockImplementation(async id => dataOf(id) as never)
    })

    it("loads the note once when it is opened (no double load)", async () => {
        const latest = setup()
        expect(latest.current.noteDataTree).toBeNull()

        act(() => latest.current.openNote(1))

        await waitFor(() => expect(shownGroup(latest)).toBe(10))
        expect(getDBNoteData).toHaveBeenCalledTimes(1)
        expect(getDBNoteData).toHaveBeenCalledWith(1)
    })

    it("shows the response of the active note even when a slower response of the previous one arrives later", async () => {
        const a = deferred<ReturnType<typeof dataOf>>()
        const b = deferred<ReturnType<typeof dataOf>>()
        vi.mocked(getDBNoteData).mockImplementation(((id: number) => (id === 1 ? a.promise : b.promise)) as never)
        const latest = setup()

        act(() => latest.current.openNote(1))
        act(() => latest.current.openNote(2))

        // B answers first
        await act(async () => { b.resolve(dataOf(2)) })
        await waitFor(() => expect(shownGroup(latest)).toBe(20))

        // A answers late: it must not replace what is shown under tab B
        await act(async () => { a.resolve(dataOf(1)) })
        expect(latest.current.activeId).toBe(2)
        expect(shownGroup(latest)).toBe(20)
    })

    it("never renders the data of another note under the new active tab", async () => {
        const latest = setup()
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))

        const b = deferred<ReturnType<typeof dataOf>>()
        vi.mocked(getDBNoteData).mockReturnValueOnce(b.promise as never)
        act(() => latest.current.openNote(2))

        // Still loading: nothing is shown instead of the data of note 1
        expect(latest.current.activeId).toBe(2)
        expect(latest.current.noteDataTree).toBeNull()

        await act(async () => { b.resolve(dataOf(2)) })
        await waitFor(() => expect(shownGroup(latest)).toBe(20))
    })

    it("shows a cached tab instantly and revalidates it in background", async () => {
        const latest = setup()
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))
        act(() => latest.current.openNote(2))
        await waitFor(() => expect(shownGroup(latest)).toBe(20))
        expect(getDBNoteData).toHaveBeenCalledTimes(2)

        // The revalidation of tab 1 is slow
        const revalidation = deferred<ReturnType<typeof dataOf>>()
        vi.mocked(getDBNoteData).mockReturnValueOnce(revalidation.promise as never)
        act(() => latest.current.activateNote(1))

        // Cache hit: data available in the very render of the switch, while the DB is queried again
        expect(shownGroup(latest)).toBe(10)
        expect(getDBNoteData).toHaveBeenCalledTimes(3)

        const fresh = dataOf(1)
        fresh.groups = [makeGroup({ id: 11, noteID: 1 })]
        fresh.sections = []
        fresh.tasks = []
        await act(async () => { revalidation.resolve(fresh) })
        await waitFor(() => expect(shownGroup(latest)).toBe(11))
    })

    it("tells the subscribers which note changed, and stops after unsubscribing", async () => {
        const latest = setup()
        const listener = vi.fn()
        let stop!: () => void
        act(() => { stop = latest.current.subscribeNoteChanges(listener) })

        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))
        expect(listener).toHaveBeenCalledWith(1, "load")

        listener.mockClear()
        act(() => { latest.current.patchGroup(10, { name: "Named" }) })
        expect(listener).toHaveBeenCalledWith(1, "edit")

        stop()
        listener.mockClear()
        act(() => { latest.current.patchGroup(10, { name: "Again" }) })
        expect(listener).not.toHaveBeenCalled()
    })

    it("evicts the cache of a closed tab", async () => {
        const latest = setup()
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))
        act(() => latest.current.openNote(2))
        await waitFor(() => expect(shownGroup(latest)).toBe(20))

        act(() => latest.current.closeNote(1))
        expect(latest.current.activeId).toBe(2)

        const again = deferred<ReturnType<typeof dataOf>>()
        vi.mocked(getDBNoteData).mockReturnValueOnce(again.promise as never)
        act(() => latest.current.openNote(1))
        expect(latest.current.noteDataTree).toBeNull() // not served from the cache anymore
        await act(async () => { again.resolve(dataOf(1)) })
        await waitFor(() => expect(shownGroup(latest)).toBe(10))
    })

    it("does not cache the response of a tab closed while it was loading", async () => {
        const slow = deferred<ReturnType<typeof dataOf>>()
        vi.mocked(getDBNoteData).mockReturnValueOnce(slow.promise as never)
        const latest = setup()
        act(() => latest.current.openNote(1))
        act(() => latest.current.closeNote(1))
        await act(async () => { slow.resolve(dataOf(1)) })

        act(() => latest.current.openNote(1))
        expect(latest.current.noteDataTree).toBeNull()
        await waitFor(() => expect(shownGroup(latest)).toBe(10))
    })

    it("refreshActiveNote reloads the active note and getNoteData a specific one", async () => {
        const latest = setup()
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))

        const updated = dataOf(1)
        updated.groups = [makeGroup({ id: 12, noteID: 1 })]
        vi.mocked(getDBNoteData).mockResolvedValueOnce(updated as never)
        await act(() => latest.current.refreshActiveNote())
        expect(shownGroup(latest)).toBe(12)

        await act(() => latest.current.getNoteData(1))
        expect(getDBNoteData).toHaveBeenLastCalledWith(1)
    })

    it("refreshActiveNote does nothing without an active note", async () => {
        const latest = setup()
        await act(() => latest.current.refreshActiveNote())
        expect(getDBNoteData).not.toHaveBeenCalled()
    })

    it("a slower earlier refresh does not overwrite a newer one", async () => {
        const latest = setup()
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))

        const slow = deferred<ReturnType<typeof dataOf>>()
        vi.mocked(getDBNoteData).mockReturnValueOnce(slow.promise as never)
        let first!: Promise<void>
        act(() => { first = latest.current.refreshActiveNote() })
        const newer = dataOf(1)
        newer.groups = [makeGroup({ id: 13, noteID: 1 })]
        vi.mocked(getDBNoteData).mockResolvedValueOnce(newer as never)
        await act(() => latest.current.refreshActiveNote())
        expect(shownGroup(latest)).toBe(13)

        await act(async () => { slow.resolve(dataOf(1)); await first })
        expect(shownGroup(latest)).toBe(13)
    })

    it("reports a failed load with a toast and keeps the previous data", async () => {
        const latest = setup()
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))

        vi.mocked(getDBNoteData).mockRejectedValueOnce(new Error("nope"))
        act(() => latest.current.openNote(2))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossibile caricare la nota. Riprova."))
        expect(latest.current.noteDataTree).toBeNull()

        act(() => latest.current.activateNote(1))
        expect(shownGroup(latest)).toBe(10)
    })

    it("has stable action identities", async () => {
        const latest = setup()
        const before = { ...latest.current }
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))
        for (const key of ["refreshActiveNote", "getNoteData", "setNoteDataTree", "patchGroup", "patchSection", "patchTask", "appendGroup", "appendSection", "appendTask", "removeTask", "applyTaskMove", "applySectionMoveToNewGroup", "getCachedNoteTree", "subscribeNoteTree"] as const)
            expect(latest.current[key]).toBe(before[key])
    })

    it("writes the cache entry of the note given to setNoteDataTree, not the active one", async () => {
        const latest = setup()
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))
        const tree = { groups: [makeGroup({ id: 77 })] }
        act(() => latest.current.setNoteDataTree(tree, 1))
        expect(latest.current.getCachedNoteTree(1)).toBe(tree)
        expect(shownGroup(latest)).toBe(77)
    })

    it("lets a row read one value of the cached tree and hear about its changes", async () => {
        const latest = setup()
        expect(latest.current.getCachedNoteTree(1)).toBeNull()
        act(() => latest.current.openNote(1))
        await waitFor(() => expect(shownGroup(latest)).toBe(10))
        const listener = vi.fn()
        const stop = latest.current.subscribeNoteTree(listener)
        expect(latest.current.getCachedNoteTree(1)).toBe(latest.current.noteDataTree)

        let rollback!: () => void
        act(() => { rollback = latest.current.patchGroup(10, { collapsed: true }) })
        expect(listener).toHaveBeenCalledTimes(1)
        expect(latest.current.getCachedNoteTree(1)?.groups[0].collapsed).toBe(true)
        act(() => rollback())
        expect(latest.current.getCachedNoteTree(1)?.groups[0].collapsed).toBeFalsy()

        stop()
        act(() => { latest.current.patchGroup(10, { collapsed: true }) })
        expect(listener).toHaveBeenCalledTimes(2)
    })

    describe("optimistic task updates", () => {
        const task = (latest: { current: Api }) => latest.current.noteDataTree!.groups[0].sections[0].tasks[0]

        it("patches the cached tree at once and restores the previous values on rollback", async () => {
            const latest = setup()
            act(() => latest.current.openNote(1))
            await waitFor(() => expect(shownGroup(latest)).toBe(10))

            let rollback!: () => void
            act(() => { rollback = latest.current.patchTask(1000, { completed: true }) })
            expect(task(latest).completed).toBe(true)
            expect(getDBNoteData).toHaveBeenCalledTimes(1)

            act(() => rollback())
            expect(task(latest).completed).toBe(false)
        })

        it("is not overwritten by a reload that started before the patch", async () => {
            const latest = setup()
            const slow = deferred<ReturnType<typeof dataOf>>()
            vi.mocked(getDBNoteData).mockReturnValueOnce(slow.promise as never)
            act(() => latest.current.openNote(1))
            // Cached data would be needed to patch: seed it with an optimistic tree
            act(() => latest.current.setNoteDataTree({ groups: [makeGroup({ id: 10, sections: [makeSection({ id: 100, tasks: [makeTask({ id: 1000, priority: false })] })] })] }))
            act(() => { latest.current.patchTask(1000, { priority: true }) })

            await act(async () => { slow.resolve(dataOf(1)) })
            expect(task(latest).priority).toBe(true)
        })

        it("finds subtasks and ignores unknown tasks", async () => {
            const latest = setup()
            act(() => latest.current.openNote(1))
            await waitFor(() => expect(shownGroup(latest)).toBe(10))
            act(() => latest.current.setNoteDataTree({
                groups: [makeGroup({
                    id: 10,
                    sections: [makeSection({ id: 100, tasks: [makeTask({ id: 1, subtasks: [makeTask({ id: 2, completed: false })] })] })],
                })],
            }))

            act(() => { latest.current.patchTask(2, { completed: true }) })
            expect(task(latest).subtasks[0].completed).toBe(true)

            const before = latest.current.noteDataTree
            const rollback = latest.current.patchTask(999, { completed: true })
            expect(latest.current.noteDataTree).toBe(before)
            rollback()
            expect(latest.current.noteDataTree).toBe(before)
        })
    })

    describe("optimistic creations and removals", () => {
        const opened = async () => {
            const latest = setup()
            act(() => latest.current.openNote(1))
            await waitFor(() => expect(shownGroup(latest)).toBe(10))
            return latest
        }

        it("appends a created task without reloading, and the rollback removes it", async () => {
            const latest = await opened()
            let rollback!: () => void
            act(() => { rollback = latest.current.appendTask(5000, { sectionId: 100 }, "New") })
            expect(latest.current.noteDataTree!.groups[0].sections[0].tasks.map(t => t.id)).toEqual([1000, 5000])
            expect(getDBNoteData).toHaveBeenCalledTimes(1)

            act(() => rollback())
            expect(latest.current.noteDataTree!.groups[0].sections[0].tasks.map(t => t.id)).toEqual([1000])
        })

        it("falls back to a background reload when the created row cannot be applied", async () => {
            const latest = await opened()
            act(() => { latest.current.appendTask(5000, { sectionId: 999 }, "Orphan") })
            await waitFor(() => expect(getDBNoteData).toHaveBeenCalledTimes(2))
        })

        it("is not overwritten by a reload that started before the created row was appended", async () => {
            const latest = await opened()
            const slow = deferred<ReturnType<typeof dataOf>>()
            vi.mocked(getDBNoteData).mockReturnValueOnce(slow.promise as never)
            let reload!: Promise<void>
            act(() => { reload = latest.current.refreshActiveNote() })
            act(() => { latest.current.appendGroup(30, 1, "Late", 31) })

            await act(async () => { slow.resolve(dataOf(1)); await reload })
            expect(latest.current.noteDataTree!.groups.map(g => g.id)).toEqual([10, 30])
        })

        it("patches groups and sections, removes tasks and moves them", async () => {
            const latest = await opened()
            act(() => { latest.current.patchGroup(10, { name: "Named" }) })
            act(() => { latest.current.patchSection(100, { title: "Renamed" }) })
            expect(latest.current.noteDataTree!.groups[0]).toMatchObject({ name: "Named" })
            expect(latest.current.noteDataTree!.groups[0].sections[0].title).toBe("Renamed")

            let undo!: () => void
            act(() => { undo = latest.current.removeTask(1000) })
            expect(latest.current.noteDataTree!.groups[0].sections[0].tasks).toEqual([])
            act(() => undo())
            expect(latest.current.noteDataTree!.groups[0].sections[0].tasks.map(t => t.id)).toEqual([1000])
        })
    })

    describe("split workspace", () => {
        const base: SplitState = { open0: [1], active0: 1, open1: [2], active1: 2, focused: 0 }

        function setupSplit(initial: SplitState) {
            const latest: { current: Api & { paneActions: readonly [ActiveNoteActionsType, ActiveNoteActionsType], trees: readonly unknown[] } } = { current: undefined as never }
            function Probe() {
                latest.current = {
                    ...useTabs(), ...useTabsActions(), ...useActiveNote(), ...useActiveNoteActions(),
                    paneActions: useContext(PaneNoteActionsContext)!,
                    trees: useContext(PaneNoteTreesContext)!,
                }
                return null
            }
            const ui = (state: SplitState) => <SplitHarness state={state}><ActiveNoteProvider><Probe /></ActiveNoteProvider></SplitHarness>
            const view = render(ui(initial))
            return { latest, update: (state: SplitState) => view.rerender(ui(state)) }
        }
        const groupOf = (tree: unknown) => (tree as { groups: { id: number }[] } | null)?.groups[0]?.id ?? null
        const taskOf = (tree: unknown) => (tree as ReturnType<typeof dataOf>["groups"] & { groups: { sections: { tasks: { completed: boolean }[] }[] }[] }).groups[0].sections[0].tasks[0]

        it("loads the active note of each pane, once", async () => {
            const { latest } = setupSplit(base)
            await waitFor(() => expect(groupOf(latest.current.trees[1])).toBe(20))
            expect(groupOf(latest.current.trees[0])).toBe(10)
            expect(getDBNoteData).toHaveBeenCalledTimes(2)
            expect(shownGroup(latest)).toBe(10) // the focused pane
        })

        it("retains the notes of both panes and evicts a closed one", async () => {
            const { latest, update } = setupSplit({ ...base, open0: [1, 3] })
            await waitFor(() => expect(groupOf(latest.current.trees[1])).toBe(20))
            update({ ...base, open0: [1, 3], active0: 3 })
            await waitFor(() => expect(latest.current.getCachedNoteTree(3)).not.toBeNull())
            expect(latest.current.getCachedNoteTree(1)).not.toBeNull()
            expect(latest.current.getCachedNoteTree(2)).not.toBeNull()
            update({ ...base, open0: [3], active0: 3 })
            await waitFor(() => expect(latest.current.getCachedNoteTree(1)).toBeNull())
            expect(latest.current.getCachedNoteTree(2)).not.toBeNull()
        })

        it("does not reload pane 0 when pane 1 changes its note", async () => {
            const { latest, update } = setupSplit({ ...base, open1: [2, 3] })
            await waitFor(() => expect(groupOf(latest.current.trees[1])).toBe(20))
            update({ ...base, open1: [2, 3], active1: 3 })
            await waitFor(() => expect(groupOf(latest.current.trees[1])).toBe(30))
            expect(getDBNoteData).toHaveBeenCalledTimes(3)
            expect(vi.mocked(getDBNoteData).mock.calls.filter(([id]) => id === 1)).toHaveLength(1)
        })

        it("patches only the note of the pane whose actions are used", async () => {
            const { latest } = setupSplit(base)
            await waitFor(() => expect(groupOf(latest.current.trees[1])).toBe(20))
            const before0 = latest.current.trees[0]
            act(() => { latest.current.paneActions[1].patchTask(2000, { completed: true }) })
            expect(taskOf(latest.current.trees[1]).completed).toBe(true)
            expect(latest.current.trees[0]).toBe(before0)
            expect(getDBNoteData).toHaveBeenCalledTimes(2)
        })

        it("makes the focused actions and tree follow the focused pane", async () => {
            const { latest, update } = setupSplit(base)
            await waitFor(() => expect(groupOf(latest.current.trees[1])).toBe(20))
            act(() => { latest.current.patchTask(1000, { completed: true }) })
            expect(taskOf(latest.current.trees[0]).completed).toBe(true)
            expect(taskOf(latest.current.trees[1]).completed).toBe(false)

            update({ ...base, focused: 1 })
            expect(shownGroup(latest)).toBe(20)
            expect(latest.current.getNoteTree()).toBe(latest.current.trees[1])
            act(() => { latest.current.patchTask(2000, { completed: true }) })
            expect(taskOf(latest.current.trees[1]).completed).toBe(true)
        })

        it("refreshActiveNote of a pane reloads that pane's note", async () => {
            const { latest } = setupSplit(base)
            await waitFor(() => expect(groupOf(latest.current.trees[1])).toBe(20))
            await act(async () => { await latest.current.paneActions[1].refreshActiveNote() })
            expect(vi.mocked(getDBNoteData).mock.calls.filter(([id]) => id === 2)).toHaveLength(2)
            expect(vi.mocked(getDBNoteData).mock.calls.filter(([id]) => id === 1)).toHaveLength(1)
        })

        it("ignores a stale response of a pane note that has been replaced by an optimistic update", async () => {
            const slow = deferred<ReturnType<typeof dataOf>>()
            const { latest } = setupSplit(base)
            await waitFor(() => expect(groupOf(latest.current.trees[1])).toBe(20))
            vi.mocked(getDBNoteData).mockReturnValueOnce(slow.promise as never)
            let reload!: Promise<void>
            act(() => { reload = latest.current.paneActions[1].refreshActiveNote() })
            act(() => { latest.current.paneActions[1].patchTask(2000, { completed: true }) })
            await act(async () => { slow.resolve(dataOf(2)); await reload })
            expect(taskOf(latest.current.trees[1]).completed).toBe(true)
        })
    })
})
