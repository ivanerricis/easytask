import { join } from "@tauri-apps/api/path";
import { ask } from "@tauri-apps/plugin-dialog";
import { exit } from "@tauri-apps/plugin-process";
import Database from "@tauri-apps/plugin-sql";
import i18n from "@/i18n";
import { createError } from "@/types/error";
import { ensureAppFolder } from "./appPaths";
import { reportError } from "@/lib/report-error";
import { initDB } from "./initDb";

export const DB_FILE = "easytask.db";

let dbPromise: Promise<Database> | null = null;
let restoring = false;

/**
 * Marks a backup restore as in progress: while set, getDB() rejects so that nothing (e.g. a debounced write)
 * reopens the database file while it is being replaced.
 * @category Database
 */
export function setRestoring(value: boolean): void {
    restoring = value;
}

/**
 * The safety copy before a migration failed. This runs before React is mounted, so the question is a blocking native
 * dialog: "Continue anyway" returns and the migration goes on, "Exit" closes the app and rejects, so the database is
 * never touched (the next start asks again). If the dialog itself cannot be shown the migration is NOT run.
 */
async function confirmMigrationWithoutBackup(cause: unknown): Promise<void> {
    const reason = cause instanceof Error ? cause.message : String((cause as { message?: unknown })?.message ?? cause);
    let proceed = false;
    try {
        proceed = await ask(i18n.t("errors.db.backupFailed.description", { message: reason, interpolation: { escapeValue: false } }), {
            title: i18n.t("errors.db.backupFailed.title"),
            kind: "warning",
            okLabel: i18n.t("errors.db.backupFailed.continue"),
            cancelLabel: i18n.t("errors.db.backupFailed.exit"),
        });
    } catch (error) {
        reportError(error);
    }
    if (proceed) return;
    await exit(0).catch(reportError);
    throw createError("DB_MIGRATION_CANCELLED", i18n.t("errors.db.migrationCancelled"));
}

/**
 * Creates the database if it doesn't exist and migrates it to the latest schema.
 * @returns Promise resolving to the Database instance.
 * @category Database
 */
async function createDB(): Promise<Database> {
    const folderPath = await ensureAppFolder();
    const filePath = await join(folderPath, DB_FILE);

    const db = await Database.load(`sqlite:${filePath}`);

    try {
        await initDB(db, {
            // An existing database about to change its schema is copied first. If the copy cannot be made the user decides
            // (see confirmMigrationWithoutBackup); an already existing copy of the same migration is not a failure.
            // Imported lazily because the backup module depends on this one.
            beforeMigrate: async (opened, from, to) => {
                try {
                    const { createPreMigrationBackup } = await import("./backup");
                    await createPreMigrationBackup(opened, from, to);
                } catch (error) {
                    reportError(error);
                    await confirmMigrationWithoutBackup(error);
                }
            },
        });
    } catch (err: unknown) {
        await db.close().catch(() => false);
        throw err;
    }

    return db;
}

/**
 * Gets the database instance, creating it if it doesn't exist.
 * The creation is shared between concurrent callers and retried after a failure.
 * @returns Promise resolving to the Database instance; rejects with "DB_RESTORING" while a backup is being restored.
 * @category Database
 */
export function getDB(): Promise<Database> {
    if (restoring)
        return Promise.reject(createError("DB_RESTORING", i18n.t("errors.backup.restoring")));
    if (!dbPromise) {
        dbPromise = createDB().catch((err: unknown) => {
            dbPromise = null;
            throw err;
        });
    }
    return dbPromise;
}

/**
 * Closes the database and forgets the instance, so the next getDB() reopens the file
 * (used before replacing the file when restoring a backup). Does nothing if it was never opened.
 * @category Database
 */
export async function closeDB(): Promise<void> {
    const pending = dbPromise;
    dbPromise = null;
    if (!pending) return;
    const db = await pending.catch(() => null);
    if (db) await db.close();
}
