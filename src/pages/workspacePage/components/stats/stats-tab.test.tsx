import { describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { requestAppCommand } from "@/lib/app-commands"
import { STATS_TAB_ID, isStatsTab, isVirtualTab, statsTabNote } from "@/lib/tabs/virtual-tabs"
import { ButtonStats } from "../sidebar/ButtonStats"
import { StatsTabCommand } from "./StatsTabCommand"

const openNote = vi.fn()
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote }) }))
vi.mock("@/contexts/use-layout", () => ({ usePaneFocusGetter: () => () => true }))

describe("statistics tab", () => {
    it("has a negative id that is not a note, with a stand-in note for the tab bar", () => {
        expect(STATS_TAB_ID).toBeLessThan(0)
        expect(isStatsTab(STATS_TAB_ID)).toBe(true)
        expect(isStatsTab(3)).toBe(false)
        expect(isVirtualTab(STATS_TAB_ID)).toBe(true)
        expect(isVirtualTab(null)).toBe(false)
        expect(isVirtualTab(5)).toBe(false)
        expect(statsTabNote("Statistiche")).toMatchObject({ id: STATS_TAB_ID, name: "Statistiche" })
    })

    it("the footer button opens the tab through the command, every time (the tab is brought to the front if open)", async () => {
        openNote.mockClear()
        render(<><ButtonStats /><StatsTabCommand /></>)
        await userEvent.click(screen.getByRole("button", { name: "Statistiche" }))
        await userEvent.click(screen.getByRole("button", { name: "Statistiche" }))
        expect(openNote).toHaveBeenCalledTimes(2)
        expect(openNote).toHaveBeenCalledWith(STATS_TAB_ID)
    })

    it("the command opens the tab also without the sidebar button (View menu)", () => {
        openNote.mockClear()
        render(<StatsTabCommand />)
        act(() => requestAppCommand("open-stats"))
        expect(openNote).toHaveBeenCalledWith(STATS_TAB_ID)
    })
})
