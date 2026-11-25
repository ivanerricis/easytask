import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { SystemSettings } from "./SystemSettings"

const isEnabled = vi.fn()
const enable = vi.fn()
const disable = vi.fn()
const saveCloseToTray = vi.fn()
const notifyCloseToTrayChanged = vi.fn()
const saveRememberWindowState = vi.fn()
const isPortable = vi.fn()
const saveAlwaysOnTop = vi.fn()
const setAlwaysOnTop = vi.fn()
const saveHardwareAcceleration = vi.fn()
const flushPreferences = vi.fn()
const relaunch = vi.fn()
let hardwareAcceleration = true
let alwaysOnTop = false
let closeToTray = false
let rememberWindowState = true
let dueNotifications = true
const saveDueNotifications = vi.fn()

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@tauri-apps/plugin-autostart", () => ({
    isEnabled: () => isEnabled(),
    enable: () => enable(),
    disable: () => disable(),
}))
vi.mock("@/lib/store/preferences", () => ({
    getDueNotifications: async () => dueNotifications,
    saveDueNotifications: (...a: unknown[]) => saveDueNotifications(...a),
    getCloseToTray: async () => closeToTray,
    saveCloseToTray: (...a: unknown[]) => saveCloseToTray(...a),
    getAlwaysOnTop: async () => alwaysOnTop,
    saveAlwaysOnTop: (...a: unknown[]) => saveAlwaysOnTop(...a),
    getHardwareAcceleration: async () => hardwareAcceleration,
    saveHardwareAcceleration: (...a: unknown[]) => saveHardwareAcceleration(...a),
    getRememberWindowState: async () => rememberWindowState,
    saveRememberWindowState: (...a: unknown[]) => saveRememberWindowState(...a),
}))
vi.mock("@/lib/store/save-soon", () => ({ flushStore: () => flushPreferences() }))
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunch() }))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setAlwaysOnTop: (...a: unknown[]) => setAlwaysOnTop(...a) }) }))
vi.mock("@/db/appPaths", () => ({ isPortable: () => isPortable() }))
vi.mock("@/lib/tray", () => ({ notifyCloseToTrayChanged: (...a: unknown[]) => notifyCloseToTrayChanged(...a) }))

beforeEach(() => {
    vi.clearAllMocks()
    closeToTray = false
    dueNotifications = true
    saveDueNotifications.mockResolvedValue(undefined)
    rememberWindowState = true
    alwaysOnTop = false
    hardwareAcceleration = true
    saveHardwareAcceleration.mockResolvedValue(undefined)
    flushPreferences.mockResolvedValue(undefined)
    relaunch.mockResolvedValue(undefined)
    setAlwaysOnTop.mockResolvedValue(undefined)
    saveAlwaysOnTop.mockResolvedValue(undefined)
    isPortable.mockResolvedValue(false)
    saveRememberWindowState.mockResolvedValue(undefined)
    isEnabled.mockResolvedValue(false)
    enable.mockResolvedValue(undefined)
    disable.mockResolvedValue(undefined)
    saveCloseToTray.mockResolvedValue(undefined)
})

describe("SystemSettings", () => {
    it("reads the autostart state from the system and toggles it", async () => {
        isEnabled.mockResolvedValue(true)
        const user = userEvent.setup()
        render(<SystemSettings />)
        const autostart = screen.getByRole("switch", { name: "Avvia con Windows" })
        await waitFor(() => expect(autostart).toBeChecked())
        await user.click(autostart)
        expect(disable).toHaveBeenCalled()
        expect(autostart).not.toBeChecked()
        await user.click(autostart)
        expect(enable).toHaveBeenCalled()
    })

    it("reverts the switch and shows a toast when the system refuses", async () => {
        enable.mockRejectedValue(new Error("denied"))
        const user = userEvent.setup()
        render(<SystemSettings />)
        const autostart = screen.getByRole("switch", { name: "Avvia con Windows" })
        await waitFor(() => expect(autostart).toBeEnabled())
        await user.click(autostart)
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(autostart).not.toBeChecked()
    })

    it("saves close to the notification area and tells the app", async () => {
        const user = userEvent.setup()
        render(<SystemSettings />)
        const toggle = screen.getByRole("switch", { name: "Riduci nell'area di notifica" })
        await user.click(toggle)
        expect(saveCloseToTray).toHaveBeenCalledWith(true)
        expect(notifyCloseToTrayChanged).toHaveBeenCalledWith(true)
        expect(toggle).toBeChecked()
    })

    it("saves remembering the window", async () => {
        const user = userEvent.setup()
        render(<SystemSettings />)
        const toggle = await screen.findByRole("switch", { name: "Ricorda posizione e dimensione della finestra" })
        await waitFor(() => expect(toggle).toBeChecked())
        await user.click(toggle)
        expect(saveRememberWindowState).toHaveBeenCalledWith(false)
        expect(toggle).not.toBeChecked()
    })

    it("shows remembering the window off and disabled in portable mode, with the reason", async () => {
        isPortable.mockResolvedValue(true)
        render(<SystemSettings />)
        const toggle = screen.getByRole("switch", { name: "Ricorda posizione e dimensione della finestra" })
        await waitFor(() => expect(toggle).toBeDisabled())
        expect(toggle).not.toBeChecked()
        expect(screen.getByText(/versione portatile/)).toBeInTheDocument()
    })

    it("puts the window on top and saves the choice", async () => {
        const user = userEvent.setup()
        render(<SystemSettings />)
        const toggle = screen.getByRole("switch", { name: "Tieni la finestra in primo piano" })
        await user.click(toggle)
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
        await waitFor(() => expect(saveAlwaysOnTop).toHaveBeenCalledWith(true))
        expect(toggle).toBeChecked()
    })

    it("shows the stored always on top state", async () => {
        alwaysOnTop = true
        render(<SystemSettings />)
        await waitFor(() => expect(screen.getByRole("switch", { name: "Tieni la finestra in primo piano" })).toBeChecked())
    })

    it("shows the stored hardware acceleration state", async () => {
        hardwareAcceleration = false
        render(<SystemSettings />)
        await waitFor(() => expect(screen.getByRole("switch", { name: "Accelerazione hardware" })).not.toBeChecked())
    })

    it("saves hardware acceleration and offers to restart now", async () => {
        const user = userEvent.setup()
        render(<SystemSettings />)
        const toggle = screen.getByRole("switch", { name: "Accelerazione hardware" })
        await waitFor(() => expect(toggle).toBeChecked())
        await user.click(toggle)
        expect(saveHardwareAcceleration).toHaveBeenCalledWith(false)
        expect(toggle).not.toBeChecked()
        const [message, options] = vi.mocked(toast).mock.calls[0] as unknown as [string, { action: { onClick: () => void } }]
        expect(message).toBe("L'accelerazione hardware cambia al prossimo avvio.")
        options.action.onClick()
        await waitFor(() => expect(relaunch).toHaveBeenCalled())
        expect(flushPreferences).toHaveBeenCalled()
    })

    it("reverts the switch and reports when the window refuses", async () => {
        setAlwaysOnTop.mockRejectedValue(new Error("denied"))
        const user = userEvent.setup()
        render(<SystemSettings />)
        const toggle = screen.getByRole("switch", { name: "Tieni la finestra in primo piano" })
        await user.click(toggle)
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(toggle).not.toBeChecked()
        expect(saveAlwaysOnTop).not.toHaveBeenCalled()
    })
})

describe("due date notifications", () => {
    it("is on by default and saves the change", async () => {
        const user = userEvent.setup()
        render(<SystemSettings />)
        const toggle = await screen.findByRole("switch", { name: "Notifiche delle scadenze" })
        await waitFor(() => expect(toggle).toBeChecked())
        await user.click(toggle)
        await waitFor(() => expect(saveDueNotifications).toHaveBeenCalledWith(false))
        expect(toggle).not.toBeChecked()
    })
})
