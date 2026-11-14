import { join } from "@tauri-apps/api/path"
import { copyFile, exists, mkdir, readDir, remove, rename, stat } from "@tauri-apps/plugin-fs"
import { relaunch } from "@tauri-apps/plugin-process"
import Database from "@tauri-apps/plugin-sql"
import i18n from "@/i18n"
import { reportError } from "@/lib/report-error"
import { getAutoBackup, getBackupFolder, getBackupFrequency, getBackupKeep, type BackupFrequency } from "@/lib/store/preferences"
import { createError, isAppError } from "@/types/error"
import { ensureAppFolder } from "./appPaths"
import { closeDB, DB_FILE, getDB, setRestoring } from "./dbManager"
import { APPLICATION_ID, LATEST_SCHEMA_VERSION } from "./initDb"

const BACKUP_FOLDER = "backups"
/** Subfolder of the backups folder holding the copies taken before a migration (not rotated). */
const PRE_MIGRATION_FOLDER = "pre-migration"

const PRE_MIGRATION_PATTERN = /^easytask-pre-migration-v(\d+)-to-v(\d+)\.db$/

/** How many pre-migration copies are kept: when a new one is taken, the ones of the oldest migrations are deleted. */
export const MAX_PRE_MIGRATION_BACKUPS = 10

const REGULAR_PATTERN = /^easytask-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d+))?\.db$/
const PRE_RESTORE_PATTERN = /^easytask-pre-restore-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d+))?\.db$/

type BackupKind = "manual" | "auto" | "pre-restore"

export type BackupInfo = {
    /** File name inside the backups folder. */
    name: string
    /** Absolute path of the file. */
    path: string
    /** Size in bytes (0 if unknown). */
    size: number
    /** Moment the backup was taken, read from the file name. */
    date: Date
    /** True for the safety copy made right before a restore. */
    preRestore: boolean
}

const pad = (value: number) => String(value).padStart(2, "0")

/** "YYYYMMDD-HHmmss" in local time. */
function formatTimestamp(date: Date): string {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/** Builds the file name of a backup taken at `date`; `sequence` (>= 2) disambiguates backups taken in the same second. */
export function backupFileName(date: Date, preRestore = false, sequence = 1): string {
    return `easytask-${preRestore ? "pre-restore-" : ""}${formatTimestamp(date)}${sequence > 1 ? `-${sequence}` : ""}.db`
}

/** Reads the date out of a backup file name; null when the name is not a backup name. */
export function parseBackupName(name: string): { date: Date, preRestore: boolean, sequence: number } | null {
    const preRestore = PRE_RESTORE_PATTERN.exec(name)
    const match = preRestore ?? REGULAR_PATTERN.exec(name)
    if (!match) return null
    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
    return { date: new Date(year, month - 1, day, hour, minute, second), preRestore: preRestore !== null, sequence: match[7] ? Number(match[7]) : 1 }
}

/** Creates the folder (and its parents) if missing; `mkdir` with `recursive` is idempotent, no `exists` check needed. */
async function ensureDir(folder: string): Promise<void> {
    await mkdir(folder, { recursive: true })
}

/**
 * Runs `VACUUM INTO` for `target`. VACUUM cannot run in a transaction and the plugin's binding of its argument is not
 * verified, so the path goes in as an SQL string literal: single quotes are doubled and a path that could end the
 * literal early or confuse the statement (NUL character, empty path) is refused.
 */
async function vacuumInto(db: Database, target: string): Promise<void> {
    if (target.length === 0 || target.includes("\0")) throw new Error("Invalid backup path")
    await db.execute(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
}

/** The default backups folder, inside the data folder. Pre-migration copies always live here. */
async function defaultBackupFolderPath(): Promise<string> {
    const folder = await join(await ensureAppFolder(), BACKUP_FOLDER)
    await ensureDir(folder)
    return folder
}

/** The folder regular and pre-restore backups live in: the custom one chosen in the settings, else the default one. */
async function backupFolderPath(): Promise<string> {
    const custom = await getBackupFolder()
    if (!custom) return defaultBackupFolderPath()
    await ensureDir(custom)
    return custom
}

/**
 * Lists the backups in the data folder, newest first.
 * @category Database
 */
export async function listBackups(): Promise<BackupInfo[]> {
    const folder = await backupFolderPath()
    const entries = await readDir(folder)
    const backups = await Promise.all(entries.map(async (entry): Promise<BackupInfo | null> => {
        const parsed = entry.isFile ? parseBackupName(entry.name) : null
        if (!parsed) return null
        const path = await join(folder, entry.name)
        const size = await stat(path).then(info => info.size, () => 0)
        return { name: entry.name, path, size, date: parsed.date, preRestore: parsed.preRestore }
    })).then(list => list.filter((backup): backup is BackupInfo => backup !== null))
    const sequenceOf = (backup: BackupInfo) => parseBackupName(backup.name)?.sequence ?? 1
    return backups.sort((a, b) => b.date.getTime() - a.date.getTime() || sequenceOf(b) - sequenceOf(a) || b.name.localeCompare(a.name))
}

/**
 * Deletes the oldest regular backups, keeping the last `keep`. The pre-restore copy is not counted.
 * @returns How many files were deleted.
 * @category Database
 */
export async function rotateBackups(keep: number): Promise<number> {
    const regular = (await listBackups()).filter(backup => !backup.preRestore)
    const stale = regular.slice(Math.max(1, keep))
    for (const backup of stale) await remove(backup.path)
    return stale.length
}

/**
 * Writes a consistent copy of the database (VACUUM INTO, outside any transaction) in the backups folder.
 * Regular backups are then rotated according to the "keep" preference; only the newest pre-restore copy is kept.
 * @param kind Why the backup is taken (pre-migration copies have their own function, createPreMigrationBackup).
 * @param database Connection to copy; the shared one when omitted. Needed while that one is still being opened.
 * @returns The created backup.
 * @category Database
 */
export async function createBackup(kind: BackupKind = "manual", database?: Database): Promise<BackupInfo> {
    const folder = await backupFolderPath()
    const date = new Date()
    const preRestore = kind === "pre-restore"
    // Two backups in the same second would make VACUUM INTO fail on the existing file: add a numeric suffix
    let name = backupFileName(date, preRestore)
    let path = await join(folder, name)
    for (let sequence = 2; await exists(path); sequence++) {
        name = backupFileName(date, preRestore, sequence)
        path = await join(folder, name)
    }

    const db = database ?? await getDB()
    await vacuumInto(db, path)

    if (preRestore) {
        const previous = (await listBackups()).filter(backup => backup.preRestore && backup.name !== name)
        for (const backup of previous) await remove(backup.path)
    } else {
        // The backup is already written: a failure while deleting the old ones must not make it fail
        try {
            await rotateBackups(await getBackupKeep())
        } catch (error) {
            reportError(error)
        }
    }
    const size = await stat(path).then(info => info.size, () => 0)
    return { name, path, size, date, preRestore }
}

export type PreMigrationBackupInfo = {
    name: string
    path: string
    size: number
    /** Modification time of the file (when the copy was taken); null if unknown. */
    date: Date | null
}

/** "easytask-pre-migration-v6-to-v7.db" */
function preMigrationFileName(from: number, to: number): string {
    return `easytask-pre-migration-v${from}-to-v${to}.db`
}

async function preMigrationFolderPath(): Promise<string> {
    const folder = await join(await defaultBackupFolderPath(), PRE_MIGRATION_FOLDER)
    await ensureDir(folder)
    return folder
}

/**
 * Copies the database before a schema migration into backups/pre-migration, named after the two versions.
 * These copies are not rotated by the "backups to keep" preference: they have their own cap
 * ({@link MAX_PRE_MIGRATION_BACKUPS}, the copies of the oldest migrations go first, never the one just taken),
 * and an existing copy for the same pair of versions is left untouched, so a migration that fails and is retried at every start cannot overwrite the
 * copy taken from the intact database. The copy is written to a temporary name and renamed, so a half-written
 * file is never mistaken for a good one.
 * @param database Connection being opened (the shared one is not available yet).
 * @returns The copy, or null when it already existed.
 * @category Database
 */
export async function createPreMigrationBackup(database: Database, from: number, to: number): Promise<PreMigrationBackupInfo | null> {
    const folder = await preMigrationFolderPath()
    const name = preMigrationFileName(from, to)
    const path = await join(folder, name)
    if (await exists(path)) return null

    const temp = `${path}.tmp`
    if (await exists(temp)) await remove(temp)
    await vacuumInto(database, temp)
    await rename(temp, path)
    await prunePreMigrationBackups(folder, name).catch(reportError)
    const info = await stat(path).catch(() => null)
    return { name, path, size: info?.size ?? 0, date: info?.mtime ?? new Date() }
}

/** Deletes the copies of the oldest migrations (lowest target version) beyond the cap; `keepName` is never deleted. */
async function prunePreMigrationBackups(folder: string, keepName: string): Promise<void> {
    const copies: { name: string, order: number }[] = []
    for (const entry of await readDir(folder)) {
        const match = entry.isFile ? PRE_MIGRATION_PATTERN.exec(entry.name) : null
        if (match) copies.push({ name: entry.name, order: Number(match[2]) * 1000 + Number(match[1]) })
    }
    copies.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    const surplus = copies.length - MAX_PRE_MIGRATION_BACKUPS
    for (const copy of copies.slice(0, Math.max(0, surplus))) {
        if (copy.name !== keepName) await remove(await join(folder, copy.name))
    }
}

/**
 * Lists the pre-migration copies, newest first.
 * @category Database
 */
export async function listPreMigrationBackups(): Promise<PreMigrationBackupInfo[]> {
    const folder = await preMigrationFolderPath()
    const list: PreMigrationBackupInfo[] = []
    for (const entry of await readDir(folder)) {
        if (!entry.isFile || !PRE_MIGRATION_PATTERN.test(entry.name)) continue
        const path = await join(folder, entry.name)
        const info = await stat(path).catch(() => null)
        list.push({ name: entry.name, path, size: info?.size ?? 0, date: info?.mtime ?? null })
    }
    return list.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) || b.name.localeCompare(a.name))
}

/** Minimum distance between two automatic backups that is not "once a day": weekly = 7 days, monthly = 30 days. */
const FREQUENCY_DAYS: Record<Exclude<BackupFrequency, "daily">, number> = { weekly: 7, monthly: 30 }
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * True when no regular backup is recent enough for the frequency: daily = none taken today (calendar day),
 * weekly = none in the last 7 days, monthly = none in the last 30 days. The pre-restore copy does not count.
 */
function isBackupDue(frequency: BackupFrequency, backups: readonly BackupInfo[], now = new Date()): boolean {
    const regular = backups.filter(backup => !backup.preRestore)
    if (frequency === "daily") {
        const today = formatTimestamp(now).slice(0, 8)
        return !regular.some(backup => formatTimestamp(backup.date).startsWith(today))
    }
    const since = now.getTime() - FREQUENCY_DAYS[frequency] * DAY_MS
    return !regular.some(backup => backup.date.getTime() > since)
}

/**
 * Backup at startup: skipped when disabled or when a regular backup is recent enough for the chosen frequency
 * (see {@link isBackupDue}). Best effort: a failure is only logged, never shown or thrown.
 * Never runs two at once: a call made while another one is still checking or writing returns false (the scheduler in
 * src/lib/auto-backup-schedule.ts calls it again later).
 * @returns True when a backup was created.
 * @category Database
 */
export async function runAutoBackup(): Promise<boolean> {
    if (autoBackupRunning) return false
    autoBackupRunning = true
    try {
        if (!(await getAutoBackup())) return false
        if (!isBackupDue(await getBackupFrequency(), await listBackups())) return false
        await createBackup("auto")
        return true
    } catch (error) {
        reportError(error)
        return false
    } finally {
        autoBackupRunning = false
    }
}

let autoBackupRunning = false

function assertBackupName(name: string): void {
    if (!parseBackupName(name)) throw createError("BACKUP_INVALID_NAME", i18n.t("errors.backup.invalidName"))
}

/**
 * Deletes one backup file.
 * @category Database
 */
export async function deleteBackup(name: string): Promise<void> {
    assertBackupName(name)
    await remove(await join(await backupFolderPath(), name))
}

/**
 * Opens a backup read-only and checks that it is an EasyTask database this build can use:
 * application_id, user_version not newer than the known migrations and PRAGMA integrity_check.
 * @throws A "BACKUP_INVALID" error (translated) when the file is not a usable EasyTask database.
 * @category Database
 */
async function validateBackupFile(path: string): Promise<void> {
    const invalid = () => createError("BACKUP_INVALID", i18n.t("errors.backup.invalid"))
    let db: Database
    try {
        db = await Database.load(`sqlite:${path}?mode=ro`)
    } catch {
        throw invalid()
    }
    try {
        const [{ application_id: applicationId = 0 } = {}] = await db.select<{ application_id: number }[]>("PRAGMA application_id")
        const [{ user_version: version = 0 } = {}] = await db.select<{ user_version: number }[]>("PRAGMA user_version")
        if (applicationId !== APPLICATION_ID) throw invalid()
        if (version > LATEST_SCHEMA_VERSION) throw createError("BACKUP_NEWER", i18n.t("errors.backup.newer"))
        const check = await db.select<{ integrity_check: string }[]>("PRAGMA integrity_check")
        if (check.length !== 1 || check[0].integrity_check !== "ok") throw invalid()
    } catch (error) {
        if (isAppError(error)) throw error
        throw invalid()
    } finally {
        await db.close().catch(() => false)
    }
}

/**
 * Replaces the database with a backup and restarts the app. The backup is validated first (see validateBackupFile),
 * then a pre-restore copy of the current database is taken. The database is closed (getDB() rejects meanwhile),
 * its -wal/-shm files removed, and the backup copied to "<db>.restoring" and renamed over the database, so a
 * failure never leaves a half-written database.
 * @category Database
 */
export async function restoreBackup(name: string): Promise<void> {
    assertBackupName(name)
    const folder = await backupFolderPath()
    const source = await join(folder, name)
    if (!(await exists(source))) throw createError("BACKUP_NOT_FOUND", i18n.t("errors.backup.notFound"))

    await validateBackupFile(source)
    await createBackup("pre-restore")

    const target = await join(await ensureAppFolder(), DB_FILE)
    const temp = `${target}.restoring`
    let relaunching = false
    setRestoring(true)
    try {
        await closeDB()
        for (const suffix of ["-wal", "-shm"]) {
            const sidecar = `${target}${suffix}`
            if (await exists(sidecar)) await remove(sidecar)
        }
        try {
            await copyFile(source, temp)
            await rename(temp, target)
        } catch (error) {
            await remove(temp).catch(() => undefined)
            throw error
        }
        relaunching = true
        await relaunch()
    } finally {
        // On success the app is restarting: keep refusing the database until the process exits
        if (!relaunching) setRestoring(false)
    }
}
