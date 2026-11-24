import { beforeEach, describe, expect, it, vi } from "vitest"

const openUrl = vi.hoisted(() => vi.fn())
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }))

import { findLinks, isLinkClick, isSafeUrl, linkAt, openLink } from "./links"

const urls = (text: string) => findLinks(text).map(link => link.url)

describe("findLinks", () => {
    it("finds http, https and mailto links", () => {
        expect(urls("see https://example.com/a and http://a.org or mailto:me@x.com")).toEqual(["https://example.com/a", "http://a.org", "mailto:me@x.com"])
    })

    it("returns the offsets of the link", () => {
        expect(findLinks("go to https://a.io now")).toEqual([{ start: 6, end: 18, url: "https://a.io" }])
    })

    it("drops the trailing punctuation of the sentence", () => {
        expect(urls("Visit https://example.com.")).toEqual(["https://example.com"])
        expect(urls("a https://example.com/x, b https://e.org/y; c https://e.net?! d https://e.dev:")).toEqual(["https://example.com/x", "https://e.org/y", "https://e.net", "https://e.dev"])
    })

    it("drops a closing parenthesis that has no opening one", () => {
        expect(urls("(see https://example.com/page)")).toEqual(["https://example.com/page"])
        expect(urls("(see https://example.com/page).")).toEqual(["https://example.com/page"])
        expect(urls("[https://example.com]")).toEqual(["https://example.com"])
    })

    it("keeps balanced parentheses that belong to the link", () => {
        expect(urls("https://en.wikipedia.org/wiki/Rust_(language)")).toEqual(["https://en.wikipedia.org/wiki/Rust_(language)"])
        expect(urls("(https://en.wikipedia.org/wiki/Rust_(language))")).toEqual(["https://en.wikipedia.org/wiki/Rust_(language)"])
    })

    it("keeps the query and the fragment", () => {
        expect(urls("https://e.com/a?b=1&c=2#top")).toEqual(["https://e.com/a?b=1&c=2#top"])
    })

    it("stops at quotes and angle brackets", () => {
        expect(urls('<https://e.com/a> "https://e.org"')).toEqual(["https://e.com/a", "https://e.org"])
    })

    it("ignores other schemes and incomplete links", () => {
        expect(urls("file:///etc/passwd javascript:alert(1) ftp://x.com data:text/html,hi")).toEqual([])
        expect(urls("https:// http:// mailto: https://.")).toEqual([])
    })

    it("does not find a link inside a word", () => {
        expect(urls("nothttps://e.com")).toEqual([])
    })

    it("finds nothing in a plain text", () => {
        expect(findLinks("")).toEqual([])
        expect(findLinks("buy milk")).toEqual([])
    })
})

describe("isSafeUrl", () => {
    it("accepts only http, https and mailto", () => {
        expect(isSafeUrl("https://a.io")).toBe(true)
        expect(isSafeUrl("http://a.io")).toBe(true)
        expect(isSafeUrl("mailto:a@b.c")).toBe(true)
        expect(isSafeUrl("file:///c:/x")).toBe(false)
        expect(isSafeUrl("javascript:alert(1)")).toBe(false)
        expect(isSafeUrl("not a url")).toBe(false)
        expect(isSafeUrl("mailto:")).toBe(false)
    })
})

describe("linkAt", () => {
    it("finds the link under an offset, the end included", () => {
        const text = "a https://e.com b"
        expect(linkAt(text, 1)).toBeNull()
        expect(linkAt(text, 2)?.url).toBe("https://e.com")
        expect(linkAt(text, 15)?.url).toBe("https://e.com")
        expect(linkAt(text, 16)).toBeNull()
    })
})

describe("openLink", () => {
    beforeEach(() => openUrl.mockReset())

    it("opens a safe link", async () => {
        await openLink("https://a.io")
        expect(openUrl).toHaveBeenCalledWith("https://a.io")
    })

    it("refuses an unsafe one", async () => {
        await openLink("file:///c:/x")
        await openLink("javascript:alert(1)")
        expect(openUrl).not.toHaveBeenCalled()
    })
})

describe("isLinkClick", () => {
    it("needs Ctrl (or Cmd) and the main button", () => {
        expect(isLinkClick({ ctrlKey: true, metaKey: false, button: 0 })).toBe(true)
        expect(isLinkClick({ ctrlKey: false, metaKey: true, button: 0 })).toBe(true)
        expect(isLinkClick({ ctrlKey: false, metaKey: false, button: 0 })).toBe(false)
        expect(isLinkClick({ ctrlKey: true, metaKey: false, button: 2 })).toBe(false)
    })
})
