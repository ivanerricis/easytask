import i18n from "@/i18n"
import type Database from "@tauri-apps/plugin-sql"
import { type Folder, type Note, type Workspace } from "@/types/types"
import { WORKSPACE_EXPORT_FORMAT, WORKSPACE_EXPORT_VERSION, type ExportAudio, type ExportFolder, type ExportNote, type ExportTemplate, type WorkspaceExport } from "@/types/transfer"
import { createError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { getDB } from "../../dbManager"
import { buildNotesContent, parseTemplateContent } from "../template"
import { getDBAutomationsByNote, toPortableAutomations } from "../automation"
import { chunked, placeholders } from "../sql"

type AudioRow = { section_groupID: number, name: string, path: string, position: number }

type ExportEntry ={ note: Note & { color: string | null }, folderRef: string | null }

/**
 * Exports notes (content and audio paths), in the given order; `folderRef` is where each note sits inside the file.
 * The rows of all the notes are loaded in bulk (a few selects for the whole list), not note by note.
 */
async function buildNotesExport(db: Database, entries: ExportEntry[]): Promise<ExportNote[]> {
    const noteIds = entries.map(({ note }) => note.id)
    const [contents, rules] = await Promise.all([buildNotesContent(noteIds, true), getDBAutomationsByNote(noteIds)])

    const audioByNote = new Map<number, AudioRow[]>()
    // The chunks are independent reads (each note is in one chunk only): run them together, merge in chunk order
    const audioChunks = await Promise.all(chunked(noteIds).map(ids => db.select<(AudioRow & { noteID: number })[]>(
        `SELECT a.section_groupID, a.name, a.path, a.position, g.noteID FROM audio_file a
         INNER JOIN section_group g ON g.id = a.section_groupID
         WHERE g.noteID IN (${placeholders(ids.length)}) AND g.deleted_at IS NULL AND a.deleted_at IS NULL
         ORDER BY a.position, a.id`, ids)))
    for (const rows of audioChunks) {
        for (const row of rows) {
            const list = audioByNote.get(row.noteID)
            if (list) list.push(row)
            else audioByNote.set(row.noteID, [row])
        }
    }

    return entries.map(({ note, folderRef }): ExportNote => {
        const { content, sectionIds, groupIds, defaultSectionIds } = contents.get(note.id)!
        const automations = toPortableAutomations(rules.get(note.id) ?? [], content, sectionIds, groupIds, defaultSectionIds)
        // Index of every group in the content (groupIds is in content order)
        const groupIndex = new Map(groupIds.map((id, index) => [id, index]))
        return {
            ref: `n${note.id}`,
            folderRef,
            name: note.name,
            color: note.color ?? null,
            ...(note.bg_color ? { bg_color: note.bg_color } : {}),
            ...(note.archived_at ? { archived_at: note.archived_at } : {}),
            position: note.position,
            content,
            ...(automations.length > 0 ? { automations } : {}),
            audio: (audioByNote.get(note.id) ?? []).flatMap((file): ExportAudio[] => {
                const index = groupIndex.get(file.section_groupID)
                return index === undefined ? [] : [{ groupIndex: index, name: file.name, path: file.path, position: file.position }]
            }),
        }
    })
}
/**
 * Builds the export of a workspace: folders, notes (with content and audio paths) and templates, without any trashed item
 * (archived items are included, with their `archived_at`).
 * @param workspaceId The ID of the workspace.
 * @throws A "TRANSFER_WORKSPACE_MISSING" error when the workspace does not exist, "TRANSFER_EXPORT_FAILED" otherwise.
 * @category Database Queries
 */
export async function buildDBWorkspaceExport(workspaceId: number): Promise<WorkspaceExport> {
    try {
        const db = await getDB()
        const workspaces = await db.select<Workspace[]>(
            'SELECT * FROM workspace WHERE id = ? AND deleted_at IS NULL', [workspaceId])
        if (workspaces.length === 0)
            throw createError("TRANSFER_WORKSPACE_MISSING", i18n.t("errors.transfer.workspaceMissing"))

        const [folders, notes, templates] = await Promise.all([
            db.select<(Folder & { color: string | null })[]>(
                'SELECT * FROM folder WHERE workspaceID = ? AND deleted_at IS NULL ORDER BY position, id', [workspaceId]),
            db.select<(Note & { color: string | null })[]>(
                'SELECT * FROM note WHERE workspaceID = ? AND deleted_at IS NULL ORDER BY position, id', [workspaceId]),
            db.select<{ name: string, color: string | null, bg_color: string | null, content: string }[]>(
                'SELECT name, color, bg_color, content FROM note_template WHERE workspaceID = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE, id',
                [workspaceId]),
        ])

        // An item inside a trashed folder is hidden with it: it is exported only when its whole folder chain is alive
        const folderById = new Map(folders.map(folder => [folder.id, folder]))
        const isReachable = (folderId: number | null): boolean => {
            const seen = new Set<number>()
            while (folderId !== null) {
                const folder = folderById.get(folderId)
                if (!folder || seen.has(folderId)) return false
                seen.add(folderId)
                folderId = folder.folderID
            }
            return true
        }
        const refOf = (folderId: number | null) => folderId === null ? null : `f${folderId}`

        const exportFolders: ExportFolder[] = folders.filter(folder => isReachable(folder.id)).map(folder => ({
            ref: `f${folder.id}`,
            parentRef: refOf(folder.folderID),
            name: folder.name,
            color: folder.color ?? null,
            ...(folder.archived_at ? { archived_at: folder.archived_at } : {}),
            position: folder.position,
        }))

        const exportNotes = await buildNotesExport(db,
            notes.filter(note => isReachable(note.folderID)).map(note => ({ note, folderRef: refOf(note.folderID) })))

        const exportTemplates: ExportTemplate[] = templates.map(template => {
            // A corrupted snapshot is exported as an empty template
            return { name: template.name, color: template.color ?? null, ...(template.bg_color ? { bg_color: template.bg_color } : {}), content: parseTemplateContent(template.content) }
        })

        return {
            format: WORKSPACE_EXPORT_FORMAT,
            version: WORKSPACE_EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            workspace: { name: workspaces[0].name, color: workspaces[0].color ?? null },
            folders: exportFolders,
            notes: exportNotes,
            templates: exportTemplates,
        }
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TRANSFER_EXPORT_FAILED", i18n.t("errors.transfer.export", { message: getErrorMessage(e) })))
    }
}

/**
 * Builds the export of a single note, or of a folder with its whole subtree (subfolders and notes, without any trashed item).
 * The file is a "mini workspace" (`scope: "items"`): `workspace` holds the name and color of the item, the item itself sits at
 * the root of the file (parentRef / folderRef null) and `templates` is empty.
 * @param itemType "note" or "folder".
 * @param itemId The ID of the note or folder.
 * @throws A "TRANSFER_ITEM_MISSING" error when the item does not exist (or is trashed), "TRANSFER_EXPORT_FAILED" otherwise.
 * @category Database Queries
 */
export async function buildDBItemExport(itemType: "note" | "folder", itemId: number): Promise<WorkspaceExport> {
    return buildDBItemsExport([{ type: itemType, id: itemId }])
}

/**
 * Builds the export of several notes and folders (each folder with its whole subtree) in ONE file with scope "items",
 * the same format as the export of a single item: every selected item sits at the root of the file, in the given order.
 * An item that is inside another selected folder is not exported twice (it comes with that folder), and so is a repeated one.
 * `workspace` carries `name` and, for a single item, the color of that item.
 * @param items The notes and folders to export (at least one).
 * @param name The name stored in the file; defaults to the name of the first item.
 * @throws A "TRANSFER_ITEM_MISSING" error when an item does not exist (or is trashed), "TRANSFER_EXPORT_FAILED" otherwise.
 * @category Database Queries
 */
export async function buildDBItemsExport(items: { type: "note" | "folder", id: number }[], name?: string): Promise<WorkspaceExport> {
    try {
        const db = await getDB()
        const missing = () => createError("TRANSFER_ITEM_MISSING", i18n.t("errors.transfer.itemMissing"))
        if (items.length === 0) throw missing()

        // The living subtree (ids) of every selected folder, to leave out what another selected folder already brings
        // (one recursive query for all the selected folders, which also loads the folder rows)
        type FolderRow = Folder & { color: string | null }
        const selectedFolderIds = [...new Set(items.filter(item => item.type === "folder").map(item => item.id))]
        const subtreeOf = new Map<number, Set<number>>()
        const folderById = new Map<number, FolderRow>()
        for (const ids of chunked(selectedFolderIds)) {
            const rows = await db.select<(FolderRow & { _root: number })[]>(
                `WITH RECURSIVE subtree(root, id) AS (
                    SELECT id, id FROM folder WHERE id IN (${placeholders(ids.length)}) AND deleted_at IS NULL
                    UNION ALL
                    SELECT s.root, f.id FROM folder f INNER JOIN subtree s ON f.folderID = s.id WHERE f.deleted_at IS NULL
                 )
                 SELECT s.root AS _root, f.* FROM subtree s INNER JOIN folder f ON f.id = s.id ORDER BY f.position, f.id`, ids)
            for (const { _root, ...folder } of rows) {
                if (!subtreeOf.has(_root)) subtreeOf.set(_root, new Set())
                subtreeOf.get(_root)!.add(folder.id)
                if (!folderById.has(folder.id)) folderById.set(folder.id, folder as FolderRow)
            }
        }
        if (selectedFolderIds.some(id => !subtreeOf.has(id))) throw missing()
        const insideOther = (folderId: number) =>
            [...subtreeOf].some(([topId, ids]) => topId !== folderId && ids.has(folderId))
        const topFolderIds = selectedFolderIds.filter(id => !insideOther(id))
        const folderIds = new Set(topFolderIds.flatMap(id => [...subtreeOf.get(id)!]))

        const exportFolders: ExportFolder[] = []
        let root: { name: string, color: string | null } | null = null
        const topFolders = new Set(topFolderIds)

        const folderRows = [...folderById.values()].filter(folder => folderIds.has(folder.id))

        // The selected notes, in one query
        const selectedNotes = new Map<number, Note & { color: string | null }>()
        for (const ids of chunked([...new Set(items.filter(item => item.type === "note").map(item => item.id))])) {
            const rows = await db.select<(Note & { color: string | null })[]>(
                `SELECT * FROM note WHERE id IN (${placeholders(ids.length)}) AND deleted_at IS NULL`, ids)
            for (const note of rows) selectedNotes.set(note.id, note)
        }

        const entries: ExportEntry[] = []
        const exported = new Set<number>()
        // Folders in the order of the selection, each followed by its subtree
        for (const item of items) {
            if (item.type === "folder") {
                if (!topFolders.has(item.id) || exported.has(item.id)) continue
                root ??= { name: folderById.get(item.id)!.name, color: folderById.get(item.id)!.color ?? null }
                for (const folder of folderRows.filter(row => subtreeOf.get(item.id)!.has(row.id))) {
                    exported.add(folder.id)
                    exportFolders.push({
                        ref: `f${folder.id}`,
                        parentRef: folder.id === item.id || folder.folderID === null || !subtreeOf.get(item.id)!.has(folder.folderID) ? null : `f${folder.folderID}`,
                        name: folder.name,
                        color: folder.color ?? null,
                        ...(folder.archived_at ? { archived_at: folder.archived_at } : {}),
                        position: folder.position,
                    })
                }
            } else {
                const note = selectedNotes.get(item.id)
                if (!note) throw missing()
                // Inside a selected folder: exported with it
                if (note.folderID !== null && folderIds.has(note.folderID)) continue
                if (entries.some(entry => entry.note.id === item.id)) continue
                root ??= { name: note.name, color: note.color ?? null }
                entries.push({ note, folderRef: null })
            }
        }
        if (!root) throw missing()
        const inFolders: (Note & { color: string | null })[] = []
        for (const ids of chunked([...folderIds]))
            inFolders.push(...await db.select<(Note & { color: string | null })[]>(
                `SELECT * FROM note WHERE deleted_at IS NULL AND folderID IN (${placeholders(ids.length)}) ORDER BY position, id`, ids))
        inFolders.sort((a, b) => a.position - b.position || a.id - b.id)
        for (const note of inFolders) entries.push({ note, folderRef: `f${note.folderID}` })
        const exportNotes = await buildNotesExport(db, entries)
        const single = exportFolders.filter(folder => folder.parentRef === null).length + exportNotes.filter(note => note.folderRef === null).length === 1
        return {
            format: WORKSPACE_EXPORT_FORMAT,
            version: WORKSPACE_EXPORT_VERSION,
            scope: "items",
            exportedAt: new Date().toISOString(),
            workspace: { name: name ?? root.name, color: single ? root.color : null },
            folders: exportFolders,
            notes: exportNotes,
            templates: [],
        }
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TRANSFER_EXPORT_FAILED", i18n.t("errors.transfer.export", { message: getErrorMessage(e) })))
    }
}
