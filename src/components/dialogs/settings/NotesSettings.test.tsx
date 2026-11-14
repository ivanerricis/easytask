import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NotesSettings } from "./NotesSettings"

const setters = { setCollapsedGroupLayout: vi.fn(), setTaskDensity: vi.fn(), setNewTaskPosition: vi.fn(), setSpellcheck: vi.fn(), setConfirmDeleteWithContent: vi.fn(), setKeepAddingTasks: vi.fn(), setShowTaskInsertLine: vi.fn(), setLiveDrag: vi.fn(), setReopenLastWorkspace: vi.fn(), setStartupWorkspaceId: vi.fn() }
let prefs: Record<string, unknown>
const workspaces = [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }]

vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ workspaces }) }))

vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => ({ ...prefs, ...setters }) }))

describe("NotesSettings", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        prefs = { collapsedGroupLayout: "vertical", taskDensity: "normal", newTaskPosition: "bottom", spellcheck: true, reopenLastWorkspace: false, startupWorkspaceId: null }
    })

    it("changes the layout of the collapsed groups", async () => {
        render(<NotesSettings />)
        expect(screen.getByRole("radio", { name: "Verticale" })).toBeChecked()
        await userEvent.click(screen.getByRole("radio", { name: "Orizzontale" }))
        expect(setters.setCollapsedGroupLayout).toHaveBeenCalledWith("horizontal")
    })

    it("changes the task density", async () => {
        render(<NotesSettings />)
        await userEvent.click(screen.getByRole("radio", { name: "Compatta" }))
        expect(setters.setTaskDensity).toHaveBeenCalledWith("compact")
    })

    it("changes where new tasks go", async () => {
        render(<NotesSettings />)
        await userEvent.click(screen.getByRole("radio", { name: "In cima" }))
        expect(setters.setNewTaskPosition).toHaveBeenCalledWith("top")
    })

    it("toggles keep adding tasks", async () => {
        prefs.keepAddingTasks = true
        render(<NotesSettings />)
        const toggle = screen.getByRole("switch", { name: "Continua ad aggiungere task" })
        expect(toggle).toBeChecked()
        await userEvent.click(toggle)
        expect(setters.setKeepAddingTasks).toHaveBeenCalledWith(false)
    })

    it("toggles the task insert line", async () => {
        prefs.showTaskInsertLine = true
        render(<NotesSettings />)
        const toggle = screen.getByRole("switch", { name: "Linea per inserire un task" })
        expect(toggle).toBeChecked()
        await userEvent.click(toggle)
        expect(setters.setShowTaskInsertLine).toHaveBeenCalledWith(false)
    })

    it("toggles the live drag", async () => {
        prefs.liveDrag = true
        render(<NotesSettings />)
        const toggle = screen.getByRole("switch", { name: "Task, sezioni, gruppi, note, cartelle e tab che si spostano mentre li trascini" })
        expect(toggle).toBeChecked()
        await userEvent.click(toggle)
        expect(setters.setLiveDrag).toHaveBeenCalledWith(false)
    })

    it("toggles the delete confirmation", async () => {
        prefs.confirmDeleteWithContent = true
        render(<NotesSettings />)
        const toggle = screen.getByRole("switch", { name: "Conferma l'eliminazione solo se c'è contenuto" })
        expect(toggle).toBeChecked()
        await userEvent.click(toggle)
        expect(setters.setConfirmDeleteWithContent).toHaveBeenCalledWith(false)
    })

    it("toggles the spell check", async () => {
        render(<NotesSettings />)
        const toggle = screen.getByRole("switch", { name: "Controllo ortografico" })
        expect(toggle).toBeChecked()
        await userEvent.click(toggle)
        expect(setters.setSpellcheck).toHaveBeenCalledWith(false)
    })

    it("chooses what the app opens at startup", async () => {
        const user = userEvent.setup()
        const { rerender } = render(<NotesSettings />)
        const select = screen.getByRole("combobox", { name: "Apri all'avvio" })
        expect(select).toHaveTextContent("Pagina iniziale")

        await user.click(select)
        await user.click(await screen.findByRole("option", { name: "Ultimo workspace usato" }))
        expect(setters.setReopenLastWorkspace).toHaveBeenLastCalledWith(true)
        expect(setters.setStartupWorkspaceId).toHaveBeenLastCalledWith(null)

        await user.click(select)
        await user.click(await screen.findByRole("option", { name: "Beta" }))
        expect(setters.setReopenLastWorkspace).toHaveBeenLastCalledWith(true)
        expect(setters.setStartupWorkspaceId).toHaveBeenLastCalledWith(2)

        // The preferences are mocked: show the stored state the user would now see
        prefs = { ...prefs, reopenLastWorkspace: true, startupWorkspaceId: 2 }
        rerender(<NotesSettings />)
        await user.click(select)
        await user.click(await screen.findByRole("option", { name: "Pagina iniziale" }))
        expect(setters.setReopenLastWorkspace).toHaveBeenLastCalledWith(false)
    })

    it("shows the fixed workspace, or the last one when it was deleted", () => {
        prefs = { ...prefs, reopenLastWorkspace: true, startupWorkspaceId: 1 }
        const { unmount } = render(<NotesSettings />)
        expect(screen.getByRole("combobox", { name: "Apri all'avvio" })).toHaveTextContent("Alpha")
        unmount()
        prefs = { ...prefs, startupWorkspaceId: 99 }
        render(<NotesSettings />)
        expect(screen.getByRole("combobox", { name: "Apri all'avvio" })).toHaveTextContent("Ultimo workspace usato")
    })
})
