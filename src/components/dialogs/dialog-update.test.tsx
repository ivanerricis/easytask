import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { getSkippedUpdateVersion, saveSkippedUpdateVersion } from "@/lib/store/preferences"
import { UPDATE_AVAILABLE_EVENT, type UpdateAvailableDetail } from "@/lib/updater"
import { DialogUpdate } from "./dialog-update"
import { ReleaseNotes } from "@/components/release-notes"

const relaunch = vi.fn()
const openUrl = vi.fn()

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }))
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunch() }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (...a: unknown[]) => openUrl(...a) }))
vi.mock("@/db/appPaths", () => ({ isPortable: vi.fn() }))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const NOTES = "### Added\n\n- Hide completed tasks (`Ctrl+Shift+H`).\n- Duplicate notes.\n\n### Fixed\n\n- A bug."

const fakeUpdate = (downloadAndInstall = vi.fn().mockResolvedValue(undefined)) => ({
    version: "1.2.3",
    currentVersion: "1.2.0",
    body: NOTES,
    downloadAndInstall,
})

const announce = (detail: Partial<UpdateAvailableDetail> = {}) => {
    const update = detail.update ?? fakeUpdate()
    act(() => {
        window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail: { portable: false, ...detail, update } }))
    })
    return update
}

beforeEach(async () => {
    relaunch.mockReset().mockResolvedValue(undefined)
    openUrl.mockReset().mockResolvedValue(undefined)
    vi.mocked(toast.error).mockClear()
    await saveSkippedUpdateVersion(null)
})

describe("DialogUpdate", () => {
    it("stays hidden until an update is announced", () => {
        render(<DialogUpdate />)
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("shows the versions but not the release notes", async () => {
        render(<DialogUpdate />)
        announce()
        const dialog = await screen.findByRole("dialog")
        expect(dialog).toHaveTextContent("Aggiornamento disponibile")
        expect(dialog).toHaveTextContent("EasyTask 1.2.3")
        expect(dialog).toHaveTextContent("1.2.0")
        expect(dialog).not.toHaveTextContent("Duplicate notes.")
        expect(screen.queryByRole("region", { name: "Novità" })).not.toBeInTheDocument()
    })

    it("installs the update and restarts", async () => {
        const downloadAndInstall = vi.fn().mockResolvedValue(undefined)
        render(<DialogUpdate />)
        announce({ update: fakeUpdate(downloadAndInstall) as never })
        await userEvent.click(await screen.findByRole("button", { name: "Aggiorna ora" }))
        await waitFor(() => expect(relaunch).toHaveBeenCalled())
        expect(downloadAndInstall).toHaveBeenCalledTimes(1)
    })

    it("keeps the dialog open with an error toast when the install fails", async () => {
        render(<DialogUpdate />)
        announce({ update: fakeUpdate(vi.fn().mockRejectedValue(new Error("rete"))) as never })
        await userEvent.click(await screen.findByRole("button", { name: "Aggiorna ora" }))
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(relaunch).not.toHaveBeenCalled()
        expect(screen.getByRole("button", { name: "Aggiorna ora" })).toBeEnabled()
        expect(screen.getByRole("alert")).toHaveTextContent("rete")
    })

    it("starts with the focus on the main action, not on Skip", async () => {
        render(<DialogUpdate />)
        announce()
        const button = await screen.findByRole("button", { name: "Aggiorna ora" })
        await waitFor(() => expect(button).toHaveFocus())
    })

    it("shows a hint and an animated bar while installing with an unknown size", async () => {
        render(<DialogUpdate />)
        announce({ update: fakeUpdate(vi.fn(() => new Promise<void>(() => undefined))) as never })
        await userEvent.click(await screen.findByRole("button", { name: "Aggiorna ora" }))
        expect(await screen.findByText(/Non chiudere l'app/)).toBeInTheDocument()
        expect(screen.getByRole("progressbar", { name: "Download dell'aggiornamento" })).toHaveAttribute("aria-valuetext", "Download in corso…")
    })

    it("tells with a toast when another dialog is open", async () => {
        vi.mocked(toast).mockClear()
        const other = document.createElement("div")
        other.setAttribute("role", "dialog")
        document.body.appendChild(other)
        render(<DialogUpdate />)
        announce()
        expect(toast).toHaveBeenCalledWith("Aggiornamento disponibile", expect.objectContaining({ action: expect.objectContaining({ label: "Mostra" }) }))
        act(() => other.remove())
    })

    it("opens once the other dialog closes", async () => {
        const other = document.createElement("div")
        other.setAttribute("role", "dialog")
        document.body.appendChild(other)
        render(<DialogUpdate />)
        announce()
        expect(screen.queryByText("Aggiornamento disponibile")).not.toBeInTheDocument()
        act(() => other.remove())
        expect(await screen.findByRole("dialog")).toHaveTextContent("Aggiornamento disponibile")
    })

    it("does not watch the whole DOM tree while it waits for the other dialog", () => {
        const observe = vi.spyOn(MutationObserver.prototype, "observe")
        const other = document.createElement("div")
        other.setAttribute("role", "dialog")
        document.body.appendChild(other)
        render(<DialogUpdate />)
        announce()
        expect(observe).toHaveBeenCalledWith(document.body, { childList: true })
        observe.mockRestore()
        act(() => other.remove())
    })

    it("closes on Later without skipping the version", async () => {
        render(<DialogUpdate />)
        announce()
        await userEvent.click(await screen.findByRole("button", { name: "Più tardi" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(await getSkippedUpdateVersion()).toBeNull()
    })

    it("remembers a skipped version", async () => {
        render(<DialogUpdate />)
        announce()
        await userEvent.click(await screen.findByRole("button", { name: "Salta questa versione" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        await waitFor(async () => expect(await getSkippedUpdateVersion()).toBe("1.2.3"))
    })

    it("offers the Releases page in the portable app", async () => {
        const downloadAndInstall = vi.fn()
        render(<DialogUpdate />)
        announce({ update: fakeUpdate(downloadAndInstall) as never, portable: true })
        expect(await screen.findByText(/Versione portable|portatile/i)).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: /Releases|release/i }))
        expect(openUrl).toHaveBeenCalled()
        expect(downloadAndInstall).not.toHaveBeenCalled()
    })

    it("waits for another open dialog to close", async () => {
        const other = document.createElement("div")
        other.setAttribute("role", "dialog")
        document.body.appendChild(other)
        render(<DialogUpdate />)
        announce()
        // A real wait on purpose: it asserts that the dialog stays hidden, so there is no condition to wait for
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(screen.queryByText("Aggiornamento disponibile")).not.toBeInTheDocument()
        act(() => other.remove())
        expect(await screen.findByText("Aggiornamento disponibile")).toBeInTheDocument()
    })
})

describe("ReleaseNotes", () => {
    it("renders plain paragraphs too", () => {
        render(<ReleaseNotes body={"Prima riga\n\nSeconda riga"} />)
        expect(screen.getByText("Prima riga")).toBeInTheDocument()
        expect(screen.getByText("Seconda riga")).toBeInTheDocument()
    })
})
