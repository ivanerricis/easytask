import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { STATS_TAB_ID } from "@/lib/tabs/virtual-tabs"
import { StatsHeader } from "./StatsHeader"
import { StatsPage } from "./StatsPage"

const closeNote = vi.fn()
const activateNote = vi.fn()
vi.mock("@/contexts/use-tabs", () => ({
    useTabsActions: () => ({ closeNote, activateNote }),
    useActiveNoteSelector: (selector: (id: number | null) => unknown) => selector(STATS_TAB_ID),
}))
vi.mock("@/contexts/use-shortcuts", () => ({ useShortcutLabel: () => "Ctrl+W" }))
vi.mock("@/components/stats/StatsView", () => ({ StatsView: () => <output data-testid="stats-view" /> }))

describe("statistics tab parts", () => {
    it("the page shows its title and the statistics", () => {
        render(<StatsPage />)
        expect(screen.getByRole("tabpanel", { name: "Statistiche" })).toBeInTheDocument()
        expect(screen.getByTestId("stats-view")).toBeInTheDocument()
    })

    it("the tab header activates and closes the tab", async () => {
        render(<StatsHeader />)
        const tab = screen.getByRole("tab", { name: /Statistiche/ })
        expect(tab).toHaveAttribute("aria-selected", "true")
        await userEvent.click(tab)
        expect(activateNote).toHaveBeenCalledWith(STATS_TAB_ID)
        await userEvent.click(screen.getByRole("button", { name: /Chiudi/ }))
        expect(closeNote).toHaveBeenCalledWith(STATS_TAB_ID)
    })
})
