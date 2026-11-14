import i18n from "@/i18n"
import type { NoteTemplate, NoteTemplateContent, TemplateGroup, TemplateSection, TemplateTag, TemplateTask } from "@/types/template";
import type { Group, Section, Task } from "@/types/types";
import { createError, handleDBError, toAppError } from "@/types/error";
import { getErrorMessage } from "@/lib/utils";
import { getDB } from "../dbManager";
import { rethrowTxError, Transaction, type TxRef } from "../transaction";
import { getDBNoteData, getDBNotesData, type NoteData } from "./note";
import { addEnsureTag, WORKSPACE_OF_SECTION, type UsedTag } from "./tag";
import { isDefaultSection } from "@/lib/group-sections";
import { nextPositionSql } from "./sql";

const TEMPLATE_UNIQUE_MESSAGE = () => i18n.t("errors.template.unique")
const TEMPLATE_CHECK_MESSAGE = () => i18n.t("errors.template.check")
const NOTE_UNIQUE_MESSAGE = () => i18n.t("errors.template.noteUnique")
const NOTE_CHECK_MESSAGE = () => i18n.t("errors.note.check")
const SOURCE_MISSING_MESSAGE = () => i18n.t("errors.template.sourceMissing")

type TemplateRow = Omit<NoteTemplate, "content"> & { content: string }

const EMPTY_CONTENT: NoteTemplateContent = { version: 1, groups: [] }

/**
 * Parses the JSON snapshot stored in a template. A corrupted or malformed snapshot behaves as an empty template
 * instead of breaking the whole list.
 * @param json The content column of a note_template row.
 * @category Database Queries
 */
export function parseTemplateContent(json: string): NoteTemplateContent {
    try {
        const value = JSON.parse(json) as NoteTemplateContent
        if (value && Array.isArray(value.groups)) return value
    } catch {
        // Falls through to the empty template
    }
    return EMPTY_CONTENT
}

const toTemplate = ({ content, ...row }: TemplateRow): NoteTemplate =>
    ({ ...row, sourceNoteName: row.sourceNoteName ?? null, content: parseTemplateContent(content) })

/**
 * Returns a function that snapshots a section (with its tasks and subtasks at any depth) out of a list of tasks.
 * A subtask whose ancestor is not in the list is left out with it.
 * @param tasks The (non deleted) tasks of the sections that will be snapshotted.
 * @param tags The tags their `tagIDs` refer to (a tag that is not here is left out of the snapshot).
 * @category Database Queries
 */
export function createSectionSnapshotter(tasks: Task[], tags: readonly UsedTag[] = []): (section: Pick<Section, "id" | "title" | "color" | "archived_at" | "position">) => TemplateSection {
    const childrenOf = new Map<number, Task[]>()
    const topOf = new Map<number, Task[]>()
    for (const task of tasks) {
        const bucket = task.taskID != null ? childrenOf : topOf
        const key = task.taskID != null ? task.taskID : (task.sectionID as number)
        const list = bucket.get(key)
        if (list) list.push(task)
        else bucket.set(key, [task])
    }

    const tagById = new Map(tags.map(tag => [tag.id, tag]))
    const tagsOf = (task: Task): TemplateTag[] =>
        (task.tagIDs ?? []).flatMap(id => tagById.get(id) ?? []).map(({ name, color }) => ({ name, color: color ?? null }))

    const snapshotTask = (task: Task): TemplateTask => ({
        ...(task.archived_at ? { archived_at: task.archived_at } : {}),
        text: task.text,
        description: task.description ?? null,
        completed: !!task.completed,
        priority: !!task.priority,
        color: task.color ?? null,
        ...(tagsOf(task).length > 0 ? { tags: tagsOf(task) } : {}),
        position: task.position,
        subtasks: (childrenOf.get(task.id) ?? []).map(snapshotTask),
    })

    return section => ({
        title: section.title,
        color: section.color ?? null,
        ...(section.archived_at ? { archived_at: section.archived_at } : {}),
        position: section.position,
        tasks: (topOf.get(section.id) ?? []).map(snapshotTask),
    })
}

/**
 * The template content of a note, the ids of its source sections and groups (see buildContentWithSectionIds).
 * `defaultSectionIds` has the id of the default section of every group (null when it has none), in group order.
 */
export type NoteContent = { content: NoteTemplateContent, sectionIds: number[], groupIds: number[], defaultSectionIds: (number | null)[] }

/**
 * Builds the template content out of rows already loaded (see getDBNoteData): an exact copy of the groups, sections and
 * tasks it is given, in their order. Returns the same as buildContentWithSectionIds.
 * @param data The groups, sections and tasks of a note.
 * @category Database Queries
 */
export function buildContentFromRows({ groups, sections, tasks, tags }: NoteData): NoteContent {
    const snapshotSection = createSectionSnapshotter(tasks, tags)
    const sectionsByGroup = new Map<number, Section[]>()
    for (const section of sections) {
        const list = sectionsByGroup.get(section.groupID)
        if (list) list.push(section)
        else sectionsByGroup.set(section.groupID, [section])
    }
    // The default section of a group holds its direct tasks: they go in `group.tasks`, and it is not one of the sections
    // (its place among them is `directIndex`: the sections that come before it in the shared order)
    const directIndexOf = (group: Group) => {
        const rows = sectionsByGroup.get(group.id) ?? []
        const at = rows.findIndex(isDefaultSection)
        return Math.max(at, 0)
    }
    const sectionsOf = (group: Group) => (sectionsByGroup.get(group.id) ?? []).filter(section => !isDefaultSection(section))
    const defaultOf = (group: Group) => (sectionsByGroup.get(group.id) ?? []).find(isDefaultSection)

    return {
        content: {
            version: 1,
            groups: groups.map((group): TemplateGroup => {
                const direct = defaultOf(group)
                const directTasks = direct ? snapshotSection(direct).tasks : []
                return {
                    name: group.name ?? null,
                    color: group.color ?? null,
                    ...(group.archived_at ? { archived_at: group.archived_at } : {}),
                    ...(group.width ? { width: group.width } : {}),
                    ...(directTasks.length > 0 ? { tasks: directTasks } : {}),
                    ...(directIndexOf(group) > 0 ? { directIndex: directIndexOf(group) } : {}),
                    position: group.position,
                    sections: sectionsOf(group).map(snapshotSection),
                }
            }),
        },
        sectionIds: groups.flatMap(group => sectionsOf(group).map(section => section.id)),
        groupIds: groups.map(group => group.id),
        defaultSectionIds: groups.map(group => defaultOf(group)?.id ?? null),
    }
}

/**
 * Builds the template content of a note: an exact copy of its visible groups, sections and tasks (neither deleted nor
 * archived; subtasks at any depth; a subtask whose ancestor is in the trash is hidden with it). Audio files are not included.
 * It also returns the ids of the source sections in content order (the groups first, then the
 * sections of each group): the position `i` of a section in the content is `sectionIds[i]`. `groupIds` has the ids of
 * the source groups in content order.
 * @param noteId The ID of the note.
 * @param includeArchived Keeps the archived groups and sections, with their `archived_at` (used by the export; default false).
 * @category Database Queries
 */
export async function buildContentWithSectionIds(noteId: number, includeArchived = false): Promise<NoteContent> {
    return buildContentFromRows(await getDBNoteData(noteId, includeArchived))
}

/**
 * Like buildContentWithSectionIds for many notes at once (a few selects for the whole list instead of three per note).
 * @param noteIds The IDs of the notes.
 * @param includeArchived Keeps the archived groups and sections (default false).
 * @returns The content of every note, by note id.
 * @category Database Queries
 */
export async function buildNotesContent(noteIds: readonly number[], includeArchived = false): Promise<Map<number, NoteContent>> {
    const data = await getDBNotesData(noteIds, includeArchived)
    return new Map([...data].map(([noteId, rows]) => [noteId, buildContentFromRows(rows)]))
}

/**
 * Creates a template from an existing note: an independent, exact snapshot of its content at this moment.
 * @param noteId The ID of the source note (it must not be deleted).
 * @param name The name of the template (unique in the workspace).
 * @returns The ID of the new template.
 * @throws A "TEMPLATE_SOURCE_MISSING" error when the note does not exist, "TEMPLATE_EXISTS" on a name clash.
 * @category Database Queries
 */
export async function createDBTemplateFromNote(noteId: number, name: string): Promise<number> {
    try {
        const db = await getDB()
        const notes = await db.select<{ workspaceID: number, color: string | null, bg_color: string | null }[]>(
            'SELECT workspaceID, color, bg_color FROM note WHERE id = ? AND workspaceID IS NOT NULL AND deleted_at IS NULL', [noteId])
        if (notes.length === 0)
            throw createError("TEMPLATE_SOURCE_MISSING", SOURCE_MISSING_MESSAGE())

        const { content } = await buildContentWithSectionIds(noteId)
        const result = await db.execute(
            'INSERT INTO note_template (workspaceID, sourceNoteID, name, color, bg_color, content) VALUES (?, ?, ?, ?, ?, ?)',
            [notes[0].workspaceID, noteId, name.trim(), notes[0].color ?? null, notes[0].bg_color ?? null, JSON.stringify(content)])
        return result.lastInsertId as number
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "TEMPLATE", { UNIQUE: TEMPLATE_UNIQUE_MESSAGE(), CHECK: TEMPLATE_CHECK_MESSAGE() }))
    }
}

const TEMPLATE_SELECT = `SELECT t.*, n.name AS sourceNoteName FROM note_template t
    LEFT JOIN note n ON n.id = t.sourceNoteID AND n.deleted_at IS NULL`

/**
 * Retrieves one template (not deleted).
 * @param templateId The ID of the template.
 * @returns The template, null when it does not exist (or is in the trash).
 * @throws A createError('TEMPLATE_LOAD_FAILED') error when the query fails.
 * @category Database Queries
 */
export async function getDBTemplate(templateId: number): Promise<NoteTemplate | null> {
    try {
        const db = await getDB()
        const rows = await db.select<TemplateRow[]>(`${TEMPLATE_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`, [templateId])
        return rows.length > 0 ? toTemplate(rows[0]) : null
    } catch (error: unknown) {
        throw createError("TEMPLATE_LOAD_FAILED", i18n.t("errors.template.load", { message: getErrorMessage(error) }))
    }
}

/**
 * Retrieves the templates of a workspace (not deleted), ordered by name.
 * `sourceNoteName` is null when the source note no longer exists or is in the trash.
 * @param workspaceId The ID of the workspace.
 * @throws A createError('TEMPLATE_LOAD_FAILED') error when the query fails.
 * @category Database Queries
 */
export async function getDBTemplates(workspaceId: number): Promise<NoteTemplate[]> {
    try {
        const db = await getDB()
        const rows = await db.select<TemplateRow[]>(
            `${TEMPLATE_SELECT} WHERE t.workspaceID = ? AND t.deleted_at IS NULL ORDER BY t.name COLLATE NOCASE, t.id`, [workspaceId])
        return rows.map(toTemplate)
    } catch (error: unknown) {
        throw createError("TEMPLATE_LOAD_FAILED", i18n.t("errors.template.loadAll", { message: getErrorMessage(error) }))
    }
}

/**
 * Counts the templates of a workspace (not deleted).
 * @param workspaceId The ID of the workspace.
 * @throws A createError('TEMPLATE_LOAD_FAILED') error when the query fails.
 * @category Database Queries
 */
export async function countDBTemplates(workspaceId: number): Promise<number> {
    try {
        const db = await getDB()
        const rows = await db.select<{ count: number }[]>(
            'SELECT COUNT(*) AS count FROM note_template WHERE workspaceID = ? AND deleted_at IS NULL', [workspaceId])
        return rows[0]?.count ?? 0
    } catch (error: unknown) {
        throw createError("TEMPLATE_LOAD_FAILED", i18n.t("errors.template.loadAll", { message: getErrorMessage(error) }))
    }
}

/**
 * Renames a template.
 * @param templateId The ID of the template.
 * @param name The new name (unique in the workspace).
 * @category Database Queries
 */
export async function renameDBTemplate(templateId: number, name: string) {
    try {
        const db = await getDB()
        await db.execute('UPDATE note_template SET name = ? WHERE id = ?', [name.trim(), templateId])
    } catch (error: unknown) {
        handleDBError(error, "TEMPLATE", { UNIQUE: TEMPLATE_UNIQUE_MESSAGE(), CHECK: TEMPLATE_CHECK_MESSAGE() })
    }
}

/**
 * Overwrites the snapshot of a template with the current content (and color) of a note: its source note, or another
 * note of the same workspace (which then becomes the source of the template, so a later refresh follows it).
 * @param templateId The ID of the template.
 * @param noteId The note to copy; the source note of the template when omitted.
 * @throws A "TEMPLATE_SOURCE_MISSING" error when the note does not exist, is in the trash or is in another workspace.
 * @category Database Queries
 */
export async function updateDBTemplateFromNote(templateId: number, noteId?: number) {
    try {
        const db = await getDB()
        const rows = await db.select<{ noteID: number, color: string | null, bg_color: string | null }[]>(
            `SELECT n.id AS noteID, n.color, n.bg_color FROM note_template t
             INNER JOIN note n ON n.id = ${noteId === undefined ? 't.sourceNoteID' : '?'} AND n.deleted_at IS NULL
                AND n.workspaceID = t.workspaceID
             WHERE t.id = ? AND t.deleted_at IS NULL`, noteId === undefined ? [templateId] : [noteId, templateId])
        if (rows.length === 0)
            throw createError("TEMPLATE_SOURCE_MISSING", SOURCE_MISSING_MESSAGE())

        const { content } = await buildContentWithSectionIds(rows[0].noteID)
        await db.execute('UPDATE note_template SET sourceNoteID = ?, color = ?, bg_color = ?, content = ? WHERE id = ?',
            [rows[0].noteID, rows[0].color ?? null, rows[0].bg_color ?? null, JSON.stringify(content), templateId])
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TEMPLATE_UPDATE_FAILED", i18n.t("errors.template.update", { message: getErrorMessage(e) })))
    }
}

type PendingTask = { sectionRef: TxRef, parentRef: TxRef | null, task: TemplateTask }

/**
 * Adds to a transaction the statements that insert the groups, sections and tasks of a content snapshot
 * into a note, with one multi-row INSERT per level. Nothing runs until the transaction is run.
 * @param tx The transaction collecting the statements.
 * @param noteRef The note: its id or a reference to the statement that creates it.
 * @param content The content to insert.
 * @returns References to the created groups (in the order of `content.groups`) and sections (in content order: the
 * sections of the first group, then those of the second...).
 * @category Database Queries
 */
export function addNoteContent(tx: Transaction, noteRef: number | TxRef, content: NoteTemplateContent): { groups: TxRef[], sections: TxRef[], defaultSections: TxRef[] } {
    const { groups } = content
    const groupRefs = tx.insertRows("section_group", ["noteID", "position", "name", "color", "archived_at", "width"],
        groups.map(group => [noteRef, group.position, group.name ?? null, group.color || null, group.archived_at || null, group.width || null]))

    // Every group gets its default section (with the direct tasks of the group), the normal sections follow. They all share
    // one order: the list is at `directIndex` (clamped, 0 = on top) and the sections take the other numbers, in their order
    const directAt = (group: TemplateGroup) => Math.max(0, Math.min(Math.trunc(group.directIndex ?? 0) || 0, group.sections.length))
    const defaults = groups.map((group, i) => ({
        groupRef: groupRefs[i], isDefault: true, section: { title: "", color: null, position: directAt(group), tasks: group.tasks ?? [] },
    }))
    const normals = groups.flatMap((group, i) => group.sections.map((section, s) => (
        { groupRef: groupRefs[i], section: { ...section, position: s < directAt(group) ? s : s + 1 } })))
    const refs = addSections(tx, [...defaults, ...normals])
    return { groups: groupRefs, sections: refs.slice(groups.length), defaultSections: refs.slice(0, groups.length) }
}

/**
 * Adds to a transaction the statements that insert sections (with their tasks and subtasks) into existing or
 * to-be-created groups, with one multi-row INSERT per level.
 * @param tx The transaction collecting the statements.
 * @param sources The sections and the group each one goes into (its id or a reference to the statement that creates it);
 * `isDefault` marks the hidden default section of a group (the one with its direct tasks).
 * @returns References to the created sections, in the order of `sources`.
 * @category Database Queries
 */
export function addSections(tx: Transaction, sources: { groupRef: number | TxRef, section: TemplateSection, isDefault?: boolean }[]): TxRef[] {
    const sectionRefs = tx.insertRows("section", ["groupID", "title", "color", "archived_at", "position", "is_default"],
        sources.map(({ groupRef, section, isDefault }) => [groupRef, section.title || null, section.color ?? null, section.archived_at || null, section.position, isDefault ? 1 : 0]))

    // Tasks level by level: the subtasks of a level reference the ids of their parents
    const tagged: { taskRef: TxRef, tags: TemplateTag[] }[] = []
    let level: PendingTask[] = sources.flatMap(({ section }, i) =>
        section.tasks.map(task => ({ sectionRef: sectionRefs[i], parentRef: null, task })))
    while (level.length > 0) {
        const refs = tx.insertRows("task",
            ["sectionID", "taskID", "text", "description", "completed", "priority", "color", "archived_at", "position"],
            level.map(({ sectionRef, parentRef, task }) => [
                sectionRef, parentRef, task.text, task.description ?? null, task.completed ? 1 : 0,
                task.priority ? 1 : 0, task.color ?? null, task.archived_at || null, task.position,
            ]))
        level.forEach(({ task }, i) => { if (task.tags?.length) tagged.push({ taskRef: refs[i], tags: task.tags }) })
        level = level.flatMap(({ sectionRef, task }, i) =>
            task.subtasks.map(subtask => ({ sectionRef, parentRef: refs[i], task: subtask })))
    }
    if (tagged.length > 0) addTaskTags(tx, sectionRefs[0], tagged)
    return sectionRefs
}

/** Rows per statement of the links (two parameters each). */
const TAG_LINK_CHUNK = 200

/**
 * Adds to a transaction the statements that give tags to tasks created in the same transaction: the tags missing in the
 * workspace of the tasks are created first (at the end of its list, in the order they appear; a tag with the same name, ignoring
 * the case, is reused as it is), then the links are written.
 * @param tx The transaction collecting the statements.
 * @param sectionRef A section created in the transaction (or its id): it tells the workspace.
 * @param tasks The tasks (by reference) and their tags.
 * @category Database Queries
 */
export function addTaskTags(tx: Transaction, sectionRef: number | TxRef, tasks: readonly { taskRef: TxRef | number, tags: readonly TemplateTag[] }[]): void {
    const wanted = new Map<string, TemplateTag>()
    for (const { tags } of tasks)
        for (const tag of tags) if (!wanted.has(tag.name.toLowerCase())) wanted.set(tag.name.toLowerCase(), tag)
    for (const tag of wanted.values()) addEnsureTag(tx, WORKSPACE_OF_SECTION, sectionRef, tag)
    const links = tasks.flatMap(({ taskRef, tags }) => [...new Set(tags.map(tag => tag.name.toLowerCase()))].map(name => [taskRef, name] as const))
    for (let start = 0; start < links.length; start += TAG_LINK_CHUNK) {
        const chunk = links.slice(start, start + TAG_LINK_CHUNK)
        tx.add(
            `WITH v(taskID, name) AS (VALUES ${chunk.map(() => "(?, ?)").join(", ")})
             INSERT OR IGNORE INTO task_tag (taskID, tagID)
             SELECT v.taskID, tg.id FROM v INNER JOIN tag tg ON tg.name = v.name AND tg.workspaceID = ${WORKSPACE_OF_SECTION}`,
            [...chunk.flat(), sectionRef])
    }
}

/**
 * Creates a note from a template, appended at the end of the destination (workspace root or folder).
 * The note and all its groups, sections and tasks (one multi-row INSERT per level) are written in ONE database
 * transaction: on any failure nothing is created.
 * @param templateId The ID of the template.
 * @param workspaceId The ID of the workspace of the new note.
 * @param folderId The destination folder, null for the workspace root.
 * @param name The name of the new note.
 * @returns The ID of the new note.
 * @throws "NOTE_EXISTS" on a name clash in the destination, "TEMPLATE_NOT_FOUND" when the template does not exist,
 * "TEMPLATE_APPLY_FAILED" when the content cannot be inserted.
 * @category Database Queries
 */
export async function createDBNoteFromTemplate(templateId: number, workspaceId: number, folderId: number | null, name: string): Promise<number> {
    let template: NoteTemplate
    try {
        const db = await getDB()
        const rows = await db.select<TemplateRow[]>(
            `${TEMPLATE_SELECT} WHERE t.id = ? AND t.workspaceID = ? AND t.deleted_at IS NULL`, [templateId, workspaceId])
        if (rows.length === 0)
            throw createError("TEMPLATE_NOT_FOUND", i18n.t("errors.template.notFound"))
        template = toTemplate(rows[0])
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TEMPLATE_LOAD_FAILED", i18n.t("errors.template.load", { message: getErrorMessage(e) })))
    }

    const tx = new Transaction()
    const note = folderId === null
        ? tx.add(
            `INSERT INTO note (workspaceID, name, color, bg_color, position)
             SELECT ?, ?, ?, ?, ${nextPositionSql("note", "workspaceID = ? AND folderID IS NULL AND deleted_at IS NULL")}`,
            [workspaceId, name.trim(), template.color, template.bg_color ?? null, workspaceId])
        : tx.add(
            `INSERT INTO note (workspaceID, folderID, name, color, bg_color, position)
             SELECT ?, ?, ?, ?, ?, ${nextPositionSql("note", "folderID = ? AND deleted_at IS NULL")}`,
            [workspaceId, folderId, name.trim(), template.color, template.bg_color ?? null, folderId])
    addNoteContent(tx, tx.idOf(note), template.content)

    try {
        const results = await tx.run()
        return results[note].lastInsertId
    } catch (error: unknown) {
        // Statement 0 is the note itself: its failures are name clashes / invalid names
        rethrowTxError(error, note, "NOTE", { UNIQUE: NOTE_UNIQUE_MESSAGE(), CHECK: NOTE_CHECK_MESSAGE() })
        throw createError("TEMPLATE_APPLY_FAILED", i18n.t("errors.template.apply", { message: getErrorMessage(error) }))
    }
}
