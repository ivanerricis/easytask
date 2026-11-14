import { act, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reportError } from "@/lib/report-error"

const exportWorkspaceToFile = vi.fn()
const importWorkspaceFromFile = vi.fn()
const getWorkspaces = vi.fn()
const flushAll = vi.fn()

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/lib/report-error", async () => (await import("@/test/mocks")).reportErrorMock())
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: null, getWorkspaces }) }))
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ getWorkspaceData: vi.fn() }) }))
vi.mock("@/contexts/undo/use-undo", async () => (await import("@/test/mocks")).undoModuleMock())
vi.mock("@/contexts/use-template-drafts", () => ({ useTemplateDraftActions: () => ({ flushAll }) }))
vi.mock("@/lib/workspace-transfer", () => ({
    exportWorkspaceToFile: (...a: unknown[]) => exportWorkspaceToFile(...a),
    importWorkspaceFromFile: (...a: unknown[]) => importWorkspaceFromFile(...a),
    exportItemToFile: vi.fn(),
    exportItemsToFile: vi.fn(),
    importItemsFromFile: vi.fn(),
}))

import { useWorkspaceTransfer } from "./use-workspace-transfer"

beforeEach(() => {
    vi.clearAllMocks()
    exportWorkspaceToFile.mockResolvedValue({ missingFiles: 0 })
    importWorkspaceFromFile.mockResolvedValue({ workspaceId: 4, skippedFiles: 0 })
    getWorkspaces.mockResolvedValue(undefined)
    flushAll.mockResolvedValue(undefined)
})

describe("useWorkspaceTransfer", () => {
    it("saves the open template editors, then exports the workspace and confirms", async () => {
        const { result } = renderHook(() => useWorkspaceTransfer())
        await act(() => result.current.exportWorkspace({ id: 3, name: "Casa" }))
        expect(flushAll).toHaveBeenCalledTimes(1)
        expect(exportWorkspaceToFile).toHaveBeenCalledWith({ id: 3, name: "Casa" }, expect.objectContaining({ onProgress: expect.any(Function) }))
        expect(flushAll.mock.invocationCallOrder[0]).toBeLessThan(exportWorkspaceToFile.mock.invocationCallOrder[0])
        expect(toast.success).toHaveBeenCalledWith("Workspace esportato")
        expect(result.current.isBusy).toBe(false)
    })

    it("stays silent when the export dialog is cancelled", async () => {
        exportWorkspaceToFile.mockResolvedValue(null)
        const { result } = renderHook(() => useWorkspaceTransfer())
        await act(() => result.current.exportWorkspace({ id: 3, name: "Casa" }))
        expect(toast.success).not.toHaveBeenCalled()
        expect(reportError).not.toHaveBeenCalled()
    })

    it("shows the error when the export fails, and is not busy afterwards", async () => {
        exportWorkspaceToFile.mockRejectedValue(new Error("disco pieno"))
        const { result } = renderHook(() => useWorkspaceTransfer())
        await act(() => result.current.exportWorkspace({ id: 3, name: "Casa" }))
        expect(reportError).toHaveBeenCalledWith(expect.anything(), "disco pieno")
        expect(toast.success).not.toHaveBeenCalled()
        expect(result.current.isBusy).toBe(false)
    })

    it("does not export when saving the template editors fails", async () => {
        flushAll.mockRejectedValue(new Error("salvataggio fallito"))
        const { result } = renderHook(() => useWorkspaceTransfer())
        await act(() => result.current.exportWorkspace({ id: 3, name: "Casa" }))
        expect(exportWorkspaceToFile).not.toHaveBeenCalled()
        expect(reportError).toHaveBeenCalledWith(expect.anything(), "salvataggio fallito")
    })

    it("imports a workspace, reloads the list and confirms", async () => {
        const { result } = renderHook(() => useWorkspaceTransfer())
        await act(() => result.current.importWorkspace())
        // Outside the ImportNamesProvider no dialog is shown: the proposed name is used
        expect(importWorkspaceFromFile).toHaveBeenCalledWith(undefined, expect.any(Function))
        expect(getWorkspaces).toHaveBeenCalledTimes(1)
        expect(toast.success).toHaveBeenCalledWith("Workspace importato")
    })

    it("reports skipped files", async () => {
        importWorkspaceFromFile.mockResolvedValue({ workspaceId: 4, skippedFiles: 3 })
        const { result } = renderHook(() => useWorkspaceTransfer())
        await act(() => result.current.importWorkspace())
        expect(toast.success).toHaveBeenCalledWith("Workspace importato · 3 file saltati")
    })

    it("does nothing when the import dialog is cancelled", async () => {
        importWorkspaceFromFile.mockResolvedValue(null)
        const { result } = renderHook(() => useWorkspaceTransfer())
        await act(() => result.current.importWorkspace())
        expect(getWorkspaces).not.toHaveBeenCalled()
        expect(toast.success).not.toHaveBeenCalled()
        expect(result.current.isBusy).toBe(false)
    })

    it("shows the error when the import fails", async () => {
        importWorkspaceFromFile.mockRejectedValue(new Error("file non valido"))
        const { result } = renderHook(() => useWorkspaceTransfer())
        await act(() => result.current.importWorkspace())
        expect(reportError).toHaveBeenCalledWith(expect.anything(), "file non valido")
        expect(getWorkspaces).not.toHaveBeenCalled()
        expect(result.current.isBusy).toBe(false)
    })
})
