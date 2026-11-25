import type { NoteTemplateContent, TemplateTask } from "@/types/template"
import { exportableTasks, groupBlocks, type NoteExportOptions } from "./note-markdown"
import { parseMarkdown, type InlineNode } from "./markdown-lite"

export const PRINT_ROOT_ID = "note-print"
/** Set on the body while the note is printed: the stylesheet (index.css) hides the app and shows only the printable note. */
export const PRINTING_CLASS = "printing-note"

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (className) node.className = className
    return node
}

function appendInline(doc: Document, parent: HTMLElement, nodes: readonly InlineNode[]): void {
    for (const node of nodes) {
        if (node.type === "text") parent.append(doc.createTextNode(node.text))
        else if (node.type === "link") parent.append(el(doc, "span", node.text, "link"))
        else {
            const wrapper = el(doc, node.type === "bold" ? "strong" : "em")
            appendInline(doc, wrapper, node.children)
            parent.append(wrapper)
        }
    }
}

/** A description drawn from its Markdown as DOM: text nodes and plain elements only (a link prints as its address, as text). */
function descriptionDom(doc: Document, description: string): HTMLElement {
    const root = el(doc, "div", undefined, "description")
    for (const block of parseMarkdown(description)) {
        if (block.type === "text") {
            const paragraph = el(doc, "p")
            appendInline(doc, paragraph, block.inline)
            root.append(paragraph)
            continue
        }
        const list = el(doc, block.type === "numbers" ? "ol" : "ul", undefined, block.type === "checklist" ? "checklist" : undefined)
        for (const item of block.items) {
            const entry = el(doc, "li")
            if (block.type === "checklist") entry.append(el(doc, "span", item.checked ? "☑" : "☐", "box"))
            appendInline(doc, entry, item.inline)
            list.append(entry)
        }
        root.append(list)
    }
    return root
}

function taskList(doc: Document, tasks: readonly TemplateTask[], hideCompleted: boolean): HTMLUListElement | null {
    const visible = exportableTasks(tasks, hideCompleted)
    if (visible.length === 0) return null
    const list = el(doc, "ul")
    for (const task of visible) {
        const item = el(doc, "li", undefined, task.completed ? "done" : "open")
        item.append(el(doc, "span", task.completed ? "☑" : "☐", "box"), el(doc, "span", task.text, "text"))
        for (const tag of task.tags ?? []) item.append(el(doc, "span", tag.name, "tag"))
        if (task.description?.trim()) item.append(descriptionDom(doc, task.description.trim()))
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
