import { useEffect } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"
import { TabsProvider } from "@/contexts/tabs-context"
import { useTabsActions } from "@/contexts/use-tabs"
import { TREE_REVEAL_EVENT } from "@/lib/tree-reveal"
import { APP_COMMAND_EVENT } from "@/lib/app-commands"
import type { Folder, Note } from "@/types/types"
import { makeNote } from "@/test/ui-fixtures"
import { IsSplitProvider } from "@/test/split-harness"
import { TemplateDraftsActionsContext, TemplateDraftsContext, type TemplateDraftsActionsType } from "@/contexts/template-drafts-context-object"
import type { DraftSaveStatus } from "@/lib/template-draft"
import type { TreeData } from "./sidebar/tree-dnd"
import { LayoutActionsContext, LayoutContext } from "@/contexts/layout-context-object"
import { PathBar } from "./PathBar"
import { NoteSearchContext } from "./note-search-context"
import { createNoteSearchStore } from "./note-search-store"
import type { SearchMatch } from "./note-search"

const dates = { creation_date: "", creation_time: "", edit_date: "", edit_time: "" }
const folder = (id: number, name: string, folderID: number | null, subfolders: Folder[] = [], notes: Note[] = []): Folder => ({
    id, workspaceID: 1, folderID, name, position: 0, ...dates, subfolders, notes,
})

// Radice, Lavoro { Progetti { A { B { Profonda } } , Nidificata }, Piano }
const deep = makeNote({ id: 4, name: "Profonda", folderID: 14 })
const nested = makeNote({ id: 2, name: "Nidificata", folderID: 11 })
const tree: TreeData = {
    rootFolders: [folder(10, "Lavoro", null, [folder(11, "Progetti", 10, [folder(12, "A", 11, [folder(13, "B", 12, [folder(14, "C", 13, [], [deep])])])], [nested])])],
    rootNotes: [makeNote({ id: 1, name: "Radice", folderID: null })],
}
const notes = [makeNote({ id: 1, name: "Radice" }), nested, deep]

vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceData: () => ({ workspaceDataTree: tree }), useWorkspaceTags: () => [] }))
const prefs = { hideCompletedTasks: false, setHideCompletedTasks: vi.fn() }
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))
vi.mock("@/lib/store/preferences", () => ({ getReopenNotes: vi.fn().mockResolvedValue(false) }))
vi.mock("@/lib/store/tabs", () => ({ getWorkspaceTabs: vi.fn(), saveWorkspaceTabs: vi.fn() }))
// Radix tooltips measure their arrow with a ResizeObserver, which jsdom lacks
vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } })

const Opener = ({ ids }: { ids: number[] }) => {
    const { openNote } = useTabsActions()
    useEffect(() => { ids.forEach(openNote) }, [ids, openNote])
    return null
}

const setup = async (ids: number[]) => {
    const view = render(
        <ShortcutsProvider>
            <TabsProvider notes={notes} workspaceId={null}>
                <Opener ids={ids} />
                <PathBar />
            </TabsProvider>
        </ShortcutsProvider>,
    )
    await act(async () => { })
    return view
}

const crumbs = () => screen.getAllByRole("button", { name: /nella barra laterale/ }).map(button => button.textContent)

describe("PathBar path", () => {
    beforeEach(() => {
        prefs.hideCompletedTasks = false
        prefs.setHideCompletedTasks.mockReset()
    })

    it("shows only the note for a note in the root, marked as the current page", async () => {
        await setup([1])
        expect(screen.getByRole("navigation", { name: "Percorso della nota" })).toBeInTheDocument()
        expect(crumbs()).toEqual(["Radice"])
        expect(screen.getByRole("button", { name: "Mostra Radice nella barra laterale" })).toHaveAttribute("aria-current", "page")
    })

    it("lists the folders and then the note for a nested note", async () => {
        await setup([2])
        expect(crumbs()).toEqual(["Lavoro", "Progetti", "Nidificata"])
        expect(screen.getByRole("button", { name: "Mostra Lavoro nella barra laterale" })).not.toHaveAttribute("aria-current")
        expect(screen.getByRole("button", { name: "Mostra Nidificata nella barra laterale" })).toHaveAttribute("aria-current", "page")
        expect(screen.getByText("Nidificata").className).toContain("truncate")
        expect(screen.getByText("Nidificata")).toHaveAttribute("title", "Nidificata")
    })

    it("keeps the first segment and the last two, with an ellipsis, on a long path", async () => {
        await setup([4])
        expect(crumbs()).toEqual(["Lavoro", "C", "Profonda"])
        expect(document.querySelector("[data-slot='breadcrumb-ellipsis']")).not.toBeNull()
    })

    it("asks the sidebar to show the item of the clicked segment", async () => {
        await setup([2])
        const listener = vi.fn()
        window.addEventListener(TREE_REVEAL_EVENT, listener)
        await userEvent.click(screen.getByRole("button", { name: "Mostra Progetti nella barra laterale" }))
        await userEvent.click(screen.getByRole("button", { name: "Mostra Nidificata nella barra laterale" }))
        window.removeEventListener(TREE_REVEAL_EVENT, listener)
        expect(listener.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
            { type: "folder", id: 11 },
            { type: "note", id: 2 },
        ])
    })
})

describe("PathBar new group button", () => {
    it("is a button named New group in the bar, also while the search field is open", async () => {
        await setup([1])
        expect(screen.getByRole("button", { name: "Nuovo gruppo" })).toBeInTheDocument()
    })

    it("is the leftmost of the note buttons, before the search and the completed toggle", async () => {
        await setup([1])
        const names = screen.getAllByRole("button").map(b => b.getAttribute("aria-label")).filter(Boolean)
        expect(names.indexOf("Nuovo gruppo")).toBeLessThan(names.indexOf("Nascondi task completati"))
    })

    it("asks for the new group form on click", async () => {
        await setup([1])
        const commands: string[] = []
        const onCommand = (event: Event) => commands.push((event as CustomEvent<string>).detail)
        window.addEventListener(APP_COMMAND_EVENT, onCommand)
        await userEvent.click(screen.getByRole("button", { name: "Nuovo gruppo" }))
        window.removeEventListener(APP_COMMAND_EVENT, onCommand)
        expect(commands).toEqual(["new-group"])
    })
})

describe("PathBar hide completed toggle", () => {
    beforeEach(() => {
        prefs.hideCompletedTasks = false
        prefs.setHideCompletedTasks.mockReset()
    })

    it("shows a single toggle reflecting the preference with aria-pressed, whatever the number of open notes", async () => {
        const { unmount } = await setup([1, 2])
        expect(screen.getAllByRole("button", { name: "Nascondi task completati" })).toHaveLength(1)
        expect(screen.getByRole("button", { name: "Nascondi task completati" })).toHaveAttribute("aria-pressed", "false")
        unmount()

        prefs.hideCompletedTasks = true
        await setup([1])
        expect(screen.getByRole("button", { name: "Nascondi task completati" })).toHaveAttribute("aria-pressed", "true")
    })

    it("toggles the preference on click", async () => {
        await setup([1])
        await userEvent.click(screen.getByRole("button", { name: "Nascondi task completati" }))
        expect(prefs.setHideCompletedTasks).toHaveBeenCalledTimes(1)
        expect(prefs.setHideCompletedTasks).toHaveBeenCalledWith(true)
    })

    it("toggles the preference once with Ctrl+Shift+H, whatever the number of open notes", async () => {
        await setup([1, 2])
        fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true })
        expect(prefs.setHideCompletedTasks).toHaveBeenCalledTimes(1)
        expect(prefs.setHideCompletedTasks).toHaveBeenCalledWith(true)
    })

    it("does not trigger with Ctrl+H alone (go home)", async () => {
        await setup([1])
        fireEvent.keyDown(window, { key: "h", ctrlKey: true })
        expect(prefs.setHideCompletedTasks).not.toHaveBeenCalled()
    })
})

describe("PathBar search", () => {
    const match = (id: number): SearchMatch => ({ id: `task-${id}#0`, key: `task-${id}`, kind: "task", itemId: id, groupId: 1, taskPath: [], occurrence: 0 })

    const setupSearch = async () => {
        const store = createNoteSearchStore()
        const view = render(
            <ShortcutsProvider>
                <TabsProvider notes={notes} workspaceId={null}>
                    <Opener ids={[1]} />
                    <NoteSearchContext.Provider value={store}><PathBar /></NoteSearchContext.Provider>
                </TabsProvider>
            </ShortcutsProvider>,
        )
        await act(async () => { })
        return { store, ...view }
    }

    it("has no search button outside a search provider", async () => {
        await setup([1])
        expect(screen.queryByRole("button", { name: "Cerca nella nota" })).not.toBeInTheDocument()
    })

    it("the button opens the field with the focus, and the close button closes it", async () => {
        const { store } = await setupSearch()
        await userEvent.click(screen.getByRole("button", { name: "Cerca nella nota" }))
        const field = screen.getByRole("textbox", { name: "Cerca nella nota" })
        expect(field).toHaveFocus()
        expect(store.getState().open).toBe(true)
        await userEvent.click(screen.getByRole("button", { name: "Chiudi la ricerca" }))
        expect(screen.queryByRole("textbox", { name: "Cerca nella nota" })).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Cerca nella nota" })).toBeInTheDocument()
    })

    it("typing sets the query and the counter follows the matches", async () => {
        const { store } = await setupSearch()
        await userEvent.click(screen.getByRole("button", { name: "Cerca nella nota" }))
        await userEvent.type(screen.getByRole("textbox", { name: "Cerca nella nota" }), "ab")
        expect(store.getState().query).toBe("ab")
        expect(screen.getByText("Nessun risultato")).toBeInTheDocument()
        act(() => store.setMatches([match(1), match(2), match(3)], true))
        expect(screen.getByText("1 di 3")).toBeInTheDocument()
    })

    it("Enter goes to the next match, Shift+Enter to the previous one", async () => {
        const { store } = await setupSearch()
        await userEvent.click(screen.getByRole("button", { name: "Cerca nella nota" }))
        await userEvent.type(screen.getByRole("textbox", { name: "Cerca nella nota" }), "a")
        act(() => store.setMatches([match(1), match(2), match(3)], true))
        await userEvent.keyboard("{Enter}")
        expect(screen.getByText("2 di 3")).toBeInTheDocument()
        await userEvent.keyboard("{Shift>}{Enter}{/Shift}{Shift>}{Enter}{/Shift}")
        expect(screen.getByText("3 di 3")).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Risultato successivo" }))
        expect(screen.getByText("1 di 3")).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Risultato precedente" }))
        expect(screen.getByText("3 di 3")).toBeInTheDocument()
    })

    it("Esc closes the search and clears the query without reaching other Esc handlers", async () => {
        const { store } = await setupSearch()
        const outside = vi.fn()
        window.addEventListener("keydown", outside)
        await userEvent.click(screen.getByRole("button", { name: "Cerca nella nota" }))
        await userEvent.type(screen.getByRole("textbox", { name: "Cerca nella nota" }), "a{Escape}")
        window.removeEventListener("keydown", outside)
        expect(store.getState()).toMatchObject({ open: false, query: "" })
        expect(outside.mock.calls.some(([event]) => (event as KeyboardEvent).key === "Escape")).toBe(false)
    })

    it("Ctrl+F opens the field, and focuses and selects the query when it is already open", async () => {
        const { store } = await setupSearch()
        fireEvent.keyDown(window, { key: "f", ctrlKey: true })
        const field = await screen.findByRole("textbox", { name: "Cerca nella nota" })
        expect(field).toHaveFocus()
        await userEvent.type(field, "xyz")
        screen.getByRole("button", { name: "Chiudi la ricerca" }).focus()
        fireEvent.keyDown(window, { key: "f", ctrlKey: true })
        expect(field).toHaveFocus()
        expect((field as HTMLInputElement).selectionEnd).toBe(3)
        expect((field as HTMLInputElement).selectionStart).toBe(0)
        expect(store.getState().query).toBe("xyz")
    })
})

describe("PathBar of a template editor", () => {
    const draftNote = makeNote({ id: 7, name: "Bozza" })
    const retrySave = vi.fn().mockResolvedValue(true)

    const setupDraft = async (status: DraftSaveStatus) => {
        const actions: TemplateDraftsActionsType = {
            openTemplateEditor: async () => {}, flushTemplate: async () => true, flushAll: async () => true,
            retrySave, refreshDrafts: async () => {},
            statusStore: { subscribe: () => () => {}, getStatus: () => status },
        }
        render(
            <ShortcutsProvider>
                <TabsProvider notes={[draftNote]} workspaceId={null}>
                    <TemplateDraftsContext.Provider value={{ drafts: [{ noteId: 7, templateId: 3, templateName: "Sprint", color: null, trashed: false }] }}>
                        <TemplateDraftsActionsContext.Provider value={actions}>
                            <Opener ids={[7]} />
                            <PathBar />
                        </TemplateDraftsActionsContext.Provider>
                    </TemplateDraftsContext.Provider>
                </TabsProvider>
            </ShortcutsProvider>,
        )
        await act(async () => { })
    }

    it("shows Template and the name of the template instead of the folders, with the save state", async () => {
        await setupDraft("saved")
        const nav = screen.getByRole("navigation", { name: "Percorso della nota" })
        expect(nav).toHaveTextContent("Template")
        expect(nav).toHaveTextContent("Sprint")
        expect(screen.queryByRole("button", { name: /nella barra laterale/ })).not.toBeInTheDocument()
        expect(screen.getByRole("status")).toHaveTextContent("Salvato")
    })

    it("retries the save of the draft from the Retry button", async () => {
        retrySave.mockClear()
        await setupDraft("error")
        await userEvent.click(screen.getByRole("button", { name: "Riprova" }))
        expect(retrySave).toHaveBeenCalledWith(7)
    })
})

describe("PathBar split button", () => {
    const renderWithLayout = async (isSplit: boolean) => {
        const toggleSplit = vi.fn()
        const layoutActions = { split: vi.fn(), unsplit: vi.fn(), toggleSplit, focusPane: vi.fn(), openInPane: vi.fn(), moveToPane: vi.fn(), getLayout: () => ({ left: { openIds: [], activeId: null }, right: null, focused: 0 as const, isSplit: false }) }
        render(
            <ShortcutsProvider>
                <TabsProvider notes={notes} workspaceId={null}>
                    <LayoutContext.Provider value={{ left: { openIds: [1], activeId: 1 }, right: isSplit ? { openIds: [], activeId: null } : null, focused: 0, isSplit }}>
                        <IsSplitProvider isSplit={isSplit}>
                            <LayoutActionsContext.Provider value={layoutActions}>
                                <Opener ids={[1]} />
                                <PathBar />
                            </LayoutActionsContext.Provider>
                        </IsSplitProvider>
                    </LayoutContext.Provider>
                </TabsProvider>
            </ShortcutsProvider>,
        )
        await act(async () => { })
        return toggleSplit
    }

    it("offers to split the workspace and toggles the split on click", async () => {
        const toggleSplit = await renderWithLayout(false)
        await userEvent.click(screen.getByRole("button", { name: "Dividi in due aree" }))
        expect(toggleSplit).toHaveBeenCalledTimes(1)
    })

    it("offers to close the split when the workspace is split", async () => {
        const toggleSplit = await renderWithLayout(true)
        expect(screen.queryByRole("button", { name: "Dividi in due aree" })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Chiudi la divisione" }))
        expect(toggleSplit).toHaveBeenCalledTimes(1)
    })
})
