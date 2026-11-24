import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { buildContentWithSectionIds } from "@/db/queries/template"
import { getGroupLabel } from "@/pages/workspacePage/components/groups/group-label"
import { getSectionLabel } from "@/pages/workspacePage/components/section/section-label"
import { noteToMarkdown, type NoteExportOptions } from "./note-markdown"
import { printNote } from "./note-print"

const exportOptions = (title: string, hideCompleted: boolean): NoteExportOptions => ({
    hideCompleted,
    title,
    groupLabel: index => getGroupLabel({}, index),
    untitledSection: getSectionLabel({}),
})

/** Copies a note to the clipboard as Markdown (the content as the note shows it: no archived items; `hideCompleted` follows the preference). */
export async function copyNoteAsMarkdown(noteId: number, noteName: string, hideCompleted: boolean): Promise<void> {
    const { content } = await buildContentWithSectionIds(noteId)
    await writeText(noteToMarkdown(content, exportOptions(noteName, hideCompleted)))
}

/** Opens the print dialog with a printable page of the note (choose "Save as PDF" there). */
export async function printNoteAsPdf(noteId: number, noteName: string, hideCompleted: boolean): Promise<void> {
    const { content } = await buildContentWithSectionIds(noteId)
    printNote(content, exportOptions(noteName, hideCompleted))
}

