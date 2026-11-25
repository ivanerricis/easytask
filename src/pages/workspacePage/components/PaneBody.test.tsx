import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PaneBody } from "./PaneBody"
import { STATS_TAB_ID, WHATS_NEW_TAB_ID } from "@/lib/tabs/virtual-tabs"

const state = { activeId: 5 as number | null }
vi.mock("@/contexts/use-tabs", () => ({ useActiveNoteId: () => state.activeId }))
vi.mock("@/contexts/use-layout", () => ({ usePane: () => ({ pane: 1 }) }))
vi.mock("@/contexts/use-page", () => ({ useIsActivePage: () => false }))
vi.mock("./note-dnd-veil", () => ({ useVeilLifted: () => false }))
vi.mock("./OpenTaskEffect", () => ({ OpenTaskEffect: () => null }))
vi.mock("./note/NoteList", () => ({ NoteList: () => <div /> }))
vi.mock("./PathBar", () => ({ PathBar: () => <div /> }))
vi.mock("./groups/GroupContainer", () => ({ GroupContainer: () => <div /> }))
vi.mock("./page/PageView", () => ({ PageView: () => <div /> }))
vi.mock("./note-search-context", () => ({ NoteSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("./whats-new/WhatsNewPage", () => ({ WhatsNewPage: ({ panelId, tabId }: { panelId?: string, tabId?: string }) => <div role="tabpanel" id={panelId} aria-labelledby={tabId} /> }))
vi.mock("./stats/StatsPage", () => ({ StatsPage: ({ panelId, tabId }: { panelId?: string, tabId?: string }) => <div role="tabpanel" id={panelId} aria-labelledby={tabId} /> }))

describe("PaneBody tab panel", () => {
    beforeEach(() => { state.activeId = 5 })

    it("the note area is the panel of the active tab of its pane", () => {
        render(<PaneBody empty={null} alwaysTabs={false} />)
        const panel = screen.getByRole("tabpanel")
        expect(panel).toHaveAttribute("id", "tabpanel-1")
        expect(panel).toHaveAttribute("aria-labelledby", "tab-1-5")
    })

    it.each([["statistics", STATS_TAB_ID], ["what's new", WHATS_NEW_TAB_ID]])("the %s page is linked to its tab too", (_name, id) => {
        state.activeId = id
        render(<PaneBody empty={null} alwaysTabs={false} />)
        const panel = screen.getByRole("tabpanel")
        expect(panel).toHaveAttribute("id", "tabpanel-1")
        expect(panel).toHaveAttribute("aria-labelledby", `tab-1-${id}`)
    })
})
