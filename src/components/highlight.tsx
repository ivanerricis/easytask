import { Fragment } from "react"
import { findMatchRanges } from "@/pages/workspacePage/components/note-search"
import { cn } from "@/lib/utils"

type HighlightProps = {
    text: string
    /** What to highlight (ignoring case and accents); empty renders the plain text. */
    query: string
    /** Which occurrence is the current match of the search (0-based): it gets the stronger style. */
    active?: number
    /** Added to every mark (e.g. to keep the text of a mirror layer transparent). */
    markClassName?: string
}

/**
 * The text with the occurrences of the query wrapped in `<mark>` elements. Deterministic (no CSS Custom Highlight API,
 * which WebKitGTK does not do reliably). The text stays the same for the screen readers: a mark only adds a background.
 * @category Components
 */
export function Highlight({ text, query, active = -1, markClassName }: HighlightProps) {
    const ranges = findMatchRanges(text, query)
    if (ranges.length === 0) return <>{text}</>
    const parts: React.ReactNode[] = []
    let last = 0
    ranges.forEach(([start, end], occurrence) => {
        const isActive = occurrence === active
        parts.push(
            <Fragment key={start}>
                {text.slice(last, start)}
                <mark
                    data-active={isActive ? "true" : undefined}
                    className={cn(
                        // Yellow like the search of a browser, readable on both themes; the current match is orange with a ring (theme tokens)
                        "rounded-xs box-decoration-clone px-px",
                        isActive
                            ? "bg-highlight-active text-highlight-active-foreground ring-2 ring-highlight-ring"
                            : "bg-highlight text-highlight-foreground",
                        markClassName,
                    )}
                >
                    {text.slice(start, end)}
                </mark>
            </Fragment>,
        )
        last = end
    })
    parts.push(text.slice(last))
    return <>{parts}</>
}
