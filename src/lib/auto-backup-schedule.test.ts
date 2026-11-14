import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runAutoBackup = vi.fn()
vi.mock("@/db/backup", () => ({ runAutoBackup: () => runAutoBackup() }))

import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, scheduleAutoBackup } from "./auto-backup-schedule"

let stop: () => void

beforeEach(() => {
    vi.useFakeTimers()
    runAutoBackup.mockReset().mockResolvedValue(false)
    stop = scheduleAutoBackup()
})

afterEach(() => {
    stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("scheduleAutoBackup", () => {
    it("checks shortly after the start", () => {
        vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS - 1)
        expect(runAutoBackup).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(runAutoBackup).toHaveBeenCalledTimes(1)
    })

    it("checks again every hour", () => {
        vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
        vi.advanceTimersByTime(CHECK_INTERVAL_MS)
        expect(runAutoBackup).toHaveBeenCalledTimes(2)
        vi.advanceTimersByTime(CHECK_INTERVAL_MS * 2)
        expect(runAutoBackup).toHaveBeenCalledTimes(4)
    })

    it("checks when the window gets the focus or becomes visible again, not more than once a minute", () => {
        vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
        runAutoBackup.mockClear()
        vi.advanceTimersByTime(2 * 60 * 1000)
        window.dispatchEvent(new Event("focus"))
        document.dispatchEvent(new Event("visibilitychange"))
        expect(runAutoBackup).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(61 * 1000)
        document.dispatchEvent(new Event("visibilitychange"))
        expect(runAutoBackup).toHaveBeenCalledTimes(2)
    })

    it("does not check when the window becomes hidden", () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
        document.dispatchEvent(new Event("visibilitychange"))
        expect(runAutoBackup).not.toHaveBeenCalled()
    })

    it("stops completely when cancelled", () => {
        stop()
        vi.advanceTimersByTime(CHECK_INTERVAL_MS * 2)
        window.dispatchEvent(new Event("focus"))
        expect(runAutoBackup).not.toHaveBeenCalled()
    })
})
