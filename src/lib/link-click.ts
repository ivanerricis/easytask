import type { MouseEvent } from "react"
import { findLinks, isLinkClick, linkAt, openLink } from "./links"
import { reportError } from "./report-error"

/** Marks a link of a text: a row of the tasks leaves its Ctrl+click to the link instead of using it to select the row. */
export const LINK_ATTRIBUTE = "data-text-link"

/**
 * Ctrl+click in an editable text (a textarea cannot underline a link): opens the link under the caret, if any.
 * Meant for the onClick of the field; a plain click only moves the caret, as always.
 */
export function openLinkAtCaret(event: MouseEvent<HTMLTextAreaElement>): void {
    if (!isLinkClick(event)) return
    const field = event.currentTarget
    const link = linkAt(field.value, field.selectionStart)
    if (!link) return
    event.preventDefault()
    openLink(link.url).catch((error: unknown) => reportError(error))
}

/** The tooltip of an editable text: only when it holds a link. */
export const linkHint = (text: string, hint: string): string | undefined => findLinks(text).length > 0 ? hint : undefined
