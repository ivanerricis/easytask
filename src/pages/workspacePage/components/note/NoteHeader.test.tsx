import { useEffect, useState } from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"
import { TabsProvider } from "@/contexts/tabs-context"
import { useTabsActions } from "@/contexts/use-tabs"
import { makeNote } from "@/test/ui-fixtures"
import { NoteHeader } from "./NoteHeader"
import { pendingRename, requestTabRename } from "@/lib/pending-rename"
import { TemplateDraftsContext } from "@/contexts/template-drafts-context-object"
vi.mock("../template-draft/DraftTabMenu", () => ({ DraftTabMenu: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

// The rename field needs the workspace data; the rows are tested without it
const startRename = vi.hoisted(() => vi.fn())
const deleteItem = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const purgeItem = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ deleteItem, purgeItem }) }))
const cancelEdit = vi.hoisted(() => vi.fn())
const editingNow = vi.hoisted(() => ({ value: false }))
vi.mock("@/hooks/use-inline-rename", () => ({
    useInlineRename: () => {
        const [editing, setEditing] = useState(editingNow.value)
        return {
            editing,
            error: null,
            start: () => { startRename(); setEditing(true) },
            inputProps: { onKeyDown: (e: { key: string }) => { if (e.key === "Escape" || e.key === "Enter") { cancelEdit(); setEditing(false) } } },
        }
    },
}))

vi.mock("@/lib/store/preferences", () => ({ getReopenNotes: vi.fn().mockResolvedValue(false) }))
vi.mock("@/lib/store/tabs", () => ({ getWorkspaceTabs: vi.fn(), saveWorkspaceTabs: vi.fn() }))
const menuRenders = vi.hoisted(() => ({ count: 0 }))
vi.mock("./ButtonMenuNote", () => ({ ButtonMenuNote: ({ children }: { children: React.ReactNode }) => { menuRenders.count++; return <>{children}</> } }))
// Radix tooltips measure their arrow with a ResizeObserver, which jsdom lacks
vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } })

const notes = [makeNote({ id: 1, name: "Uno" }), makeNote({ id: 2, name: "Due" })]

const Opener = () => {
    const { openNote } = useTabsActions()
    useEffect(() => { openNote(1); openNote(2) }, [openNote])
    return null
}

const setup = () => render(
    <ShortcutsProvider>
        <TabsProvider notes={notes} workspaceId={null}>
            <Opener />
            {notes.map(note => <NoteHeader key={note.id} note={note} />)}
        </TabsProvider>
    </ShortcutsProvider>,
)

describe("NoteHeader active tab", () => {
    // Both tabs reserve the same border, so activating one never moves the others
    // (the box of the tab is the parent of the element with the tab role)
    const tab = (name: string) => screen.getByRole("tab", { name }).parentElement as HTMLElement
    const tabButton = (name: string) => screen.getByRole("tab", { name })

    it("marks the active tab with the normal border color, bold text and aria-selected", async () => {
        setup()
        await act(async () => { })

        // Opened last, "Due" is the active one
        expect(tabButton("Due")).toHaveAttribute("aria-selected", "true")
        expect(tab("Due").className).toContain("border-x-border")
        // no line under the active tab: it opens onto the note
        expect(tab("Due").className).toContain("border-b-transparent")
        expect(screen.getByText("Due").className).toContain("font-medium")
        // a tab is not a container of buttons: the close button is its sibling
        expect(tabButton("Due").querySelector("button")).toBeNull()

        expect(tabButton("Uno")).toHaveAttribute("aria-selected", "false")
        expect(tab("Uno").className).toContain("border-x-transparent")
        expect(tab("Uno").className).toContain("border-b-border")
        expect(tab("Uno").className).toContain("border-x")
        expect(screen.getByText("Uno").className).not.toContain("font-medium")
    })

    it("has the height of the sidebar header, whatever the state", async () => {
        setup()
        await act(async () => { })
        expect(tab("Uno").className).toContain("min-h-[42px]")
        expect(tab("Due").className).toContain("min-h-[42px]")
    })

    it("moves the marks when another tab is activated", async () => {
        setup()
        await act(async () => { })
        await userEvent.click(screen.getByText("Uno"))

        expect(tabButton("Uno")).toHaveAttribute("aria-selected", "true")
        expect(tabButton("Due")).toHaveAttribute("aria-selected", "false")
    })
})

describe("NoteHeader tab semantics", () => {
    it("has one tab in the tab order (the active one), the others are reached with the arrows", async () => {
        setup()
        await act(async () => { })
        expect(screen.getByRole("tab", { name: "Due" })).toHaveAttribute("tabindex", "0")
        expect(screen.getByRole("tab", { name: "Uno" })).toHaveAttribute("tabindex", "-1")
    })

    it("truncates a long name and shows it whole as a title", async () => {
        const long = "Un nome di nota molto molto lungo che non deve allargare la barra delle schede all'infinito"
        render(
            <ShortcutsProvider>
                <TabsProvider notes={[makeNote({ id: 9, name: long })]} workspaceId={null}>
                    <NoteHeader note={makeNote({ id: 9, name: long })} />
                </TabsProvider>
            </ShortcutsProvider>,
        )
        const tab = screen.getByRole("tab", { name: long })
        expect(tab).toHaveAttribute("title", long)
        expect(screen.getByText(long).className).toContain("truncate")
    })
})

describe("NoteHeader of a template editor", () => {
    it("shows the Template badge and the template name; a normal tab stays plain", async () => {
        const draftNote = makeNote({ id: 7, name: "bozza interna" })
        render(
            <ShortcutsProvider>
                <TabsProvider notes={[...notes, draftNote]} workspaceId={null}>
                    <TemplateDraftsContext.Provider value={{ drafts: [{ noteId: 7, templateId: 3, templateName: "Sprint", color: null, trashed: false }] }}>
                        <NoteHeader note={notes[0]} />
                        <NoteHeader note={draftNote} />
                    </TemplateDraftsContext.Provider>
                </TabsProvider>
            </ShortcutsProvider>,
        )
        await act(async () => { })

        const draftTab = screen.getByRole("tab", { name: /Sprint/ })
        expect(draftTab).toHaveAttribute("title", "Template: Sprint")
        expect(draftTab).toHaveTextContent("Template")
        expect(draftTab).toHaveAttribute("data-note-id", "7")
        expect(screen.queryByText("bozza interna")).not.toBeInTheDocument()

        const plain = screen.getByRole("tab", { name: "Uno" })
        expect(plain).toHaveAttribute("title", "Uno")
        expect(plain).not.toHaveTextContent("Template")
    })
})

describe("NoteHeader renders", () => {
    it("re-renders only the two tabs involved when the active tab changes", async () => {
        const three = [makeNote({ id: 1, name: "Uno" }), makeNote({ id: 2, name: "Due" }), makeNote({ id: 3, name: "Tre" })]
        const Open3 = () => {
            const { openNote } = useTabsActions()
            useEffect(() => { openNote(1); openNote(2); openNote(3) }, [openNote])
            return null
        }
        render(
            <ShortcutsProvider>
                <TabsProvider notes={three} workspaceId={null}>
                    <Open3 />
                    {three.map(note => <NoteHeader key={note.id} note={note} />)}
                </TabsProvider>
            </ShortcutsProvider>,
        )
        await act(async () => { })
        // "Tre" is active; moving to "Uno" touches "Uno" and "Tre" only, "Due" stays as it was
        menuRenders.count = 0
        await userEvent.click(screen.getByText("Uno"))
        expect(screen.getByRole("tab", { name: "Uno" })).toHaveAttribute("aria-selected", "true")
        expect(menuRenders.count).toBe(2)
    })
})

describe("NoteHeader rename request", () => {
    it("starts the inline rename when a rename of its note is requested, once", async () => {
        startRename.mockClear()
        setup()
        await act(async () => { })
        expect(startRename).not.toHaveBeenCalled()
        // Not the pane of these tabs (outside the panes: 0): nothing happens
        act(() => requestTabRename(1, 1))
        expect(startRename).not.toHaveBeenCalled()
        act(() => requestTabRename(1, 0))
        expect(startRename).toHaveBeenCalledTimes(1)
        expect(pendingRename.getState()).toBeNull()
    })

    it("Escape in the name field of a just created note deletes it for good and never records the creation", async () => {
        deleteItem.mockClear()
        purgeItem.mockClear()
        const onKeep = vi.fn()
        setup()
        await act(async () => { })
        act(() => requestTabRename(2, 0, onKeep))
        const field = document.querySelector("input")!
        field.focus()
        await userEvent.keyboard("{Escape}")
        expect(deleteItem).toHaveBeenCalledWith("note", 2)
        // its tab (the active one) is closed even when the delete does not touch the tree (sidebar closed): the neighbour becomes active
        expect(screen.getByRole("tab", { name: "Uno" })).toHaveAttribute("aria-selected", "true")
        await waitFor(() => expect(purgeItem).toHaveBeenCalledWith("note", 2))
        expect(onKeep).not.toHaveBeenCalled()
    })

    it("records the creation when the name field ends any other way (Enter, blur)", async () => {
        deleteItem.mockClear()
        const onKeep = vi.fn()
        setup()
        await act(async () => { })
        act(() => requestTabRename(1, 0, onKeep))
        document.querySelector("input")!.focus()
        await userEvent.keyboard("{Enter}")
        expect(onKeep).toHaveBeenCalledTimes(1)
        expect(deleteItem).not.toHaveBeenCalled()
    })

    it("asks when the tab shows up after the request", async () => {
        startRename.mockClear()
        requestTabRename(2, 0)
        setup()
        await act(async () => { })
        expect(startRename).toHaveBeenCalledTimes(1)
        expect(pendingRename.getState()).toBeNull()
    })
})
