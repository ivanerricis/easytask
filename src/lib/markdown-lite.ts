import { findLinks, isSafeUrl } from "./links"

/**
 * The small subset of Markdown a task description can use: bold, italic, bullet and numbered lists, checklists and the links of
 * `links.ts`. It is parsed into plain data (never into HTML), so the text can never inject markup. Everything else, and the line
 * breaks, stay as typed: a description without any of this reads exactly as before.
 *
 * The text of a Page (`{ rich: true }`) also reads headings, fenced code, quotes, rules, inline code and `[text](address)` links, still
 * into plain data. A task description never uses the rich mode, so a "#" at the start of its lines stays text.
 */

export type InlineNode =
    | { type: "text", text: string }
    | { type: "bold" | "italic", children: InlineNode[] }
    | { type: "link", url: string, text: string }
    /** Rich mode only. */
    | { type: "code", text: string }

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
    /** The blocks below come from the rich mode only. */
    | { type: "heading", level: 1 | 2 | 3 | 4 | 5 | 6, inline: InlineNode[] }
    | { type: "code", text: string }
    | { type: "quote", inline: InlineNode[] }
    | { type: "rule" }

export type ParseOptions = {
    /** Reads the Markdown of a page (headings, code, quotes, rules, inline code, `[text](address)`) and not only a description. */
    rich?: boolean
}

const CHECK_ITEM = /^[ \t]*[-*+][ \t]+\[([ xX])\](?:[ \t]+(.*))?$/
const BULLET_ITEM = /^[ \t]*[-*+][ \t]+(.*)$/
const NUMBER_ITEM = /^[ \t]*\d{1,9}[.)][ \t]+(.*)$/

// An emphasis opens and closes on a character that is not a space, so "2 * 3 * 4" is not italic. Bold goes first.
const BOLD = /\*\*(?=\S)([^]*?\S)\*\*(?!\*)/
const ITALIC = /\*(?=[^\s*])([^]*?[^\s*])\*/
const MASK = "\u0001"

const CODE_SPAN = /(`+)(?!`)([^]*?[^`])\1(?!`)/g
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^\s)]+)\)/g

/** A piece of a line that is not formatted text: a link or a code span, with the range it covers. */
type Atom = { start: number, end: number, node: InlineNode }

/** The atoms of a line, none inside another: code spans first, then `[text](address)`, then the bare addresses. */
function findAtoms(text: string, rich: boolean): Atom[] {
    const atoms: Atom[] = []
    const free = (start: number, end: number) => atoms.every(atom => end <= atom.start || start >= atom.end)
    if (rich) {
        for (const match of text.matchAll(CODE_SPAN)) {
            atoms.push({ start: match.index, end: match.index + match[0].length, node: { type: "code", text: match[2].replace(/^ (?! *$)(.*) $/, "$1") } })
        }
        for (const match of text.matchAll(MARKDOWN_LINK)) {
            const start = match.index
            const end = start + match[0].length
            if (free(start, end) && isSafeUrl(match[2])) atoms.push({ start, end, node: { type: "link", url: match[2], text: match[1] } })
        }
    }
    for (const link of findLinks(text)) {
        if (free(link.start, link.end)) atoms.push({ start: link.start, end: link.end, node: { type: "link", url: link.url, text: link.url } })
    }
    return atoms.sort((a, b) => a.start - b.start)
}

/**
 * The inline formatting of one line of text: emphasis (nestable) and links, never cut by an emphasis. In rich mode also code spans
 * and `[text](address)` links.
 */
export function parseInline(text: string, options: ParseOptions = {}): InlineNode[] {
    const atoms = findAtoms(text, options.rich === true)
    // The links and code spans are hidden from the emphasis search, so a "*" inside an address is never taken as markup
    let masked = text
    for (const atom of atoms) masked = masked.slice(0, atom.start) + MASK.repeat(atom.end - atom.start) + masked.slice(atom.end)

    const nodes: InlineNode[] = []
    const pushPlain = (from: number, to: number) => {
        let at = from
        for (const atom of atoms) {
            if (atom.end <= from || atom.start >= to) continue
            if (atom.start > at) nodes.push({ type: "text", text: text.slice(at, atom.start) })
            nodes.push(atom.node)
            at = atom.end
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
        nodes.push({ type: found.type, children: parseInline(text.slice(start + found.mark, end - found.mark), options) })
        from = end
    }
    return nodes
}

const withoutCarriage = (line: string) => line.endsWith("\r") ? line.slice(0, -1) : line

const HEADING = /^[ \t]{0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/
const RULE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^[ \t]{0,3}>[ \t]?(.*)$/

/**
 * The blocks of a text: consecutive lines of the same kind of list are one list, the other lines are text kept as typed.
 * In rich mode (a page) a line can also be a heading, a rule or a quote, and a fenced block is code, whose lines are never read.
 */
export function parseMarkdown(text: string, options: ParseOptions = {}): Block[] {
    const rich = options.rich === true
    const blocks: Block[] = []
    const lines = text.split("\n")
    for (let line = 0; line < lines.length; line++) {
        const content = withoutCarriage(lines[line])
        const last = blocks[blocks.length - 1]

        if (rich) {
            const fence = FENCE.exec(content)
            if (fence) {
                const body: string[] = []
                let next = line + 1
                // The block ends at a line of the same marker (at least as long), or at the end of the text
                while (next < lines.length) {
                    const candidate = withoutCarriage(lines[next]).trim()
                    if (candidate.startsWith(fence[1][0].repeat(fence[1].length)) && /^(`+|~+)$/.test(candidate)) break
                    body.push(withoutCarriage(lines[next]))
                    next++
                }
                blocks.push({ type: "code", text: body.join("\n") })
                line = next
                continue
            }
            const heading = HEADING.exec(content)
            if (heading) {
                blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, inline: parseInline(heading[2], options) })
                continue
            }
            if (RULE.test(content) && !CHECK_ITEM.test(content)) {
                blocks.push({ type: "rule" })
                continue
            }
            const quote = QUOTE.exec(content)
            if (quote) {
                if (last && last.type === "quote") last.inline.push({ type: "text", text: "\n" }, ...parseInline(quote[1], options))
                else blocks.push({ type: "quote", inline: parseInline(quote[1], options) })
                continue
            }
            // Blank lines between blocks only separate them
            if (content.trim() === "" && !(last && last.type === "text")) continue
        }

        const check = CHECK_ITEM.exec(content)
        const number = check ? null : NUMBER_ITEM.exec(content)
        const bullet = check || number ? null : BULLET_ITEM.exec(content)
        const kind = check ? "checklist" : number ? "numbers" : bullet ? "bullets" : null
        if (kind) {
            const item: ListItem = { inline: parseInline((check?.[2] ?? number?.[1] ?? bullet?.[1] ?? "").trimEnd(), options), line }
            if (check) item.checked = check[1] !== " "
            if (last && last.type === kind) last.items.push(item)
            else blocks.push({ type: kind, items: [item] })
        } else if (last && last.type === "text") {
            // A line of text goes with the text above it: the "\n" between them is kept, so the line breaks stay
            last.inline.push({ type: "text", text: "\n" }, ...parseInline(content, options))
        } else {
            blocks.push({ type: "text", inline: parseInline(content, options) })
        }
    }
    if (rich) {
        // The blank lines that end a paragraph are not part of it
        for (const block of blocks) {
            if (block.type !== "text") continue
            while (block.inline.length > 0) {
                const tail = block.inline[block.inline.length - 1]
                if (tail.type === "text" && tail.text.trim() === "") block.inline.pop()
                else break
            }
        }
    }
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
