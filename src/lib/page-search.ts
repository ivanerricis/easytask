import { parseMarkdown, type Block, type InlineNode } from "./markdown-lite"
import { findMatchRanges } from "@/pages/workspacePage/components/note-search"

/** Calls `visit` with each piece of text the preview draws, in drawing order (the order of MarkdownText), with the object that holds it. */
function walkPreview(blocks: readonly Block[], visit: (holder: object, text: string) => void) {
    const inline = (nodes: readonly InlineNode[]) => {
        for (const node of nodes) {
            if (node.type === "bold" || node.type === "italic") inline(node.children)
            else if (node.type === "text" || node.type === "code" || node.type === "link") visit(node, node.text)
        }
    }
    for (const block of blocks) {
        if (block.type === "text" || block.type === "heading" || block.type === "quote") inline(block.inline)
        else if (block.type === "code") visit(block, block.text)
        else if (block.type !== "rule") for (const item of block.items) inline(item.inline)
    }
}

/**
 * For each piece of text of the preview, how many matches of `query` come before it (ignoring case and accents), and the total.
 * MarkdownText numbers the occurrences it highlights with this, so the search of a page counts and shows the same ones.
 */
export function previewOffsets(blocks: readonly Block[], query: string): { offsets: Map<object, number>, total: number } {
    const offsets = new Map<object, number>()
    let total = 0
    walkPreview(blocks, (holder, text) => {
        offsets.set(holder, total)
        total += findMatchRanges(text, query).length
    })
    return { offsets, total }
}

/** How many times `query` appears in the formatted preview of a page. */
export function countPreviewMatches(body: string, query: string): number {
    return previewOffsets(parseMarkdown(body, { rich: true }), query).total
}
