import { useEffect } from "react"
import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NoteDataTree } from "@/types/types"
import { PreferencesProvider } from "@/contexts/preferences-context"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"
import { TabsProvider } from "@/contexts/tabs-context"
import { useSelectedTask, useTabsActions } from "@/contexts/use-tabs"
import { store } from "@/lib/store/initStore"
import { saveShortcutOverrides } from "@/lib/store/shortcuts"
import { getPref } from "@/lib/store/preferences"
import { SIDEBAR_DEFAULT_WIDTH } from "@/lib/sidebar-layout"
import { SideBarRight } from "./SideBarRight"
import { RightPanelProvider } from "./right-panel-context"
import { useRightPanel } from "./use-right-panel"
import { makeGroup, makeNote, makeSection, makeTask } from "@/test/ui-fixtures"

// Radix tooltips measure their arrow with a ResizeObserver, which jsdom lacks
vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } })

let tree: NoteDataTree | null
vi.mock("@/contexts/use-active-note", () => ({
    useActiveNote: () => ({ noteDataTree: tree }),
}))
vi.mock("./DetailsPanel", () => ({ DetailsPanel: () => <div>contenuto dettagli</div> }))
vi.mock("./HistoryPanel", () => ({ HistoryPanel: () => <div>contenuto cronologia</div> }))

const originalWidth = window.innerWidth

const makeTree = (): NoteDataTree => ({
    groups: [makeGroup({ id: 1, sections: [makeSection({ id: 1, tasks: [makeTask({ id: 10 })] })] })],
})

function Setup({ children }: { children: ReactNode }) {
    const { openNote } = useTabsActions()
    useEffect(() => { openNote(1) }, [openNote])
    return <>{children}</>
}

/** Helpers to drive the panel from outside, like the task rows do. */
function Controls() {
    const panel = useRightPanel()
    const [selected, select] = useSelectedTask(1)
    return (
        <>
            <output data-testid="selected">{String(selected)}</output>
            <output data-testid="state">{`${panel.open}|${panel.tab}`}</output>
            <button onClick={() => select(10)}>select 10</button>
            <button onClick={() => select(99)}>select 99</button>
            <button onClick={() => panel.showTaskDetails(10)}>show details of 10</button>
            <button onClick={() => panel.setTab("history")}>open history</button>
        </>
    )
}

const renderPanel = () => render(
    <PreferencesProvider>
        <ShortcutsProvider>
            <TabsProvider notes={[makeNote({ id: 1 })]} workspaceId={null}>
                <Setup>
                    <RightPanelProvider>
                        <Controls />
                        <SideBarRight />
                    </RightPanelProvider>
                </Setup>
            </TabsProvider>
        </ShortcutsProvider>
    </PreferencesProvider>,
)

const toggle = () => screen.getByRole("button", { name: "Mostra o nascondi il pannello dei dettagli" })
const tab = (name: string) => screen.getByRole("tab", { name })

beforeEach(() => {
    tree = makeTree()
    window.innerWidth = 1400
})
afterEach(() => { window.innerWidth = originalWidth })

describe("SideBarRight tabs", () => {
    it("is a tablist with the Details and History tabs, and the panel of the selected tab", async () => {
        renderPanel()
        expect(await screen.findByRole("tablist", { name: "Tab del pannello" })).toBeInTheDocument()
        expect(screen.getAllByRole("tab").map(el => el.textContent)).toEqual(["Dettagli", "Cronologia"])
        expect(tab("Dettagli")).toHaveAttribute("aria-selected", "true")
        expect(tab("Cronologia")).toHaveAttribute("aria-selected", "false")
        const panel = screen.getByRole("tabpanel")
        expect(panel).toHaveAttribute("aria-labelledby", tab("Dettagli").id)
        expect(tab("Dettagli")).toHaveAttribute("aria-controls", panel.id)
        expect(screen.getByText("contenuto dettagli")).toBeInTheDocument()
        expect(screen.queryByText("contenuto cronologia")).toBeNull()
    })

    it("has the height of the left sidebar header and of the note tabs", async () => {
        renderPanel()
        expect((await screen.findByRole("tablist")).className).toContain("min-h-[42px]")
    })

    it("switches tab with a click and remembers it", async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.click(await screen.findByRole("tab", { name: "Cronologia" }))
        expect(screen.getByText("contenuto cronologia")).toBeInTheDocument()
        expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tab("Cronologia").id)
        await waitFor(async () => expect(await getPref("rightPanelTab")).toBe("history"))
    })

    it("restores the remembered tab", async () => {
        await store.set("rightPanelTab", "history")
        renderPanel()
        expect(await screen.findByText("contenuto cronologia")).toBeInTheDocument()
        expect(tab("Cronologia")).toHaveAttribute("aria-selected", "true")
    })

    it("moves between tabs with the arrow keys (wrapping), Home and End, moving the focus too", async () => {
        const user = userEvent.setup()
        renderPanel()
        await screen.findByRole("tab", { name: "Dettagli" })
        tab("Dettagli").focus()

        await user.keyboard("{ArrowRight}")
        expect(tab("Cronologia")).toHaveAttribute("aria-selected", "true")
        expect(tab("Cronologia")).toHaveFocus()
        expect(screen.getByText("contenuto cronologia")).toBeInTheDocument()

        await user.keyboard("{ArrowRight}")
        expect(tab("Dettagli")).toHaveAttribute("aria-selected", "true")
        expect(tab("Dettagli")).toHaveFocus()

        await user.keyboard("{ArrowLeft}")
        expect(tab("Cronologia")).toHaveAttribute("aria-selected", "true")

        await user.keyboard("{Home}")
        expect(tab("Dettagli")).toHaveFocus()
        await user.keyboard("{End}")
        expect(tab("Cronologia")).toHaveFocus()
        await user.keyboard("{ArrowUp}")
        expect(tab("Cronologia")).toHaveFocus()
    })
})

describe("SideBarRight open state, width and shortcut", () => {
    it("is open by default and the toggle button hides it and remembers it", async () => {
        const user = userEvent.setup()
        renderPanel()
        await screen.findByRole("tablist")
        expect(toggle()).toHaveAttribute("aria-expanded", "true")
        await user.click(toggle())
        expect(toggle()).toHaveAttribute("aria-expanded", "false")
        expect(screen.queryByRole("tablist")).toBeNull()
        await waitFor(async () => expect(await getPref("sidebarRightOpen")).toBe(false))

        await user.click(toggle())
        expect(await screen.findByRole("tablist")).toBeInTheDocument()
        await waitFor(async () => expect(await getPref("sidebarRightOpen")).toBe(true))
    })

    it("restores a closed panel", async () => {
        await store.set("sidebarRightOpen", false)
        renderPanel()
        await waitFor(() => expect(toggle()).toHaveAttribute("aria-expanded", "false"))
        expect(screen.queryByRole("tablist")).toBeNull()
    })

    it("shows the shortcut in the tooltip of the toggle", async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.hover(toggle())
        expect((await screen.findAllByText("(Ctrl + Maiusc + B)")).length).toBeGreaterThan(0)
    })

    it("toggles with Ctrl+Shift+B, also from a text field, and not with Ctrl+B", async () => {
        const user = userEvent.setup()
        render(
            <PreferencesProvider><ShortcutsProvider><TabsProvider notes={[makeNote({ id: 1 })]} workspaceId={null}>
                <Setup><RightPanelProvider><input aria-label="campo" /><SideBarRight /></RightPanelProvider></Setup>
            </TabsProvider></ShortcutsProvider></PreferencesProvider>,
        )
        await screen.findByRole("tablist")
        await user.keyboard("{Control>}b{/Control}")
        expect(screen.getByRole("tablist")).toBeInTheDocument()

        await user.keyboard("{Control>}{Shift>}b{/Shift}{/Control}")
        expect(screen.queryByRole("tablist")).toBeNull()

        screen.getByLabelText("campo").focus()
        await user.keyboard("{Control>}{Shift>}b{/Shift}{/Control}")
        expect(await screen.findByRole("tablist")).toBeInTheDocument()
    })

    it("follows a customized shortcut", async () => {
        const user = userEvent.setup()
        await saveShortcutOverrides({ "toggle-right-sidebar": { key: "j", ctrl: true } })
        renderPanel()
        await screen.findByRole("tablist")
        await waitFor(async () => {
            await user.keyboard("{Control>}j{/Control}")
            expect(screen.queryByRole("tablist")).toBeNull()
        })
        await user.keyboard("{Control>}{Shift>}b{/Shift}{/Control}")
        expect(screen.queryByRole("tablist")).toBeNull()
    })

    it("has a keyboard resizable separator whose width is remembered", async () => {
        const user = userEvent.setup()
        renderPanel()
        const separator = await screen.findByRole("separator")
        expect(separator).toHaveAttribute("aria-valuenow", String(SIDEBAR_DEFAULT_WIDTH))
        separator.focus()
        // The panel grows to the left
        await user.keyboard("{ArrowLeft}")
        expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", String(SIDEBAR_DEFAULT_WIDTH + 16))
        await waitFor(async () => expect(await getPref("sidebarRightWidth")).toBe(SIDEBAR_DEFAULT_WIDTH + 16))
    })

    it("restores the remembered width", async () => {
        await store.set("sidebarRightWidth", 340)
        renderPanel()
        await waitFor(() => expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "340"))
    })
})

describe("SideBarRight in a compact window", () => {
    beforeEach(() => { window.innerWidth = 800 })

    it("is a closed overlay by default even when the remembered state is open", async () => {
        await store.set("sidebarRightOpen", true)
        renderPanel()
        await waitFor(() => expect(toggle()).toHaveAttribute("aria-expanded", "false"))
        expect(screen.queryByRole("tablist")).toBeNull()
    })

    it("opens as a modal sheet without resizer, closes with Escape or a click outside, and does not remember it", async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.click(toggle())
        expect(await screen.findByRole("tablist")).toBeInTheDocument()
        expect(screen.getByRole("dialog")).toBeInTheDocument()
        expect(screen.queryByRole("separator")).toBeNull()
        expect(await store.get("sidebarRightOpen")).toBeUndefined()

        tab("Dettagli").focus()
        await user.keyboard("{Escape}")
        expect(screen.queryByRole("tablist")).toBeNull()
        expect(toggle()).toHaveFocus()

        await user.click(toggle())
        await user.click(document.querySelector("[data-slot='sheet-overlay']")!)
        expect(screen.queryByRole("tablist")).toBeNull()
        expect(await store.get("sidebarRightOpen")).toBeUndefined()
    })
})

describe("SideBarRight and the selection", () => {
    it("showTaskDetails selects the task, shows the Details tab and opens the panel", async () => {
        const user = userEvent.setup()
        await store.set("rightPanelTab", "history")
        await store.set("sidebarRightOpen", false)
        renderPanel()
        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("false|history"))

        await user.click(screen.getByRole("button", { name: "show details of 10" }))
        expect(screen.getByTestId("state")).toHaveTextContent("true|details")
        expect(screen.getByTestId("selected")).toHaveTextContent("10")
        expect(screen.getByText("contenuto dettagli")).toBeInTheDocument()
    })

    it("showTaskDetails opens the overlay in a compact window", async () => {
        window.innerWidth = 800
        const user = userEvent.setup()
        renderPanel()
        await user.click(screen.getByRole("button", { name: "show details of 10" }))
        expect(screen.getByTestId("state")).toHaveTextContent("true|details")
        expect(screen.getByRole("tablist")).toBeInTheDocument()
    })

    it("clears the selection when the task is no longer in the note", async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.click(screen.getByRole("button", { name: "select 10" }))
        expect(screen.getByTestId("selected")).toHaveTextContent("10")

        // The task is deleted or moved away: the tree changes with the next render
        tree = { groups: [makeGroup({ id: 1, sections: [makeSection({ id: 1, tasks: [] })] })] }
        await user.click(screen.getByRole("button", { name: "open history" }))
        await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("null"))
    })

    it("clears a selection of a task that does not exist, and keeps one that does", async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.click(screen.getByRole("button", { name: "select 99" }))
        await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("null"))
        await user.click(screen.getByRole("button", { name: "select 10" }))
        expect(screen.getByTestId("selected")).toHaveTextContent("10")
    })

    it("keeps the selection while the note data is still loading", async () => {
        tree = null
        const user = userEvent.setup()
        renderPanel()
        await user.click(screen.getByRole("button", { name: "select 10" }))
        expect(screen.getByTestId("selected")).toHaveTextContent("10")
    })
})
