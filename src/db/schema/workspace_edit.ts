const NOW_SET = `
            edit_date = DATE('now', 'localtime'),
            edit_time = strftime('%H:%M', 'now', 'localtime')`

/** Table -> SQL expression (using the row alias) resolving the id of the owning workspace. */
const workspaceOf: Record<string, (row: "NEW" | "OLD") => string> = {
    folder: r => `${r}.workspaceID`,
    note: r => `${r}.workspaceID`,
    note_template: r => `${r}.workspaceID`,
    section_group: r => `(SELECT workspaceID FROM note WHERE id = ${r}.noteID)`,
    section: r => `(SELECT n.workspaceID FROM section_group g JOIN note n ON n.id = g.noteID WHERE g.id = ${r}.groupID)`,
    task: r => `(SELECT n.workspaceID FROM section s JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID WHERE s.id = ${r}.sectionID)`,
    audio_file: r => `(SELECT n.workspaceID FROM section_group g JOIN note n ON n.id = g.noteID WHERE g.id = ${r}.section_groupID)`,
    media_file: r => `(SELECT n.workspaceID FROM section_group g JOIN note n ON n.id = g.noteID WHERE g.id = ${r}.section_groupID)`,
}

/** Tables created by a later migration: they get their triggers from it, not from migration v3. */
const CREATED_LATER = ["media_file"]

const bump = (ws: string, extra = "") => `
        UPDATE workspace SET${NOW_SET}
        WHERE id = ${ws}${extra};`

function trigger(table: string, event: "INSERT" | "UPDATE" | "DELETE", body: string, columns?: readonly string[]): string {
    return `
    CREATE TRIGGER IF NOT EXISTS workspace_edit_on_${table}_${event.toLowerCase()}
    AFTER ${event}${columns ? ` OF ${columns.join(", ")}` : ""} ON ${table}
    FOR EACH ROW
    BEGIN${body}
    END;
`
}

/**
 * The update trigger of a table that fires only when one of the given columns is in the SET of the UPDATE (the others,
 * like the open/closed state of the view, leave the edit date of the workspace alone). Used by migration v10.
 */
export function updateTriggerOf(table: string, columns: readonly string[]): string {
    return triggersFor(table, columns)[1]
}

/** The three triggers (insert, update, delete) of a table; used again when a table is rebuilt by a migration. */
export function triggersFor(table: string, updateColumns?: readonly string[]): string[] {
    const of = workspaceOf[table]
    // folder/note can move to another workspace: the old one changed too
    const moved = table === "folder" || table === "note"
        ? bump("OLD.workspaceID", " AND OLD.workspaceID IS NOT NEW.workspaceID")
        : ""
    return [
        trigger(table, "INSERT", bump(of("NEW"))),
        trigger(table, "UPDATE", bump(of("NEW")) + moved, updateColumns),
        trigger(table, "DELETE", bump(of("OLD"))),
    ]
}

/**
 * Migration v3: inserting, updating (soft delete included) or deleting any element of a workspace
 * refreshes the edit date/time of the workspace that owns it.
 * No recursion: the workspace trigger fires only on name/color and recursive_triggers is off.
 * @category Database Schema
 */
export const createWorkspaceEditTriggers: string[] = Object.keys(workspaceOf).filter(table => !CREATED_LATER.includes(table)).flatMap(table => triggersFor(table))
