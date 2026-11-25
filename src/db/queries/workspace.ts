import i18n from "@/i18n"
import type { Folder, Note, Workspace } from "@/types/types";
import { getDB } from "../dbManager"
import { createError } from "@/types/error";
import { withDBErrors, WORKSPACE_MESSAGES } from "./errors";
import { getErrorMessage } from "@/lib/utils";

/** The columns of a note the sidebar tree needs: everything but the text of a page, which is read when the page is opened. */
const NOTE_TREE_COLUMNS = "id, workspaceID, folderID, name, color, creation_date, creation_time, edit_date, edit_time, position, deleted_at, archived_at, templateID, bg_color, bg_image, kind"

/**
 * Retrieves the workspace data for a given workspace ID.
 * @param workspaceID The ID of the workspace to retrieve data for.
 * Folders and notes are ordered by position; soft deleted and archived items are excluded (an archived folder hides its
 * content: the tree builders drop the orphans).
 * @returns The workspace data, including folders and notes.
 * @throws A createError('WORKSPACE_DATA_LOAD_FAILED') error when the query fails.
 * @category Database Queries
 */
export async function getDBWorkspaceData(workspaceID: number) {
    try {
        const db = await getDB()
        // Two independent selects (no transaction): the pooled connection can serve them in parallel
        const [folders, notes] = await Promise.all([
            db.select<Folder[]>(
                'SELECT * FROM folder WHERE workspaceID=? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY position, name COLLATE NOCASE ASC',
                [workspaceID]),
            db.select<Note[]>(
                `SELECT ${NOTE_TREE_COLUMNS} FROM note WHERE workspaceID=? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY position, name COLLATE NOCASE ASC`,
                [workspaceID]),
        ])

        return { folders, notes }
    } catch (error: unknown) {
        throw createError('WORKSPACE_DATA_LOAD_FAILED', i18n.t("errors.workspace.load", { message: getErrorMessage(error) }))
    }
}

/**
 * Retrieves all workspaces from the database.
 * @returns A list of all workspaces ordered by edit date and time.
 * @throws A createError('WORKSPACE_DATA_LOAD_FAILED') error when the query fails.
 * @category Database Queries
 */
export async function getDBWorkspaces() {
    try {
        const db = await getDB()
        return await db.select<Workspace[]>('SELECT * FROM workspace WHERE deleted_at IS NULL ORDER BY edit_date DESC, edit_time DESC')
    } catch (error: unknown) {
        throw createError('WORKSPACE_DATA_LOAD_FAILED', i18n.t("errors.workspace.load", { message: getErrorMessage(error) }))
    }
}

/**
 * Creates a new workspace in the database.
 * @param name The name of the workspace.
 * @param color The color of the workspace (optional).
 * @category Database Queries
 */
export async function createDBWorkspace(name: string, color?: string | null) {
    return withDBErrors("WORKSPACE", WORKSPACE_MESSAGES, async () => {
        const db = await getDB();
        await db.execute('INSERT INTO workspace (name, color) VALUES (?, ?)', [name, color ?? null])
    })
}