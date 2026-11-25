import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { DueTask } from "@/db/queries/due"
import { STATS_WEEKS, type WorkspaceStats } from "@/lib/workspace-stats"
import { openTaskStore } from "@/lib/open-task-request"
import { StatsView } from "./StatsView"

const state: { stats: WorkspaceStats | null } = { stats: null }
const openNote = vi.fn()
vi.mock("./use-workspace-stats", () => ({ useWorkspaceStats: () => state.stats }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1 } }) }))
vi.mock("@/contexts/use-tabs", () => ({ useTabsActions: () => ({ openNote }) }))

const due = (id: number, date = "2026-11-10"): DueTask => ({
    id, text: `Task ${id}`, due_date: date, due_time: null, noteID: 7, noteName: "Roadmap", sectionTitle: "S", groupName: null, workspaceID: 1, workspaceName: "W",
})

const stats = (overrides: Partial<WorkspaceStats> = {}): WorkspaceStats => ({
    weeks: Array.from({ length: STATS_WEEKS }, (_, i) => ({ start: `2026-0${(i % 9) + 1}-01`, count: i })),
    completedInRange: 66,
    doneTotal: 6,
    openTotal: 4,
    notes: [{ id: 7, name: "Roadmap", done: 6, total: 10, lastEdit: "2026-11-20" }],
    stale: [{ id: 8, name: "Old draft", done: 0, total: 0, lastEdit: "2026-01-01", days: 120 }],
    overdue: [],
    dueThisWeek: [],
    ...overrides,
})

beforeEach(() => { openNote.mockClear(); openTaskStore.set(null) })

describe("StatsView", () => {
    it("shows a loading message until the statistics arrive", () => {
        state.stats = null
        render(<StatsView />)
        expect(screen.getByRole("status")).toBeInTheDocument()
    })

    it("draws the sections: chart, progress, stale notes and empty lists", () => {
        state.stats = stats()
        render(<StatsView />)
        expect(screen.getByRole("list", { name: /12/ })).toBeInTheDocument()
        expect(screen.getByText("Roadmap")).toBeInTheDocument()
        expect(screen.getByText("6/10")).toBeInTheDocument()
        expect(screen.getByText("Old draft")).toBeInTheDocument()
        expect(screen.getByText("120 g")).toBeInTheDocument()
        expect(screen.getByText("Nessun task scaduto")).toBeInTheDocument()
        expect(screen.getByText("Niente in scadenza questa settimana")).toBeInTheDocument()
    })

    it("opens a note in a tab when it is chosen", async () => {
        state.stats = stats()
        render(<StatsView />)
        await userEvent.click(screen.getByRole("button", { name: /Roadmap/ }))
        expect(openNote).toHaveBeenCalledWith(7)
    })

    it("shows the first overdue tasks and all of them on request", async () => {
        state.stats = stats({ overdue: Array.from({ length: 9 }, (_, i) => due(i + 1)) })
        render(<StatsView />)
        expect(screen.getAllByTestId("stats-task")).toHaveLength(6)
        await userEvent.click(screen.getByRole("button", { name: "Mostra tutti (9)" }))
        expect(screen.getAllByTestId("stats-task")).toHaveLength(9)
        await userEvent.click(screen.getByRole("button", { name: "Mostra meno" }))
        expect(screen.getAllByTestId("stats-task")).toHaveLength(6)
    })

    it("lists the tasks due this week and says so when there are no notes", () => {
        state.stats = stats({ dueThisWeek: [due(3, "2026-11-26")], notes: [], stale: [] })
        render(<StatsView />)
        expect(screen.getByText("In scadenza questa settimana (1)")).toBeInTheDocument()
        expect(screen.getByText("Task 3")).toBeInTheDocument()
        expect(screen.getByText("Ancora nessuna nota")).toBeInTheDocument()
        expect(screen.getByText("Tutte le note sono state modificate di recente")).toBeInTheDocument()
    })

    it("asks to open the task on its note when an overdue task is clicked", async () => {
        state.stats = stats({ overdue: [due(5)] })
        render(<StatsView />)
        await userEvent.click(screen.getByTestId("stats-task"))
        expect(openTaskStore.getState()).toMatchObject({ workspaceId: 1, noteId: 7, taskId: 5 })
    })
})
