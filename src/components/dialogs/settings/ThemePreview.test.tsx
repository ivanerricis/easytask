import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import { ThemePreview } from "./ThemePreview"

const nord = BUILTIN_THEMES.find(theme => theme.id === "nord")!
const light = BUILTIN_THEMES.find(theme => theme.id === "light")!

describe("ThemePreview", () => {
    it("is an image named after the theme, with its variables and base class", () => {
        render(<ThemePreview theme={nord} />)
        const preview = screen.getByRole("img", { name: "Anteprima del tema Nord" })
        expect(preview).toHaveClass("dark")
        expect(preview.style.getPropertyValue("--background")).toBe("#2e3440")
        expect(preview.style.getPropertyValue("--primary")).toBe("#88c0d0")
    })

    it("uses the accent override instead of the accent of the theme", () => {
        render(<ThemePreview theme={light} accent="#336699" />)
        const preview = screen.getByRole("img")
        expect(preview).toHaveClass("light")
        expect(preview.style.getPropertyValue("--primary")).toBe("#336699")
    })

    it("draws a small thumbnail", () => {
        render(<ThemePreview theme={light} size="sm" />)
        expect(screen.getByRole("img")).toHaveClass("w-20")
    })

    it("renders nothing for an invalid theme", () => {
        const { container } = render(<ThemePreview theme={{ ...light, colors: { ...light.colors, border: "red" } }} />)
        expect(container).toBeEmptyDOMElement()
    })
})
