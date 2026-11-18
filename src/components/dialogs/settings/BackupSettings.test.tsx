import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { BackupSettings } from "./BackupSettings"
import type { BackupInfo } from "@/db/backup"

const createBackup = vi.fn()
const deleteBackup = vi.fn()
const listBackups = vi.fn()
const restoreBackup = vi.fn()
const listPreMigrationBackups = vi.fn()
const saveBackupKeep = vi.fn()
const saveAutoBackupMode = vi.fn()
const invoke = vi.fn()
const saveBackupFolder = vi.fn()
const saveBackupFrequency = vi.fn()
const openDialog = vi.fn()
const writeTextFile = vi.fn()
const removeFile = vi.fn()
let storedFolder: string | null = null

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...a: unknown[]) => openDialog(...a) }))
vi.mock("@tauri-apps/api/path", () => ({ join: async (...parts: string[]) => parts.join("/") }))
vi.mock("@tauri-apps/plugin-fs", () => ({
    writeTextFile: (...a: unknown[]) => writeTextFile(...a),
    remove: (...a: unknown[]) => removeFile(...a),
}))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/backup", () => ({
    createBackup: (...a: unknown[]) => createBackup(...a),
    deleteBackup: (...a: unknown[]) => deleteBackup(...a),
    listBackups: () => listBackups(),
    restoreBackup: (...a: unknown[]) => restoreBackup(...a),
    listPreMigrationBackups: () => listPreMigrationBackups(),
}))
vi.mock("@/lib/store/preferences", () => ({
    BACKUP_FREQUENCIES: ["daily", "weekly", "monthly"],
    getBackupFrequency: async () => "weekly",
    getBackupFolder: async () => storedFolder,
    saveBackupFolder: (...a: unknown[]) => saveBackupFolder(...a),
    saveBackupFrequency: (...a: unknown[]) => saveBackupFrequency(...a),
    DEFAULT_BACKUP_KEEP: 7,
    MIN_BACKUP_KEEP: 1,
    MAX_BACKUP_KEEP: 100,
    clampBackupKeep: (v: number) => Math.min(100, Math.max(1, Math.round(v))),
    getBackupKeep: async () => 5,
    AUTO_BACKUP_MODES: ["off", "startup", "close", "both"],
    DEFAULT_AUTO_BACKUP_MODE: "close",
    getAutoBackupMode: async () => "close",
    saveBackupKeep: (...a: unknown[]) => saveBackupKeep(...a),
    saveAutoBackupMode: (...a: unknown[]) => saveAutoBackupMode(...a),
}))

const backup = (name: string, size: number, preRestore = false): BackupInfo => ({
    name, path: `/b/${name}`, size, date: new Date(2026, 0, 2, 10, 0, 0), preRestore,
})

beforeEach(() => {
    vi.clearAllMocks()
    listBackups.mockResolvedValue([
        backup("easytask-20260102-100000.db", 2048),
        backup("easytask-pre-restore-20260102-090000.db", 3 * 1024 * 1024, true),
    ])
    listPreMigrationBackups.mockResolvedValue([])
    createBackup.mockResolvedValue(undefined)
    deleteBackup.mockResolvedValue(undefined)
    restoreBackup.mockResolvedValue(undefined)
    saveBackupKeep.mockResolvedValue(undefined)
    saveAutoBackupMode.mockResolvedValue(undefined)
    invoke.mockResolvedValue(undefined)
    storedFolder = null
    saveBackupFolder.mockResolvedValue(undefined)
    saveBackupFrequency.mockResolvedValue(undefined)
    writeTextFile.mockResolvedValue(undefined)
    removeFile.mockResolvedValue(undefined)
})

describe("BackupSettings", () => {
    it("lists the backups with their size and the stored preferences", async () => {
        render(<BackupSettings />)
        expect(await screen.findByText("2 KB")).toBeInTheDocument()
        expect(screen.getByText("3.0 MB")).toBeInTheDocument()
        expect(screen.getByText("(prima del ripristino)")).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Backup da conservare" })).toHaveValue(5))
        await waitFor(() => expect(screen.getByRole("combobox", { name: "Backup automatico" })).toHaveTextContent("Solo alla chiusura"))
    })

    it("shows the pre-migration copies only when there are some", async () => {
        const { unmount } = render(<BackupSettings />)
        await screen.findByText("2 KB")
        expect(screen.queryByText("Copie prima dell'aggiornamento del database")).not.toBeInTheDocument()
        unmount()
        listPreMigrationBackups.mockResolvedValue([
            { name: "easytask-pre-migration-v6-to-v7.db", path: "/b/p", size: 5 * 1024, date: new Date(2026, 0, 2, 10, 0, 0) },
        ])
        render(<BackupSettings />)
        expect(await screen.findByText("easytask-pre-migration-v6-to-v7.db")).toBeInTheDocument()
        expect(screen.getByText("Copie prima dell'aggiornamento del database")).toBeInTheDocument()
    })

    it("backs up now and refreshes the list", async () => {
        const user = userEvent.setup()
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        await user.click(screen.getByRole("button", { name: "Esegui backup" }))
        expect(createBackup).toHaveBeenCalledWith("manual")
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Backup creato"))
        expect(listBackups).toHaveBeenCalledTimes(2)
    })

    it("restores only after the confirmation", async () => {
        const user = userEvent.setup()
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        await user.click(screen.getAllByRole("button", { name: /^Ripristina il backup del/ })[0])
        expect(restoreBackup).not.toHaveBeenCalled()
        await user.click(screen.getByRole("button", { name: "Ripristina e riavvia" }))
        await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith("easytask-20260102-100000.db"))
    })

    it("does not restore when the confirmation is cancelled", async () => {
        const user = userEvent.setup()
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        await user.click(screen.getAllByRole("button", { name: /^Ripristina il backup del/ })[0])
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(restoreBackup).not.toHaveBeenCalled()
    })

    it("deletes a backup only after the confirmation", async () => {
        const user = userEvent.setup()
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        await user.click(screen.getAllByRole("button", { name: /^Elimina il backup del/ })[0])
        expect(deleteBackup).not.toHaveBeenCalled()
        expect(screen.getByText("Eliminare questo backup?")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Elimina" }))
        await waitFor(() => expect(deleteBackup).toHaveBeenCalledWith("easytask-20260102-100000.db"))
    })

    it("does not delete when the confirmation is cancelled", async () => {
        const user = userEvent.setup()
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        await user.click(screen.getAllByRole("button", { name: /^Elimina il backup del/ })[0])
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(deleteBackup).not.toHaveBeenCalled()
    })

    it("shows icon-only buttons with an accessible name and a destructive delete button", async () => {
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        const restoreButton = screen.getAllByRole("button", { name: /^Ripristina il backup del/ })[0]
        const deleteButton = screen.getAllByRole("button", { name: /^Elimina il backup del/ })[0]
        expect(restoreButton).not.toHaveTextContent(/\S/)
        expect(deleteButton).not.toHaveTextContent(/\S/)
        expect(deleteButton.className).toContain("text-destructive")
        expect(restoreButton.className).not.toContain("text-destructive")
    })

    it("saves the preferences and opens the backups folder", async () => {
        const user = userEvent.setup()
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        await user.click(screen.getByRole("combobox", { name: "Backup automatico" }))
        await user.click(screen.getByRole("option", { name: "All'avvio e alla chiusura" }))
        expect(saveAutoBackupMode).toHaveBeenCalledWith("both")
        const input = screen.getByRole("spinbutton", { name: "Backup da conservare" })
        await user.clear(input)
        await user.type(input, "12")
        expect(saveBackupKeep).toHaveBeenLastCalledWith(12)
        await user.click(screen.getByRole("button", { name: "Apri" }))
        expect(invoke).toHaveBeenCalledWith("open_data_folder", { subfolder: "backups" })
    })

    it("shows the stored frequency and disables it while the automatic backup is off", async () => {
        const user = userEvent.setup()
        render(<BackupSettings />)
        const frequency = screen.getByRole("combobox", { name: "Frequenza del backup automatico" })
        await waitFor(() => expect(frequency).toHaveTextContent("Ogni settimana"))
        expect(frequency).toBeEnabled()
        const keep = screen.getByRole("spinbutton", { name: "Backup da conservare" })
        expect(keep).toBeEnabled()
        await user.click(screen.getByRole("combobox", { name: "Backup automatico" }))
        await user.click(screen.getByRole("option", { name: "Disattivato" }))
        expect(saveAutoBackupMode).toHaveBeenCalledWith("off")
        expect(frequency).toBeDisabled()
        expect(keep).toBeDisabled()
    })

    it("chooses a writable folder, saves it and can go back to the default one", async () => {
        const user = userEvent.setup()
        openDialog.mockResolvedValue("/mnt/usb")
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        expect(screen.getByText(/^Predefinita/)).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Scegli…" }))
        expect(openDialog).toHaveBeenCalledWith(expect.objectContaining({ directory: true }))
        await waitFor(() => expect(saveBackupFolder).toHaveBeenCalledWith("/mnt/usb"))
        expect(writeTextFile).toHaveBeenCalledWith("/mnt/usb/easytask-write-test.tmp", "")
        expect(removeFile).toHaveBeenCalledWith("/mnt/usb/easytask-write-test.tmp")
        expect(await screen.findByText("/mnt/usb")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Usa la predefinita" }))
        await waitFor(() => expect(saveBackupFolder).toHaveBeenLastCalledWith(null))
    })

    it("does not save a folder that is not writable", async () => {
        const user = userEvent.setup()
        openDialog.mockResolvedValue("/readonly")
        writeTextFile.mockRejectedValue(new Error("denied"))
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        await user.click(screen.getByRole("button", { name: "Scegli…" }))
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(saveBackupFolder).not.toHaveBeenCalled()
    })

    it("does nothing when the folder picker is cancelled", async () => {
        const user = userEvent.setup()
        openDialog.mockResolvedValue(null)
        render(<BackupSettings />)
        await screen.findByText("2 KB")
        await user.click(screen.getByRole("button", { name: "Scegli…" }))
        expect(saveBackupFolder).not.toHaveBeenCalled()
    })
})
