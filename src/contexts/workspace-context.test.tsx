import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WorkspaceProvider } from "./workspace-context"
import { useWorkspace } from "./use-workspace"
import { createDBWorkspace, getDBWorkspaces } from "@/db/queries/workspace"
import { getDBTrashedWorkspaces, purgeDBItem, restoreDBItem } from "@/db/queries/trash"
import { deferred } from "@/test/ui-render"
import { makeWorkspace } from "@/test/ui-fixtures"
import { deleteWorkspaceTabs } from "@/lib/store/tabs"
import { reportError } from "@/lib/report-error"

vi.mock("@/db/queries/workspace", () => ({
    getDBWorkspaces: vi.fn(),
    createDBWorkspace: vi.fn(),
}))

vi.mock("@/db/queries/trash", () => ({
    getDBTrashedWorkspaces: vi.fn(),
    restoreDBItem: vi.fn(),
    purgeDBItem: vi.fn(),
}))

vi.mock("@/lib/store/tabs", () => ({ deleteWorkspaceTabs: vi.fn() }))
vi.mock("@/lib/report-error", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/report-error")>()), reportError: vi.fn() }))

const wrapper = ({ children }: { children: ReactNode }) => <WorkspaceProvider>{children}</WorkspaceProvider>

describe("WorkspaceContext", () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it("throws when used outside the provider", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        expect(() => renderHook(() => useWorkspace())).toThrow(/WorkspaceProvider/)
        spy.mockRestore()
    })

    it("loads workspaces and toggles isLoading", async () => {
        const d = deferred<ReturnType<typeof makeWorkspace>[]>()
        vi.mocked(getDBWorkspaces).mockReturnValue(d.promise)
        const { result } = renderHook(() => useWorkspace(), { wrapper })
        expect(result.current.isLoading).toBe(false)

        let p!: Promise<void>
        act(() => { p = result.current.getWorkspaces() })
        expect(result.current.isLoading).toBe(true)

        await act(async () => {
            d.resolve([makeWorkspace({ id: 1 }), makeWorkspace({ id: 2, name: "B" })])
            await p
        })
        expect(result.current.isLoading).toBe(false)
        expect(result.current.workspaces.map(w => w.id)).toEqual([1, 2])
    })

    it("lists trashed workspaces without touching the active list", async () => {
        const trashed = [{ ...makeWorkspace({ id: 7 }), summary: "" }]
        vi.mocked(getDBTrashedWorkspaces).mockResolvedValue(trashed)
        const { result } = renderHook(() => useWorkspace(), { wrapper })
        await act(async () => {
            expect(await result.current.getTrashedWorkspaces()).toBe(trashed)
        })
        expect(result.current.workspaces).toEqual([])
    })

    it("restores and purges a workspace, then refreshes the active list", async () => {
        vi.mocked(getDBWorkspaces).mockResolvedValue([makeWorkspace({ id: 1 })])
        const { result } = renderHook(() => useWorkspace(), { wrapper })
        await act(() => result.current.restoreWorkspace(1))
        expect(restoreDBItem).toHaveBeenCalledWith("workspace", 1)
        expect(result.current.workspaces.map(w => w.id)).toEqual([1])

        vi.mocked(getDBWorkspaces).mockResolvedValue([])
        await act(() => result.current.purgeWorkspace(2))
        expect(purgeDBItem).toHaveBeenCalledWith("workspace", 2)
        expect(deleteWorkspaceTabs).toHaveBeenCalledWith(2)
        expect(result.current.workspaces).toEqual([])
    })

    it("still purges the workspace when its saved tabs cannot be deleted", async () => {
        vi.mocked(getDBWorkspaces).mockResolvedValue([])
        vi.mocked(deleteWorkspaceTabs).mockRejectedValueOnce(new Error("store"))
        const { result } = renderHook(() => useWorkspace(), { wrapper })
        await act(() => result.current.purgeWorkspace(2))
        expect(purgeDBItem).toHaveBeenCalledWith("workspace", 2)
        expect(reportError).toHaveBeenCalledTimes(1)
        expect(result.current.error).toBeNull()
    })

    it("surfaces restore errors and skips the refresh", async () => {
        vi.mocked(restoreDBItem).mockRejectedValueOnce({ code: "WORKSPACE_EXISTS", message: "dup" })
        const { result } = renderHook(() => useWorkspace(), { wrapper })
        await act(async () => {
            await expect(result.current.restoreWorkspace(1)).rejects.toMatchObject({ code: "WORKSPACE_EXISTS" })
        })
        expect(getDBWorkspaces).not.toHaveBeenCalled()
    })

    it("falls back to an empty list when the query returns nothing", async () => {
        vi.mocked(getDBWorkspaces).mockResolvedValue(undefined as never)
        const { result } = renderHook(() => useWorkspace(), { wrapper })
        await act(() => result.current.getWorkspaces())
        expect(result.current.workspaces).toEqual([])
    })

    it("keeps isLoading true until every concurrent operation has finished", async () => {
        const first = deferred<ReturnType<typeof makeWorkspace>[]>()
        const second = deferred<ReturnType<typeof makeWorkspace>[]>()
        vi.mocked(getDBWorkspaces)
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise)
        const { result } = renderHook(() => useWorkspace(), { wrapper })

        let p1!: Promise<void>
        let p2!: Promise<void>
        act(() => {
            p1 = result.current.getWorkspaces()
            p2 = result.current.getWorkspaces()
        })
        expect(result.current.isLoading).toBe(true)

        await act(async () => {
            first.resolve([])
            await p1
        })
        expect(result.current.isLoading).toBe(true)

        await act(async () => {
            second.resolve([])
            await p2
        })
        expect(result.current.isLoading).toBe(false)
    })

    it("propagates errors and resets isLoading", async () => {
        vi.mocked(getDBWorkspaces).mockRejectedValue(new Error("db down"))
        const { result } = renderHook(() => useWorkspace(), { wrapper })

        await act(async () => {
            await expect(result.current.getWorkspaces()).rejects.toThrow("db down")
        })
        expect(result.current.isLoading).toBe(false)
    })

    it("exposes the error message and clears it on the next operation", async () => {
        vi.mocked(getDBWorkspaces).mockRejectedValueOnce(new Error("db down"))
        const { result } = renderHook(() => useWorkspace(), { wrapper })

        await act(async () => {
            await expect(result.current.getWorkspaces()).rejects.toThrow("db down")
        })
        expect(result.current.error).toBe("db down")

        vi.mocked(getDBWorkspaces).mockResolvedValueOnce([])
        await act(() => result.current.getWorkspaces())
        expect(result.current.error).toBeNull()
    })

    it("creates a workspace with the color and refreshes the list", async () => {
        vi.mocked(createDBWorkspace).mockResolvedValue(undefined as never)
        vi.mocked(getDBWorkspaces).mockResolvedValue([makeWorkspace({ id: 7, name: "New" })])
        const { result } = renderHook(() => useWorkspace(), { wrapper })

        await act(() => result.current.createWorkspace("New", "#fff"))

        expect(createDBWorkspace).toHaveBeenCalledWith("New", "#fff")
        expect(result.current.workspaces).toEqual([expect.objectContaining({ id: 7 })])
    })

    it("passes null when no color is given", async () => {
        vi.mocked(getDBWorkspaces).mockResolvedValue([])
        const { result } = renderHook(() => useWorkspace(), { wrapper })
        await act(() => result.current.createWorkspace("Plain"))
        expect(createDBWorkspace).toHaveBeenCalledWith("Plain", null)
    })

    it("does not refresh when creation fails", async () => {
        vi.mocked(createDBWorkspace).mockRejectedValue(new Error("insert failed"))
        const { result } = renderHook(() => useWorkspace(), { wrapper })

        await act(async () => {
            await expect(result.current.createWorkspace("X")).rejects.toThrow("insert failed")
        })
        expect(getDBWorkspaces).not.toHaveBeenCalled()
        expect(result.current.isLoading).toBe(false)
    })

    it("resetWorkspace clears the current workspace", async () => {
        const { result } = renderHook(() => useWorkspace(), { wrapper })
        act(() => result.current.setCurrentWorkspace(makeWorkspace()))
        await waitFor(() => expect(result.current.currentWorkspace).not.toBeNull())

        act(() => result.current.resetWorkspace())
        expect(result.current.currentWorkspace).toBeNull()
        expect(result.current.error).toBeNull()
    })
})
