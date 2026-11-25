import { triggersFor } from "./workspace_edit";

/**
 * Creates the task_file table: the files attached to a task. Like media_file and audio_file only the path is stored (the
 * file stays where it is); `name` is the label shown (the file name unless it was renamed by a template or an import). The
 * name is not unique: the same file may be attached twice. A row goes away with its task (when it is purged, not when it is
 * trashed or archived: the files of a trashed task come back with it); a single file is removed for good and the removal is
 * undone by writing the list back.
 * @category Database Schema
 */
export const createTableTaskFile = `
    CREATE TABLE IF NOT EXISTS task_file (
        id INTEGER PRIMARY KEY,
        taskID INTEGER NOT NULL,
        name TEXT NOT NULL CHECK (LENGTH(name) > 0),
        path TEXT NOT NULL CHECK (LENGTH(path) > 0),
        position INTEGER NOT NULL DEFAULT 0,
        creation_date TEXT NOT NULL DEFAULT (DATE('now', 'localtime')),
        creation_time TEXT NOT NULL DEFAULT (strftime('%H:%M', 'now', 'localtime')),
        FOREIGN KEY(taskID) REFERENCES task(id) ON DELETE CASCADE
    );
`

/**
 * Index of the task_file table: the files of a task, in order (it also serves the ON DELETE CASCADE of the task).
 * @category Database Schema
 */
export const createTaskFileIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_task_file_task ON task_file(taskID, position);`,
]

/**
 * Migration v23 (v21 until the migrations of the due dates and of the pages are merged): files attached to the tasks, with the
 * edit-date triggers of the workspace.
 * @category Database Schema
 */
export const taskFileSchema: string[] = [createTableTaskFile, ...createTaskFileIndexes, ...triggersFor("task_file")]
