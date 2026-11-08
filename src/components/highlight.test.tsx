import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Highlight } from "./highlight"

describe("Highlight", () => {
    it("renders the plain text without marks for an empty query or no match", () => {
        const { container, rerender } = render(<p><Highlight text="Compra il latte" query="" /></p>)
        expect(container.querySelector("mark")).toBeNull()
        expect(container).toHaveTextContent("Compra il latte")
        rerender(<p><Highlight text="Compra il latte" query="pane" /></p>)
        expect(container.querySelector("mark")).toBeNull()
    })

    it("wraps every match, ignoring case and accents, and keeps the original text", () => {
        const { container } = render(<p><Highlight text="Perché il PERCHE" query="perche" /></p>)
        const marks = [...container.querySelectorAll("mark")]
        expect(marks.map(mark => mark.textContent)).toEqual(["Perché", "PERCHE"])
        expect(container).toHaveTextContent("Perché il PERCHE")
    })

    it("gives the stronger style and data-active only to the current occurrence", () => {
        const { container } = render(<p><Highlight text="aa bb aa" query="aa" active={1} /></p>)
        const [first, second] = [...container.querySelectorAll("mark")]
        expect(first).not.toHaveAttribute("data-active")
        expect(second).toHaveAttribute("data-active", "true")
        expect(second.className).toContain("bg-highlight-active")
        expect(first.className).toContain("bg-highlight text-highlight-foreground")
        expect(first.className).not.toContain("bg-highlight-active")
        expect(first.className + second.className).not.toMatch(/yellow|orange|dark:/)
    })
})
