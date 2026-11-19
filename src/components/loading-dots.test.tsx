import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LoadingDots } from "@/components/loading-dots"
import { LoadingPage } from "@/components/pages/loading-page"
import { DraftSaveStatus } from "@/pages/workspacePage/components/template-draft/DraftSaveStatus"

describe("LoadingDots", () => {
    it("draws three dots, hidden from the screen readers", () => {
        render(<LoadingDots />)
        const dots = screen.getByTestId("loading-dots")
        expect(dots).toHaveAttribute("aria-hidden", "true")
        expect(dots.querySelectorAll(".loading-dot")).toHaveLength(3)
    })

    it("follows the loading text instead of being part of it", () => {
        render(<DraftSaveStatus status="saving" onRetry={() => {}} />)
        expect(screen.getByTestId("loading-dots")).toBeInTheDocument()
        expect(screen.getByRole("status").textContent).not.toContain("…")
    })

    it("is in the loading page once the delay has passed, the text is there from the start", async () => {
        render(<LoadingPage text="Caricamento" />)
        expect(screen.getByText("Caricamento")).toBeInTheDocument()
        expect(await screen.findByTestId("loading-dots")).toBeInTheDocument()
    })
})
