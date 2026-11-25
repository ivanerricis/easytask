import { afterEach, describe, expect, it, vi } from "vitest"
import type { NoteTemplateContent, TemplateTask } from "@/types/template"
import { noteToPrintDom, pageToPrintDom, printNote, printPage, PRINT_ROOT_ID, PRINTING_CLASS } from "./note-print"

const task = (text: string, extra: Partial<TemplateTask> = {}): TemplateTask =>
    ({ text, description: null, completed: false, priority: false, color: null, position: 0, subtasks: [], ...extra })
const tree: NoteTemplateContent = {
    version: 1,
    groups: [{ name: null, position: 0, tasks: [task("direct")], sections: [{ title: "S", color: null, position: 0, tasks: [
        task("<b>a</b>", { tags: [{ name: "t", color: null }], description: "desc", subtasks: [task("sub", { completed: true })] }),
        task("done", { completed: true }),
    ] }] }],
}
const options = { hideCompleted: false, groupLabel: (i: number) => `Group ${i + 1}`, untitledSection: "Untitled", title: "Note" }

afterEach(() => {
    document.getElementById(PRINT_ROOT_ID)?.remove()
    document.body.classList.remove(PRINTING_CLASS)
    vi.restoreAllMocks()
})

describe("noteToPrintDom", () => {
    it("builds the title, group, section, tasks, tags, description and subtasks", () => {
        const root = noteToPrintDom(document, tree, options)
        expect(root.querySelector("h1")?.textContent).toBe("Note")
        expect(root.querySelector("h2")?.textContent).toBe("Group 1")
        expect(root.querySelector("h3")?.textContent).toBe("S")
        expect([...root.querySelectorAll("li")].map(li => li.querySelector(":scope > .text")?.textContent)).toEqual(["direct", "<b>a</b>", "sub", "done"])
        expect(root.querySelector(".tag")?.textContent).toBe("t")
        expect(root.querySelector(".description")?.textContent).toBe("desc")
        expect(root.querySelector("li ul li.done")).not.toBeNull()
    })

    it("prints the Markdown of a description as bold, lists and checkboxes, never as markup", () => {
        const withMd: NoteTemplateContent = { version: 1, groups: [{ name: "G", position: 0, sections: [{ title: "S", color: null, position: 0, tasks: [
            task("t", { description: "**bold** <i>x</i>\n- a\n1. b\n- [x] c\n- [ ] d" }),
        ] }] }] }
        const description = noteToPrintDom(document, withMd, options).querySelector(".description")!
        expect(description.querySelector("strong")?.textContent).toBe("bold")
        expect(description.querySelector("i")).toBeNull()
        expect(description.querySelector("p")?.textContent).toBe("bold <i>x</i>")
        expect(description.querySelectorAll("ul:not(.checklist) > li")).toHaveLength(1)
        expect(description.querySelectorAll("ol > li")).toHaveLength(1)
        expect([...description.querySelectorAll("ul.checklist > li")].map(li => li.textContent)).toEqual(["☑c", "☐d"])
    })

    it("never turns a task text into markup", () => {
        const root = noteToPrintDom(document, tree, options)
        expect(root.querySelector("b")).toBeNull()
    })

    it("leaves out the completed tasks with hide completed", () => {
        const root = noteToPrintDom(document, tree, { ...options, hideCompleted: true })
        expect([...root.querySelectorAll(".text")].map(node => node.textContent)).toEqual(["direct", "<b>a</b>"])
    })
})

describe("printNote", () => {
    it("puts the page in the body, prints and cleans up after the print", () => {
        const print = vi.spyOn(window, "print").mockImplementation(() => {
            expect(document.getElementById(PRINT_ROOT_ID)).not.toBeNull()
            expect(document.body.classList.contains(PRINTING_CLASS)).toBe(true)
            expect(document.title).toBe("Note")
        })
        const title = document.title
        printNote(tree, options)
        expect(print).toHaveBeenCalledTimes(1)
        window.dispatchEvent(new Event("afterprint"))
        expect(document.getElementById(PRINT_ROOT_ID)).toBeNull()
        expect(document.body.classList.contains(PRINTING_CLASS)).toBe(false)
        expect(document.title).toBe(title)
    })

    it("cleans up and rethrows when the webview cannot print", () => {
        vi.spyOn(window, "print").mockImplementation(() => { throw new Error("no print") })
        expect(() => printNote(tree, options)).toThrow("no print")
        expect(document.getElementById(PRINT_ROOT_ID)).toBeNull()
        expect(document.body.classList.contains(PRINTING_CLASS)).toBe(false)
    })
})

describe("pageToPrintDom and printPage", () => {
    it("draws the Markdown of a page as plain elements, never as markup", () => {
        const root = pageToPrintDom(document, "# Title\n\nSome **bold** and `code` <i>x</i>\n\n- one\n- [x] done\n\n> quote\n\n```\nlet a = 1\n```\n---\n1. first")
        expect(root.id).toBe(PRINT_ROOT_ID)
        expect(root.querySelector("h1")?.textContent).toBe("Title")
        expect(root.querySelector("p strong")?.textContent).toBe("bold")
        expect(root.querySelector("p code")?.textContent).toBe("code")
        expect(root.querySelector("i")).toBeNull()
        expect(root.querySelector("p")?.textContent).toContain("<i>x</i>")
        expect(root.querySelector("ul:not(.checklist) > li")?.textContent).toBe("one")
        expect(root.querySelector("ul.checklist > li")?.textContent).toBe("☑done")
        expect(root.querySelector("blockquote")?.textContent).toBe("quote")
        expect(root.querySelector("pre code")?.textContent).toBe("let a = 1")
        expect(root.querySelector("hr")).not.toBeNull()
        expect(root.querySelector("ol > li")?.textContent).toBe("first")
        expect(root.querySelector("script, img")).toBeNull()
    })

    it("prints with the name of the page as the title of the document, then cleans up", () => {
        const print = vi.spyOn(window, "print").mockImplementation(() => {
            expect(document.getElementById(PRINT_ROOT_ID)?.querySelector("h1")?.textContent).toBe("T")
            expect(document.title).toBe("My page")
            expect(document.body.classList.contains(PRINTING_CLASS)).toBe(true)
        })
        const before = document.title
        printPage("# T", "My page")
        expect(print).toHaveBeenCalledTimes(1)
        window.dispatchEvent(new Event("afterprint"))
        expect(document.getElementById(PRINT_ROOT_ID)).toBeNull()
        expect(document.title).toBe(before)
    })
})
