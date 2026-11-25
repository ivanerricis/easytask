import { type MouseEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { isLinkClick, openLink } from "@/lib/links"
import { LINK_ATTRIBUTE } from "@/lib/link-click"
import { parseMarkdown, type InlineNode } from "@/lib/markdown-lite"
import { reportError } from "@/lib/report-error"
import { Highlight } from "@/components/highlight"
import { previewOffsets } from "@/lib/page-search"

type MarkdownTextProps = {
    text: string
    /** Called with the line of a checklist item when it is clicked; without it the boxes are read only. */
    onToggle?: (line: number) => void
    /** Reads the Markdown of a page too (headings, code, quotes, rules, inline code, [text](address) links). */
    rich?: boolean
    /** Highlights the occurrences of `query` (`active` is the current one, numbered in drawing order; see previewOffsets). */
    search?: { query: string, active: number }
    className?: string
}

/** What the highlighting needs while the blocks are drawn: the query, the current occurrence and where each text starts counting. */
type Marks = { query: string, active: number, offsets: Map<object, number> }

const HEADING_CLASS: Record<number, string> = {
    1: "text-2xl font-semibold", 2: "text-xl font-semibold", 3: "text-lg font-semibold",
    4: "text-base font-semibold", 5: "text-sm font-semibold", 6: "text-sm font-medium text-muted-foreground",
}

const LINK_CLASS = "underline decoration-primary/70 underline-offset-2 hover:decoration-primary"

/** A text of the preview, with its matches marked when a search is on. */
function Marked({ holder, text, marks }: { holder: object, text: string, marks?: Marks }): ReactNode {
    if (!marks) return text
    return <Highlight text={text} query={marks.query} active={marks.active - (marks.offsets.get(holder) ?? 0)} />
}

function Inline({ nodes, marks }: { nodes: InlineNode[], marks?: Marks }): ReactNode {
    const { t } = useTranslation()
    const follow = (event: MouseEvent<HTMLElement>, url: string) => {
        if (!isLinkClick(event)) return
        event.preventDefault()
        event.stopPropagation()
        openLink(url).catch((error: unknown) => reportError(error))
    }
    return nodes.map((node, index) => {
        switch (node.type) {
            case "text": return marks ? <Marked key={index} holder={node} text={node.text} marks={marks} /> : node.text
            case "bold": return <strong key={index} className="font-semibold"><Inline nodes={node.children} marks={marks} /></strong>
            case "italic": return <em key={index}><Inline nodes={node.children} marks={marks} /></em>
            case "code": return <code key={index} className="rounded-xs bg-muted px-1 py-0.5 font-mono text-[0.9em]"><Marked holder={node} text={node.text} marks={marks} /></code>
            case "link": return (
                <span
                    key={index}
                    {...{ [LINK_ATTRIBUTE]: "" }}
                    title={t("tasks.openLink")}
                    onClick={event => follow(event, node.url)}
                    className={LINK_CLASS}
                >{marks ? <Marked holder={node} text={node.text} marks={marks} /> : node.text}</span>
            )
        }
    })
}

/**
 * A description drawn from its Markdown (bold, italic, lists, checklists, links): React elements only, never HTML. The text
 * keeps its line breaks. A click on a checklist box calls `onToggle`; a click anywhere else bubbles up (it starts the edit).
 */
export function MarkdownText({ text, onToggle, rich = false, search, className }: MarkdownTextProps) {
    const { t } = useTranslation()
    const blocks = parseMarkdown(text, { rich })
    const marks: Marks | undefined = search && search.query.trim() !== ""
        ? { query: search.query, active: search.active, offsets: previewOffsets(blocks, search.query).offsets }
        : undefined
    return (
        <div className={cn("break-words [&>*+*]:mt-1", className)}>
            {blocks.map((block, index) => {
                if (block.type === "heading") {
                    const Heading = `h${block.level}` as "h1"
                    return <Heading key={index} className={cn("break-words", HEADING_CLASS[block.level])}><Inline nodes={block.inline} marks={marks} /></Heading>
                }
                if (block.type === "code") return <pre key={index} className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm"><code><Marked holder={block} text={block.text} marks={marks} /></code></pre>
                if (block.type === "quote") return <blockquote key={index} className="whitespace-pre-wrap border-l-2 border-border pl-3 text-muted-foreground"><Inline nodes={block.inline} marks={marks} /></blockquote>
                if (block.type === "rule") return <hr key={index} className="border-border" />
                if (block.type === "text") return <p key={index} className="whitespace-pre-wrap"><Inline nodes={block.inline} marks={marks} /></p>
                if (block.type === "checklist") return (
                    <ul key={index} className="flex flex-col gap-1">
                        {block.items.map(item => (
                            <li key={item.line} className="flex items-start gap-2">
                                <Checkbox
                                    checked={item.checked}
                                    disabled={!onToggle}
                                    aria-label={t("tasks.markdown.toggleItem")}
                                    onClick={event => event.stopPropagation()}
                                    onCheckedChange={() => onToggle?.(item.line)}
                                    className="mt-0.5"
                                />
                                <span className={cn("min-w-0 whitespace-pre-wrap", item.checked && "text-muted-foreground line-through")}>
                                    <Inline nodes={item.inline} marks={marks} />
                                </span>
                            </li>
                        ))}
                    </ul>
                )
                const List = block.type === "numbers" ? "ol" : "ul"
                return (
                    <List key={index} className={cn("ml-5", block.type === "numbers" ? "list-decimal" : "list-disc")}>
                        {block.items.map(item => <li key={item.line}><Inline nodes={item.inline} marks={marks} /></li>)}
                    </List>
                )
            })}
        </div>
    )
}
