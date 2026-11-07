import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WHATS_NEW_TAB_ID } from "@/lib/tabs/virtual-tabs"
import { pendingWhatsNew } from "@/lib/whats-new"
import { WhatsNewHeader } from "./WhatsNewHeader"
import { WhatsNewPage } from "./WhatsNewPage"
import { WhatsNewTrigger } from "./WhatsNewTrigger"

const openNote = vi.fn()
const closeNote = vi.fn()
const activateNote = vi.fn()
const tabs = { restored: true, activeId: WHATS_NEW_TAB_ID }

vi.mock("@/contexts/use-tabs", () => ({
    useTabs: () => tabs,
    useTabsActions: () => ({ openNote, closeNote, activateNote }),
    useActiveNoteSelector: (selector: (id: number | null) => unknown) => selector(tabs.activeId),
}))
vi.mock("@/contexts/use-shortcuts", () => ({ useShortcutLabel: () => "Ctrl+W" }))
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.17.0") }))
vi.mock("@/lib/whats-new", () => ({ pendingWhatsNew: vi.fn() }))

beforeEach(() => {
    vi.clearAllMocks()
    tabs.restored = true
    tabs.activeId = WHATS_NEW_TAB_ID
})

describe("WhatsNewTrigger", () => {
    it("opens the tab and then saves the version when the app was updated", async () => {
        const markSeen = vi.fn().mockResolvedValue(undefined)
        vi.mocked(pendingWhatsNew).mockResolvedValue({ notes: "x", markSeen })
        render(<WhatsNewTrigger />)
        await waitFor(() => expect(openNote).toHaveBeenCalledWith(WHATS_NEW_TAB_ID))
        await waitFor(() => expect(markSeen).toHaveBeenCalledTimes(1))
    })

    it("opens nothing when there is nothing new (first installation or same version)", async () => {
        vi.mocked(pendingWhatsNew).mockResolvedValue(null)
        render(<WhatsNewTrigger />)
        await waitFor(() => expect(pendingWhatsNew).toHaveBeenCalledTimes(1))
        expect(openNote).not.toHaveBeenCalled()
    })

    it("waits for the saved tabs to be restored", () => {
        tabs.restored = false
        render(<WhatsNewTrigger />)
        expect(pendingWhatsNew).not.toHaveBeenCalled()
    })

    it("asks in the language of the app", async () => {
        vi.mocked(pendingWhatsNew).mockResolvedValue(null)
        render(<WhatsNewTrigger />)
        await waitFor(() => expect(pendingWhatsNew).toHaveBeenCalledWith("it"))
    })
})

describe("WhatsNewPage", () => {
    it("shows the bundled notes of the running version", async () => {
        render(<WhatsNewPage />)
        expect(await screen.findByRole("heading", { name: "Novità" })).toBeInTheDocument()
        expect(await screen.findByTestId("whats-new-version")).toHaveTextContent("0.17.0")
        expect(await screen.findByText("Aggiunto")).toBeInTheDocument()
    })
})

describe("WhatsNewHeader", () => {
    it("is a selected tab named after the news and closes on the x", async () => {
        render(<WhatsNewHeader />)
        expect(screen.getByRole("tab", { name: "Novità", selected: true })).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: /Chiudi/ }))
        expect(closeNote).toHaveBeenCalledWith(WHATS_NEW_TAB_ID)
    })

    it("activates the tab on click when it is not the active one", async () => {
        tabs.activeId = 5
        render(<WhatsNewHeader />)
        await userEvent.click(screen.getByRole("tab", { name: "Novità" }))
        expect(activateNote).toHaveBeenCalledWith(WHATS_NEW_TAB_ID)
    })
})
