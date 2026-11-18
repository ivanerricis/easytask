import { defaultWindowIcon } from "@tauri-apps/api/app"
import { Menu } from "@tauri-apps/api/menu"
import { TrayIcon } from "@tauri-apps/api/tray"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { backupBeforeQuit } from "@/lib/close-backup"
import { flushStore } from "@/lib/store/save-soon"
import { reportError } from "@/lib/report-error"
import { createWindowEvent } from "@/lib/window-event"

/** Texts of the notification area icon (translated by the caller). */
export type TrayLabels = { tooltip: string, open: string, quit: string }

/** Event fired on `window` when the "close to the notification area" setting changes. */
export const CLOSE_TO_TRAY_EVENT = "easytask:close-to-tray"

const closeToTrayEvent = createWindowEvent<boolean>(CLOSE_TO_TRAY_EVENT)

let active = false

/** True while closing the main window must hide it instead (the tray icon is then shown). */
export const isCloseToTrayActive = (): boolean => active

/**
 * Tells the app that the "close to the notification area" setting is now `value`. The hook mounted in App reacts:
 * it shows or removes the icon and starts or stops hiding the window on close.
 * @category Window
 */
export function notifyCloseToTrayChanged(value: boolean): void {
    closeToTrayEvent.emit(value)
}

/** Marks the setting as on or off (called by the hook, which owns the tray icon). */
export function setCloseToTrayActive(value: boolean): void {
    active = value
}

/** Shows the main window again, restored and focused. */
async function showMainWindow(): Promise<void> {
    const window = getCurrentWindow()
    await window.show()
    await window.unminimize()
    await window.setFocus()
}

/** Hides the main window; the app keeps running in the notification area. */
export async function hideMainWindow(): Promise<void> {
    await getCurrentWindow().hide()
}

/**
 * Really quits: pending store changes (preferences, tabs, shortcuts) are saved first, then the backup of the closing
 * (when the mode asks for it; the hidden window is shown so its overlay can be seen), then the window is destroyed
 * (the last window ends the app).
 */
async function quitApp(): Promise<void> {
    await flushStore().catch(error => reportError(error))
    await backupBeforeQuit(() => { void getCurrentWindow().show().catch(reportError) })
    await getCurrentWindow().destroy()
}

const buildMenu = (labels: TrayLabels) =>
    Menu.new({
        items: [
            { id: "open", text: labels.open, action: () => { void showMainWindow().catch(reportError) } },
            { id: "quit", text: labels.quit, action: () => { void quitApp().catch(reportError) } },
        ],
    })

/** The icon in the notification area. */
export type AppTray = {
    /** Applies new texts (language change) without recreating the icon. */
    update: (labels: TrayLabels) => Promise<void>
    /** Removes the icon. */
    dispose: () => Promise<void>
}

/**
 * Creates the icon (the app icon) with its tooltip and menu; a left click shows the window, the menu opens on right click.
 * @category Window
 */
export async function createTray(labels: TrayLabels): Promise<AppTray> {
    const tray = await TrayIcon.new({
        icon: (await defaultWindowIcon()) ?? undefined,
        tooltip: labels.tooltip,
        menu: await buildMenu(labels),
        showMenuOnLeftClick: false,
        action: event => {
            if (event.type === "Click" && event.button === "Left" && event.buttonState === "Up") {
                void showMainWindow().catch(reportError)
            }
        },
    })
    return {
        update: async next => {
            await tray.setTooltip(next.tooltip)
            await tray.setMenu(await buildMenu(next))
        },
        dispose: () => tray.close(),
    }
}
