import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { addDays, toDueDate } from "@/lib/due-date"
import { DueBadge } from "./DueBadge"
import { DueEditor } from "./DueEditor"

const today = toDueDate(new Date())

describe("DueBadge", () => {
    it("shows nothing for a task without a due date", () => {
        render(<DueBadge task={{ due_date: null }} />)
        expect(screen.queryByTestId("due-badge")).toBeNull()
    })

    it("is neutral for a date far away and says it in its accessible name", () => {
        render(<DueBadge task={{ due_date: addDays(today, 30) }} />)
        const badge = screen.getByTestId("due-badge")
        expect(badge).toHaveAttribute("data-due-status", "later")
        expect(badge).toHaveAccessibleName(/^Scade /)
    })

    it("marks today and tomorrow as soon, with the word and not only the color", () => {
        render(<>
            <DueBadge task={{ due_date: today, due_time: "23:59" }} />
            <DueBadge task={{ due_date: addDays(today, 1) }} />
        </>)
        const [first, second] = screen.getAllByTestId("due-badge")
        expect(first).toHaveAttribute("data-due-status", "today")
        expect(first).toHaveTextContent("Oggi")
        expect(second).toHaveAttribute("data-due-status", "tomorrow")
        expect(second).toHaveTextContent("Domani")
    })

    it("marks a past date as overdue, with its own icon and name", () => {
        render(<DueBadge task={{ due_date: addDays(today, -1) }} />)
        const badge = screen.getByTestId("due-badge")
        expect(badge).toHaveAttribute("data-due-status", "overdue")
        expect(badge).toHaveTextContent("Ieri")
        expect(badge).toHaveAccessibleName(/^Scaduto: /)
        expect(badge).toHaveClass("text-destructive")
    })

    it("a completed task is never overdue", () => {
        render(<DueBadge task={{ due_date: addDays(today, -5), completed: true }} />)
        const badge = screen.getByTestId("due-badge")
        expect(badge).toHaveAttribute("data-due-status", "done")
        expect(badge).not.toHaveClass("text-destructive")
    })
})

describe("DueEditor", () => {
    it("saves the picked day and time, and clears an existing date", async () => {
        const user = userEvent.setup()
        const onSave = vi.fn()
        const onClear = vi.fn()
        render(<DueEditor value={{ date: null, time: null }} onSave={onSave} onClear={onClear} />)
        expect(screen.getByRole("button", { name: "Imposta" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Rimuovi scadenza" })).toBeDisabled()
        await user.click(screen.getByRole("button", { name: "Domani" }))
        await user.type(screen.getByLabelText("Ora"), "09:30")
        await user.click(screen.getByRole("button", { name: "Imposta" }))
        expect(onSave).toHaveBeenCalledWith({ date: addDays(today, 1), time: "09:30" })
        expect(onClear).not.toHaveBeenCalled()
    })

    it("starts from the current value, can drop the time and can remove the date", async () => {
        const user = userEvent.setup()
        const onSave = vi.fn()
        const onClear = vi.fn()
        render(<DueEditor value={{ date: addDays(today, 3), time: "18:00" }} onSave={onSave} onClear={onClear} />)
        expect(screen.getByLabelText("Ora")).toHaveValue("18:00")
        await user.click(screen.getByRole("button", { name: "Nessuna ora" }))
        await user.click(screen.getByRole("button", { name: "Imposta" }))
        expect(onSave).toHaveBeenCalledWith({ date: addDays(today, 3), time: null })
        await user.click(screen.getByRole("button", { name: "Rimuovi scadenza" }))
        expect(onClear).toHaveBeenCalledTimes(1)
    })
})
