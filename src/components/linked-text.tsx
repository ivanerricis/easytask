import { Fragment, type KeyboardEventHandler, type MouseEvent, type MouseEventHandler } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { findLinks, isLinkClick, openLink } from "@/lib/links"
import { LINK_ATTRIBUTE } from "@/lib/link-click"
import { reportError } from "@/lib/report-error"

type LinkedTextProps = {
    text: string
    label: string
    className?: string
    onClick?: MouseEventHandler<HTMLDivElement>
    onKeyDown?: KeyboardEventHandler<HTMLDivElement>
    tabIndex?: number
}

/**
 * A read only text whose links (http, https, mailto) are underlined: Ctrl+click opens one in the system browser, a plain
 * click does what the text does (it starts the rename). It stands in place of the read only textarea, which cannot underline
 * a part of its text, only for a text that has a link.
 */
export const LinkedText = ({ text, label, className, onClick, onKeyDown, tabIndex = 0 }: LinkedTextProps) => {
    const { t } = useTranslation()
    const links = findLinks(text)
    const parts: { key: number, text: string, url?: string }[] = []
    let from = 0
    for (const link of links) {
        if (link.start > from) parts.push({ key: from, text: text.slice(from, link.start) })
        parts.push({ key: link.start, text: text.slice(link.start, link.end), url: link.url })
        from = link.end
    }
    if (from < text.length) parts.push({ key: from, text: text.slice(from) })

    const follow = (event: MouseEvent<HTMLElement>, url: string) => {
        if (!isLinkClick(event)) return
        event.preventDefault()
        event.stopPropagation()
        openLink(url).catch((error: unknown) => reportError(error))
    }

    return (
        <div
            role="textbox"
            aria-readonly
            aria-multiline
            tabIndex={tabIndex}
            aria-label={label}
            onClick={onClick}
            onKeyDown={onKeyDown}
            className={cn("whitespace-pre-wrap", className)}
        >
            {parts.map(part => part.url === undefined
                ? <Fragment key={part.key}>{part.text}</Fragment>
                : (
                    <span
                        key={part.key}
                        {...{ [LINK_ATTRIBUTE]: "" }}
                        title={t("tasks.openLink")}
                        onClick={event => follow(event, part.url!)}
                        className="underline decoration-primary/70 underline-offset-2 hover:decoration-primary"
                    >{part.text}</span>
                ))}
        </div>
    )
}
