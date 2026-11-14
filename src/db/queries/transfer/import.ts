import i18n from "@/i18n"
import type Database from "@tauri-apps/plugin-sql"
import { invoke } from "@tauri-apps/api/core"
import { type ExportAudio, type ExportFolder, type WorkspaceExport } from "@/types/transfer"
import { createError, handleDBError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { getDB } from "../../dbManager"
import { AUDIO_EXTENSIONS } from "../audio"
import { MEDIA_EXTENSIONS } from "../media"
import { addNoteContent } from "../template"
import { addNoteAutomations } from "../automation"
import { chunked } from "../sql"
import { uniqueName } from "../names"
import { rethrowTxError, Transaction, type TxRef } from "../../transaction"
import { uniqueSibling } from "./validate"

/**
 * Default check for the audio files of an import: the Rust `audio_file_exists` command, which (unlike plugin-fs
 * `exists`) is not scoped to the EasyTask folder. An error of the command says nothing about the file, so it is
 * treated as present (the row is kept, the app already handles a missing audio file at playback). Only a definite
 * `false` skips the file.
 * @param path Absolute path of the audio file.
 * @category Database Queries
 */
async function defaultAudioExists(path: string): Promise<boolean> {
    try {
        return await invoke<boolean>("audio_file_exists", { path })
    } catch {
        return true
    }
}

/**
 * Default check for the images and videos of an import: the Rust `files_exist` command (which only looks at files with an
 * allowed extension). Like {@link defaultAudioExists}, an error of the command keeps the row: only a definite `false` skips it.
 * @param path Absolute path of the image or video.
 * @category Database Queries
 */
async function defaultMediaExists(path: string): Promise<boolean> {
    try {
        return (await invoke<boolean[]>("files_exist", { paths: [path] }))[0] !== false
    } catch {
        return true
    }
}

const hasExtension = (path: string, extensions: readonly string[]) => {
    const dot = path.lastIndexOf(".")
    return dot >= 0 && extensions.includes(path.slice(dot + 1).toLowerCase())
}
const hasAudioExtension = (path: string) => hasExtension(path, AUDIO_EXTENSIONS)
const hasMediaExtension = (path: string) => hasExtension(path, MEDIA_EXTENSIONS)

/** What an import needs to decide about the linked files (audio, images, videos) of a file. */
type FileChecks = {
    audioExists: (path: string) => Promise<boolean>
    mediaExists: (path: string) => Promise<boolean>
    /** Zip import: where each entry of the archive (`files/...`) was extracted. */
    extractedFiles?: Readonly<Record<string, string>>
}

/** The path a row of the file points to: the extracted copy for an entry of a zip (undefined when the archive lacks it), else the path in the file. */
function pathOfFile(file: ExportAudio, extractedFiles: FileChecks["extractedFiles"]): string | undefined {
    if (file.file === undefined || extractedFiles === undefined) return file.path
    return Object.hasOwn(extractedFiles, file.file) ? extractedFiles[file.file] : undefined
}

/**
 * The name a workspace import gets unless the user picks another one: the name in the file, or the first free
 * "name (imported)", "name (imported 2)"... when it is taken.
 * @param data A validated workspace export.
 * @category Database Queries
 */
export async function suggestDBWorkspaceImportName(data: WorkspaceExport): Promise<string> {
    return uniqueWorkspaceName(await getDB(), data.workspace.name.trim())
}

/** Returns the first free workspace name: "name", "name (imported)", "name (imported 2)"... (the word comes from the current language). */
async function uniqueWorkspaceName(db: Database, name: string): Promise<string> {
    // Trashed workspaces are included: they still hold the UNIQUE constraint on the name
    const rows = await db.select<{ name: string }[]>('SELECT name FROM workspace')
    const word = i18n.t("errors.transfer.suffix")
    return uniqueName(name, rows.map(row => row.name),
        (original, attempt) => attempt === 1 ? `${original} (${word})` : `${original} (${word} ${attempt})`, { caseInsensitive: true })
}

/** How many `audioExists` checks (each a Tauri invoke) run at the same time. */
const AUDIO_CHECK_BATCH = 20

/**
 * Checks each distinct path once, in batches of {@link AUDIO_CHECK_BATCH} running together.
 * A check that throws counts as "missing" (the file is skipped).
 * @returns Whether each path exists.
 */
async function checkAudioPaths(paths: readonly string[], audioExists: (path: string) => Promise<boolean>): Promise<Map<string, boolean>> {
    const unique = [...new Set(paths)]
    const result = new Map<string, boolean>()
    for (const batch of chunked(unique, AUDIO_CHECK_BATCH)) {
        const answers = await Promise.all(batch.map(path => Promise.resolve().then(() => audioExists(path)).then(found => Boolean(found), () => false)))
        batch.forEach((path, i) => result.set(path, answers[i]))
    }
    return result
}

type PendingFolder = { folder: ExportFolder, parentRef: TxRef | number | null }

type InsertedItems = { skippedFiles: number, folderRefs: Map<string, TxRef>, noteRefs: TxRef[] }

/**
 * Adds to `tx` the folders, notes (with their content) and audio files of an export. The top items of the file go under
 * `rootParent` (a folder id or reference, null = workspace root). Audio, image and video files that are missing, have no allowed
 * extension or clash on the name inside the group are skipped and counted.
 */
async function insertItems(
    tx: Transaction, data: WorkspaceExport, workspaceRef: TxRef | number, rootParent: TxRef | number | null,
    checks: FileChecks,
): Promise<InsertedItems> {
    let skippedFiles = 0
    // Folders level by level: children reference the ids of their parents
    const folderRefs = new Map<string, TxRef>()
    const childrenOf = new Map<string | null, ExportFolder[]>()
    for (const folder of data.folders) {
        const siblings = childrenOf.get(folder.parentRef)
        if (siblings) siblings.push(folder)
        else childrenOf.set(folder.parentRef, [folder])
    }
    let level: PendingFolder[] = (childrenOf.get(null) ?? []).map(folder => ({ folder, parentRef: rootParent }))
    let imported = 0
    while (level.length > 0) {
        const refs = tx.insertRows("folder", ["workspaceID", "folderID", "name", "color", "archived_at", "position"],
            level.map(({ folder, parentRef }) => [workspaceRef, parentRef, folder.name.trim(), folder.color ?? null, folder.archived_at || null, folder.position]))
        level.forEach(({ folder }, i) => folderRefs.set(folder.ref, refs[i]))
        imported += level.length
        level = level.flatMap(({ folder }, i) =>
            (childrenOf.get(folder.ref) ?? []).map(child => ({ folder: child, parentRef: refs[i] })))
    }
    // Folders left out are part of a parent cycle
    if (imported !== data.folders.length) throw createError("TRANSFER_INVALID_TREE", i18n.t("errors.transfer.invalidFolderTree"))

    let noteRefs: TxRef[] = []
    if (data.notes.length > 0) {
        const pathsOf = (list: (note: (typeof data.notes)[number]) => ExportAudio[], hasAllowedExtension: (path: string) => boolean) =>
            data.notes.flatMap(note => list(note).map(file => pathOfFile(file, checks.extractedFiles))
                .filter((path): path is string => path !== undefined && hasAllowedExtension(path)))
        const [audioExisting, mediaExisting] = [
            await checkAudioPaths(pathsOf(note => note.audio, hasAudioExtension), checks.audioExists),
            await checkAudioPaths(pathsOf(note => note.media, hasMediaExtension), checks.mediaExists),
        ]
        noteRefs = tx.insertRows("note", ["workspaceID", "folderID", "name", "color", "bg_color", "archived_at", "position"],
            data.notes.map(note => [
                workspaceRef, note.folderRef === null ? rootParent : folderRefs.get(note.folderRef) ?? null,
                note.name.trim(), note.color ?? null, note.bg_color || null, note.archived_at || null, note.position,
            ]))

        for (const [i, note] of data.notes.entries()) {
            const { groups: groupRefs, sections: sectionRefs, defaultSections } = addNoteContent(tx, noteRefs[i], note.content)
            if (note.automations?.length) addNoteAutomations(tx, noteRefs[i], note.automations, note.content, sectionRefs, groupRefs, defaultSections)
            for (const [table, files, hasAllowedExtension, existing] of [
                ["audio_file", note.audio, hasAudioExtension, audioExisting],
                ["media_file", note.media, hasMediaExtension, mediaExisting],
            ] as const) {
                const rows: unknown[][] = []
                const taken = new Set<string>()
                for (const file of files) {
                    const path = pathOfFile(file, checks.extractedFiles)
                    const keep = path !== undefined && hasAllowedExtension(path) && existing.get(path) === true
                    // UNIQUE(name, section_groupID): a duplicated name in the file is skipped instead of failing the import
                    const key = `${file.groupIndex}^@${file.name.toLowerCase()}`
                    if (!keep || taken.has(key)) {
                        skippedFiles += 1
                        continue
                    }
                    taken.add(key)
                    rows.push([groupRefs[file.groupIndex], file.name, path, file.position])
                }
                if (rows.length > 0) tx.insertRows(table, ["section_groupID", "name", "path", "position"], rows)
            }
        }
    }
    return { skippedFiles, folderRefs, noteRefs }
}


/**
 * Imports an export as a new workspace. The name is made unique ("name (importato)", "name (importato 2)"...), unless
 * `options.name` (chosen by the user) is given: that one is used as is, and a clash is an error.
 * The workspace and everything in it are written in ONE database transaction: on any failure nothing is created.
 * @param data A validated export (see validateWorkspaceExport).
 * @param options `audioExists` / `mediaExists` decide whether an audio file / an image or video is kept (files for which they
 * return false or throw are skipped). Files without an allowed extension (AUDIO_EXTENSIONS, MEDIA_EXTENSIONS) are always skipped.
 * `extractedFiles` (zip import): where each entry of the archive was extracted; rows that name an entry (`file`) point to
 * that copy, and are skipped when the archive does not have it.
 * @returns The ID of the new workspace and the number of skipped files (audio, images and videos).
 * @category Database Queries
 */
export async function importDBWorkspace(
    data: WorkspaceExport,
    options: { audioExists?: (path: string) => Promise<boolean>, mediaExists?: (path: string) => Promise<boolean>, extractedFiles?: Readonly<Record<string, string>>, name?: string } = {},
): Promise<{ workspaceId: number, skippedFiles: number }> {
    if (data.scope === "items") throw createError("TRANSFER_ITEMS_FILE", i18n.t("errors.transfer.itemsFile"))
    const checks: FileChecks = {
        audioExists: options.audioExists ?? defaultAudioExists,
        mediaExists: options.mediaExists ?? defaultMediaExists,
        extractedFiles: options.extractedFiles,
    }
    const tx = new Transaction()
    let workspace: number
    try {
        const db = await getDB()
        const name = options.name !== undefined ? options.name.trim() : await uniqueWorkspaceName(db, data.workspace.name.trim())
        workspace = tx.add('INSERT INTO workspace (name, color) VALUES (?, ?)', [name, data.workspace.color ?? null])
    } catch (error: unknown) {
        handleDBError(error, "WORKSPACE", {
            UNIQUE: i18n.t("errors.workspace.unique"),
            CHECK: i18n.t("errors.workspace.check"),
        })
    }

    try {
        const workspaceRef = tx.idOf(workspace)
        // The tag list first (in its order): the tags of the tasks, by name, find them there
        if (data.tags?.length)
            tx.insertRows("tag", ["workspaceID", "name", "color", "position"], data.tags.map((tag, position) => [workspaceRef, tag.name.trim(), tag.color || null, position]))
        const { skippedFiles } = await insertItems(tx, data, workspaceRef, null, checks)

        if (data.templates.length > 0) {
            tx.insertRows("note_template", ["workspaceID", "sourceNoteID", "name", "color", "bg_color", "content"],
                data.templates.map(template => [workspaceRef, null, template.name.trim(), template.color ?? null, template.bg_color || null, JSON.stringify(template.content)]))
        }

        const results = await tx.run()
        return { workspaceId: results[workspace].lastInsertId, skippedFiles }
    } catch (error: unknown) {
        // Statement 0 is the workspace row itself: a name clash (race with another writer) or an invalid name
        rethrowTxError(error, workspace, "WORKSPACE", {
            UNIQUE: i18n.t("errors.workspace.unique"),
            CHECK: i18n.t("errors.workspace.check"),
        })
        throw createError("TRANSFER_IMPORT_FAILED", i18n.t("errors.transfer.import", { message: getErrorMessage(error) }))
    }
}

/** A top item of an items import (folders first, then notes, in file order) and the name it would get. */
type ImportItemName = { type: "folder" | "note", name: string }

/** The top items of an items file, the existing siblings under the destination and the free names of the top items. */
async function topItemNames(db: Database, data: WorkspaceExport, workspaceId: number, parentFolderId: number | null) {
    const parentKey = parentFolderId ?? 0
    const taken = async (table: "folder" | "note") => db.select<{ name: string, position: number }[]>(
        `SELECT name, position FROM ${table} WHERE workspaceID = ? AND IFNULL(folderID, 0) = ? AND deleted_at IS NULL`,
        [workspaceId, parentKey])
    const [folderRows, noteRows] = await Promise.all([taken("folder"), taken("note")])
    const folders = { items: data.folders.filter(folder => folder.parentRef === null), rows: folderRows }
    const notes = { items: data.notes.filter(note => note.folderRef === null), rows: noteRows }
    const suggestions: ImportItemName[] = []
    for (const [type, { items, rows }] of [["folder", folders], ["note", notes]] as const) {
        const used = new Set(rows.map(row => row.name))
        for (const item of items) suggestions.push({ type, name: uniqueSibling(item.name.trim(), used) })
    }
    return { folders, notes, suggestions }
}

/**
 * The names the top items of an items file get under a destination unless the user picks others (folders first, then
 * notes, in file order): the names in the file, with " (2)", " (3)"... on a clash with the existing siblings.
 * @category Database Queries
 */
export async function suggestDBItemNames(data: WorkspaceExport, workspaceId: number, parentFolderId: number | null): Promise<ImportItemName[]> {
    return (await topItemNames(await getDB(), data, workspaceId, parentFolderId)).suggestions
}

/** The notes and folders created by an items import, with their name after the renaming of the clashes. */
export type ImportedItems = {
    skippedFiles: number
    items: { type: "folder" | "note", id: number, name: string }[]
}

/**
 * Imports an items export (a note, or a folder with its subtree) into an existing workspace, under a folder or at its root.
 * The top items are appended after the existing siblings, renamed on a name clash ("name (2)", "name (3)"...) and never
 * archived (the items inside keep their archive date); everything
 * is written in ONE database transaction: on any failure nothing is created.
 * @param data A validated export with scope "items" (see validateWorkspaceExport).
 * @param workspaceId The workspace to import into.
 * @param parentFolderId The destination folder, null for the workspace root.
 * @param options `audioExists`, `mediaExists` and `extractedFiles`: see importDBWorkspace. `names`: the names chosen by
 * the user for the top items, in the order of suggestDBItemNames; they are used as they are, so an empty name or a clash
 * (with a sibling or between them) is an error ("TRANSFER_NAME_EMPTY" / "TRANSFER_NAME_TAKEN") and nothing is imported.
 * @returns The number of skipped files and the top items created (with their new ids), for the caller to refresh and undo.
 * @throws "TRANSFER_WORKSPACE_FILE" for a whole-workspace file, "TRANSFER_PARENT_MISSING" when the destination folder is gone,
 * "TRANSFER_IMPORT_FAILED" otherwise.
 * @category Database Queries
 */
export async function importDBItems(
    source: WorkspaceExport,
    workspaceId: number,
    parentFolderId: number | null,
    options: { audioExists?: (path: string) => Promise<boolean>, mediaExists?: (path: string) => Promise<boolean>, extractedFiles?: Readonly<Record<string, string>>, names?: readonly string[] } = {},
): Promise<ImportedItems> {
    if (source.scope !== "items") throw createError("TRANSFER_WORKSPACE_FILE", i18n.t("errors.transfer.workspaceFile"))
    const checks: FileChecks = {
        audioExists: options.audioExists ?? defaultAudioExists,
        mediaExists: options.mediaExists ?? defaultMediaExists,
        extractedFiles: options.extractedFiles,
    }
    // The top items get a new name/position/archive state below: work on copies, the caller's object stays as it is
    const data: WorkspaceExport = { ...source, folders: source.folders.map(folder => ({ ...folder })), notes: source.notes.map(note => ({ ...note })) }
    try {
        const db = await getDB()
        if (parentFolderId !== null) {
            const parents = await db.select<{ id: number }[]>(
                'SELECT id FROM folder WHERE id = ? AND workspaceID = ? AND deleted_at IS NULL AND archived_at IS NULL', [parentFolderId, workspaceId])
            if (parents.length === 0) throw createError("TRANSFER_PARENT_MISSING", i18n.t("errors.transfer.parentMissing"))
        }

        // Top items: after the existing siblings, with a free name among them (or the one the user chose)
        const top = await topItemNames(db, data, workspaceId, parentFolderId)
        const topFolders = top.folders.items
        const topNotes = top.notes.items
        let index = 0
        for (const { items, rows } of [top.folders, top.notes]) {
            const used = new Set(rows.map(row => row.name))
            let position = rows.reduce((max, row) => Math.max(max, row.position + 1), 0)
            for (const item of items) {
                const chosen = options.names?.[index]?.trim()
                const suggested = top.suggestions[index++].name
                if (chosen === undefined) item.name = suggested
                else {
                    if (!chosen) throw createError("TRANSFER_NAME_EMPTY", i18n.t("errors.nameEmpty"))
                    if (used.has(chosen)) throw createError("TRANSFER_NAME_TAKEN", i18n.t("errors.transfer.nameTaken", { name: chosen }))
                    item.name = chosen
                }
                used.add(item.name)
                item.position = position++
                // What the user imports on purpose shows up: only the items inside keep their archive date
                item.archived_at = null
            }
        }

        const tx = new Transaction()
        const { skippedFiles, folderRefs, noteRefs } = await insertItems(tx, data, workspaceId, parentFolderId, checks)
        const results = await tx.run()
        const idOf = (ref: TxRef) => results[ref.$ref].lastInsertId - ref.offset
        return {
            skippedFiles,
            items: [
                ...topFolders.map(folder => ({ type: "folder" as const, id: idOf(folderRefs.get(folder.ref)!), name: folder.name })),
                ...topNotes.map(note => ({ type: "note" as const, id: idOf(noteRefs[data.notes.indexOf(note)]), name: note.name })),
            ],
        }
    } catch (error: unknown) {
        throw toAppError(error, e => createError("TRANSFER_IMPORT_FAILED", i18n.t("errors.transfer.import", { message: getErrorMessage(e) })))
    }
}
