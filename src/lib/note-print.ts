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
        else if (node.type === "code") parent.append(el(doc, "code", node.text))
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
        // Only the rich mode (a page) makes the other blocks; a description never has them
        if (!("items" in block)) continue
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
    printRoot(noteToPrintDom(document, tree, options), options.title)
}

/** The printable page of a Page as DOM: its Markdown drawn as plain elements and text nodes (never HTML). */
export function pageToPrintDom(doc: Document, body: string): HTMLElement {
    const root = el(doc, "div")
    root.id = PRINT_ROOT_ID
    const page = el(doc, "div", undefined, "page-doc")
    for (const block of parseMarkdown(body, { rich: true })) {
        if (block.type === "text" || block.type === "quote") {
            const paragraph = el(doc, block.type === "quote" ? "blockquote" : "p")
            appendInline(doc, paragraph, block.inline)
            page.append(paragraph)
        } else if (block.type === "heading") {
            const heading = el(doc, `h${block.level}` as "h1")
            appendInline(doc, heading, block.inline)
            page.append(heading)
        } else if (block.type === "code") {
            const pre = el(doc, "pre")
            pre.append(el(doc, "code", block.text))
            page.append(pre)
        } else if (block.type === "rule") {
            page.append(el(doc, "hr"))
        } else {
            const list = el(doc, block.type === "numbers" ? "ol" : "ul", undefined, block.type === "checklist" ? "checklist" : undefined)
            for (const item of block.items) {
                const entry = el(doc, "li")
                if (block.type === "checklist") entry.append(el(doc, "span", item.checked ? "☑" : "☐", "box"))
                appendInline(doc, entry, item.inline)
                list.append(entry)
            }
            page.append(list)
        }
    }
    root.append(page)
    return root
}

/** Opens the print dialog with a Page ("Save as PDF" there); `title` is the suggested name of the file. */
export function printPage(body: string, title: string): void {
    printRoot(pageToPrintDom(document, body), title)
}

function printRoot(root: HTMLElement, title: string | undefined): void {
    document.getElementById(PRINT_ROOT_ID)?.remove()
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
    if (title) document.title = title
    window.addEventListener("afterprint", cleanup)
    try {
        window.print()
    } catch (error) {
        cleanup()
        throw error
    }
}
