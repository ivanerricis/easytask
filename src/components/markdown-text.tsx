import { type MouseEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { isLinkClick, openLink } from "@/lib/links"
import { LINK_ATTRIBUTE } from "@/lib/link-click"
import { parseMarkdown, type InlineNode } from "@/lib/markdown-lite"
import { reportError } from "@/lib/report-error"

type MarkdownTextProps = {
    text: string
    /** Called with the line of a checklist item when it is clicked; without it the boxes are read only. */
    onToggle?: (line: number) => void
    className?: string
}

const LINK_CLASS = "underline decoration-primary/70 underline-offset-2 hover:decoration-primary"

function Inline({ nodes }: { nodes: InlineNode[] }): ReactNode {
    const { t } = useTranslation()
    const follow = (event: MouseEvent<HTMLElement>, url: string) => {
        if (!isLinkClick(event)) return
        event.preventDefault()
        event.stopPropagation()
        openLink(url).catch((error: unknown) => reportError(error))
    }
    return nodes.map((node, index) => {
        switch (node.type) {
            case "text": return node.text
            case "bold": return <strong key={index} className="font-semibold"><Inline nodes={node.children} /></strong>
            case "italic": return <em key={index}><Inline nodes={node.children} /></em>
            case "link": return (
                <span
                    key={index}
                    {...{ [LINK_ATTRIBUTE]: "" }}
                    title={t("tasks.openLink")}
                    onClick={event => follow(event, node.url)}
                    className={LINK_CLASS}
                >{node.text}</span>
            )
        }
    })
}

/**
 * A description drawn from its Markdown (bold, italic, lists, checklists, links): React elements only, never HTML. The text
 * keeps its line breaks. A click on a checklist box calls `onToggle`; a click anywhere else bubbles up (it starts the edit).
 */
export function MarkdownText({ text, onToggle, className }: MarkdownTextProps) {
    const { t } = useTranslation()
    return (
        <div className={cn("break-words [&>*+*]:mt-1", className)}>
            {parseMarkdown(text).map((block, index) => {
                if (block.type === "text") return <p key={index} className="whitespace-pre-wrap"><Inline nodes={block.inline} /></p>
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
                                    <Inline nodes={item.inline} />
                                </span>
                            </li>
                        ))}
                    </ul>
                )
                const List = block.type === "numbers" ? "ol" : "ul"
                return (
                    <List key={index} className={cn("ml-5", block.type === "numbers" ? "list-decimal" : "list-disc")}>
                        {block.items.map(item => <li key={item.line}><Inline nodes={item.inline} /></li>)}
                    </List>
                )
            })}
        </div>
    )
}
