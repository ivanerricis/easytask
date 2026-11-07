import i18n from "@/i18n"
import { createError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { getDB } from "../dbManager"
import { Transaction, TransactionError } from "../transaction"
import { addNoteContent, buildContentWithSectionIds, getDBTemplate } from "./template"

/**
 * The working copy of a template while it is edited: a note with no workspace (so no list of a workspace shows it)
 * whose `templateID` is the template. There is at most one per template.
 */
export type TemplateDraft = {
    /** The draft note. */
    noteId: number
    templateId: number
    templateName: string
    color: string | null
    /** The template is in the trash. */
    trashed: boolean
}

/** What `saveDBTemplateDraft` did: wrote the template, found it already equal, or found it purged. */
type TemplateDraftSave = "written" | "unchanged" | "missing"

const updateFailed = (error: unknown) =>
    createError("TEMPLATE_UPDATE_FAILED", i18n.t("errors.template.update", { message: getErrorMessage(error) }))

async function findDraftNote(templateId: number): Promise<number | null> {
    const db = await getDB()
    const rows = await db.select<{ id: number }[]>('SELECT id FROM note WHERE templateID = ?', [templateId])
    return rows.length > 0 ? rows[0].id : null
}

/**
 * Opens the draft of a template: returns the one that already exists (for example after a crash) or creates it, as an
 * exact copy of the content of the template, in ONE database transaction.
 * @param templateId The ID of the template (it must not be deleted).
 * @returns The ID of the draft note.
 * @throws A "TEMPLATE_NOT_FOUND" error when the template does not exist, "TEMPLATE_UPDATE_FAILED" otherwise.
 * @category Database Queries
 */
export async function createDBTemplateDraft(templateId: number): Promise<number> {
    try {
        const existing = await findDraftNote(templateId)
        if (existing !== null) return existing

        const template = await getDBTemplate(templateId)
        if (!template)
            throw createError("TEMPLATE_NOT_FOUND", i18n.t("errors.template.notFound"))

        const tx = new Transaction()
        const note = tx.add(
            'INSERT INTO note (workspaceID, folderID, templateID, name, color, bg_color, position) VALUES (NULL, NULL, ?, ?, ?, ?, 0)',
            [templateId, template.name, template.color, template.bg_color ?? null])
        addNoteContent(tx, tx.idOf(note), template.content)
        try {
            const results = await tx.run()
            return results[note].lastInsertId
        } catch (error: unknown) {
            // Another call created the draft first (the index allows one per template)
            if (error instanceof TransactionError && error.statementIndex === note) {
                const raced = await findDraftNote(templateId)
                if (raced !== null) return raced
            }
            throw error
        }
    } catch (error: unknown) {
        throw toAppError(error, updateFailed)
    }
}

/**
 * Writes the current content (and color) of a draft into its template, even when the template is in the trash. Nothing
 * is written when the template already has that content, so reopening a draft does not change the edit date.
 * @param noteId The ID of the draft note.
 * @returns "missing" when the draft or its template no longer exist (the template was purged).
 * @throws A "TEMPLATE_UPDATE_FAILED" error when the content cannot be read or written.
 * @category Database Queries
 */
export async function saveDBTemplateDraft(noteId: number): Promise<TemplateDraftSave> {
    try {
        const db = await getDB()
        const rows = await db.select<{ templateID: number, color: string | null, bg_color: string | null, content: string, templateColor: string | null, templateBg: string | null }[]>(
            `SELECT n.templateID, n.color, n.bg_color, t.content, t.color AS templateColor, t.bg_color AS templateBg FROM note n
             INNER JOIN note_template t ON t.id = n.templateID
             WHERE n.id = ? AND n.templateID IS NOT NULL`, [noteId])
        if (rows.length === 0) return "missing"

        const { content } = await buildContentWithSectionIds(noteId)
        const json = JSON.stringify(content)
        const color = rows[0].color ?? null
        const bg = rows[0].bg_color ?? null
        if (json === rows[0].content && color === (rows[0].templateColor ?? null) && bg === (rows[0].templateBg ?? null)) return "unchanged"

        await db.execute('UPDATE note_template SET color = ?, bg_color = ?, content = ? WHERE id = ?', [color, bg, json, rows[0].templateID])
        return "written"
    } catch (error: unknown) {
        throw toAppError(error, updateFailed)
    }
}

/**
 * Deletes a draft with all its groups, sections and tasks (for good, not to the trash). Only a note that is a draft is
 * deleted: any other id is left alone. Save the draft first to keep its changes.
 * @param noteId The ID of the draft note.
 * @category Database Queries
 */
export async function deleteDBTemplateDraft(noteId: number) {
    try {
        const db = await getDB()
        await db.execute('DELETE FROM note WHERE id = ? AND templateID IS NOT NULL', [noteId])
    } catch (error: unknown) {
        throw toAppError(error, updateFailed)
    }
}

/**
 * Sets the color of a draft and of its template together.
 * @param noteId The ID of the draft note.
 * @param color The new color, null for none.
 * @category Database Queries
 */
export async function setDBTemplateDraftColor(noteId: number, color: string | null) {
    try {
        const tx = new Transaction()
        tx.add('UPDATE note_template SET color = ? WHERE id = (SELECT templateID FROM note WHERE id = ?)', [color, noteId])
        tx.add('UPDATE note SET color = ? WHERE id = ? AND templateID IS NOT NULL', [color, noteId])
        await tx.run()
    } catch (error: unknown) {
        throw toAppError(error, updateFailed)
    }
}

/**
 * The drafts of the templates of a workspace.
 * @param workspaceId The ID of the workspace.
 * @param includeTrashed Also the drafts whose template is in the trash (used to recover them at startup; default false).
 * @category Database Queries
 */
export async function getDBTemplateDrafts(workspaceId: number, includeTrashed = false): Promise<TemplateDraft[]> {
    try {
        const db = await getDB()
        const rows = await db.select<(Omit<TemplateDraft, "trashed"> & { trashed: number })[]>(
            `SELECT n.id AS noteId, t.id AS templateId, t.name AS templateName, n.color,
                    t.deleted_at IS NOT NULL AS trashed
             FROM note n INNER JOIN note_template t ON t.id = n.templateID
             WHERE t.workspaceID = ?${includeTrashed ? '' : ' AND t.deleted_at IS NULL'}
             ORDER BY n.id`, [workspaceId])
        return rows.map(row => ({ ...row, color: row.color ?? null, trashed: !!row.trashed }))
    } catch (error: unknown) {
        throw createError("TEMPLATE_LOAD_FAILED", i18n.t("errors.template.loadAll", { message: getErrorMessage(error) }))
    }
}

/**
 * A single draft by the ID of its note (null when the note is no draft of a template).
 * @param noteId The ID of the draft note.
 * @category Database Queries
 */
export async function getDBTemplateDraft(noteId: number): Promise<TemplateDraft | null> {
    try {
        const db = await getDB()
        const rows = await db.select<(Omit<TemplateDraft, "trashed"> & { trashed: number })[]>(
            `SELECT n.id AS noteId, t.id AS templateId, t.name AS templateName, n.color,
                    t.deleted_at IS NOT NULL AS trashed
             FROM note n INNER JOIN note_template t ON t.id = n.templateID
             WHERE n.id = ?`, [noteId])
        const row = rows[0]
        return row ? { ...row, color: row.color ?? null, trashed: !!row.trashed } : null
    } catch (error: unknown) {
        throw createError("TEMPLATE_LOAD_FAILED", i18n.t("errors.template.loadAll", { message: getErrorMessage(error) }))
    }
}
