import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NoteTemplate } from "@/types/template"
import { makeWorkspace } from "@/test/ui-fixtures"
import { DialogPickTemplate } from "./dialog-pick-template"

const actions = { getTemplates: vi.fn() }
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => actions }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: makeWorkspace({ id: 4 }) }) }))

const template = (id: number, name: string) => ({ id, name, content: { groups: [] } }) as unknown as NoteTemplate
const onOpenChange = vi.fn()
const onPick = vi.fn()
const setup = () => render(<DialogPickTemplate isOpen onOpenChange={onOpenChange} onPick={onPick} />)

// cmdk measures the list: jsdom has neither ResizeObserver nor scrollIntoView
beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("ResizeObserver", class { observe() { /* none */ } unobserve() { /* none */ } disconnect() { /* none */ } })
    Element.prototype.scrollIntoView = vi.fn()
    actions.getTemplates.mockResolvedValue([template(1, "Sprint"), template(2, "Retro")])
})

describe("DialogPickTemplate", () => {
    it("lists the templates of the workspace", async () => {
        setup()
        expect(await screen.findByText("Sprint")).toBeInTheDocument()
        expect(screen.getByText("Retro")).toBeInTheDocument()
        expect(actions.getTemplates).toHaveBeenCalledWith(4)
    })

    it("filters by name", async () => {
        const user = userEvent.setup()
        setup()
        await screen.findByText("Sprint")
        await user.type(screen.getByRole("combobox"), "ret")
        expect(screen.queryByText("Sprint")).not.toBeInTheDocument()
        expect(screen.getByText("Retro")).toBeInTheDocument()
    })

    it("picks a template and closes", async () => {
        const user = userEvent.setup()
        setup()
        await user.click(await screen.findByText("Retro"))
        expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: "Retro" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("explains how to get a template when there are none", async () => {
        actions.getTemplates.mockResolvedValue([])
        setup()
        await waitFor(() => expect(screen.getByText(/Non ci sono ancora template/)).toBeInTheDocument())
    })
    it("mostra Caricamento finché i template non sono arrivati, senza Nessun risultato", async () => {
        let resolve: (list: NoteTemplate[]) => void = () => { /* none */ }
        actions.getTemplates.mockReturnValue(new Promise<NoteTemplate[]>(r => { resolve = r }))
        setup()
        expect(screen.getByText("Caricamento")).toBeInTheDocument()
        expect(screen.queryByText("Nessun risultato")).not.toBeInTheDocument()
        resolve([template(1, "Sprint")])
        expect(await screen.findByText("Sprint")).toBeInTheDocument()
        expect(screen.queryByText("Caricamento")).not.toBeInTheDocument()
    })

    it("in caso di errore mostra l'errore e non Nessun risultato", async () => {
        actions.getTemplates.mockRejectedValue(new Error("boom"))
        setup()
        expect(await screen.findByText(/boom/)).toBeInTheDocument()
        expect(screen.queryByText("Nessun risultato")).not.toBeInTheDocument()
        expect(screen.queryByText("Caricamento")).not.toBeInTheDocument()
    })
})
