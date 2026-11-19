import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TagBadge, TagShapeSample } from "./tag-badge"

describe("TagBadge shapes", () => {
    it("is a pill by default (no shape, NULL, or a value this version does not know)", () => {
        render(<>
            <TagBadge tag={{ name: "A", color: null }} />
            <TagBadge tag={{ name: "B", color: null, shape: null }} />
            <TagBadge tag={{ name: "C", color: null, shape: "blob" as never }} />
        </>)
        for (const badge of screen.getAllByTestId("tag-badge")) {
            expect(badge).toHaveAttribute("data-shape", "pill")
            expect(badge).toHaveClass("rounded-full")
        }
    })

    it("draws a rounded rectangle with the border and tint of the color", () => {
        render(<TagBadge tag={{ name: "Rect", color: "#ff0000", shape: "rounded" }} />)
        const badge = screen.getByTestId("tag-badge")
        expect(badge).toHaveAttribute("data-shape", "rounded")
        expect(badge).toHaveClass("rounded-sm", "border-2")
        expect(badge).not.toHaveClass("rounded-full")
        expect(badge.style.backgroundColor).toMatch(/^rgba\(255, 0, 0, /)
        expect(badge.style.borderColor).toMatch(/^rgba\(255, 0, 0, /)
    })

    it("draws a dot and the name with no box at all", () => {
        render(<TagBadge tag={{ name: "Dotted", color: "#ff0000", shape: "dot" }} />)
        const badge = screen.getByTestId("tag-badge")
        expect(badge).toHaveAttribute("data-shape", "dot")
        expect(badge).toHaveTextContent("Dotted")
        expect(badge).toHaveAttribute("title", "Dotted")
        expect(badge.style.backgroundColor).toBe("")
        const dot = badge.firstElementChild as HTMLElement
        expect(dot.style.backgroundColor).toBe("rgb(255, 0, 0)")
        expect(dot).toHaveAttribute("aria-hidden", "true")
    })

    it("draws the dot of a tag without color in a neutral tone", () => {
        render(<TagBadge tag={{ name: "Plain", color: null, shape: "dot" }} />)
        expect(screen.getByTestId("tag-badge").firstElementChild).toHaveClass("bg-muted-foreground/50")
    })

    it("draws a label with a point on the left (a clipped outline and a hole), with and without color", () => {
        render(<>
            <TagBadge tag={{ name: "Colored", color: "#ff0000", shape: "tag" }} />
            <TagBadge tag={{ name: "Plain", color: null, shape: "tag" }} />
        </>)
        const [colored, plain] = screen.getAllByTestId("tag-badge")
        for (const badge of [colored, plain]) {
            expect(badge).toHaveAttribute("data-shape", "tag")
            expect(badge.className).toContain("clip-path:polygon")
            expect(badge).toHaveClass("rounded-none")
            // The hole of the label never carries text
            expect(badge.querySelector("[aria-hidden='true']")).not.toBeNull()
        }
        expect(colored).not.toHaveClass("border-2")
        expect(colored.style.backgroundColor).toMatch(/^rgba\(255, 0, 0, /)
        expect(plain.style.backgroundColor).toBe("")
        expect(plain).toHaveTextContent("Plain")
    })

    it("keeps the text color of the theme and cuts a long name in every shape", () => {
        const long = "x".repeat(100)
        render(<>
            {(["pill", "rounded", "dot", "tag"] as const).map(shape => <TagBadge key={shape} tag={{ name: long, color: "#00ff00", shape: shape === "pill" ? null : shape }} />)}
        </>)
        for (const badge of screen.getAllByTestId("tag-badge")) {
            expect(badge).toHaveClass("text-foreground", "max-w-32")
            expect(badge.querySelector(".truncate")).not.toBeNull()
        }
    })
})

describe("TagShapeSample", () => {
    it("draws every shape without text, hidden from the screen readers", () => {
        const { container } = render(<>
            {(["pill", "rounded", "dot", "tag"] as const).map(shape => <TagShapeSample key={shape} shape={shape} color="#0000ff" />)}
        </>)
        const samples = [...container.querySelectorAll("[aria-hidden='true']")]
        expect(samples).toHaveLength(4)
        expect(samples.every(sample => sample.textContent === "")).toBe(true)
        expect(samples[0]).toHaveClass("rounded-full")
        expect(samples[1]).toHaveClass("rounded-sm")
        expect((samples[2] as HTMLElement).style.backgroundColor).toBe("rgb(0, 0, 255)")
        expect(samples[3].className).toContain("clip-path:polygon")
    })
})
