import { describe, expect, it } from "vitest"
import { parseInline, parseMarkdown, toggleChecklistItem } from "./markdown-lite"

describe("parseInline", () => {
    it("leaves a plain text as one node", () => {
        expect(parseInline("just words")).toEqual([{ type: "text", text: "just words" }])
        expect(parseInline("")).toEqual([])
    })

    it("reads bold and italic, also nested", () => {
        expect(parseInline("a **b** c *d*")).toEqual([
            { type: "text", text: "a " },
            { type: "bold", children: [{ type: "text", text: "b" }] },
            { type: "text", text: " c " },
            { type: "italic", children: [{ type: "text", text: "d" }] },
        ])
        expect(parseInline("**bold and *italic***")).toEqual([
            { type: "bold", children: [{ type: "text", text: "bold and " }, { type: "italic", children: [{ type: "text", text: "italic" }] }] },
        ])
    })

    it("does not take stars next to spaces or unmatched stars for emphasis", () => {
        expect(parseInline("2 * 3 * 4")).toEqual([{ type: "text", text: "2 * 3 * 4" }])
        expect(parseInline("a * b")).toEqual([{ type: "text", text: "a * b" }])
        expect(parseInline("**open")).toEqual([{ type: "text", text: "**open" }])
    })

    it("finds the safe links only and never cuts one with an emphasis", () => {
        expect(parseInline("see https://example.com/*a*/b now")).toEqual([
            { type: "text", text: "see " },
            { type: "link", url: "https://example.com/*a*/b", text: "https://example.com/*a*/b" },
            { type: "text", text: " now" },
        ])
        expect(parseInline("javascript:alert(1)")).toEqual([{ type: "text", text: "javascript:alert(1)" }])
    })

    it("lets a link sit inside a bold text", () => {
        expect(parseInline("**go https://example.com**")).toEqual([
            { type: "bold", children: [{ type: "text", text: "go " }, { type: "link", url: "https://example.com", text: "https://example.com" }] },
        ])
    })

    it("keeps html as text", () => {
        expect(parseInline("<b onclick=x>hi</b>")).toEqual([{ type: "text", text: "<b onclick=x>hi</b>" }])
    })
})

describe("parseMarkdown", () => {
    it("keeps plain paragraphs and line breaks as one text", () => {
        const [block] = parseMarkdown("one\n\ntwo\nthree")
        expect(block.type).toBe("text")
        const joined = block.type === "text" ? block.inline.map(node => node.type === "text" ? node.text : "").join("") : ""
        expect(joined).toBe("one\n\ntwo\nthree")
    })

    it("groups the lines of a list and tells the kinds apart", () => {
        const blocks = parseMarkdown("intro\n- a\n* b\n1. c\n2) d\n- [ ] e\n- [X] f\nend")
        expect(blocks.map(block => block.type)).toEqual(["text", "bullets", "numbers", "checklist", "text"])
        const check = blocks[3]
        expect(check.type === "checklist" && check.items.map(item => [item.line, item.checked])).toEqual([[5, false], [6, true]])
    })

    it("accepts an empty checklist item and windows line ends", () => {
        const blocks = parseMarkdown("- [ ]\r\n- [x] done\r\n")
        expect(blocks[0]).toMatchObject({ type: "checklist", items: [{ inline: [], checked: false }, { checked: true }] })
    })

    it("does not take a line that only looks like a list for one", () => {
        expect(parseMarkdown("-no space\n1.5 liters\n[ ] box").map(block => block.type)).toEqual(["text"])
    })
})

describe("toggleChecklistItem", () => {
    it("ticks and unticks only the chosen line", () => {
        const text = "x\n- [ ] a\n- [ ] b"
        expect(toggleChecklistItem(text, 2)).toBe("x\n- [ ] a\n- [x] b")
        expect(toggleChecklistItem("- [x] a", 0)).toBe("- [ ] a")
        expect(toggleChecklistItem("- [X] a", 0)).toBe("- [ ] a")
    })

    it("keeps the rest of the line, the indent and the line ends", () => {
        expect(toggleChecklistItem("  * [ ] a [ ] b\r\nz", 0)).toBe("  * [x] a [ ] b\r\nz")
    })

    it("returns null for a line that is not a checklist item or does not exist", () => {
        expect(toggleChecklistItem("- a", 0)).toBeNull()
        expect(toggleChecklistItem("- [ ] a", 3)).toBeNull()
    })
})

describe("rich mode (the text of a page)", () => {
    const rich = { rich: true } as const
    const types = (text: string) => parseMarkdown(text, rich).map(block => block.type)

    it("is off by default: a description keeps its '#', quotes and fences as text", () => {
        expect(parseMarkdown("# Title\n> quote\n---\n```\ncode\n```").map(block => block.type)).toEqual(["text"])
        expect(parseInline("a `b`")).toEqual([{ type: "text", text: "a `b`" }])
    })

    it("reads headings with their level and drops the closing hashes", () => {
        const [h1, h3] = parseMarkdown("# One\n\n### Three ###", rich)
        expect(h1).toEqual({ type: "heading", level: 1, inline: [{ type: "text", text: "One" }] })
        expect(h3).toEqual({ type: "heading", level: 3, inline: [{ type: "text", text: "Three" }] })
        expect(types("#nospace\n####### seven")).toEqual(["text"])
    })

    it("reads a fenced block as code, with its lines untouched, also when it is not closed", () => {
        const blocks = parseMarkdown("before\n```ts\n# not a heading\n- [ ] not a task\n```\nafter", rich)
        expect(blocks.map(block => block.type)).toEqual(["text", "code", "text"])
        expect(blocks[1]).toEqual({ type: "code", text: "# not a heading\n- [ ] not a task" })
        expect(parseMarkdown("~~~\nopen", rich)).toEqual([{ type: "code", text: "open" }])
    })

    it("reads quotes (one block for consecutive lines), rules and lists around them", () => {
        expect(types("> a\n> b\n\n---\n* * *\n- x\n1. y")).toEqual(["quote", "rule", "rule", "bullets", "numbers"])
        const [quote] = parseMarkdown("> a\n> b", rich)
        expect(quote).toEqual({ type: "quote", inline: [{ type: "text", text: "a" }, { type: "text", text: "\n" }, { type: "text", text: "b" }] })
    })

    it("keeps the line numbers of the checklist items, whatever comes before", () => {
        const blocks = parseMarkdown("# T\n\n```\nx\n```\n- [ ] a\n- [x] b", rich)
        const list = blocks.find(block => block.type === "checklist")
        expect(list && list.type === "checklist" && list.items.map(item => item.line)).toEqual([5, 6])
    })

    it("keeps the blank line between two paragraphs but not the ones around other blocks", () => {
        const blocks = parseMarkdown("one\n\ntwo\n\n# H\n\nthree\n\n", rich)
        expect(blocks.map(block => block.type)).toEqual(["text", "heading", "text"])
        const joined = (index: number) => { const block = blocks[index]; return block.type === "text" ? block.inline.map(node => node.type === "text" ? node.text : "").join("") : "" }
        expect(joined(0)).toBe("one\n\ntwo")
        expect(joined(2)).toBe("three")
    })

    it("reads inline code (its stars stay text) and [text](address) links, and refuses an unsafe address", () => {
        expect(parseInline("a `*b*` c", rich)).toEqual([{ type: "text", text: "a " }, { type: "code", text: "*b*" }, { type: "text", text: " c" }])
        expect(parseInline("see [docs](https://example.com/a_b) now", rich)).toEqual([
            { type: "text", text: "see " },
            { type: "link", url: "https://example.com/a_b", text: "docs" },
            { type: "text", text: " now" },
        ])
        expect(parseInline("[x](javascript:alert(1))", rich).some(node => node.type === "link")).toBe(false)
        expect(parseInline("[x](file:///etc/passwd)", rich).some(node => node.type === "link")).toBe(false)
    })

    it("never turns html into anything but text", () => {
        expect(parseMarkdown("<script>alert(1)</script>\n<img src=x onerror=y>", rich)).toEqual([
            { type: "text", inline: [{ type: "text", text: "<script>alert(1)</script>" }, { type: "text", text: "\n" }, { type: "text", text: "<img src=x onerror=y>" }] },
        ])
    })
})
