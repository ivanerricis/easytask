import { render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { addDays, toDueDate } from "@/lib/due-date"
import type { DueTask } from "@/db/queries/due"

const { getDBDueTasks } = vi.hoisted(() => ({ getDBDueTasks: vi.fn() }))
vi.mock("@/db/queries/due", () => ({ getDBDueTasks }))

import { DueTasksList } from "./DueTasksList"
import { countDueNow } from "./use-due-tasks"

const today = toDueDate(new Date())
const task = (id: number, text: string, offset: number, extra: Partial<DueTask> = {}): DueTask => ({
    id, text, due_date: addDays(today, offset), due_time: null, noteID: 1, noteName: "Roadmap", workspaceID: 1, workspaceName: "Launch", ...extra,
})

beforeEach(() => { getDBDueTasks.mockReset() })

describe("DueTasksList", () => {
    it("groups the tasks in overdue, today and the next 7 days, each with its note", async () => {
        getDBDueTasks.mockResolvedValue([task(1, "Late", -2), task(2, "Now", 0), task(3, "Soon", 3)])
        render(<DueTasksList workspaceId={1} />)
        await screen.findByText("Late")
        const sections = screen.getAllByRole("region")
        expect(sections.map(section => section.getAttribute("data-due-section"))).toEqual(["overdue", "today", "week"])
        expect(within(sections[0]).getByText("Late")).toBeInTheDocument()
        expect(within(sections[1]).getByText("Now")).toBeInTheDocument()
        expect(within(sections[2]).getByText("Soon")).toBeInTheDocument()
        expect(screen.getAllByText("Roadmap")).toHaveLength(3)
        expect(getDBDueTasks).toHaveBeenCalledWith(addDays(today, 7), 1)
    })

    it("names the workspace when it lists every workspace", async () => {
        getDBDueTasks.mockResolvedValue([task(1, "Late", -2)])
        render(<DueTasksList showWorkspace />)
        await screen.findByText("Launch › Roadmap")
        expect(getDBDueTasks).toHaveBeenCalledWith(addDays(today, 7), undefined)
    })

    it("says so when nothing is due", async () => {
        getDBDueTasks.mockResolvedValue([])
        render(<DueTasksList />)
        await waitFor(() => expect(screen.getByText(/Nessun task scaduto/)).toBeInTheDocument())
    })
})

describe("countDueNow", () => {
    it("counts the overdue tasks and the ones due today, not the later ones", () => {
        expect(countDueNow([task(1, "a", -1), task(2, "b", 0, { due_time: "23:59" }), task(3, "c", 1), task(4, "d", 9)], new Date())).toBe(2)
    })
})
