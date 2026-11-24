import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const openUrl = vi.hoisted(() => vi.fn())
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }))

import { LinkedText } from "./linked-text"
import { openLinkAtCaret } from "@/lib/link-click"

beforeEach(() => openUrl.mockReset().mockResolvedValue(undefined))

describe("LinkedText", () => {
    it("underlines the links and keeps the rest as text", () => {
        render(<LinkedText text="see https://a.io, ok" label="text" />)
        const link = screen.getByText("https://a.io")
        expect(link).toHaveAttribute("data-text-link")
        expect(link.className).toContain("underline")
        expect(link).toHaveAttribute("title", "Ctrl+clic per aprire")
        expect(screen.getByRole("textbox")).toHaveTextContent("see https://a.io, ok")
    })

    it("opens the link on Ctrl+click and does not run the click of the text", () => {
        const onClick = vi.fn()
        render(<LinkedText text="go https://a.io" label="text" onClick={onClick} />)
        fireEvent.click(screen.getByText("https://a.io"), { ctrlKey: true })
        expect(openUrl).toHaveBeenCalledWith("https://a.io")
        expect(onClick).not.toHaveBeenCalled()
    })

    it("leaves a plain click to the text (it starts the rename) and opens nothing", () => {
        const onClick = vi.fn()
        render(<LinkedText text="go https://a.io" label="text" onClick={onClick} />)
        fireEvent.click(screen.getByText("https://a.io"))
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(openUrl).not.toHaveBeenCalled()
    })

    it("does not open a click on the plain part of the text", () => {
        render(<LinkedText text="go https://a.io" label="text" />)
        fireEvent.click(screen.getByRole("textbox"), { ctrlKey: true })
        expect(openUrl).not.toHaveBeenCalled()
    })
})

describe("openLinkAtCaret", () => {
    const field = (value: string, caret: number) => {
        render(<textarea aria-label="f" defaultValue={value} onClick={openLinkAtCaret} />)
        const area = screen.getByLabelText("f") as HTMLTextAreaElement
        area.setSelectionRange(caret, caret)
        return area
    }

    it("opens the link under the caret on Ctrl+click", () => {
        fireEvent.click(field("a https://a.io b", 5), { ctrlKey: true })
        expect(openUrl).toHaveBeenCalledWith("https://a.io")
    })

    it("does nothing without Ctrl or outside a link", () => {
        fireEvent.click(field("a https://a.io b", 5))
        expect(openUrl).not.toHaveBeenCalled()
    })

    it("does nothing on Ctrl+click outside a link", () => {
        fireEvent.click(field("a https://a.io b", 0), { ctrlKey: true })
        expect(openUrl).not.toHaveBeenCalled()
    })
})
