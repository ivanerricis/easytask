import i18n from "@/i18n"
import { type NoteTemplateContent } from "@/types/template"
import { MAX_IMPORT_ITEMS, WORKSPACE_EXPORT_FORMAT, WORKSPACE_EXPORT_VERSION, type ExportFolder, type ExportNote, type WorkspaceExport } from "@/types/transfer"
import { createError } from "@/types/error"
import { isPortableAutomation } from "@/lib/automations/portable"
import { uniqueName } from "../names"

const INVALID_FILE_MESSAGE = () => i18n.t("errors.transfer.invalidFile")
const MALFORMED_MESSAGE = () => i18n.t("errors.transfer.malformed")
const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === "string"
const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isNullableString = (value: unknown) => value === null || value === undefined || isString(value)

function malformed(): never {
    throw createError("TRANSFER_INVALID_FILE", MALFORMED_MESSAGE())
}

function tooMany(): never {
    throw createError("TRANSFER_TOO_MANY_ITEMS", i18n.t("errors.transfer.tooManyItems", { max: MAX_IMPORT_ITEMS.toLocaleString(i18n.language) }))
}

/** Counts the items of a file against MAX_IMPORT_ITEMS (the walk stops as soon as the limit is passed). */
type Counter = { count: number }
function bump(counter: Counter, amount = 1) {
    counter.count += amount
    if (counter.count > MAX_IMPORT_ITEMS) tooMany()
}

function checkTask(task: unknown, counter: Counter, depth = 0) {
    if (!isObject(task) || depth > 100) malformed()
    bump(counter)
    if (!isString(task.text) || !isNumber(task.position) || !Array.isArray(task.subtasks)) malformed()
    if (!isNullableString(task.description) || !isNullableString(task.color) || !isNullableString(task.archived_at)) malformed()
    for (const subtask of task.subtasks as unknown[]) checkTask(subtask, counter, depth + 1)
}

/** Checks a note content so that the insertion never crashes on a malformed file. */
function checkContent(content: unknown, counter: Counter): NoteTemplateContent {
    if (!isObject(content) || !Array.isArray(content.groups)) malformed()
    for (const group of content.groups as unknown[]) {
        bump(counter)
        if (!isObject(group) || !isNumber(group.position) || !Array.isArray(group.sections) || !isNullableString(group.name)
            || !isNullableString(group.color) || !isNullableString(group.archived_at)) malformed()
        if (!(group.width === undefined || group.width === null || (Number.isInteger(group.width) && (group.width as number) > 0))) malformed()
        if (!(group.directIndex === undefined || (Number.isInteger(group.directIndex) && (group.directIndex as number) >= 0 && (group.directIndex as number) <= (group.sections as unknown[]).length))) malformed()
        if (group.tasks !== undefined) {
            if (!Array.isArray(group.tasks)) malformed()
            for (const task of group.tasks as unknown[]) checkTask(task, counter)
        }
        for (const section of group.sections as unknown[]) {
            bump(counter)
            if (!isObject(section) || !isString(section.title) || !isNumber(section.position) || !Array.isArray(section.tasks)
                || !isNullableString(section.color) || !isNullableString(section.archived_at)) malformed()
            for (const task of section.tasks as unknown[]) checkTask(task, counter)
        }
    }
    return content as unknown as NoteTemplateContent
}

/** An empty color is not a valid color (CHECK LENGTH(color) > 0): it means "no color". */
const cleanColor = (color: string | null | undefined): string | null => color ? color : null

/** Returns "name", or "name (2)", "name (3)"... the first one not in `used`; the result is added to `used`. */
export function uniqueSibling(name: string, used: Set<string>): string {
    const candidate = uniqueName(name, used, (original, attempt) => `${original} (${attempt + 1})`)
    used.add(candidate)
    return candidate
}

const untitled = (value: string) => value.trim() || i18n.t("errors.transfer.untitled")

type ContentTask = NoteTemplateContent["groups"][number]["sections"][number]["tasks"][number]

function normalizeTask(task: ContentTask) {
    task.text = untitled(task.text)
    task.color = cleanColor(task.color)
    for (const subtask of task.subtasks) normalizeTask(subtask)
}

/**
 * Fixes (in place) what the database would reject: blank task texts get a placeholder,
 * empty colors become null and section titles clashing in the same group get a numeric suffix.
 */
function normalizeContent(content: NoteTemplateContent) {
    for (const group of content.groups) {
        group.color = cleanColor(group.color)
        for (const task of group.tasks ?? []) normalizeTask(task)
        const titles = new Set<string>()
        for (const section of group.sections) {
            // A blank title stays blank (a section may have no title); only the others must differ
            section.title = section.title.trim() ? uniqueSibling(section.title.trim(), titles) : ""
            section.color = cleanColor(section.color)
            for (const task of section.tasks) normalizeTask(task)
        }
    }
}

/** Renames (in place) the items of the same parent that share a name, keeping the file order. */
function dedupeNames<T extends { name: string }>(items: T[], parentOf: (item: T) => string | null) {
    const used = new Map<string | null, Set<string>>()
    for (const item of items) {
        const parent = parentOf(item)
        let names = used.get(parent)
        if (!names) used.set(parent, names = new Set())
        item.name = uniqueSibling(item.name.trim(), names)
    }
}

/**
 * Validates the parsed content of an export file.
 * @param data The parsed JSON.
 * @returns The same data, typed.
 * @throws A "TRANSFER_INVALID_FILE" error (Italian message) for a wrong format or malformed structure,
 * "TRANSFER_UNSUPPORTED_VERSION" for an unsupported version, "TRANSFER_TOO_MANY_ITEMS" above MAX_IMPORT_ITEMS.
 * The data is also normalized in place: blank task texts get a placeholder, empty colors become null,
 * and sibling folders, notes and sections with the same name get a numeric suffix.
 * @category Database Queries
 */
export function validateWorkspaceExport(data: unknown): WorkspaceExport {
    if (!isObject(data) || data.format !== WORKSPACE_EXPORT_FORMAT)
        throw createError("TRANSFER_INVALID_FILE", INVALID_FILE_MESSAGE())
    if (data.version !== WORKSPACE_EXPORT_VERSION)
        throw createError("TRANSFER_UNSUPPORTED_VERSION", i18n.t("errors.transfer.unsupportedVersion"))

    const { workspace, folders, notes, templates, scope } = data
    if (scope !== undefined && scope !== "workspace" && scope !== "items") malformed()
    if (!isObject(workspace) || !isNonEmpty(workspace.name) || !isNullableString(workspace.color)) malformed()
    if (!Array.isArray(folders) || !Array.isArray(notes) || !Array.isArray(templates)) malformed()
    const counter: Counter = { count: 0 }
    bump(counter, folders.length + notes.length + templates.length)

    const folderRefs = new Set<string>()
    for (const folder of folders as unknown[]) {
        if (!isObject(folder) || !isNonEmpty(folder.ref) || !isNonEmpty(folder.name) || !isNumber(folder.position)
            || !isNullableString(folder.color) || !isNullableString(folder.archived_at) || !(folder.parentRef === null || isString(folder.parentRef))) malformed()
        if (folderRefs.has(folder.ref)) malformed()
        folderRefs.add(folder.ref)
    }
    for (const folder of folders as ExportFolder[])
        if (folder.parentRef !== null && !folderRefs.has(folder.parentRef)) malformed()

    const noteRefs = new Set<string>()
    for (const note of notes as unknown[]) {
        if (!isObject(note) || !isNonEmpty(note.ref) || !isNonEmpty(note.name) || !isNumber(note.position)
            || !isNullableString(note.color) || !isNullableString(note.bg_color) || !isNullableString(note.archived_at) || !Array.isArray(note.audio) || !Array.isArray(note.media)
            || !(note.folderRef === null || (isString(note.folderRef) && folderRefs.has(note.folderRef)))) malformed()
        if (noteRefs.has(note.ref)) malformed()
        noteRefs.add(note.ref)
        const content = checkContent(note.content, counter)
        if (note.automations !== undefined) {
            if (!Array.isArray(note.automations)) malformed()
            bump(counter, note.automations.length)
            for (const automation of note.automations as unknown[])
                if (!isPortableAutomation(automation, content)) malformed()
        }
        for (const file of [...note.audio as unknown[], ...note.media as unknown[]]) {
            if (!isObject(file) || !isNumber(file.groupIndex) || !isNonEmpty(file.name) || !isNonEmpty(file.path)
                || !isNumber(file.position) || file.groupIndex < 0 || file.groupIndex >= content.groups.length
                || !(file.file === undefined || isNonEmpty(file.file))) malformed()
        }
    }
    for (const template of templates as unknown[]) {
        if (!isObject(template) || !isNonEmpty(template.name) || !isNullableString(template.color) || !isNullableString(template.bg_color)) malformed()
        checkContent(template.content, counter)
    }

    if (scope === "items") {
        // A part of a workspace: no templates and at least one item at the top
        const hasRoot = (folders as ExportFolder[]).some(folder => folder.parentRef === null)
            || (notes as ExportNote[]).some(note => note.folderRef === null)
        if (templates.length > 0 || !hasRoot) malformed()
    }

    const result = data as unknown as WorkspaceExport
    result.workspace.color = cleanColor(result.workspace.color)
    for (const folder of result.folders) folder.color = cleanColor(folder.color)
    for (const note of result.notes) {
        note.color = cleanColor(note.color)
        if (note.bg_color !== undefined) note.bg_color = cleanColor(note.bg_color)
        normalizeContent(note.content)
    }
    for (const template of result.templates) {
        template.color = cleanColor(template.color)
        if (template.bg_color !== undefined) template.bg_color = cleanColor(template.bg_color)
        template.name = template.name.trim()
        normalizeContent(template.content)
    }
    dedupeNames(result.folders, folder => folder.parentRef)
    dedupeNames(result.notes, note => note.folderRef)
    return result
}
