import i18n from "@/i18n"
import type { Task } from "@/types/types"
import type { NoteTemplate } from "@/types/template"
import { createError, handleDBError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { getDB } from "../dbManager"
import { rethrowTxError, Transaction } from "../transaction"
import type { PortableAutomation } from "@/lib/automations/portable"
import { addNoteContent, addSections, buildContentWithSectionIds, createSectionSnapshotter, getDBTemplate } from "./template"
import { uniqueName } from "./names"
import { addNoteAutomations, getDBPortableAutomations } from "./automation"

/**
 * The name of a copy: "<name> (copy)", then "<name> (copy 2)", "<name> (copy 3)"... the first one not in `taken`.
 * The word comes from the current language.
 * @param name The name of the original.
 * @param taken The names already used among the siblings.
 * @category Database Queries
 */
export function uniqueCopyName(name: string, taken: ReadonlySet<string>): string {
    const word = i18n.t("duplicate.suffix")
    return uniqueName(name, taken, (original, attempt) => attempt === 1 ? `${original} (${word})` : `${original} (${word} ${attempt})`, { allowOriginal: false })
}

type NoteRow = { workspaceID: number, folderID: number | null, name: string, color: string | null, bg_color: string | null, position: number }
type SectionRow = { groupID: number, title: string | null, color: string | null, position: number, id: number }

/**
 * Duplicates a note in the same workspace and folder, right after the original (the following siblings shift by one).
 * The copy is named "<name> (copy)" ("(copy 2)"... when taken), has the same color and an exact copy of the non deleted
 * groups, sections, tasks and subtasks, and the automations that only refer to those sections (pointing to the copied
 * sections). Audio files are not copied. Everything is written in ONE database transaction.
 * @param noteId The ID of the note to duplicate (it must not be deleted).
 * @returns The ID of the new note.
 * @throws "DUPLICATE_SOURCE_MISSING" when the note does not exist, "NOTE_EXISTS" on a name clash, "DUPLICATE_FAILED" otherwise.
 * @category Database Queries
 */
export async function duplicateDBNote(noteId: number): Promise<number> {
    let source: NoteRow
    let name: string
    let content: Awaited<ReturnType<typeof buildContentWithSectionIds>>["content"]
    let automations: PortableAutomation[]
    try {
        const db = await getDB()
        const rows = await db.select<NoteRow[]>(
            // A note without workspace is the working copy of a template (see template-draft.ts): it is not duplicated
            'SELECT workspaceID, folderID, name, color, bg_color, position FROM note WHERE id = ? AND workspaceID IS NOT NULL AND deleted_at IS NULL', [noteId])
        if (rows.length === 0)
            throw createError("DUPLICATE_SOURCE_MISSING", i18n.t("errors.duplicate.noteMissing"))
        source = rows[0]
        const siblings = await db.select<{ name: string }[]>(
            'SELECT name FROM note WHERE workspaceID = ? AND IFNULL(folderID, 0) = ? AND deleted_at IS NULL',
            [source.workspaceID, source.folderID ?? 0])
        name = uniqueCopyName(source.name, new Set(siblings.map(row => row.name)))
        const built = await buildContentWithSectionIds(noteId)
        content = built.content
        automations = await getDBPortableAutomations(noteId, content, built.sectionIds, built.groupIds, built.defaultSectionIds)
    } catch (error: unknown) {
        throw toAppError(error, e => createError("DUPLICATE_FAILED", i18n.t("errors.duplicate.load", { message: getErrorMessage(e) })))
    }

    const tx = new Transaction()
    tx.add(
        'UPDATE note SET position = position + 1 WHERE workspaceID = ? AND IFNULL(folderID, 0) = ? AND position > ? AND deleted_at IS NULL',
        [source.workspaceID, source.folderID ?? 0, source.position])
    const note = tx.add(
        'INSERT INTO note (workspaceID, folderID, name, color, bg_color, position) VALUES (?, ?, ?, ?, ?, ?)',
        [source.workspaceID, source.folderID, name, source.color, source.bg_color, source.position + 1])
    const { groups, sections, defaultSections } = addNoteContent(tx, tx.idOf(note), content)
    addNoteAutomations(tx, tx.idOf(note), automations, content, sections, groups, defaultSections)

    try {
        const results = await tx.run()
        return results[note].lastInsertId
    } catch (error: unknown) {
        rethrowTxError(error, note, "NOTE", { UNIQUE: i18n.t("errors.template.noteUnique"), CHECK: i18n.t("errors.note.check") })
        throw createError("DUPLICATE_FAILED", i18n.t("errors.duplicate.apply", { message: getErrorMessage(error) }))
    }
}

/**
 * Duplicates a template in the same workspace: the copy is named "<name> (copy)" ("(copy 2)"... when taken) and has the
 * same color, source note and content. The content is the one saved in the database: the changes of an open template
 * editor must be saved first.
 * @param templateId The ID of the template to duplicate (it must not be deleted).
 * @returns The ID of the new template.
 * @throws "TEMPLATE_NOT_FOUND" when the template does not exist, "TEMPLATE_EXISTS" on a name clash, "DUPLICATE_FAILED" otherwise.
 * @category Database Queries
 */
export async function duplicateDBTemplate(templateId: number): Promise<number> {
    let source: NoteTemplate
    let name: string
    try {
        const found = await getDBTemplate(templateId)
        if (!found)
            throw createError("TEMPLATE_NOT_FOUND", i18n.t("errors.template.notFound"))
        source = found
        const db = await getDB()
        const siblings = await db.select<{ name: string }[]>(
            'SELECT name FROM note_template WHERE workspaceID = ? AND deleted_at IS NULL', [source.workspaceID])
        name = uniqueCopyName(source.name, new Set(siblings.map(row => row.name)))
    } catch (error: unknown) {
        throw toAppError(error, e => createError("DUPLICATE_FAILED", i18n.t("errors.duplicate.load", { message: getErrorMessage(e) })))
    }

    try {
        const db = await getDB()
        const result = await db.execute(
            'INSERT INTO note_template (workspaceID, sourceNoteID, name, color, bg_color, content) VALUES (?, ?, ?, ?, ?, ?)',
            [source.workspaceID, source.sourceNoteID, name, source.color, source.bg_color, JSON.stringify(source.content)])
        return result.lastInsertId as number
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "TEMPLATE", { UNIQUE: i18n.t("errors.template.unique"), CHECK: i18n.t("errors.template.check") }))
    }
}

/**
 * Duplicates a section in the same group, right after the original (the following sections shift by one).
 * The copy is titled "<title> (copy)" ("(copy 2)"... when taken) and has the same color and an exact
 * copy of the non deleted tasks and subtasks. Everything is written in ONE database transaction.
 * @param sectionId The ID of the section to duplicate (it must not be deleted).
 * @returns The ID of the new section.
 * @throws "DUPLICATE_SOURCE_MISSING" when the section does not exist, "SECTION_EXISTS" on a title clash, "DUPLICATE_FAILED" otherwise.
 * @category Database Queries
 */
export async function duplicateDBSection(sectionId: number): Promise<number> {
    let source: SectionRow
    let title: string
    let snapshot: ReturnType<ReturnType<typeof createSectionSnapshotter>>
    try {
        const db = await getDB()
        const rows = await db.select<SectionRow[]>(
            'SELECT id, groupID, title, color, position FROM section WHERE id = ? AND deleted_at IS NULL AND is_default = 0', [sectionId])
        if (rows.length === 0)
            throw createError("DUPLICATE_SOURCE_MISSING", i18n.t("errors.duplicate.sectionMissing"))
        source = rows[0]
        const siblings = await db.select<{ title: string | null }[]>(
            'SELECT title FROM section WHERE groupID = ? AND deleted_at IS NULL', [source.groupID])
        // A section without a title is copied without one
        title = source.title ? uniqueCopyName(source.title, new Set(siblings.flatMap(row => row.title ? [row.title] : []))) : ""
        const tasks = await db.select<Task[]>(
            'SELECT * FROM task WHERE sectionID = ? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY position, id', [sectionId])
        snapshot = createSectionSnapshotter(tasks)({ ...source, title: source.title ?? "" })
    } catch (error: unknown) {
        throw toAppError(error, e => createError("DUPLICATE_FAILED", i18n.t("errors.duplicate.load", { message: getErrorMessage(e) })))
    }

    const tx = new Transaction()
    tx.add('UPDATE section SET position = position + 1 WHERE groupID = ? AND position > ? AND deleted_at IS NULL',
        [source.groupID, source.position])
    const [sectionRef] = addSections(tx, [{ groupRef: source.groupID, section: { ...snapshot, title, position: source.position + 1 } }])
    const sectionStatement = sectionRef.$ref

    try {
        const results = await tx.run()
        return results[sectionStatement].lastInsertId
    } catch (error: unknown) {
        rethrowTxError(error, sectionStatement, "SECTION", { UNIQUE: i18n.t("errors.section.unique"), CHECK: i18n.t("errors.section.check") })
        throw createError("DUPLICATE_FAILED", i18n.t("errors.duplicate.apply", { message: getErrorMessage(error) }))
    }
}
