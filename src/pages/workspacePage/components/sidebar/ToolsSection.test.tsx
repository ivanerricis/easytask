import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ToolsSection } from "./ToolsSection"

const prefs = { sidebarToolsOpen: true, setSidebarToolsOpen: vi.fn((value: boolean) => { prefs.sidebarToolsOpen = value }) }
const counts = { due: 0, templates: 0, archive: 0, trash: 0 }
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))
vi.mock("./use-tool-counts", () => ({
    useDueCount: () => counts.due,
    useTemplateCount: () => counts.templates,
    useArchiveCount: () => counts.archive,
    useTrashCount: () => counts.trash,
}))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1 } }) }))

describe("ToolsSection", () => {
    beforeEach(() => {
        prefs.sidebarToolsOpen = true
        prefs.setSidebarToolsOpen.mockClear()
        Object.assign(counts, { due: 0, templates: 0, archive: 0, trash: 0 })
    })

    it("shows the five entries when open, with the header exposing its state", () => {
        render(<ToolsSection />)
        const header = screen.getByRole("button", { name: "Strumenti" })
        expect(header).toHaveAttribute("aria-expanded", "true")
        expect(header).toHaveAttribute("aria-controls")
        for (const name of [/Scadenze|Due/, /Statistiche/, /Template/, /Archivio/, /Cestino/])
            expect(screen.getByRole("button", { name })).toBeInTheDocument()
    })

    it("shows no badge in the header while open", () => {
        counts.due = 2
        render(<ToolsSection />)
        expect(screen.getByRole("button", { name: "Strumenti" })).toHaveTextContent(/^Strumenti$/)
    })

    it("asks to save the new state when the header is clicked", async () => {
        const user = userEvent.setup()
        render(<ToolsSection />)
        await user.click(screen.getByRole("button", { name: "Strumenti" }))
        expect(prefs.setSidebarToolsOpen).toHaveBeenCalledWith(false)
    })

    it("is operable with the keyboard", async () => {
        const user = userEvent.setup()
        render(<ToolsSection />)
        await user.tab()
        expect(screen.getByRole("button", { name: "Strumenti" })).toHaveFocus()
        await user.keyboard("{Enter}")
        expect(prefs.setSidebarToolsOpen).toHaveBeenCalledWith(false)
    })

    it("when closed hides the entries and keeps the non-zero counts in the header with accessible text", () => {
        prefs.sidebarToolsOpen = false
        Object.assign(counts, { due: 3, templates: 0, archive: 5, trash: 1 })
        render(<ToolsSection />)
        const header = screen.getByRole("button", { name: /Strumenti/ })
        expect(header).toHaveAttribute("aria-expanded", "false")
        expect(screen.queryByRole("button", { name: /Statistiche/ })).not.toBeInTheDocument()
        expect(header).toHaveTextContent("3")
        expect(header).toHaveTextContent("5")
        expect(header).toHaveTextContent("1")
        expect(header).toHaveTextContent("5 elementi nell'archivio")
        expect(header).toHaveTextContent("1 elemento nel cestino")
        // Templates are 0: no badge
        expect(header).not.toHaveTextContent(/template/i)
        // Overdue first (red), then the neutral ones
        const badges = header.querySelectorAll("[data-slot=badge]")
        expect(Array.from(badges).map(badge => badge.getAttribute("data-variant"))).toEqual(["destructive", "outline", "outline"])
        expect(Array.from(badges).map(badge => badge.textContent)).toEqual(["3", "5", "1"])
    })
})
