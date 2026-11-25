/**
 * Creates the task table in the database (soft delete through deleted_at, manual order through position).
 * @category Database Schema
 */
export const createTaskTable = `
    CREATE TABLE IF NOT EXISTS task (
        id INTEGER PRIMARY KEY,
        sectionID INTEGER,
        taskID INTEGER,
        text TEXT NOT NULL CHECK (LENGTH(text) > 0),
        description TEXT,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        priority BOOLEAN NOT NULL DEFAULT FALSE,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        color TEXT CHECK (LENGTH(color) > 0) DEFAULT NULL,
        creation_date TEXT NOT NULL DEFAULT (DATE('now', 'localtime')),
        creation_time TEXT NOT NULL DEFAULT (strftime('%H:%M', 'now', 'localtime')),
        edit_date TEXT NOT NULL DEFAULT (DATE('now', 'localtime')),
        edit_time TEXT NOT NULL DEFAULT (strftime('%H:%M', 'now', 'localtime')),
        deleted_at TEXT DEFAULT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(sectionID) REFERENCES section(id) ON DELETE CASCADE,
        FOREIGN KEY(taskID) REFERENCES task(id) ON DELETE CASCADE
    );
`

/**
 * Indexes of the task table, serving the task tree lookups and the ON DELETE CASCADE.
 * @category Database Schema
 */
export const createTaskIndexes = `
    CREATE INDEX IF NOT EXISTS idx_task_section ON task(sectionID, taskID, position);
    CREATE INDEX IF NOT EXISTS idx_task_parent ON task(taskID, position);
`

/**
 * Creates the trigger that updates the edit timestamp of the task table.
 * It fires only when content columns change (not position or deleted_at), so it never re-triggers itself.
 * @category Database Schema
 */
export const createTaskTrigger = `
    DROP TRIGGER IF EXISTS update_task_edit_timestamp;

    CREATE TRIGGER update_task_edit_timestamp
    AFTER UPDATE OF sectionID, taskID, text, description, completed, priority, archived, color ON task
    FOR EACH ROW
    BEGIN
        UPDATE task
        SET
            edit_date = DATE('now', 'localtime'),
            edit_time = strftime('%H:%M', 'now', 'localtime')
        WHERE id = OLD.id;
    END;
`

/**
 * Migration v4: drops the old unused `archived` flag of the tasks (tasks became archivable again in v6, with `archived_at`): the trigger that lists
 * it is dropped first and recreated without it. The DROP COLUMN is retried safely by initDb.
 * @category Database Schema
 */
export const dropTaskArchivedColumn: string[] = [
    `DROP TRIGGER IF EXISTS update_task_edit_timestamp;`,
    `ALTER TABLE task DROP COLUMN archived;`,
    `
    CREATE TRIGGER IF NOT EXISTS update_task_edit_timestamp
    AFTER UPDATE OF sectionID, taskID, text, description, completed, priority, color ON task
    FOR EACH ROW
    BEGIN
        UPDATE task
        SET
            edit_date = DATE('now', 'localtime'),
            edit_time = strftime('%H:%M', 'now', 'localtime')
        WHERE id = OLD.id;
    END;
`,
]

/**
 * Migration v6: archive date (`archived_at`) on the tasks: an archived task (with its subtasks) is hidden from the note
 * without going to the trash. The edit-timestamp trigger does not list it, so archiving does not change the edit date.
 * @category Database Schema
 */
export const addTaskArchivedAt: string[] = [
    `ALTER TABLE task ADD COLUMN archived_at TEXT DEFAULT NULL;`,
]

/**
 * Migration v21: due date (`due_date`, YYYY-MM-DD) and optional due time (`due_time`, HH:MM, only with a date) on the tasks.
 * A partial index serves the "due" views across a workspace. Both columns are content, so the edit-timestamp trigger of the task
 * and the workspace edit trigger list them: the two triggers are recreated in ONE transactional script (a failure rolls back and
 * the migration is simply run again); the ADD COLUMN steps are retried safely by initDb.
 * @param workspaceUpdateTrigger The recreated update trigger of the workspace edit date (see updateTriggerOf), listing the new columns.
 * @category Database Schema
 */
export function addTaskDue(workspaceUpdateTrigger: string): string[] {
    return [
        `ALTER TABLE task ADD COLUMN due_date TEXT DEFAULT NULL;`,
        `ALTER TABLE task ADD COLUMN due_time TEXT DEFAULT NULL;`,
        `CREATE INDEX IF NOT EXISTS idx_task_due ON task(due_date) WHERE due_date IS NOT NULL AND deleted_at IS NULL;`,
        `
    BEGIN IMMEDIATE;
    DROP TRIGGER IF EXISTS workspace_edit_on_task_update;
    ${workspaceUpdateTrigger}
    DROP TRIGGER IF EXISTS update_task_edit_timestamp;

    CREATE TRIGGER update_task_edit_timestamp
    AFTER UPDATE OF sectionID, taskID, text, description, completed, priority, color, due_date, due_time ON task
    FOR EACH ROW
    BEGIN
        UPDATE task
        SET
            edit_date = DATE('now', 'localtime'),
            edit_time = strftime('%H:%M', 'now', 'localtime')
        WHERE id = OLD.id;
    END;
    COMMIT;
`,
    ]
}
