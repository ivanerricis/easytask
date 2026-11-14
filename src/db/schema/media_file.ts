import { triggersFor } from "./workspace_edit";

/**
 * Creates the media_file table (images and videos linked to a group; same shape as audio_file: only the path is stored,
 * soft delete through deleted_at, manual order through position). UNIQUE(name, section_groupID) also covers the trashed
 * rows, so a file can always be restored without name conflicts.
 * @category Database Schema
 */
export const createTableMediaFile = `
    CREATE TABLE IF NOT EXISTS media_file (
        id INTEGER PRIMARY KEY,
        section_groupID INTEGER NOT NULL,
        name TEXT NOT NULL CHECK (LENGTH(name) > 0),
        path TEXT NOT NULL CHECK (LENGTH(path) > 0),
        creation_date TEXT NOT NULL DEFAULT (DATE('now', 'localtime')),
        creation_time TEXT NOT NULL DEFAULT (strftime('%H:%M', 'now', 'localtime')),
        deleted_at TEXT DEFAULT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(section_groupID) REFERENCES section_group(id) ON DELETE CASCADE,
        UNIQUE(name, section_groupID)
    );
`

/**
 * Indexes of the media_file table (the partial one on the trashed rows is the same as the other tables with a trash).
 * @category Database Schema
 */
export const createMediaFileIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_media_file_group ON media_file(section_groupID);`,
    `CREATE INDEX IF NOT EXISTS idx_media_file_deleted_at ON media_file(deleted_at) WHERE deleted_at IS NOT NULL;`,
]

/**
 * Migration v15: images and videos of the groups, with the edit-date triggers of the workspace.
 * @category Database Schema
 */
export const mediaFileSchema: string[] = [createTableMediaFile, ...createMediaFileIndexes, ...triggersFor("media_file")]
