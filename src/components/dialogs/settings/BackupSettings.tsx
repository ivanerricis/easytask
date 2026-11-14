import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { open } from "@tauri-apps/plugin-dialog"
import { join } from "@tauri-apps/api/path"
import { remove as removeFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { DatabaseBackup, FolderOpen, FolderSearch, History, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "../dialog-confirm"
import { Input } from "@/components/ui/input"
import { SelectItem } from "@/components/ui/select"
import { TooltipCustom } from "@/components/tooltip-custom"
import {
    createBackup,
    deleteBackup,
    listBackups,
    listPreMigrationBackups,
    restoreBackup,
    type BackupInfo,
    type PreMigrationBackupInfo,
} from "@/db/backup"
import { reportError } from "@/lib/report-error"
import {
    BACKUP_FREQUENCIES,
    clampBackupKeep,
    DEFAULT_BACKUP_KEEP,
    getAutoBackup,
    getBackupFolder,
    getBackupFrequency,
    getBackupKeep,
    MAX_BACKUP_KEEP,
    MIN_BACKUP_KEEP,
    saveAutoBackup,
    saveBackupFolder,
    saveBackupFrequency,
    saveBackupKeep,
    type BackupFrequency,
} from "@/lib/store/preferences"
import { formatDateTime, getErrorMessage } from "@/lib/utils"
import { FormError } from "@/components/form-error"
import { SettingsRow, SettingsSelectRow, SettingsSwitchRow } from "./SettingsRow"
import { useOpenDataFolder } from "./use-open-data-folder"

/** "12 KB", "1.4 MB". */
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Checks that files can be created in the folder by writing and deleting a temporary one. */
async function assertWritable(folder: string): Promise<void> {
    const probe = await join(folder, "easytask-write-test.tmp")
    await writeTextFile(probe, "")
    await removeFile(probe)
}

export const BackupSettings = () => {
    const { t } = useTranslation()
    const [backups, setBackups] = useState<BackupInfo[]>([])
    const [preMigration, setPreMigration] = useState<PreMigrationBackupInfo[]>([])
    const [keep, setKeep] = useState(String(DEFAULT_BACKUP_KEEP))
    const [auto, setAuto] = useState(true)
    const [frequency, setFrequency] = useState<BackupFrequency>("daily")
    const [customFolder, setCustomFolder] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [toRestore, setToRestore] = useState<BackupInfo | null>(null)
    const [toDelete, setToDelete] = useState<BackupInfo | null>(null)

    const [error, setError] = useState<string | null>(null)

    // Errors are shown inline in the panel (and logged), not as toasts
    const fail = useCallback((err: unknown, message: string) => {
        reportError(err)
        setError(message)
    }, [])

    const refresh = useCallback(async () => {
        // Informative only: a failure of the pre-migration list is logged but not shown
        const preMigrationRequest = listPreMigrationBackups().catch((err: unknown) => { reportError(err); return [] })
        try {
            setBackups(await listBackups())
        } catch (err) {
            fail(err, t("settings.data.backup.errors.list"))
        }
        setPreMigration(await preMigrationRequest)
    }, [t, fail])

    useEffect(() => {
        let cancelled = false
        void Promise.all([getBackupKeep(), getAutoBackup(), getBackupFrequency(), getBackupFolder()]).then(([storedKeep, storedAuto, storedFrequency, storedFolder]) => {
            if (cancelled) return
            setKeep(String(storedKeep))
            setAuto(storedAuto)
            setFrequency(storedFrequency)
            setCustomFolder(storedFolder)
        }).catch(error => reportError(error))
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of the list
        void refresh()
        return () => { cancelled = true }
    }, [refresh])

    const run = async (action: () => Promise<void>, errorMessage: string) => {
        setBusy(true)
        setError(null)
        try {
            await action()
        } catch (err) {
            fail(err, `${errorMessage} ${getErrorMessage(err)}`)
        } finally {
            setBusy(false)
        }
    }

    const backupNow = () => run(async () => {
        await createBackup("manual")
        toast.success(t("settings.data.backup.created"))
        await refresh()
    }, t("settings.data.backup.errors.create"))

    const remove = (backup: BackupInfo) => run(async () => {
        await deleteBackup(backup.name)
        toast.success(t("settings.data.backup.deleted"))
        await refresh()
    }, t("settings.data.backup.errors.delete"))

    const restore = (backup: BackupInfo) => run(async () => {
        await restoreBackup(backup.name)
        toast.success(t("settings.data.backup.restored"))
    }, t("settings.data.backup.errors.restore"))

    const openFolder = useOpenDataFolder(setError, "backups")

    // The field keeps the raw text while typing; the value is saved as soon as it is a valid number
    const changeKeep = (value: string) => {
        setKeep(value)
        if (value.trim() === "" || !Number.isFinite(Number(value))) return
        void saveBackupKeep(clampBackupKeep(Number(value))).catch(err => fail(err, t("settings.data.backup.errors.save")))
    }

    const normalizeKeep = () => setKeep(String(clampBackupKeep(keep.trim() === "" ? DEFAULT_BACKUP_KEEP : Number(keep))))

    const changeAuto = (value: boolean) => {
        setAuto(value)
        void saveAutoBackup(value).catch(err => fail(err, t("settings.data.backup.errors.save")))
    }

    const changeFrequency = (value: BackupFrequency) => {
        setFrequency(value)
        void saveBackupFrequency(value).catch(err => fail(err, t("settings.data.backup.errors.save")))
    }

    // A failure of the location is shown as a toast
    const failLocation = (err: unknown) => {
        reportError(err)
        toast.error(t("settings.data.backup.location.error", { message: getErrorMessage(err) }))
    }

    // The dialog plugin adds the chosen folder to the fs scope (this session; at startup Rust does it again)
    const chooseFolder = async () => {
        try {
            const picked = await open({ directory: true, multiple: false, title: t("settings.data.backup.location.dialogTitle") })
            if (typeof picked !== "string") return
            await assertWritable(picked)
            await saveBackupFolder(picked)
            setCustomFolder(picked)
            await refresh()
        } catch (err) {
            failLocation(err)
        }
    }

    const resetFolder = async () => {
        try {
            await saveBackupFolder(null)
            setCustomFolder(null)
            await refresh()
        } catch (err) {
            failLocation(err)
        }
    }

    return (
        <>
            <FormError>{error}</FormError>
            <SettingsRow label={t("settings.data.backup.now.label")} description={t("settings.data.backup.now.description")}>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void backupNow()}>
                    <DatabaseBackup />
                    {t("settings.data.backup.now.button")}
                </Button>
            </SettingsRow>
            <SettingsSwitchRow
                label={t("settings.data.backup.auto.label")}
                description={t("settings.data.backup.auto.description")}
                checked={auto}
                onCheckedChange={changeAuto}
            />
            <SettingsSelectRow
                label={t("settings.data.backup.frequency.label")}
                description={t("settings.data.backup.frequency.description")}
                value={frequency}
                onValueChange={value => changeFrequency(value as BackupFrequency)}
                disabled={!auto}
                width="w-32"
            >
                {BACKUP_FREQUENCIES.map(value => (
                    <SelectItem key={value} value={value}>{t(`settings.data.backup.frequency.${value}`)}</SelectItem>
                ))}
            </SettingsSelectRow>
            <SettingsRow label={t("settings.data.backup.keep.label")} description={t("settings.data.backup.keep.description")}>
                {({ id, descriptionId }) => (
                    <div className="flex items-center gap-2">
                        <Input
                            id={id}
                            aria-describedby={descriptionId}
                            type="number"
                            className="h-8 w-20"
                            min={MIN_BACKUP_KEEP}
                            max={MAX_BACKUP_KEEP}
                            value={keep}
                            onChange={event => changeKeep(event.target.value)}
                            onBlur={normalizeKeep}
                        />
                        <span className="text-xs text-muted-foreground">{t("settings.data.backup.keep.unit")}</span>
                    </div>
                )}
            </SettingsRow>
            <SettingsRow label={t("settings.data.backup.folder.label")} description={t("settings.data.backup.folder.description")}>
                <Button variant="outline" size="sm" onClick={() => void openFolder()}>
                    <FolderOpen />
                    {t("settings.data.backup.folder.button")}
                </Button>
            </SettingsRow>
            <div className="flex flex-col gap-3">
                <SettingsRow label={t("settings.data.backup.location.label")} description={t("settings.data.backup.location.description")}>
                    <Button variant="outline" size="sm" onClick={() => void chooseFolder()}>
                        <FolderSearch />
                        {t("settings.data.backup.location.choose")}
                    </Button>
                </SettingsRow>
                <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-muted-foreground" title={customFolder ?? undefined}>
                        {customFolder ?? t("settings.data.backup.location.default")}
                    </span>
                    {customFolder && (
                        <Button variant="ghost" size="sm" onClick={() => void resetFolder()}>
                            {t("settings.data.backup.location.reset")}
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <div className="text-sm">{t("settings.data.backup.list.title")}</div>
                {backups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("settings.data.backup.list.empty")}</p>
                ) : (
                    <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-xs border p-1" aria-label={t("settings.data.backup.list.title")}>
                        {backups.map(backup => {
                            const date = formatDateTime(backup.date)
                            return (
                            <li key={backup.name} className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0 truncate">
                                    {date}
                                    {backup.preRestore && (
                                        <span className="ml-2 text-xs text-muted-foreground">{t("settings.data.backup.list.preRestore")}</span>
                                    )}
                                    <span className="ml-2 text-xs text-muted-foreground">{formatSize(backup.size)}</span>
                                </span>
                                <span className="shrink-0 flex gap-1">
                                    <TooltipCustom text={t("settings.data.backup.restore.button")}>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            disabled={busy}
                                            aria-label={t("settings.data.backup.restore.aria", { date })}
                                            onClick={() => setToRestore(backup)}
                                        >
                                            <History />
                                        </Button>
                                    </TooltipCustom>
                                    <TooltipCustom text={t("common.delete")}>
                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            disabled={busy}
                                            aria-label={t("settings.data.backup.delete.aria", { date })}
                                            onClick={() => setToDelete(backup)}
                                        >
                                            <Trash2 />
                                        </Button>
                                    </TooltipCustom>
                                </span>
                            </li>
                            )
                        })}
                    </ul>
                )}
            </div>
            {preMigration.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="text-sm">{t("settings.data.backup.list.preMigration.title")}</div>
                    <p className="text-xs text-muted-foreground">{t("settings.data.backup.list.preMigration.description")}</p>
                    <ul className="flex flex-col gap-1 max-h-32 overflow-y-auto rounded-xs border p-1" aria-label={t("settings.data.backup.list.preMigration.title")}>
                        {preMigration.map(copy => (
                            <li key={copy.name} className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0 truncate">{copy.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {copy.date ? formatDateTime(copy.date) : ""} {formatSize(copy.size)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <ConfirmDialog
                open={toDelete !== null}
                onOpenChange={open => { if (!open) setToDelete(null) }}
                destructive
                irreversible
                initialFocus="cancel"
                title={t("settings.data.backup.delete.title")}
                description={t("settings.data.backup.delete.description", { date: toDelete ? formatDateTime(toDelete.date) : "" })}
                confirm={{ label: t("common.delete"), icon: Trash2, onClick: () => { if (toDelete) void remove(toDelete) } }}
            />
            <ConfirmDialog
                open={toRestore !== null}
                onOpenChange={open => { if (!open) setToRestore(null) }}
                destructive
                irreversible
                initialFocus="cancel"
                title={t("settings.data.backup.restore.title")}
                description={t("settings.data.backup.restore.description", { date: toRestore ? formatDateTime(toRestore.date) : "" })}
                confirm={{ label: t("settings.data.backup.restore.confirm"), icon: History, onClick: () => { if (toRestore) void restore(toRestore) } }}
            />
        </>
    )
}
