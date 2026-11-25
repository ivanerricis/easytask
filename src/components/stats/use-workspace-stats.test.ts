import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import type { WorkspaceStats } from "@/lib/workspace-stats"
import { useWorkspaceStats } from "./use-workspace-stats"

const empty: WorkspaceStats = { weeks: [], completedInRange: 0, doneTotal: 0, openTotal: 0, notes: [], stale: [], overdue: [], dueThisWeek: [] }
const load = vi.fn()
vi.mock("@/db/queries/stats", () => ({ getDBWorkspaceStats: (...args: unknown[]) => load(...args) }))

describe("useWorkspaceStats", () => {
    it("is null without a workspace and loads the statistics of the workspace", async () => {
        load.mockResolvedValue(empty)
        expect(renderHook(() => useWorkspaceStats(undefined)).result.current).toBeNull()
        expect(load).not.toHaveBeenCalled()
        const { result } = renderHook(() => useWorkspaceStats(4))
        expect(result.current).toBeNull()
        await waitFor(() => expect(result.current).toBe(empty))
        expect(load).toHaveBeenCalledWith(4, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    })

    it("reports a failed load and stays empty", async () => {
        load.mockRejectedValue(new Error("boom"))
        const { result } = renderHook(() => useWorkspaceStats(5))
        await waitFor(() => expect(load).toHaveBeenCalled())
        expect(result.current).toBeNull()
    })
})
