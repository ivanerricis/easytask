import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { addDays, toDueDate } from "@/lib/due-date"
import { weekStartOf } from "@/lib/due-agenda"
import type { DueTask } from "@/db/queries/due"

const { getDBDueTasks } = vi.hoisted(() => ({ getDBDueTasks: vi.fn() }))
vi.mock("@/db/queries/due", () => ({ getDBDueTasks }))

import { DueAgenda } from "./DueAgenda"

const today = toDueDate(new Date())
const monday = weekStartOf(today)
const task = (id: number, text: string, due_date: string, extra: Partial<DueTask> = {}): DueTask => ({
    id, text, due_date, due_time: null, noteID: 7, noteName: "Roadmap", sectionTitle: "To do", groupName: null, workspaceID: 1, workspaceName: "Launch", ...extra,
})

beforeEach(() => { getDBDueTasks.mockReset() })

describe("DueAgenda", () => {
    it("shows the tasks of the week by day with their path, and the older overdue ones in a block on top", async () => {
        getDBDueTasks.mockResolvedValue([task(1, "Very old", addDays(monday, -10)), task(2, "This week", addDays(monday, 2), { due_time: "10:00" })])
        render(<DueAgenda workspaceId={1} onOpenTask={() => undefined} />)
        await screen.findByText("Very old")
        const [overdue] = screen.getAllByRole("region")
        expect(overdue).toHaveAttribute("data-due-section", "overdue")
        expect(overdue).toHaveTextContent("Very old")
        expect(screen.getByText("This week").closest("section")).toHaveAttribute("data-due-day", addDays(monday, 2))
        expect(screen.getAllByText("Roadmap › To do")).toHaveLength(2)
        expect(document.querySelector("[data-due-empty]")).not.toBeNull()
        expect(getDBDueTasks).toHaveBeenCalledWith(addDays(monday, 6), 1)
    })

    it("opens a task on click and on Enter", async () => {
        const user = userEvent.setup()
        const onOpenTask = vi.fn()
        getDBDueTasks.mockResolvedValue([task(2, "Open me", today)])
        render(<DueAgenda onOpenTask={onOpenTask} />)
        const row = await screen.findByRole("button", { name: /Open me/ })
        await user.click(row)
        row.focus()
        await user.keyboard("{Enter}")
        expect(onOpenTask).toHaveBeenCalledTimes(2)
        expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 2, noteID: 7 }))
    })

    it("changes week with the buttons and the arrow keys, and Today (or Home) comes back", async () => {
        const user = userEvent.setup()
        getDBDueTasks.mockResolvedValue([])
        render(<DueAgenda onOpenTask={() => undefined} />)
        const range = await screen.findByTestId("due-range")
        const first = range.textContent
        const today_ = screen.getByRole("button", { name: "Oggi" })
        expect(today_).toBeDisabled()
        await user.click(screen.getByRole("button", { name: "Settimana successiva" }))
        await waitFor(() => expect(getDBDueTasks).toHaveBeenLastCalledWith(addDays(monday, 13), undefined))
        expect(range.textContent).not.toBe(first)
        expect(today_).toBeEnabled()
        await user.click(today_)
        expect(range.textContent).toBe(first)
        screen.getByRole("button", { name: "Settimana precedente" }).focus()
        await user.keyboard("{ArrowRight}{ArrowRight}")
        await waitFor(() => expect(getDBDueTasks).toHaveBeenLastCalledWith(addDays(monday, 20), undefined))
        await user.keyboard("{Home}")
        expect(range.textContent).toBe(first)
    })
})
