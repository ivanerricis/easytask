/**
 * Creates the note table in the database (soft delete through deleted_at, manual order through position).
 * @category Database Schema
 */
export const createNoteTable = `
    CREATE TABLE IF NOT EXISTS note (
        id INTEGER PRIMARY KEY,
        workspaceID INTEGER,
        folderID INTEGER,
        name TEXT NOT NULL CHECK (LENGTH(name) > 0),
        color TEXT CHECK (LENGTH(color) > 0) DEFAULT NULL,
        creation_date TEXT NOT NULL DEFAULT (DATE('now', 'localtime')),
        creation_time TEXT NOT NULL DEFAULT (strftime('%H:%M', 'now', 'localtime')),
        edit_date TEXT NOT NULL DEFAULT (DATE('now', 'localtime')),
        edit_time TEXT NOT NULL DEFAULT (strftime('%H:%M', 'now', 'localtime')),
        position INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY(workspaceID) REFERENCES workspace(id) ON DELETE CASCADE,
        FOREIGN KEY(folderID) REFERENCES folder(id) ON DELETE CASCADE
    );
`

/**
 * Indexes of the note table: the name is unique among the non deleted siblings
 * (a note in the trash does not block its name), the others serve the hierarchy lookups.
 * @category Database Schema
 */
export const createNoteIndexes = `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_note_name ON note(workspaceID, IFNULL(folderID, 0), name) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_note_parent ON note(folderID);
    CREATE INDEX IF NOT EXISTS idx_note_workspace_parent ON note(workspaceID, folderID, position);
`

/**
 * Creates the trigger that updates the edit timestamp of the note table.
 * It fires only when content columns change, so it never re-triggers itself.
 * @category Database Schema
 */
export const createNoteTrigger = `
    DROP TRIGGER IF EXISTS update_note_edit_timestamp;

    CREATE TRIGGER update_note_edit_timestamp
    AFTER UPDATE OF workspaceID, folderID, name, color ON note
    FOR EACH ROW
    BEGIN
        UPDATE note
        SET
            edit_date = DATE('now', 'localtime'),
            edit_time = strftime('%H:%M', 'now', 'localtime')
        WHERE id = OLD.id;
    END;
`

/**
 * Migration v4: adds the archive date of a note (NULL = not archived) and makes the name unique only among the
 * siblings that are neither in the trash nor archived (an archived note does not block its name).
 * @category Database Schema
 */
export const addNoteArchivedAt: string[] = [
    `ALTER TABLE note ADD COLUMN archived_at TEXT DEFAULT NULL;`,
    `DROP INDEX IF EXISTS idx_note_name;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_note_name ON note(workspaceID, IFNULL(folderID, 0), name) WHERE deleted_at IS NULL AND archived_at IS NULL;`,
]

/**
 * Migration for the template editor: a draft note is the working copy of a template while it is edited
 * (`workspaceID` NULL, so no list of the workspace shows it; `templateID` is the template it belongs to).
 * One draft per template; purging the template removes the draft with all its content.
 * @category Database Schema
 */
export const addNoteTemplateDraft: string[] = [
    `ALTER TABLE note ADD COLUMN templateID INTEGER DEFAULT NULL REFERENCES note_template(id) ON DELETE CASCADE;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_note_template_draft ON note(templateID) WHERE templateID IS NOT NULL;`,
]

/**
 * Migration v13: adds the optional background color of a note (hex; NULL = default background). The edit trigger
 * ignores it: the background is not an edit of the content.
 * @category Database Schema
 */
export const addNoteBackground: string[] = [
    `ALTER TABLE note ADD COLUMN bg_color TEXT CHECK (LENGTH(bg_color) > 0) DEFAULT NULL;`,
    `ALTER TABLE note_template ADD COLUMN bg_color TEXT CHECK (LENGTH(bg_color) > 0) DEFAULT NULL;`,
]
