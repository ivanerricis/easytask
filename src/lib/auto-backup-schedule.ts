import { runAutoBackup } from "@/db/backup"

/** Delay of the first check after the start (so it does not compete with the first render). */
export const FIRST_CHECK_DELAY_MS = 3000
/** The app can stay in the notification area for days: the check is repeated every hour. */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000
/** Minimum distance between two checks started by the window coming back (focus and visibility fire together). */
const WAKE_MIN_GAP_MS = 60 * 1000

/**
 * Schedules the automatic backup: a check shortly after the start, then every hour and whenever the window becomes
 * visible or gets the focus again (after a stay in the tray, or a sleep of the computer, the timer alone may be late).
 * Each check is {@link runAutoBackup}, which skips when no backup is due and never runs two backups at once.
 * @returns A function that stops the schedule.
 * @category Database
 */
export function scheduleAutoBackup(): () => void {
    let lastCheck = -Infinity
    const check = () => {
        lastCheck = Date.now()
        void runAutoBackup()
    }
    const onWake = () => {
        if (document.visibilityState === "hidden") return
        if (Date.now() - lastCheck < WAKE_MIN_GAP_MS) return
        check()
    }
    const first = setTimeout(check, FIRST_CHECK_DELAY_MS)
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    document.addEventListener("visibilitychange", onWake)
    window.addEventListener("focus", onWake)
    return () => {
        clearTimeout(first)
        clearInterval(interval)
        document.removeEventListener("visibilitychange", onWake)
        window.removeEventListener("focus", onWake)
    }
}
