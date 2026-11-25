import { describe, expect, it } from "vitest"
import type { NoteTemplateContent, TemplateGroup, TemplateSection, TemplateTask } from "@/types/template"
import { noteToMarkdown, type NoteExportOptions } from "./note-markdown"

const task = (text: string, extra: Partial<TemplateTask> = {}): TemplateTask =>
    ({ text, description: null, completed: false, priority: false, color: null, position: 0, subtasks: [], ...extra })
const section = (title: string, tasks: TemplateTask[], extra: Partial<TemplateSection> = {}): TemplateSection =>
    ({ title, color: null, position: 0, tasks, ...extra })
const group = (name: string | null, sections: TemplateSection[], extra: Partial<TemplateGroup> = {}): TemplateGroup =>
    ({ name, position: 0, sections, ...extra })
const note = (...groups: TemplateGroup[]): NoteTemplateContent => ({ version: 1, groups })

const options: NoteExportOptions = { hideCompleted: false, groupLabel: index => `Group ${index + 1}`, untitledSection: "Untitled" }

describe("noteToMarkdown", () => {
    it("writes groups as ##, sections as ### and tasks as checkboxes", () => {
        const md = noteToMarkdown(note(group("Work", [section("Today", [task("write"), task("send", { completed: true })])])), options)
        expect(md).toBe("## Work\n\n### Today\n\n- [ ] write\n- [x] send\n")
    })

    it("indents the subtasks by two spaces per level", () => {
        const tree = note(group("G", [section("S", [task("a", { subtasks: [task("b", { completed: true, subtasks: [task("c")] })] })])]))
        expect(noteToMarkdown(tree, options)).toBe("## G\n\n### S\n\n- [ ] a\n  - [x] b\n    - [ ] c\n")
    })

    it("adds the tags after the text and the description under the task", () => {
        const tree = note(group("G", [section("S", [task("a", { tags: [{ name: "home", color: null }, { name: "to do", color: "#fff" }], description: "line one\n\nline two", subtasks: [task("b", { description: "sub note" })] })])]))
        expect(noteToMarkdown(tree, options)).toBe("## G\n\n### S\n\n- [ ] a `home` `to do`\n  line one\n\n  line two\n  - [ ] b\n    sub note\n")
    })

    it("writes the Markdown of a description as it is, under the task", () => {
        const tree = note(group("G", [section("S", [task("a", { description: "**plan**\n- [ ] one\n- [x] two" })])]))
        expect(noteToMarkdown(tree, options)).toBe("## G\n\n### S\n\n- [ ] a\n  **plan**\n  - [ ] one\n  - [x] two\n")
    })

    it("keeps the lines of a multi-line task text under the item", () => {
        const md = noteToMarkdown(note(group("G", [section("S", [task("first\nsecond")])])), options)
        expect(md).toContain("- [ ] first\n  second\n")
    })

    it("names an unnamed group and an untitled section", () => {
        const md = noteToMarkdown(note(group(null, [section("  ", [])]), group("  ", [])), options)
        expect(md).toBe("## Group 1\n\n### Untitled\n\n## Group 2\n")
    })

    it("writes the tags of a group and of a section", () => {
        const md = noteToMarkdown(note(group("G", [section("S", [], { tags: [{ name: "s", color: null }] })], { tags: [{ name: "g", color: null }] })), options)
        expect(md).toBe("## G\n\n`g`\n\n### S\n\n`s`\n")
    })

    it("puts the tasks of the group where the note has them", () => {
        const tree = note(group("G", [section("A", [task("a")]), section("B", [task("b")])], { tasks: [task("direct")], directIndex: 1 }))
        expect(noteToMarkdown(tree, options)).toBe("## G\n\n### A\n\n- [ ] a\n\n- [ ] direct\n\n### B\n\n- [ ] b\n")
        expect(noteToMarkdown(note(group("G", [section("A", [task("a")])], { tasks: [task("direct")] })), options)).toBe("## G\n\n- [ ] direct\n\n### A\n\n- [ ] a\n")
    })

    it("adds the title of the note", () => {
        expect(noteToMarkdown(note(group("G", [])), { ...options, title: "My note" })).toBe("# My note\n\n## G\n")
    })

    it("is empty for a note without groups", () => {
        expect(noteToMarkdown(note(), options)).toBe("")
    })

    describe("hide completed", () => {
        const tree = note(group("G", [section("S", [
            task("done", { completed: true, subtasks: [task("sub", { completed: true })] }),
            task("open"),
            task("done with open child", { completed: true, subtasks: [task("child done", { completed: true }), task("child open")] }),
        ])]))

        it("keeps everything when off", () => {
            const md = noteToMarkdown(tree, options)
            expect(md).toContain("- [x] done\n  - [x] sub")
            expect(md).toContain("child done")
        })

        it("leaves out the fully completed tasks and keeps a completed task that has an open one below", () => {
            const md = noteToMarkdown(tree, { ...options, hideCompleted: true })
            expect(md).toBe("## G\n\n### S\n\n- [ ] open\n- [x] done with open child\n  - [ ] child open\n")
        })
    })
})
