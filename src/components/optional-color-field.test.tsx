import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { OptionalColorField } from "./optional-color-field"

describe("OptionalColorField", () => {
    it("is a plain + button without a color, that opens the palette of the menus", async () => {
        render(<OptionalColorField value={undefined} onChange={vi.fn()} />)
        const button = screen.getByRole("button", { name: "Aggiungi colore" })
        expect(button.style.backgroundColor).toBe("")
        expect(screen.queryByRole("radio", { name: "Colore Rosso" })).not.toBeInTheDocument()
        await userEvent.click(button)
        expect(screen.getByRole("radio", { name: "Colore Rosso" })).toBeInTheDocument()
    })

    it("takes the color of a swatch and closes the palette", async () => {
        const onChange = vi.fn()
        render(<OptionalColorField value={undefined} onChange={onChange} />)
        await userEvent.click(screen.getByRole("button", { name: "Aggiungi colore" }))
        await userEvent.click(screen.getByRole("radio", { name: "Colore Blu" }))
        expect(onChange).toHaveBeenCalledWith("#4363d8")
        expect(screen.queryByRole("radio", { name: "Colore Blu" })).not.toBeInTheDocument()
    })

    it("draws the icon in the color that contrasts with the chosen one", () => {
        const { rerender } = render(<OptionalColorField value="#000075" onChange={vi.fn()} />)
        expect(screen.getByRole("button", { name: "Cambia colore" }).querySelector("svg")).toHaveStyle({ color: "#ffffff" })
        rerender(<OptionalColorField value="#d9bf01" onChange={vi.fn()} />)
        expect(screen.getByRole("button", { name: "Cambia colore" }).querySelector("svg")).toHaveStyle({ color: "#171717" })
    })

    it("paints the button with the chosen color and marks it in the palette", async () => {
        render(<OptionalColorField value="#4363d8" onChange={vi.fn()} />)
        const button = screen.getByRole("button", { name: "Cambia colore" })
        expect(button).toHaveStyle({ backgroundColor: "#4363d8" })
        await userEvent.click(button)
        expect(screen.getByRole("radio", { name: "Colore Blu" })).toHaveAttribute("aria-checked", "true")
    })

    it("removes the color with Nessun colore", async () => {
        const onChange = vi.fn()
        render(<OptionalColorField value="#4363d8" onChange={onChange} />)
        await userEvent.click(screen.getByRole("button", { name: "Cambia colore" }))
        await userEvent.click(screen.getByRole("button", { name: "Nessun colore" }))
        expect(onChange).toHaveBeenCalledWith(undefined)
    })
})
