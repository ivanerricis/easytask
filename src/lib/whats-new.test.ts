import { beforeEach, describe, expect, it, vi } from "vitest"
import { getVersion } from "@tauri-apps/api/app"
import { getLastSeenVersion, saveLastSeenVersion } from "@/lib/store/preferences"
import { getBundledReleaseNotes } from "@/lib/release-notes"
import { pendingWhatsNew } from "./whats-new"

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }))
vi.mock("@/lib/store/preferences", () => ({ getLastSeenVersion: vi.fn(), saveLastSeenVersion: vi.fn() }))
vi.mock("@/lib/release-notes", () => ({ getBundledReleaseNotes: vi.fn() }))

beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getVersion).mockResolvedValue("0.19.0")
    vi.mocked(saveLastSeenVersion).mockResolvedValue(undefined)
    vi.mocked(getBundledReleaseNotes).mockResolvedValue("### Added\n\n- Something.")
})

describe("pendingWhatsNew", () => {
    it("gives the notes when the app was updated and saves the version only when asked", async () => {
        vi.mocked(getLastSeenVersion).mockResolvedValue("0.18.0")
        const pending = await pendingWhatsNew("it")
        expect(pending?.notes).toBe("### Added\n\n- Something.")
        expect(getBundledReleaseNotes).toHaveBeenCalledWith("0.19.0", "it")
        expect(saveLastSeenVersion).not.toHaveBeenCalled()
        await pending?.markSeen()
        expect(saveLastSeenVersion).toHaveBeenCalledWith("0.19.0")
    })

    it("shows nothing on the first installation, but remembers the version", async () => {
        vi.mocked(getLastSeenVersion).mockResolvedValue(null)
        expect(await pendingWhatsNew("en")).toBeNull()
        expect(saveLastSeenVersion).toHaveBeenCalledWith("0.19.0")
        expect(getBundledReleaseNotes).not.toHaveBeenCalled()
    })

    it("shows nothing when the version is the one already seen", async () => {
        vi.mocked(getLastSeenVersion).mockResolvedValue("0.19.0")
        expect(await pendingWhatsNew("en")).toBeNull()
        expect(saveLastSeenVersion).not.toHaveBeenCalled()
    })

    it("shows nothing, but remembers the version, when the changelog has no entry for it", async () => {
        vi.mocked(getLastSeenVersion).mockResolvedValue("0.18.0")
        vi.mocked(getBundledReleaseNotes).mockResolvedValue("")
        expect(await pendingWhatsNew("en")).toBeNull()
        expect(saveLastSeenVersion).toHaveBeenCalledWith("0.19.0")
    })
})
