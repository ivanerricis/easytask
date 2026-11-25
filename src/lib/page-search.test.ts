import { describe, expect, it } from "vitest"
import { countPreviewMatches, previewOffsets } from "./page-search"
import { parseMarkdown } from "./markdown-lite"

describe("page search", () => {
    const body = "# Fox hunt\nThe **fox** is [a fox](https://example.com)\n- fox\n- [ ] Fox\n```\nfox\n```\n> fox"

    it("counts the matches of what the preview draws, ignoring case and accents", () => {
        expect(countPreviewMatches(body, "fox")).toBe(7)
        expect(countPreviewMatches("Café cafe CAFÉ", "cafe")).toBe(3)
        expect(countPreviewMatches(body, "")).toBe(0)
    })

    it("does not count the markup, the address of a link or the fence", () => {
        expect(countPreviewMatches("**bold** [text](https://bold.example.com)", "bold")).toBe(1)
        expect(countPreviewMatches("```\ncode\n```", "```")).toBe(0)
    })

    it("gives each piece of text the number of matches before it", () => {
        const { offsets, total } = previewOffsets(parseMarkdown("fox fox\n\n# fox", { rich: true }), "fox")
        expect(total).toBe(3)
        expect([...offsets.values()]).toEqual([0, 2])
    })
})
