import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FileText } from "lucide-react"
import { ItemRow, ItemRowActions, ListEmpty, ListSkeleton } from "./item-list-parts"

describe("ItemRow", () => {
    it("scrive i dettagli in text-sm (non più piccoli di 14px)", () => {
        render(<ItemRow icon={FileText} name="Nota" details={["In: Cartella", "Eliminata il 3 marzo"]}><button>Ripristina</button></ItemRow>)
        for (const line of ["In: Cartella", "Eliminata il 3 marzo"]) {
            expect(screen.getByText(line)).toHaveClass("text-sm")
            expect(screen.getByText(line)).not.toHaveClass("text-xs")
        }
    })
})

describe("ListSkeleton", () => {
    it("è occupato, mostra Caricamento e non anima con movimento ridotto", async () => {
        render(<ListSkeleton />)
        const status = screen.getByRole("status")
        expect(status).toHaveAttribute("aria-busy", "true")
        // The skeleton (and the visible text) appear after a short delay; the text is read out from the start
        expect(screen.getByText("Caricamento")).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText("Caricamento")).toHaveClass("text-sm"))
        expect(status.querySelector("[data-slot=skeleton]")).toHaveClass("motion-reduce:animate-none")
    })
})

describe("ItemRowActions", () => {
    it("renders the two buttons with their names and calls their handlers", async () => {
        const onRestore = vi.fn()
        const onRemove = vi.fn()
        render(
            <ItemRowActions
                restore={{ icon: FileText, tooltip: "Ripristina", ariaLabel: "Ripristina Nota", onClick: onRestore }}
                remove={{ icon: FileText, tooltip: "Elimina", ariaLabel: "Elimina Nota", onClick: onRemove }}
            />,
        )
        await userEvent.click(screen.getByRole("button", { name: "Ripristina Nota" }))
        await userEvent.click(screen.getByRole("button", { name: "Elimina Nota" }))
        expect(onRestore).toHaveBeenCalledTimes(1)
        expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it("disables both when disabled", () => {
        const action = { icon: FileText, tooltip: "x", onClick: vi.fn() }
        render(<ItemRowActions disabled restore={{ ...action, ariaLabel: "A" }} remove={{ ...action, ariaLabel: "B" }} />)
        expect(screen.getByRole("button", { name: "A" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "B" })).toBeDisabled()
    })
})

describe("ListEmpty", () => {
    it("shows the message", () => {
        render(<ListEmpty>Vuoto</ListEmpty>)
        expect(screen.getByText("Vuoto")).toHaveClass("text-muted-foreground")
    })
})
