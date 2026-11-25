import { findLinks } from "./links"

/**
 * The small subset of Markdown a task description can use: bold, italic, bullet and numbered lists, checklists and the links of
 * `links.ts`. It is parsed into plain data (never into HTML), so the text can never inject markup. Everything else, and the line
 * breaks, stay as typed: a description without any of this reads exactly as before.
 */

export type InlineNode =
    | { type: "text", text: string }
    | { type: "bold" | "italic", children: InlineNode[] }
    | { type: "link", url: string, text: string }

export type ListItem = {
    inline: InlineNode[]
    /** Index (from 0) of the line of the item in the text. */
    line: number
    /** Set for a checklist item. */
    checked?: boolean
}

export type Block =
    | { type: "text", inline: InlineNode[] }
    | { type: "bullets" | "numbers" | "checklist", items: ListItem[] }

const CHECK_ITEM = /^[ \t]*[-*+][ \t]+\[([ xX])\](?:[ \t]+(.*))?$/
const BULLET_ITEM = /^[ \t]*[-*+][ \t]+(.*)$/
const NUMBER_ITEM = /^[ \t]*\d{1,9}[.)][ \t]+(.*)$/

// An emphasis opens and closes on a character that is not a space, so "2 * 3 * 4" is not italic. Bold goes first.
const BOLD = /\*\*(?=\S)([^]*?\S)\*\*(?!\*)/
const ITALIC = /\*(?=[^\s*])([^]*?[^\s*])\*/
const MASK = "\u0001"

/** The inline formatting of one line of text: emphasis (nestable) and links (never cut by an emphasis). */
export function parseInline(text: string): InlineNode[] {
    const links = findLinks(text)
    // The links are hidden from the emphasis search, so a "*" inside an address is never taken as markup
    let masked = text
    for (const link of links) masked = masked.slice(0, link.start) + MASK.repeat(link.end - link.start) + masked.slice(link.end)

    const nodes: InlineNode[] = []
    const pushPlain = (from: number, to: number) => {
        let at = from
        for (const link of links) {
            if (link.end <= from || link.start >= to) continue
            if (link.start > at) nodes.push({ type: "text", text: text.slice(at, link.start) })
            nodes.push({ type: "link", url: link.url, text: link.url })
            at = link.end
        }
        if (at < to) nodes.push({ type: "text", text: text.slice(at, to) })
    }

    let from = 0
    while (from < text.length) {
        const rest = masked.slice(from)
        const bold = BOLD.exec(rest)
        const italic = ITALIC.exec(rest)
        // The earliest wins; at the same place bold is the longer marker
        const found = bold && (!italic || bold.index <= italic.index) ? { match: bold, type: "bold" as const, mark: 2 }
            : italic ? { match: italic, type: "italic" as const, mark: 1 } : null
        if (!found) {
            pushPlain(from, text.length)
            break
        }
        const start = from + found.match.index
        const end = start + found.match[0].length
        pushPlain(from, start)
        nodes.push({ type: found.type, children: parseInline(text.slice(start + found.mark, end - found.mark)) })
        from = end
    }
    return nodes
}

const withoutCarriage = (line: string) => line.endsWith("\r") ? line.slice(0, -1) : line

/** The blocks of a description: consecutive lines of the same kind of list are one list, the other lines are text kept as typed. */
export function parseMarkdown(text: string): Block[] {
    const blocks: Block[] = []
    text.split("\n").forEach((raw, line) => {
        const content = withoutCarriage(raw)
        const check = CHECK_ITEM.exec(content)
        const number = check ? null : NUMBER_ITEM.exec(content)
        const bullet = check || number ? null : BULLET_ITEM.exec(content)
        const kind = check ? "checklist" : number ? "numbers" : bullet ? "bullets" : null
        const last = blocks[blocks.length - 1]
        if (kind) {
            const item: ListItem = { inline: parseInline((check?.[2] ?? number?.[1] ?? bullet?.[1] ?? "").trimEnd()), line }
            if (check) item.checked = check[1] !== " "
            if (last && last.type === kind) last.items.push(item)
            else blocks.push({ type: kind, items: [item] })
        } else if (last && last.type === "text") {
            // A line of text goes with the text above it: the "\n" between them is kept, so the line breaks stay
            last.inline.push({ type: "text", text: "\n" }, ...parseInline(content))
        } else {
            blocks.push({ type: "text", inline: parseInline(content) })
        }
    })
    return blocks
}

/** The text with the checklist item at `line` ticked or unticked, or null when that line is not a checklist item. */
export function toggleChecklistItem(text: string, line: number): string | null {
    const lines = text.split("\n")
    const current = lines[line]
    if (current === undefined || !CHECK_ITEM.test(withoutCarriage(current))) return null
    lines[line] = current.replace(/^([ \t]*[-*+][ \t]+\[)([ xX])\]/, (_all, open: string, mark: string) => `${open}${mark === " " ? "x" : " "}]`)
    return lines.join("\n")
}
