import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MarkdownText } from "./markdown-text"

const openUrl = vi.fn()
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (url: string) => openUrl(url) }))

describe("MarkdownText", () => {
    beforeEach(() => { openUrl.mockReset(); openUrl.mockResolvedValue(undefined) })

    it("draws bold, italic and the three kinds of list", () => {
        const { container } = render(<MarkdownText text={"**b** and *i*\n- one\n1. two\n- [x] three"} />)
        expect(container.querySelector("strong")).toHaveTextContent("b")
        expect(container.querySelector("em")).toHaveTextContent("i")
        expect(container.querySelectorAll("ul")).toHaveLength(2)
        expect(container.querySelector("ol li")).toHaveTextContent("two")
        expect(screen.getByRole("checkbox")).toBeChecked()
    })

    it("never turns html into elements", () => {
        const { container } = render(<MarkdownText text={'<img src=x onerror="alert(1)"> <script>1</script>'} />)
        expect(container.querySelector("img, script")).toBeNull()
        expect(container).toHaveTextContent('<img src=x onerror="alert(1)"> <script>1</script>')
    })

    it("calls onToggle with the line of the clicked box and does not bubble the click", async () => {
        const user = userEvent.setup()
        const onToggle = vi.fn()
        const onClick = vi.fn()
        render(<div onClick={onClick}><MarkdownText text={"title\n- [ ] a\n- [x] b"} onToggle={onToggle} /></div>)
        await user.click(screen.getAllByRole("checkbox")[1])
        expect(onToggle).toHaveBeenCalledWith(2)
        expect(onClick).not.toHaveBeenCalled()
    })

    it("opens a link only with Ctrl+click", async () => {
        const user = userEvent.setup()
        render(<MarkdownText text="go to https://example.com now" />)
        await user.click(screen.getByText("https://example.com"))
        expect(openUrl).not.toHaveBeenCalled()
        await user.keyboard("{Control>}")
        await user.click(screen.getByText("https://example.com"))
        await user.keyboard("{/Control}")
        expect(openUrl).toHaveBeenCalledWith("https://example.com")
    })
})

describe("MarkdownText rich (a page)", () => {
    beforeEach(() => { openUrl.mockReset(); openUrl.mockResolvedValue(undefined) })

    it("draws headings, code, quotes, rules and inline code", () => {
        const { container } = render(<MarkdownText rich text={"# One\n## Two\n> quoted\n---\n```\nlet a = 1\n```\nuse `code`"} />)
        expect(container.querySelector("h1")).toHaveTextContent("One")
        expect(container.querySelector("h2")).toHaveTextContent("Two")
        expect(container.querySelector("blockquote")).toHaveTextContent("quoted")
        expect(container.querySelector("hr")).not.toBeNull()
        expect(container.querySelector("pre code")).toHaveTextContent("let a = 1")
        expect(container.querySelector("p code")).toHaveTextContent("code")
    })

    it("keeps a description plain: no headings without the rich mode", () => {
        const { container } = render(<MarkdownText text={"# One"} />)
        expect(container.querySelector("h1")).toBeNull()
    })

    it("opens a [text](address) link only with Ctrl+click, and never builds html", async () => {
        const user = userEvent.setup()
        const { container } = render(<MarkdownText rich text={'[docs](https://example.com) <iframe src="x"></iframe>'} />)
        expect(container.querySelector("iframe, a")).toBeNull()
        await user.click(screen.getByText("docs"))
        expect(openUrl).not.toHaveBeenCalled()
        await user.keyboard("{Control>}")
        await user.click(screen.getByText("docs"))
        await user.keyboard("{/Control}")
        expect(openUrl).toHaveBeenCalledWith("https://example.com")
    })
})
