import { openUrl } from "@tauri-apps/plugin-opener"

/** The only schemes a link of a task can open: never file:, javascript: or anything else. */
const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "mailto:"])

// A candidate runs from the scheme to the next space or quote/angle bracket; the trailing punctuation is trimmed afterwards
const CANDIDATE = /\b(?:https?:\/\/|mailto:)[^\s<>"`]+/gi

const TRAILING_PUNCTUATION = /[.,;:!?'*_~]$/
const PAIRS: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" }

const count = (text: string, char: string) => text.split(char).length - 1

/** Drops what belongs to the sentence and not to the link: trailing punctuation and a closing bracket that has no opening one in the link. */
function trimCandidate(candidate: string): string {
    let url = candidate
    for (;;) {
        const last = url.slice(-1)
        const opening = PAIRS[last]
        if (TRAILING_PUNCTUATION.test(url)) url = url.slice(0, -1)
        else if (opening && count(url, last) > count(url, opening)) url = url.slice(0, -1)
        else return url
    }
}

/** Whether `url` is a link that may be opened: an http(s) address with a host, or a mailto: with an address. */
export function isSafeUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        if (!SAFE_PROTOCOLS.has(parsed.protocol)) return false
        return parsed.protocol === "mailto:" ? parsed.pathname.length > 0 : parsed.hostname.length > 0
    } catch {
        return false
    }
}

export type TextLink = {
    /** Offset of the first character of the link in the text. */
    start: number
    /** Offset after the last character of the link. */
    end: number
    url: string
}

/** The safe links in a text, in order. */
export function findLinks(text: string): TextLink[] {
    const links: TextLink[] = []
    for (const match of text.matchAll(CANDIDATE)) {
        const url = trimCandidate(match[0])
        if (isSafeUrl(url)) links.push({ start: match.index, end: match.index + url.length, url })
    }
    return links
}

/** The link that covers the character at `offset` (a caret at its end counts), or null. */
export function linkAt(text: string, offset: number): TextLink | null {
    return findLinks(text).find(link => offset >= link.start && offset <= link.end) ?? null
}

/** Opens a link in the system browser (the opener permission of the app allows http, https and mailto). Refuses any other scheme. */
export async function openLink(url: string): Promise<void> {
    if (!isSafeUrl(url)) return
    await openUrl(url)
}

/** Whether a click is the one that follows a link: Ctrl (Cmd on macOS) and the main button. */
export const isLinkClick = (event: { ctrlKey: boolean, metaKey: boolean, button: number }): boolean =>
    event.button === 0 && (event.ctrlKey || event.metaKey)
