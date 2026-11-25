import { useEffect } from "react"
import { act, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TabsProvider } from "@/contexts/tabs-context"
import { useTabs, useTabsActions } from "@/contexts/use-tabs"
import { NoteHeader } from "@/pages/workspacePage/components/note/NoteHeader"
import { useTabShortcuts } from "./use-tab-shortcuts"
import { makeNote } from "@/test/ui-fixtures"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"
import { LayoutActionsContext, LayoutContext, type LayoutActionsType, type LayoutContextType } from "@/contexts/layout-context-object"

vi.mock("@/lib/store/preferences", () => ({ getReopenNotes: vi.fn().mockResolvedValue(false) }))
vi.mock("@/pages/workspacePage/components/note/ButtonMenuNote", () => ({ ButtonMenuNote: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/hooks/use-inline-rename", () => ({ useInlineRename: () => ({ editing: false, error: null, start: () => {}, inputProps: {} }) }))
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ deleteItem: vi.fn(), purgeItem: vi.fn() }) }))
vi.mock("@/lib/store/tabs", () => ({ getWorkspaceTabs: vi.fn(), saveWorkspaceTabs: vi.fn() }))

const notes = [1, 2, 3].map(id => makeNote({ id, name: `Nota ${id}` }))

type Api = ReturnType<typeof useTabs> & ReturnType<typeof useTabsActions>

function Host({ withShortcuts, onRender }: { withShortcuts: boolean, onRender: (api: Api) => void }) {
    const api = { ...useTabs(), ...useTabsActions() }
    useEffect(() => onRender(api))
    return (
        <>
            {withShortcuts && <Shortcuts />}
            {api.tabs.map(note => <NoteHeader key={note.id} note={note} />)}
        </>
    )
}

function Shortcuts() {
    useTabShortcuts()
    return null
}

const keydownRegistrations = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([type]) => type === "keydown").length

describe("useTabShortcuts", () => {
    afterEach(() => vi.restoreAllMocks())

    const setup = (withShortcuts = true) => {
        const latest: { current: Api } = { current: undefined as never }
        const view = render(
            <ShortcutsProvider><TabsProvider notes={notes} workspaceId={null}>
                <Host withShortcuts={withShortcuts} onRender={api => { latest.current = api }} />
            </TabsProvider></ShortcutsProvider>
        )
        act(() => { latest.current.openNote(1); latest.current.openNote(2); latest.current.openNote(3) })
        return { latest, view }
    }

    it("registers one keydown listener (the provider's) no matter how many tabs are open", () => {
        const spy = vi.spyOn(window, "addEventListener")
        const { latest } = setup()

        expect(latest.current.tabs).toHaveLength(3)
        expect(keydownRegistrations(spy)).toBe(1)
    })

    it("the tab headers add no global listener beyond the provider one", () => {
        const spy = vi.spyOn(window, "addEventListener")
        setup(false)
        expect(keydownRegistrations(spy)).toBe(1)
    })

    it("removes the listener on unmount", () => {
        const spy = vi.spyOn(window, "removeEventListener")
        const { view } = setup()
        view.unmount()
        expect(keydownRegistrations(spy)).toBe(1)
    })

    it("Ctrl+L closes only the active tab, selecting the neighbour", () => {
        const { latest } = setup()
        act(() => latest.current.activateNote(2))

        fireEvent.keyDown(document, { key: "l", ctrlKey: true })

        expect(latest.current.openIds).toEqual([1, 3])
        expect(latest.current.activeId).toBe(3)
    })

    it("Ctrl+T closes every tab", () => {
        const { latest } = setup()
        fireEvent.keyDown(document, { key: "t", ctrlKey: true })
        expect(latest.current.openIds).toEqual([])
        expect(latest.current.activeId).toBeNull()
    })

    it("Ctrl+PageDown / Ctrl+PageUp move to the next / previous tab, wrapping around", () => {
        const { latest } = setup()
        act(() => latest.current.activateNote(2))

        fireEvent.keyDown(document, { key: "PageDown", ctrlKey: true })
        expect(latest.current.activeId).toBe(3)
        fireEvent.keyDown(document, { key: "PageDown", ctrlKey: true })
        expect(latest.current.activeId).toBe(1)
        fireEvent.keyDown(document, { key: "PageUp", ctrlKey: true })
        expect(latest.current.activeId).toBe(3)
        // tabs keep their order
        expect(latest.current.openIds).toEqual([1, 2, 3])
    })

    it("Ctrl+Tab and Ctrl+Shift+Tab do the same", () => {
        const { latest } = setup()
        act(() => latest.current.activateNote(1))

        fireEvent.keyDown(document, { key: "Tab", ctrlKey: true })
        expect(latest.current.activeId).toBe(2)
        fireEvent.keyDown(document, { key: "Tab", ctrlKey: true, shiftKey: true })
        expect(latest.current.activeId).toBe(1)
    })

    it("ignores the keys without Ctrl/Cmd and other shortcuts", () => {
        const { latest } = setup()
        fireEvent.keyDown(document, { key: "l" })
        fireEvent.keyDown(document, { key: "t" })
        fireEvent.keyDown(document, { key: "k", ctrlKey: true })
        expect(latest.current.openIds).toEqual([1, 2, 3])
    })
})

describe("useTabShortcuts split shortcuts", () => {
    // The shortcuts read the layout through getLayout() at key-press time
    const current: { value: LayoutContextType } = { value: undefined as never }
    const actions: LayoutActionsType = { split: vi.fn(), unsplit: vi.fn(), toggleSplit: vi.fn(), focusPane: vi.fn(), openInPane: vi.fn(), moveToPane: vi.fn(), getLayout: () => current.value }
    const layout = (left: number | null, right: number | null | undefined, focused: 0 | 1): LayoutContextType => ({
        left: { openIds: left === null ? [] : [left], activeId: left },
        right: right === undefined ? null : { openIds: right === null ? [] : [right], activeId: right },
        focused,
        isSplit: right !== undefined,
    })
    const setup = (value: LayoutContextType) => {
        current.value = value
        const view = render(
            <ShortcutsProvider><TabsProvider notes={notes} workspaceId={null}>
                <LayoutContext.Provider value={value}><LayoutActionsContext.Provider value={actions}><Shortcuts /></LayoutActionsContext.Provider></LayoutContext.Provider>
            </TabsProvider></ShortcutsProvider>
        )
        return view
    }
    const press = (init: KeyboardEventInit) => fireEvent.keyDown(document, init)

    afterEach(() => vi.clearAllMocks())

    it("Ctrl+\\ toggles the split", () => {
        setup(layout(1, undefined, 0))
        press({ key: "\\", ctrlKey: true })
        expect(actions.toggleSplit).toHaveBeenCalledTimes(1)
    })

    it("Ctrl+Alt+Right opens the active note of the unsplit workspace on the right", () => {
        setup(layout(1, undefined, 0))
        press({ key: "ArrowRight", ctrlKey: true, altKey: true })
        expect(actions.openInPane).toHaveBeenCalledWith(1, 1)
    })

    it("Ctrl+Alt+Right moves the active note of the focused left pane to the right", () => {
        setup(layout(2, 3, 0))
        press({ key: "ArrowRight", ctrlKey: true, altKey: true })
        expect(actions.openInPane).toHaveBeenCalledWith(2, 1)
    })

    it("Ctrl+Alt+Left moves the active note of the focused right pane to the left", () => {
        setup(layout(2, 3, 1))
        press({ key: "ArrowLeft", ctrlKey: true, altKey: true })
        expect(actions.moveToPane).toHaveBeenCalledWith(3, 0)
        expect(actions.openInPane).not.toHaveBeenCalled()
    })

    it("does nothing to move a note when the focused pane has no active note", () => {
        setup(layout(null, undefined, 0))
        press({ key: "ArrowRight", ctrlKey: true, altKey: true })
        expect(actions.openInPane).not.toHaveBeenCalled()
        expect(actions.moveToPane).not.toHaveBeenCalled()
    })

    it("does nothing when the focused right pane is empty", () => {
        setup(layout(2, null, 1))
        press({ key: "ArrowLeft", ctrlKey: true, altKey: true })
        expect(actions.moveToPane).not.toHaveBeenCalled()
    })

    it("Ctrl+Alt+\\ focuses the other pane when split", () => {
        setup(layout(2, 3, 0))
        press({ key: "\\", ctrlKey: true, altKey: true })
        expect(actions.focusPane).toHaveBeenCalledWith(1)
    })

    it("Ctrl+Alt+\\ focuses the left pane from the right one", () => {
        setup(layout(2, 3, 1))
        press({ key: "\\", ctrlKey: true, altKey: true })
        expect(actions.focusPane).toHaveBeenCalledWith(0)
    })

    it("Ctrl+Alt+\\ does nothing when not split", () => {
        setup(layout(2, undefined, 0))
        press({ key: "\\", ctrlKey: true, altKey: true })
        expect(actions.focusPane).not.toHaveBeenCalled()
    })

    it("reads the layout at the time of the key press", () => {
        const view = setup(layout(2, 3, 0))
        current.value = layout(2, 3, 1)
        view.rerender(
            <ShortcutsProvider><TabsProvider notes={notes} workspaceId={null}>
                <LayoutContext.Provider value={layout(2, 3, 1)}><LayoutActionsContext.Provider value={actions}><Shortcuts /></LayoutActionsContext.Provider></LayoutContext.Provider>
            </TabsProvider></ShortcutsProvider>
        )
        press({ key: "ArrowRight", ctrlKey: true, altKey: true })
        expect(actions.moveToPane).toHaveBeenCalledWith(3, 0)
    })
})

