import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ColorPalette } from "./color-palette"

const customPicker = (container: HTMLElement) => container.querySelector("input[type=color]") as HTMLInputElement

describe("ColorPalette", () => {
    it("picks the color of a swatch at once", async () => {
        const onPick = vi.fn()
        render(<ColorPalette onPick={onPick} />)
        await userEvent.click(screen.getByRole("radio", { name: "Colore Rosso" }))
        expect(onPick).toHaveBeenCalledWith("#e6194b", expect.anything())
    })

    it("marks the swatch of the current color", () => {
        render(<ColorPalette value="#3CB44B" onPick={vi.fn()} />)
        expect(screen.getByRole("radio", { name: "Colore Verde" })).toHaveAttribute("aria-checked", "true")
        expect(screen.getByRole("radio", { name: "Colore Rosso" })).toHaveAttribute("aria-checked", "false")
    })

    it("shows a check on the selected swatch only, in a color that contrasts with it", () => {
        const { rerender } = render(<ColorPalette value="#000075" onPick={vi.fn()} />)
        expect(screen.getByRole("radio", { name: "Colore Blu notte" }).querySelector("svg")).toHaveStyle({ color: "#ffffff" })
        expect(screen.getAllByRole("radio").filter(r => r.querySelector("svg"))).toHaveLength(1)
        rerender(<ColorPalette value="#d9bf01" onPick={vi.fn()} />)
        expect(screen.getByRole("radio", { name: "Colore Giallo" }).querySelector("svg")).toHaveStyle({ color: "#171717" })
        expect(screen.getAllByRole("radio").filter(r => r.querySelector("svg"))).toHaveLength(1)
    })

    it("shows a color outside the palette in the custom square", () => {
        const { container } = render(<ColorPalette value="#123456" onPick={vi.fn()} />)
        expect(customPicker(container)).toHaveValue("#123456")
        expect(screen.getAllByRole("radio").every(radio => radio.getAttribute("aria-checked") === "false")).toBe(true)
    })

    it("picks the custom color once the picker is closed (change), not while it moves (input)", () => {
        const onPick = vi.fn()
        const { container } = render(<ColorPalette onPick={onPick} />)
        const picker = customPicker(container)
        fireEvent.input(picker, { target: { value: "#00ff00" } })
        expect(onPick).not.toHaveBeenCalled()
        fireEvent.change(picker, { target: { value: "#00ff00" } })
        expect(onPick).toHaveBeenCalledWith("#00ff00")
    })

    it("names the custom picker for the screen readers", () => {
        render(<ColorPalette onPick={vi.fn()} />)
        expect(screen.getByLabelText("Scegli un altro colore")).toBeInTheDocument()
    })
})
