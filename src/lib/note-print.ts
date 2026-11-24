import type { NoteTemplateContent, TemplateTask } from "@/types/template"
import { exportableTasks, groupBlocks, type NoteExportOptions } from "./note-markdown"

export const PRINT_ROOT_ID = "note-print"
/** Set on the body while the note is printed: the stylesheet (index.css) hides the app and shows only the printable note. */
export const PRINTING_CLASS = "printing-note"

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (className) node.className = className
    return node
}

function taskList(doc: Document, tasks: readonly TemplateTask[], hideCompleted: boolean): HTMLUListElement | null {
    const visible = exportableTasks(tasks, hideCompleted)
    if (visible.length === 0) return null
    const list = el(doc, "ul")
    for (const task of visible) {
        const item = el(doc, "li", undefined, task.completed ? "done" : "open")
        item.append(el(doc, "span", task.completed ? "☑" : "☐", "box"), el(doc, "span", task.text, "text"))
        for (const tag of task.tags ?? []) item.append(el(doc, "span", tag.name, "tag"))
        if (task.description?.trim()) item.append(el(doc, "p", task.description.trim(), "description"))
        const subtasks = taskList(doc, task.subtasks, hideCompleted)
        if (subtasks) item.append(subtasks)
        list.append(item)
    }
    return list
}

/** The printable page of a note as DOM (text nodes only, so a task text can never inject markup). */
export function noteToPrintDom(doc: Document, tree: NoteTemplateContent, options: NoteExportOptions): HTMLElement {
    const root = el(doc, "div")
    root.id = PRINT_ROOT_ID
    if (options.title) root.append(el(doc, "h1", options.title))
    tree.groups.forEach((group, index) => {
        root.append(el(doc, "h2", group.name?.trim() || options.groupLabel(index)))
        for (const { section, tasks } of groupBlocks(group)) {
            if (section) root.append(el(doc, "h3", section.title.trim() || options.untitledSection))
            const list = taskList(doc, tasks, options.hideCompleted)
            if (list) root.append(list)
        }
    })
    return root
}

/**
 * Prints a note with the system print dialog (the user picks "Save as PDF" or a printer): the note is put in the page
 * as a hidden block that only the print stylesheet shows, then removed when the dialog is gone.
 * @throws When the webview has no print support.
 */
export function printNote(tree: NoteTemplateContent, options: NoteExportOptions): void {
    document.getElementById(PRINT_ROOT_ID)?.remove()
    const root = noteToPrintDom(document, tree, options)
    const previousTitle = document.title
    const cleanup = () => {
        window.removeEventListener("afterprint", cleanup)
        root.remove()
        document.body.classList.remove(PRINTING_CLASS)
        document.title = previousTitle
    }
    document.body.append(root)
    document.body.classList.add(PRINTING_CLASS)
    // The title is the suggested name of the PDF file
    if (options.title) document.title = options.title
    window.addEventListener("afterprint", cleanup)
    try {
        window.print()
    } catch (error) {
        cleanup()
        throw error
    }
}
