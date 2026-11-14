import type Database from "@tauri-apps/plugin-sql";
import i18n from "@/i18n";
import { APPLICATION_ID, archiveSchema, collapsedSchema, customThemeSchema, groupStructureSchema, initialSchema, noteBackgroundSchema, sectionOrderSchema, sectionTitleSchema, taskArchiveSchema, templateDraftSchema, trashIndexesSchema } from "./schema/initial";
import { addGroupColorColumn } from "./schema/section_group";
import { createWorkspaceEditTriggers } from "./schema/workspace_edit";
import { mediaFileSchema } from "./schema/media_file";
import { automationSchema } from "./schema/automation";

/**
 * Ordered list of migrations, applied once each and tracked with PRAGMA user_version.
 * The first one creates the whole initial schema (the previous v1-v8 migrations were squashed into it).
 * Every migration must be idempotent and additive: never edit an applied one, append a new one.
 * @category Database
 */
const migrations: string[][] = [
    // v1: initial schema
    initialSchema,
    // v2: color of the groups
    [addGroupColorColumn],
    // v3: any change inside a workspace refreshes its edit date/time
    createWorkspaceEditTriggers,
    // v4: archive date on folders/notes/groups/sections, removal of the unused `archived` flags
    archiveSchema,
    // v5: automations of the notes
    automationSchema,
    // v6: archive date on the tasks
    taskArchiveSchema,
    // v7: optional title of the sections
    sectionTitleSchema,
    // v8: hidden default section per group (tasks directly in the group), width of the groups
    groupStructureSchema,
    // v9: the default section (direct tasks) shares the order of the sections of its group
    sectionOrderSchema,
    // v10: saved open/closed state of groups, sections and tasks (the workspace triggers ignore it)
    collapsedSchema,
    // v11: working copy (draft) of a template while it is edited: a note with no workspace and a templateID
    templateDraftSchema,
    // v12: partial indexes on the trashed/archived rows
    trashIndexesSchema,
    // v13: background color of the notes and of the templates
    noteBackgroundSchema,
    // v14: custom themes of the user (global, not per workspace)
    customThemeSchema,
    // v15: images and videos linked to the groups
    mediaFileSchema,
];

/**
 * Highest schema version this build knows (the number of migrations); a database with a greater user_version is newer.
 * @category Database
 */
export const LATEST_SCHEMA_VERSION = migrations.length;

export { APPLICATION_ID };

/**
 * Error thrown when the database file was created by an older, incompatible version of the app.
 * @category Database
 */
export const legacyDbMessage = () => i18n.t("errors.db.legacy");

/**
 * Error thrown when the database file was created by a newer version of the app.
 * @category Database
 */
export const newerDbMessage = () => i18n.t("errors.db.newer");

type InitDbOptions = {
    /**
     * Called once, before the first migration is applied, only when an existing database (user_version > 0) has
     * migrations to run: the place to take a safety copy. A rejection aborts the migration.
     */
    beforeMigrate?: (db: Database, fromVersion: number, toVersion: number) => Promise<void>
}

/**
 * Applies the pending migrations to the database.
 * Databases created before the migrations were squashed (user_version > 0 without the EasyTask
 * application_id) are rejected with a clear error instead of being touched.
 * Errors are rethrown, so a half-initialized database is retried on the next start.
 * @param db Database instance to migrate.
 * @param options See {@link InitDbOptions}.
 * @category Database
 */
export async function initDB(db: Database, options: InitDbOptions = {}) {
    const versionRows = await db.select<{ user_version: number }[]>("PRAGMA user_version");
    const current = versionRows[0]?.user_version ?? 0;

    if (current > 0) {
        const idRows = await db.select<{ application_id: number }[]>("PRAGMA application_id");
        if ((idRows[0]?.application_id ?? 0) !== APPLICATION_ID)
            throw new Error(legacyDbMessage());
    }
    if (current > migrations.length)
        throw new Error(newerDbMessage());

    if (current > 0 && current < migrations.length)
        await options.beforeMigrate?.(db, current, migrations.length);

    for (let version = current; version < migrations.length; version++) {
        for (const query of migrations[version]) {
            try {
                await db.execute(query);
            } catch (err: unknown) {
                // ALTER TABLE ADD/DROP COLUMN have no IF [NOT] EXISTS: a run interrupted before the version bump is retried safely
                if (/^\s*ALTER TABLE/i.test(query) && /duplicate column name|no such column/i.test(String((err as { message?: unknown })?.message ?? err)))
                    continue
                console.error(`Migration v${version + 1} failed on query: ${query}`, err);
                // A migration that is a script with its own transaction (see makeSectionTitleOptional) leaves it open when it fails
                await db.execute("ROLLBACK").catch(() => undefined);
                await db.execute("PRAGMA foreign_keys = ON").catch(() => undefined);
                throw err;
            }
        }
        await db.execute(`PRAGMA user_version = ${version + 1}`);
    }
}
