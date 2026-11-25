import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useArchiveCount, useDueCount, useTemplateCount, useTrashCount } from "./use-tool-counts"

const actions = {
    countTemplates: vi.fn().mockResolvedValue(2),
    getArchiveCount: vi.fn().mockResolvedValue(3),
    getTrashCount: vi.fn().mockResolvedValue(4),
}
const due = { tasks: null as unknown[] | null }
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => actions, useWorkspaceVersion: () => 0 }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 7 } }) }))
vi.mock("@/hooks/use-now", () => ({ useNow: () => new Date("2026-01-10T12:00:00") }))
vi.mock("@/components/due/use-due-tasks", () => ({
    useDueTasks: () => due.tasks,
    countDueNow: (tasks: unknown[]) => tasks.length,
}))

describe("tool counts", () => {
    it("counts templates, archive and trash of the current workspace", async () => {
        const templates = renderHook(() => useTemplateCount())
        const archive = renderHook(() => useArchiveCount())
        const trash = renderHook(() => useTrashCount())
        await waitFor(() => expect(templates.result.current).toBe(2))
        await waitFor(() => expect(archive.result.current).toBe(3))
        await waitFor(() => expect(trash.result.current).toBe(4))
        expect(actions.countTemplates).toHaveBeenCalledWith(7)
    })

    it("counts the due tasks, 0 while they load", () => {
        due.tasks = null
        expect(renderHook(() => useDueCount()).result.current).toBe(0)
        due.tasks = [{}, {}]
        expect(renderHook(() => useDueCount()).result.current).toBe(2)
    })
})
