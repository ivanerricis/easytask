import type { NoteTemplateContent } from "@/types/template"
import type { PortableAutomation } from "@/lib/automations/portable"

/**
 * An audio file of a note group in a workspace export. `path` is where the file was; the file itself is stored in the export
 * only when it is a `.easytask.zip` (then `file` is its entry name in the archive).
 * `groupIndex` is the index of the group inside the note `content.groups`.
 * @category Types
 */
export type ExportAudio = {
    groupIndex: number
    name: string
    path: string
    position: number
    /** Zip exports only: entry of the archive (`files/...`) holding the file, relative to the root of the archive. */
    file?: string
}

/**
 * An image or video of a note group in a workspace export (same shape as {@link ExportAudio}).
 * @category Types
 */
export type ExportMedia = ExportAudio

/**
 * A folder in a workspace export. `ref` identifies it inside the file, `parentRef` is null for root folders.
 * @category Types
 */
export type ExportFolder = {
    ref: string
    parentRef: string | null
    name: string
    color: string | null
    /** Archive date; absent (or null) for a visible folder and in files created before the archive existed. */
    archived_at?: string | null
    position: number
}

/**
 * A note in a workspace export. `folderRef` is null for notes at the workspace root.
 * @category Types
 */
export type ExportNote = {
    ref: string
    folderRef: string | null
    name: string
    color: string | null
    /** Background color of the note; absent in files created before it existed (and for a note without one). */
    bg_color?: string | null
    /** Archive date; absent (or null) for a visible note and in files created before the archive existed. */
    archived_at?: string | null
    position: number
    content: NoteTemplateContent
    /**
     * The automations of the note; their sections are positions in `content`. Absent in files created before the
     * automations existed (and for a note without rules).
     */
    automations?: PortableAutomation[]
    audio: ExportAudio[]
    media: ExportMedia[]
}

/**
 * A note template in a workspace export.
 * @category Types
 */
export type ExportTemplate = {
    name: string
    color: string | null
    /** Background of the notes created from the template; absent in files created before it existed. */
    bg_color?: string | null
    content: NoteTemplateContent
}

/**
 * Content of a `<workspace name>.easytask.json` file (or of `workspace.easytask.json` inside a `.easytask.zip`): the non deleted content of a workspace (archived items included, with
 * their `archived_at`: they are imported archived).
 * @category Types
 */
export type WorkspaceExport = {
    format: "easytask-workspace"
    version: 3
    /**
     * "items": a single note, or a folder with its whole subtree (`workspace` then carries the name and color of that
     * item, `templates` is empty); importable only inside an open workspace. Absent or "workspace": a whole workspace.
     */
    scope?: ExportScope
    exportedAt: string
    workspace: { name: string, color: string | null }
    folders: ExportFolder[]
    notes: ExportNote[]
    templates: ExportTemplate[]
}

/**
 * What an export file contains: a whole workspace or a part of it (one note or one folder).
 * @category Types
 */
type ExportScope = "workspace" | "items"

export const WORKSPACE_EXPORT_FORMAT = "easytask-workspace"
export const WORKSPACE_EXPORT_VERSION = 3

/**
 * Largest export JSON accepted by the import, in bytes (checked before reading it; for a zip it caps the JSON inside, not the media files).
 * @category Types
 */
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024

/**
 * Largest number of items (folders, notes, templates, groups, sections and tasks together) accepted by the import.
 * @category Types
 */
export const MAX_IMPORT_ITEMS = 100_000
