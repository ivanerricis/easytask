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
