import { render, screen } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createProgressToast } from "./progress-toast"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())

beforeEach(() => vi.clearAllMocks())

describe("createProgressToast", () => {
    it("shows nothing until the first report, then updates the same toast and dismisses it", () => {
        vi.mocked(toast.loading).mockReturnValue("t1")
        const progress = createProgressToast("Esportazione dei file")
        progress.dismiss()
        expect(toast.dismiss).not.toHaveBeenCalled()

        progress.update({ done: 0, total: 100 })
        expect(toast.loading).toHaveBeenCalledWith(expect.anything(), { id: undefined, duration: Infinity })
        progress.update({ done: 50, total: 100 })
        expect(toast.loading).toHaveBeenLastCalledWith(expect.anything(), { id: "t1", duration: Infinity })

        const message = vi.mocked(toast.loading).mock.calls[1][0]
        render(<>{message}</>)
        expect(screen.getByText("50%")).toBeInTheDocument()
        expect(screen.getByRole("progressbar", { name: "Esportazione dei file" })).toBeInTheDocument()

        progress.dismiss()
        expect(toast.dismiss).toHaveBeenCalledWith("t1")
    })

    it("shows 0% instead of NaN when there is nothing to copy", () => {
        const progress = createProgressToast("X")
        progress.update({ done: 0, total: 0 })
        render(<>{vi.mocked(toast.loading).mock.calls[0][0]}</>)
        expect(screen.getByText("0%")).toBeInTheDocument()
    })
})
