import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DraftSaveStatus } from "./DraftSaveStatus"
import { TemplateTabLabel } from "./TemplateTabLabel"

describe("DraftSaveStatus", () => {
    it("shows nothing while the draft has not changed", () => {
        render(<DraftSaveStatus status="idle" onRetry={vi.fn()} />)
        expect(screen.getByRole("status")).toBeEmptyDOMElement()
    })

    it("shows the saving and saved states", () => {
        const { rerender } = render(<DraftSaveStatus status="saving" onRetry={vi.fn()} />)
        expect(screen.getByRole("status")).toHaveTextContent("Salvataggio")

        rerender(<DraftSaveStatus status="saved" onRetry={vi.fn()} />)
        expect(screen.getByRole("status")).toHaveTextContent("Salvato")
        expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })

    it("after an error it offers a retry", async () => {
        const onRetry = vi.fn()
        render(<DraftSaveStatus status="error" onRetry={onRetry} />)

        expect(screen.getByRole("status")).toHaveTextContent("Salvataggio non riuscito")
        await userEvent.click(screen.getByRole("button", { name: "Riprova" }))
        expect(onRetry).toHaveBeenCalledTimes(1)
    })
})

describe("TemplateTabLabel", () => {
    it("shows the Template badge and the name", () => {
        render(<TemplateTabLabel name="Sprint" />)
        expect(screen.getByText("Template")).toBeInTheDocument()
        expect(screen.getByText("Sprint")).toBeInTheDocument()
    })
})
