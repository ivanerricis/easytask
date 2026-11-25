import { updateTriggerOf } from "./workspace_edit"

/**
 * The columns whose update refreshes the edit date of the workspace (every column but the view state ones), per table, as they
 * were at migration v10. A column added to one of these tables later is added in WORKSPACE_EDIT_COLUMNS below (a test compares
 * it with the real columns).
 * @category Database Schema
 */
const COLUMNS_AT_V10 = {
    section_group: ["id", "noteID", "position", "deleted_at", "name", "color", "archived_at"],
    section: ["id", "groupID", "title", "color", "creation_date", "creation_time", "edit_date", "edit_time", "deleted_at", "position", "archived_at", "is_default"],
    task: ["id", "sectionID", "taskID", "text", "description", "completed", "priority", "color", "creation_date", "creation_time", "edit_date", "edit_time", "deleted_at", "position", "archived_at"],
} as const

/** The columns of the tables when migration v10 ran: that migration keeps using this list (an applied migration never changes). */
const tables = Object.keys(COLUMNS_AT_V10) as (keyof typeof COLUMNS_AT_V10)[]

/** The task columns that refresh the edit date of the workspace at the latest version (v21 added the due date and time). */
export const TASK_EDIT_COLUMNS: readonly string[] = [...COLUMNS_AT_V10.task, "due_date", "due_time"]

/** Like COLUMNS_AT_V10 with the columns added later: what the tests compare with the real columns. */
export const WORKSPACE_EDIT_COLUMNS: Record<keyof typeof COLUMNS_AT_V10, readonly string[]> = { ...COLUMNS_AT_V10, task: TASK_EDIT_COLUMNS }

/**
 * Migration v10: the open/closed state of groups, sections and tasks is saved (`collapsed`, false = open, so everything
 * stays open after the migration). It is a state of the view: the workspace update triggers of the three tables are
 * recreated to fire only when another column changes (`AFTER UPDATE OF` the columns that are not `collapsed` or the width),
 * so opening or closing an element, like resizing a group, does not change the edit date of the workspace. The
 * `update_*_edit_timestamp` triggers of sections and tasks already list their content columns only; groups have none.
 * The ADD COLUMN steps are retried safely by initDb; the triggers are ONE transactional script (a failure rolls back and
 * the migration is simply run again).
 * @category Database Schema
 */
export const addCollapsedColumns: string[] = [
    ...tables.map(table => `ALTER TABLE ${table} ADD COLUMN collapsed BOOLEAN NOT NULL DEFAULT FALSE;`),
    `
    BEGIN IMMEDIATE;
    ${tables.map(table => `DROP TRIGGER IF EXISTS workspace_edit_on_${table}_update;`).join(" ")}
    ${tables.map(table => updateTriggerOf(table, COLUMNS_AT_V10[table])).join(" ")}
    COMMIT;
`,
]
