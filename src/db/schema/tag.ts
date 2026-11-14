import { triggersFor } from "./workspace_edit";

/**
 * Creates the tag table: the tags of a workspace (each workspace has its own list). The name is unique in the workspace
 * ignoring the case ("Bug" and "bug" are the same tag); `position` is the order of the list. Tags are deleted for good
 * (no trash): the removal is undone by inserting the row again with the same id.
 * @category Database Schema
 */
export const createTagTable = `
    CREATE TABLE IF NOT EXISTS tag (
        id INTEGER PRIMARY KEY,
        workspaceID INTEGER NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE CHECK (LENGTH(name) > 0),
        color TEXT CHECK (LENGTH(color) > 0) DEFAULT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(workspaceID) REFERENCES workspace(id) ON DELETE CASCADE,
        UNIQUE(workspaceID, name)
    );
`

/**
 * Creates the task_tag table: the tags given to a task. A link goes away with its task (when it is purged, not when it is
 * trashed: the tags of a trashed task come back with it) and with its tag.
 * @category Database Schema
 */
export const createTaskTagTable = `
    CREATE TABLE IF NOT EXISTS task_tag (
        taskID INTEGER NOT NULL,
        tagID INTEGER NOT NULL,
        PRIMARY KEY(taskID, tagID),
        FOREIGN KEY(taskID) REFERENCES task(id) ON DELETE CASCADE,
        FOREIGN KEY(tagID) REFERENCES tag(id) ON DELETE CASCADE
    );
`

/**
 * Indexes of the tag tables: the ON DELETE CASCADE of a tag and the lookup of the tasks that have it
 * (the primary key of task_tag already serves the tags of a task).
 * @category Database Schema
 */
export const createTagIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_tag_workspace ON tag(workspaceID, position);`,
    `CREATE INDEX IF NOT EXISTS idx_task_tag_tag ON task_tag(tagID);`,
]

/**
 * Migration v16: the tags of the tasks, with the edit-date triggers of the workspace.
 * @category Database Schema
 */
export const tagSchema: string[] = [createTagTable, createTaskTagTable, ...createTagIndexes, ...triggersFor("tag"), ...triggersFor("task_tag")]
