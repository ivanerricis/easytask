import { useEffect, useLayoutEffect } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AllProviders, flushAsync } from "@/test/ui-render"
import { makeDefaultSection, makeGroup, makeNote, makeSection, makeTask } from "@/test/ui-fixtures"
import { CenterContainer } from "./CenterContainer"
import { RightPanelProvider } from "./rightbar/right-panel-context"
import { useWorkspaceData } from "@/contexts/workspace-data"
import { useActiveNoteId, useTabsActions } from "@/contexts/use-tabs"
import { useLayout, useLayoutActions } from "@/contexts/use-layout"
import { PreferencesProvider } from "@/contexts/preferences-context"
import { UndoProvider } from "@/contexts/undo"
import { AudioProvider } from "@/contexts/audio-context"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getDBWorkspaceData } from "@/db/queries/workspace"
import { getDBNoteData } from "@/db/queries/note"
import { updateDBTaskCompletion } from "@/db/queries/task"
import { saveWorkspaceTabs } from "@/lib/store/tabs"
import { requestAppCommand } from "@/lib/app-commands"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/queries/workspace")
vi.mock("@/db/queries/note")
vi.mock("@/db/queries/task")
vi.mock("@/db/queries/group")
vi.mock("@/db/queries/section")
vi.mock("@/db/queries/collapsed")
vi.mock("@/db/queries/shared_queries")
vi.mock("@/db/queries/media", async importOriginal => ({
    ...await importOriginal<typeof import("@/db/queries/media")>(),
    getDBNoteMediaCounts: vi.fn(async () => ({})),
    getDBGroupMediaFiles: vi.fn(async () => []),
}))
vi.mock("@/db/queries/audio", async importOriginal => ({
    ...await importOriginal<typeof import("@/db/queries/audio")>(),
    getDBNoteAudioFiles: vi.fn(async () => ({})),
    getDBGroupAudioFiles: vi.fn(async () => []),
}))
vi.mock("@/db/queries/template-draft", () => ({ getDBTemplateDrafts: vi.fn(async () => []) }))
vi.mock("@/db/queries/tag", () => ({ getDBTags: vi.fn(async () => []) }))
vi.mock("@/lib/store/tabs", () => ({
    getWorkspaceTabs: vi.fn(async () => ({ left: { openIds: [], activeId: null }, right: null, focused: 0 })),
    saveWorkspaceTabs: vi.fn(async () => {}),
}))

const NOTE_A = 10
const NOTE_B = 20
const rowsOf = (noteId: number, base: number, names: string[]) => ({
    groups: [makeGroup({ id: base, noteID: noteId })],
    sections: [
        makeDefaultSection({ id: base + 100, groupID: base }),
        makeSection({ id: base, groupID: base, title: `Sezione ${noteId}`, position: 1 }),
    ],
    tasks: names.map((text, i) => makeTask({ id: base * 10 + i, sectionID: base, text, position: i })),
})
const DATA: Record<number, ReturnType<typeof rowsOf>> = {
    [NOTE_A]: rowsOf(NOTE_A, 1, ["Alfa uno", "Alfa due"]),
    [NOTE_B]: rowsOf(NOTE_B, 2, ["Beta uno", "Beta due"]),
}

const api = {} as { layout: ReturnType<typeof useLayout>, actions: ReturnType<typeof useLayoutActions>, tabs: ReturnType<typeof useTabsActions>, activeId: number | null }

/** Calls the real hooks outside the panes (what the sidebar, the command menu and the details panel see). */
function Panel() {
    const { getWorkspaceData } = useWorkspaceData()
    const layout = useLayout()
    const actions = useLayoutActions()
    const tabs = useTabsActions()
    const activeId = useActiveNoteId()
    useLayoutEffect(() => { Object.assign(api, { layout, actions, tabs, activeId }) })
    useEffect(() => { void getWorkspaceData(1) }, [getWorkspaceData])
    return <output data-testid="top-active">{String(activeId)}</output>
}

const renderStack = () => render(
    <PreferencesProvider><TooltipProvider>
        <AllProviders>
            <UndoProvider><AudioProvider><RightPanelProvider><Panel /><CenterContainer /></RightPanelProvider></AudioProvider></UndoProvider>
        </AllProviders>
    </TooltipProvider></PreferencesProvider>,
)

const pane = (i: 0 | 1) => document.querySelector<HTMLElement>(`[data-pane="${i}"]`)
const tasksIn = (el: HTMLElement) => within(el).queryAllByRole("treeitem").map(row => row.getAttribute("aria-label"))
const settle = flushAsync

/** Renders the real stack, loads the workspace and opens note A in the single pane. */
async function setup() {
    const view = renderStack()
    await waitFor(() => expect(getDBWorkspaceData).toHaveBeenCalled())
    await settle()
    act(() => api.tabs.openNote(NOTE_A))
    expect(await screen.findByText("Alfa uno")).toBeInTheDocument()
    return view
}

/** Splits and moves B to the right pane through the layout actions. */
async function setupSplit() {
    const view = await setup()
    act(() => api.actions.openInPane(NOTE_B, 1))
    await waitFor(() => expect(tasksIn(pane(1)!)).toEqual(["Beta uno", "Beta due"]))
    return view
}

describe("split workspace (real providers)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getDBWorkspaceData).mockResolvedValue({
            folders: [],
            notes: [makeNote({ id: NOTE_A, name: "Nota A" }), makeNote({ id: NOTE_B, name: "Nota B" })],
        } as never)
        vi.mocked(getDBNoteData).mockImplementation(async (id: number) => DATA[id] as never)
        vi.mocked(updateDBTaskCompletion).mockResolvedValue(undefined as never)
    })

    it("1. a single pane shows the note with one tablist and no pane regions", async () => {
        await setup()
        expect(screen.getAllByRole("tablist")).toHaveLength(1)
        expect(screen.getByRole("tablist", { name: "Note aperte" })).toBeInTheDocument()
        expect(document.querySelector("[data-pane]")).toBeNull()
        expect(screen.getByText("Alfa due")).toBeInTheDocument()
        expect(screen.queryByText("Beta uno")).not.toBeInTheDocument()
    })

    it("2. the split button adds an empty right pane and keeps the left one", async () => {
        const user = userEvent.setup()
        await setup()
        await user.click(screen.getByRole("button", { name: "Dividi in due aree" }))

        const right = screen.getByRole("region", { name: "Area destra" })
        expect(right).toHaveAttribute("data-pane", "1")
        expect(within(right).getByRole("tablist", { name: "Note aperte, Area destra" })).toBeInTheDocument()
        expect(within(right).queryAllByRole("tab")).toHaveLength(0)
        expect(within(right).getByText("Area vuota")).toBeInTheDocument()
        expect(tasksIn(pane(0)!)).toEqual(["Alfa uno", "Alfa due"])
    })

    it("3. 'Apri a destra' of the tab menu moves the note to the right pane with its own data", async () => {
        const user = userEvent.setup()
        await setup()
        act(() => api.tabs.openNote(NOTE_B))
        await screen.findByText("Beta uno")
        await user.click(screen.getByRole("button", { name: "Dividi in due aree" }))

        fireEvent.contextMenu(within(pane(0)!).getByRole("tab", { name: "Nota B" }))
        await user.click(await screen.findByRole("menuitem", { name: "Apri a destra" }))

        const right = within(pane(1)!)
        await waitFor(() => expect(right.getByRole("tab", { name: "Nota B" })).toBeInTheDocument())
        await waitFor(() => expect(tasksIn(pane(1)!)).toEqual(["Beta uno", "Beta due"]))
        expect(within(pane(0)!).queryByRole("tab", { name: "Nota B" })).not.toBeInTheDocument()
        expect(tasksIn(pane(0)!)).toEqual(["Alfa uno", "Alfa due"])
    })

    it("3b. openInPane renders B on the right while A stays on the left, with no data leaking between the panes", async () => {
        await setupSplit()
        expect(within(pane(1)!).getByRole("tab", { name: "Nota B" })).toBeInTheDocument()
        expect(within(pane(0)!).getByRole("tab", { name: "Nota A" })).toBeInTheDocument()
        expect(tasksIn(pane(0)!)).toEqual(["Alfa uno", "Alfa due"])
        expect(tasksIn(pane(1)!)).toEqual(["Beta uno", "Beta due"])
        expect(within(pane(0)!).queryByText(/Beta/)).not.toBeInTheDocument()
        expect(within(pane(1)!).queryByText(/Alfa/)).not.toBeInTheDocument()
    })

    it("4. an edit in the right pane reaches the database with B's task and leaves A untouched", async () => {
        const user = userEvent.setup()
        await setupSplit()
        const taskB = DATA[NOTE_B].tasks[0]

        await user.click(within(pane(1)!).getByRole("checkbox", { name: "Segna come completato: Beta uno" }))

        await waitFor(() => expect(updateDBTaskCompletion).toHaveBeenCalledTimes(1))
        expect(vi.mocked(updateDBTaskCompletion).mock.calls[0][0]).toBe(taskB.id)
        expect(within(pane(1)!).getByRole("checkbox", { name: /Beta uno/ })).toBeChecked()
        for (const box of within(pane(0)!).getAllByRole("checkbox")) expect(box).not.toBeChecked()
    })

    it("5. the pointer focuses a pane, the top-level hooks follow it and new-group opens a single form there", async () => {
        await setupSplit()
        // Opening in the right pane focuses it
        expect(pane(1)).toHaveAttribute("data-focused", "true")
        expect(screen.getByTestId("top-active")).toHaveTextContent(String(NOTE_B))

        fireEvent.pointerDown(within(pane(0)!).getByText("Alfa uno"))
        await waitFor(() => expect(pane(0)).toHaveAttribute("data-focused", "true"))
        expect(pane(1)).toHaveAttribute("data-focused", "false")
        expect(screen.getByTestId("top-active")).toHaveTextContent(String(NOTE_A))
        expect(api.layout.focused).toBe(0)

        act(() => requestAppCommand("new-group"))
        expect(screen.getAllByRole("textbox", { name: "Nome del gruppo" })).toHaveLength(1)
        expect(within(pane(0)!).getByRole("textbox", { name: "Nome del gruppo" })).toBeInTheDocument()
        expect(within(pane(1)!).queryByRole("textbox", { name: "Nome del gruppo" })).not.toBeInTheDocument()
    })

    it("5b. the new-group shortcut and command act only in the focused pane, whichever it is", async () => {
        await setupSplit()
        // B (right) has the focus: the shortcut opens one form, in the right pane
        fireEvent.keyDown(window, { key: "n", altKey: true })
        expect(screen.getAllByRole("textbox", { name: "Nome del gruppo" })).toHaveLength(1)
        expect(within(pane(1)!).getByRole("textbox", { name: "Nome del gruppo" })).toBeInTheDocument()

        // Focus moves left: the command opens the form there, and only there
        fireEvent.pointerDown(within(pane(0)!).getByText("Alfa uno"))
        await waitFor(() => expect(pane(0)).toHaveAttribute("data-focused", "true"))
        act(() => requestAppCommand("new-group"))
        expect(within(pane(0)!).getAllByRole("textbox", { name: "Nome del gruppo" })).toHaveLength(1)
        expect(within(pane(1)!).getAllByRole("textbox", { name: "Nome del gruppo" })).toHaveLength(1)
    })

    it("6. moving the last right note to the left collapses the right pane", async () => {
        await setupSplit()
        act(() => api.actions.moveToPane(NOTE_B, 0))

        await waitFor(() => expect(screen.queryByRole("region", { name: "Area destra" })).not.toBeInTheDocument())
        expect(document.querySelector("[data-pane]")).toBeNull()
        const tabs = within(screen.getByRole("tablist", { name: "Note aperte" })).getAllByRole("tab")
        expect(tabs.map(tab => tab.textContent)).toEqual(expect.arrayContaining(["Nota A", "Nota B"]))
        expect(api.layout.left.openIds.sort()).toEqual([NOTE_A, NOTE_B])
        expect(api.layout.right).toBeNull()
    })

    it("7. unsplit closes the right tabs and closeAll closes everything", async () => {
        await setupSplit()
        act(() => api.actions.unsplit())
        await waitFor(() => expect(document.querySelector("[data-pane]")).toBeNull())
        expect(api.layout.left.openIds).toEqual([NOTE_A])
        expect(screen.queryByRole("tab", { name: "Nota B" })).not.toBeInTheDocument()

        act(() => api.actions.openInPane(NOTE_B, 1))
        await waitFor(() => expect(pane(1)).not.toBeNull())
        act(() => api.tabs.closeAllNotes())
        await waitFor(() => expect(screen.queryAllByRole("tab")).toHaveLength(0))
        expect(api.layout.left.openIds).toEqual([])
        expect(api.layout.right?.openIds ?? []).toEqual([])
    })

    it("8. the layout is saved as v2 with both panes and the focused one", async () => {
        await setupSplit()
        await waitFor(() => {
            const calls = vi.mocked(saveWorkspaceTabs).mock.calls
            expect(calls.at(-1)?.[1]).toEqual({
                left: { openIds: [NOTE_A], activeId: NOTE_A },
                right: { openIds: [NOTE_B], activeId: NOTE_B },
                focused: 1,
            })
        })
        expect(vi.mocked(saveWorkspaceTabs).mock.calls.at(-1)?.[0]).toBe(1)
    })

    it("does not log React errors or warnings while splitting, focusing and unsplitting", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        await setupSplit()
        fireEvent.pointerDown(within(pane(0)!).getByText("Alfa uno"))
        act(() => api.actions.moveToPane(NOTE_B, 0))
        act(() => api.actions.toggleSplit())
        await settle()
        expect(error).not.toHaveBeenCalled()
        expect(warn).not.toHaveBeenCalled()
    })
})
