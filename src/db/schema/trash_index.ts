/**
 * Tables with a trash (soft delete through `deleted_at`), the ones scanned by the trash views and the auto-empty at startup.
 * @category Database Schema
 */
export const TRASHABLE_TABLES = ["audio_file", "media_file", "task", "section", "section_group", "note", "folder", "note_template", "workspace"] as const

/**
 * Tables with an archive (`archived_at`).
 * @category Database Schema
 */
export const ARCHIVABLE_TABLES = ["task", "section", "section_group", "note", "folder"] as const

/**
 * Migration v12: partial indexes on the (few) trashed and archived rows, so the trash/archive views and the purge of
 * the old trash at startup do not scan whole tables. Purely additive and idempotent (IF NOT EXISTS).
 * @category Database Schema
 */
export const trashIndexSchema: string[] = [
    // media_file (migration v15) creates its own index
    ...TRASHABLE_TABLES.filter(table => table !== "media_file").map(table => `CREATE INDEX IF NOT EXISTS idx_${table}_deleted_at ON ${table}(deleted_at) WHERE deleted_at IS NOT NULL;`),
    ...ARCHIVABLE_TABLES.map(table => `CREATE INDEX IF NOT EXISTS idx_${table}_archived_at ON ${table}(archived_at) WHERE archived_at IS NOT NULL;`),
]
