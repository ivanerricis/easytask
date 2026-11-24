import { afterEach, describe, expect, it, vi } from "vitest"
import type { NoteTemplateContent, TemplateTask } from "@/types/template"
import { noteToPrintDom, printNote, PRINT_ROOT_ID, PRINTING_CLASS } from "./note-print"

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
