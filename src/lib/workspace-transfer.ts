import i18n from "@/i18n"
import { Channel, invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import { readTextFile, stat, writeTextFile } from "@tauri-apps/plugin-fs"
import {
    buildDBItemExport, buildDBItemsExport, buildDBWorkspaceExport, importDBItems, importDBWorkspace, suggestDBItemNames, suggestDBWorkspaceImportName,
    validateWorkspaceExport, type ImportedItems,
} from "@/db/queries/transfer"
import { createError } from "@/types/error"
import { MAX_IMPORT_FILE_BYTES, type WorkspaceExport } from "@/types/transfer"

const FILTERS = [{ name: "EasyTask", extensions: ["json"] }]
const ZIP_FILTERS = [{ name: "EasyTask", extensions: ["zip"] }]
const IMPORT_FILTERS = [{ name: "EasyTask", extensions: ["json", "zip"] }]

/** Something an import creates at the top (the workspace, or the top notes and folders) and the name proposed for it. */
export type ImportName = { type: "workspace" | "folder" | "note", name: string }

/**
 * Lets the user review the names before importing: `submit` imports with the chosen names (it may fail, e.g. on a name
 * clash, and be tried again with other names); resolves with its result, or null when the user cancels.
 * @category Utilities
 */
export type ChooseImportNames = <T>(proposed: ImportName[], submit: (names: string[]) => Promise<T>) => Promise<T | null>

/** Imports with the proposed names, without asking. */
const acceptProposed: ChooseImportNames = (proposed, submit) => submit(proposed.map(item => item.name))

// Characters not allowed in a Windows file name
const sanitizeFileName = (name: string) => name.replace(/[<>:"/\\|?*]/g, "_").trim() || "workspace"

/**
 * How many linked files (audio, images, videos) an export refers to, as the Rust `linked_files_size` command counts them.
 * @category Types
 */
export type LinkedFilesInfo = {
    /** Total size of the files that exist, in bytes. */
    bytes: number
    /** Files that exist (distinct paths). */
    count: number
    /** Files that no longer exist. */
    missing: number
}

/**
 * Asks whether the linked files go into the export (a `.easytask.zip`) instead of only their paths (a `.easytask.json`).
 * Resolves with true (include), false (paths only) or null (the user cancelled the export).
 * @category Utilities
 */
export type AskIncludeFiles = (info: LinkedFilesInfo) => Promise<boolean | null>

/** Bytes of the linked files copied so far and in total, as the Rust commands report them. */
export type TransferProgress = { done: number, total: number }

/**
 * What an export can do besides writing the file. Without `askIncludeFiles` the linked files are never included (paths only).
 * @category Utilities
 */
export type ExportOptions = {
    askIncludeFiles?: AskIncludeFiles
    /** Called while the linked files are written into the zip. */
    onProgress?: (progress: TransferProgress) => void
}

/**
 * Outcome of an export that was not cancelled: how many linked files could not be included because they no longer exist
 * (always 0 for a `.easytask.json`).
 * @category Types
 */
export type ExportResult = { missingFiles: number }

type ZipSource = { path: string, entry: string }

/** The last component of a path, made safe to be part of an archive entry name. */
const entryBaseName = (path: string) => {
    const base = path.split(/[\\/]/).pop() ?? ""
    // eslint-disable-next-line no-control-regex
    const clean = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim()
    return (clean.length > 100 ? clean.slice(-100) : clean) || "file"
}

/** Every linked file (audio, image, video) the export refers to, by path, in file order. */
function linkedPaths(data: WorkspaceExport): string[] {
    return [...new Set(data.notes.flatMap(note => [...note.audio, ...note.media].map(file => file.path)))]
}

/**
 * Names, inside the archive, the files an export refers to: sets `file` (`files/<n>_<name>`, unique) on every audio and media
 * entry of `data` (a path used twice gets one entry) and returns what to put in the archive.
 */
function nameZipEntries(data: WorkspaceExport): ZipSource[] {
    const entryOf = new Map<string, string>()
    for (const note of data.notes) {
        for (const file of [...note.audio, ...note.media]) {
            let entry = entryOf.get(file.path)
            if (entry === undefined) {
                entry = `files/${entryOf.size}_${entryBaseName(file.path)}`
                entryOf.set(file.path, entry)
            }
            file.file = entry
        }
    }
    return [...entryOf].map(([path, entry]) => ({ path, entry }))
}

/** A Tauri channel that forwards the progress messages of a Rust command. */
function progressChannel(onProgress: ((progress: TransferProgress) => void) | undefined): Channel<TransferProgress> {
    const channel = new Channel<TransferProgress>()
    if (onProgress) channel.onmessage = onProgress
    return channel
}

/**
 * Builds the export, asks (when there are linked files that exist) whether to include them, asks where to save, and writes
 * a `.easytask.zip` (the JSON and the files, copied by the Rust side) or a `.easytask.json` (pretty printed, paths only).
 * @returns null when the user cancelled a dialog.
 */
async function writeExport(
    build: () => Promise<WorkspaceExport>, defaultName: string, options: ExportOptions,
): Promise<ExportResult | null> {
    const data = await build()
    const paths = linkedPaths(data)
    let withFiles = false
    if (paths.length > 0 && options.askIncludeFiles) {
        const info = await invoke<LinkedFilesInfo>("linked_files_size", { paths })
        // Nothing to include when none of the files exists: the question would be pointless
        if (info.count > 0) {
            const answer = await options.askIncludeFiles(info)
            if (answer === null) return null
            withFiles = answer
        }
    }

    const base = sanitizeFileName(defaultName)
    const path = await save(withFiles
        ? { filters: ZIP_FILTERS, defaultPath: `${base}.easytask.zip` }
        : { filters: FILTERS, defaultPath: `${base}.easytask.json` })
    if (!path) return null

    if (!withFiles) {
        await writeTextFile(path, JSON.stringify(data, null, 2))
        return { missingFiles: 0 }
    }
    const files = nameZipEntries(data)
    const summary = await invoke<{ added: number, missing: number }>("export_zip", {
        dest: path, json: JSON.stringify(data, null, 2), files, onProgress: progressChannel(options.onProgress),
    })
    return { missingFiles: summary.missing }
}

/**
 * Asks where to save and writes the export of a workspace (`<name>.easytask.json`, or `.easytask.zip` with the linked files).
 * @param workspace The workspace to export.
 * @param options Asks whether to include the linked files, and reports the progress of the zip.
 * @returns null when the user cancelled a dialog.
 * @category Utilities
 */
export async function exportWorkspaceToFile(workspace: { id: number, name: string }, options: ExportOptions = {}): Promise<ExportResult | null> {
    return writeExport(() => buildDBWorkspaceExport(workspace.id), workspace.name, options)
}

/**
 * Asks where to save and writes the export of a single note or folder (`<name>.easytask.json`, or `.easytask.zip`).
 * @param itemType "note" or "folder".
 * @param item The note or folder to export (its name is the default file name).
 * @param options See {@link exportWorkspaceToFile}.
 * @returns null when the user cancelled a dialog.
 * @category Utilities
 */
export async function exportItemToFile(itemType: "note" | "folder", item: { id: number, name: string }, options: ExportOptions = {}): Promise<ExportResult | null> {
    return writeExport(() => buildDBItemExport(itemType, item.id), item.name, options)
}

/**
 * Asks where to save and writes the export of several notes and folders in ONE file (`<name>.easytask.json` or `.easytask.zip`),
 * in the format of the single item export: importing it creates every item.
 * @param items The notes and folders to export (the caller has already dropped the ones inside another selected folder).
 * @param name Default file name, also stored in the file.
 * @param options See {@link exportWorkspaceToFile}.
 * @returns null when the user cancelled a dialog.
 * @category Utilities
 */
export async function exportItemsToFile(items: { type: "note" | "folder", id: number }[], name: string, options: ExportOptions = {}): Promise<ExportResult | null> {
    return writeExport(() => buildDBItemsExport(items, name), name, options)
}

/** An export file the user picked: its validated content and, for a zip, where its files were extracted. */
type PickedExport = {
    data: WorkspaceExport
    /** Zip: entry name in the archive to the extracted copy (empty for a plain JSON). */
    files: Record<string, string>
}

/** Deletes the files extracted from a zip that will not be imported (best effort). */
async function discardExtracted(files: Record<string, string>): Promise<void> {
    const paths = Object.values(files)
    if (paths.length === 0) return
    try {
        await invoke("delete_extracted_files", { paths })
    } catch {
        // Leftover files in the media folder are harmless
    }
}

/** Reads a zip with the Rust `import_zip` command: its JSON and the extracted files. */
async function readZip(path: string, onProgress: ((progress: TransferProgress) => void) | undefined): Promise<{ json: string, files: Record<string, string> }> {
    try {
        return await invoke("import_zip", { src: path, onProgress: progressChannel(onProgress) })
    } catch (error) {
        if (String(error).startsWith("JSON_TOO_LARGE"))
            throw createError("TRANSFER_FILE_TOO_LARGE", i18n.t("errors.transfer.fileTooLarge", { max: MAX_IMPORT_FILE_BYTES / (1024 * 1024) }))
        throw createError("TRANSFER_INVALID_FILE", i18n.t("errors.transfer.invalidZip"))
    }
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        throw createError("TRANSFER_INVALID_FILE", i18n.t("errors.transfer.invalidJson"))
    }
}

/**
 * Asks for an export file (`.easytask.json` or `.easytask.zip`) and returns its validated content (null when the user
 * cancelled the dialog). A zip is read by Rust, which extracts its files into the media folder of the data folder.
 */
async function pickExportFile(onProgress?: (progress: TransferProgress) => void): Promise<PickedExport | null> {
    const path = await open({ filters: IMPORT_FILTERS, multiple: false, directory: false })
    if (!path) return null

    if (path.toLowerCase().endsWith(".zip")) {
        const { json, files } = await readZip(path, onProgress)
        try {
            return { data: validateWorkspaceExport(parseJson(json)), files }
        } catch (error) {
            await discardExtracted(files)
            throw error
        }
    }

    // A failing stat is ignored: the read below reports the real problem
    const size = await stat(path).then(info => info.size, () => 0)
    if (size > MAX_IMPORT_FILE_BYTES)
        throw createError("TRANSFER_FILE_TOO_LARGE", i18n.t("errors.transfer.fileTooLarge", { max: MAX_IMPORT_FILE_BYTES / (1024 * 1024) }))

    let text: string
    try {
        text = await readTextFile(path)
    } catch {
        throw createError("TRANSFER_INVALID_FILE", i18n.t("errors.transfer.invalidJson"))
    }
    return { data: validateWorkspaceExport(parseJson(text)), files: {} }
}

/** Runs an import of a picked file; the files extracted from a zip are deleted when the import is cancelled or fails. */
async function withPickedFile<T>(picked: PickedExport, run: () => Promise<T | null>): Promise<T | null> {
    try {
        const result = await run()
        if (result === null) await discardExtracted(picked.files)
        return result
    } catch (error) {
        await discardExtracted(picked.files)
        throw error
    }
}

/**
 * Asks for an export file (`.easytask.json` or `.easytask.zip`) and imports it as a new workspace, with the name the user
 * confirms (a free name is proposed). The files of a zip are extracted into the media folder of the data folder.
 * @param choose Shows the proposed name and imports with the chosen one (default: the proposed name, without asking).
 * @param onProgress Called while the files of a zip are extracted.
 * @returns null when the user cancelled a dialog, otherwise the new workspace ID and the number of skipped files.
 * @throws "TRANSFER_ITEMS_FILE" when the file holds a note or folder instead of a workspace.
 * @category Utilities
 */
export async function importWorkspaceFromFile(
    choose: ChooseImportNames = acceptProposed, onProgress?: (progress: TransferProgress) => void,
): Promise<{ workspaceId: number, skippedFiles: number } | null> {
    const picked = await pickExportFile(onProgress)
    if (!picked) return null
    const { data, files } = picked
    return withPickedFile(picked, async () => {
        if (data.scope === "items") throw createError("TRANSFER_ITEMS_FILE", i18n.t("errors.transfer.itemsFile"))
        const name = await suggestDBWorkspaceImportName(data)
        return choose([{ type: "workspace", name }], names => importDBWorkspace(data, { name: names[0], extractedFiles: files }))
    })
}

/**
 * Asks for an export file with notes and folders and imports it into a workspace, with the names the user confirms for the
 * top items (free names among the destination are proposed).
 * @param workspaceId The workspace to import into.
 * @param parentFolderId The destination folder, null for the workspace root.
 * @param choose Shows the proposed names and imports with the chosen ones (default: the proposed names, without asking).
 * @param onProgress Called while the files of a zip are extracted.
 * @returns null when the user cancelled a dialog, otherwise the top items created and the number of skipped files.
 * @throws "TRANSFER_WORKSPACE_FILE" when the file holds a whole workspace.
 * @category Utilities
 */
export async function importItemsFromFile(
    workspaceId: number, parentFolderId: number | null, choose: ChooseImportNames = acceptProposed, onProgress?: (progress: TransferProgress) => void,
): Promise<ImportedItems | null> {
    const picked = await pickExportFile(onProgress)
    if (!picked) return null
    const { data, files } = picked
    return withPickedFile(picked, async () => {
        if (data.scope !== "items") throw createError("TRANSFER_WORKSPACE_FILE", i18n.t("errors.transfer.workspaceFile"))
        const proposed = await suggestDBItemNames(data, workspaceId, parentFolderId)
        return choose(proposed, names => importDBItems(data, workspaceId, parentFolderId, { names, extractedFiles: files }))
    })
}
