import { runAutoBackup } from "@/db/backup"
import { reportError } from "@/lib/report-error"
import { createWindowEvent } from "@/lib/window-event"

/** The closing backup must never keep the app open for longer than this. */
export const CLOSE_BACKUP_TIMEOUT_MS = 20_000

/** Event fired on `window` while the backup of the closing is being written (payload: true at start, false at the end). */
export const CLOSE_BACKUP_EVENT = "easytask:close-backup"

export const closeBackupEvent = createWindowEvent<boolean>(CLOSE_BACKUP_EVENT)

/**
 * Backup taken when the app really closes (window closed, "Exit", quit from the notification area), when the backup
 * mode asks for it and none is due yet is skipped. It never blocks or loses the closing: the backup is raced against a
 * timeout of {@link CLOSE_BACKUP_TIMEOUT_MS} and no error escapes (a late backup is written to a temporary file, so it
 * cannot leave a half-written copy among the backups).
 * @param onWriting Called when a copy is about to be written (e.g. to show the hidden window with the overlay).
 * @category Lifecycle
 */
export async function backupBeforeQuit(onWriting?: () => void): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        const backup = runAutoBackup("close", {
            onWriting: () => {
                closeBackupEvent.emit(true)
                try { onWriting?.() } catch (error) { reportError(error) }
            },
        })
        const timeout = new Promise<void>(resolve => { timer = setTimeout(resolve, CLOSE_BACKUP_TIMEOUT_MS) })
        await Promise.race([backup, timeout])
    } catch (error) {
        reportError(error)
    } finally {
        clearTimeout(timer)
        closeBackupEvent.emit(false)
    }
}
