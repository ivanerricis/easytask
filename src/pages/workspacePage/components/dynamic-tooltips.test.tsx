import { useEffect } from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"
import { TabsProvider } from "@/contexts/tabs-context"
import { useTabsActions } from "@/contexts/use-tabs"
import { saveShortcutOverrides } from "@/lib/store/shortcuts"
import { makeNote } from "@/test/ui-fixtures"
import { NoteHeader } from "./note/NoteHeader"
import { ButtonCloseNotes } from "./ButtonCloseNotes"

// The rename field needs the workspace data; the rows are tested without it
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ deleteItem: vi.fn(), purgeItem: vi.fn() }) }))
vi.mock("@/hooks/use-inline-rename", () => ({
    useInlineRename: () => ({ editing: false, error: null, start: () => {}, inputProps: {} }),
}))

vi.mock("@/lib/store/preferences", () => ({ getReopenNotes: vi.fn().mockResolvedValue(false) }))
vi.mock("@/lib/store/tabs", () => ({ getWorkspaceTabs: vi.fn(), saveWorkspaceTabs: vi.fn() }))
vi.mock("./note/ButtonMenuNote", () => ({ ButtonMenuNote: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
// Radix tooltips measure their arrow with a ResizeObserver, which jsdom lacks
vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } })

const note = makeNote({ id: 1, name: "Nota 1" })

const Opener = () => {
    const { openNote } = useTabsActions()
    useEffect(() => { openNote(1) }, [openNote])
    return null
}

const setup = () => render(
    <ShortcutsProvider>
        <TabsProvider notes={[note]} workspaceId={null}>
            <Opener />
            <NoteHeader note={note} />
            <ButtonCloseNotes />
        </TabsProvider>
    </ShortcutsProvider>
)

describe("shortcut tooltips", () => {
    it("show the default bindings of close note and close all notes", async () => {
        setup()
        await act(async () => { })
        await userEvent.hover(screen.getByRole("button", { name: "Chiudi nota corrente" }))
        expect((await screen.findAllByText("(Ctrl + L)")).length).toBeGreaterThan(0)
        await userEvent.unhover(screen.getByRole("button", { name: "Chiudi nota corrente" }))

        await userEvent.hover(screen.getByRole("button", { name: "Chiudi tutte le note" }))
        expect((await screen.findAllByText("(Ctrl + T)")).length).toBeGreaterThan(0)
    })

    it("follow the customized bindings", async () => {
        await saveShortcutOverrides({ "close-note": { key: "w", ctrl: true }, "close-all-notes": { key: "w", ctrl: true, shift: true } })
        setup()
        await act(async () => { })
        await userEvent.hover(screen.getByRole("button", { name: "Chiudi nota corrente" }))
        expect((await screen.findAllByText("(Ctrl + W)")).length).toBeGreaterThan(0)
        await userEvent.unhover(screen.getByRole("button", { name: "Chiudi nota corrente" }))

        await userEvent.hover(screen.getByRole("button", { name: "Chiudi tutte le note" }))
        expect((await screen.findAllByText("(Ctrl + Maiusc + W)")).length).toBeGreaterThan(0)
        expect(screen.queryByText("(Ctrl + T)")).toBeNull()
    })
})
