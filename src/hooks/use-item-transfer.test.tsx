import { act, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUndoRecorderMock } from "@/test/mocks"
import { reportError } from "@/lib/report-error"

const exportItemToFile = vi.fn()
const exportItemsToFile = vi.fn()
const importItemsFromFile = vi.fn()
const getWorkspaceData = vi.fn()
const create = vi.hoisted(() => vi.fn())

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/lib/report-error", async () => (await import("@/test/mocks")).reportErrorMock())
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 7 }, getWorkspaces: vi.fn() }) }))
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ getWorkspaceData }) }))
const recorder = makeUndoRecorderMock({ create })
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))
vi.mock("@/lib/workspace-transfer", () => ({
    exportWorkspaceToFile: vi.fn(),
    importWorkspaceFromFile: vi.fn(),
    exportItemToFile: (...a: unknown[]) => exportItemToFile(...a),
    exportItemsToFile: (...a: unknown[]) => exportItemsToFile(...a),
    importItemsFromFile: (...a: unknown[]) => importItemsFromFile(...a),
}))

import { useItemTransfer } from "./use-workspace-transfer"

beforeEach(() => {
    vi.clearAllMocks()
    exportItemToFile.mockResolvedValue({ missingFiles: 0 })
    exportItemsToFile.mockResolvedValue({ missingFiles: 0 })
    getWorkspaceData.mockResolvedValue(undefined)
})

describe("useItemTransfer", () => {
    it("exports an item and confirms", async () => {
        const { result } = renderHook(() => useItemTransfer())
        await act(() => result.current.exportItem("note", { id: 2, name: "N" }))
        expect(exportItemToFile).toHaveBeenCalledWith("note", { id: 2, name: "N" }, expect.objectContaining({ onProgress: expect.any(Function) }))
        expect(toast.success).toHaveBeenCalledWith("Esportato")
        expect(result.current.isBusy).toBe(false)
    })

    it("warns when linked files were not found and are left out of the export", async () => {
        exportItemToFile.mockResolvedValueOnce({ missingFiles: 2 })
        const { result } = renderHook(() => useItemTransfer())
        await act(() => result.current.exportItem("note", { id: 2, name: "N" }))
        expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("2 file collegati"))
        expect(toast.success).not.toHaveBeenCalled()
    })

    it("stays silent when the export dialog is cancelled and shows the error when it fails", async () => {
        const { result } = renderHook(() => useItemTransfer())
        exportItemToFile.mockResolvedValueOnce(null)
        await act(() => result.current.exportItem("folder", { id: 2, name: "F" }))
        expect(toast.success).not.toHaveBeenCalled()
        exportItemToFile.mockRejectedValueOnce(new Error("boom"))
        await act(() => result.current.exportItem("folder", { id: 2, name: "F" }))
        expect(reportError).toHaveBeenCalledWith(expect.anything(), "boom")
    })

    it("exports several items in one file and confirms, or shows the error", async () => {
        const items = [{ type: "note" as const, id: 1 }, { type: "folder" as const, id: 2 }]
        const { result } = renderHook(() => useItemTransfer())
        await act(() => result.current.exportItems(items, "Selezione"))
        expect(exportItemsToFile).toHaveBeenCalledWith(items, "Selezione", expect.objectContaining({ onProgress: expect.any(Function) }))
        expect(toast.success).toHaveBeenCalledWith("Esportato")
        exportItemsToFile.mockRejectedValueOnce(new Error("boom"))
        await act(() => result.current.exportItems(items, "Selezione"))
        expect(reportError).toHaveBeenCalledWith(expect.anything(), "boom")
        expect(result.current.isBusy).toBe(false)
    })

    it("keeps the success when refreshing the tree fails after an import", async () => {
        importItemsFromFile.mockResolvedValue({ skippedFiles: 0, items: [{ type: "note", id: 5, name: "N" }] })
        getWorkspaceData.mockRejectedValue(new Error("refresh"))
        const { result } = renderHook(() => useItemTransfer())
        await act(() => result.current.importItems(null))
        expect(reportError).toHaveBeenCalledWith(expect.anything(), expect.any(String))
        expect(create).toHaveBeenCalledWith("note", 5, "N")
        expect(toast.success).toHaveBeenCalledWith("Importato")
    })

    it("imports into a folder, refreshes the tree, records the creation for undo and confirms", async () => {
        importItemsFromFile.mockResolvedValue({ skippedFiles: 0, items: [{ type: "folder", id: 11, name: "F (2)" }] })
        const { result } = renderHook(() => useItemTransfer())
        await act(() => result.current.importItems(3))
        // Outside the ImportNamesProvider no dialog is shown: the proposed names are used
        expect(importItemsFromFile).toHaveBeenCalledWith(7, 3, undefined, expect.any(Function))
        expect(getWorkspaceData).toHaveBeenCalledWith(7)
        expect(create).toHaveBeenCalledWith("folder", 11, "F (2)")
        expect(toast.success).toHaveBeenCalledWith("Importato")
    })

    it("reports skipped files", async () => {
        importItemsFromFile.mockResolvedValue({ skippedFiles: 2, items: [{ type: "note", id: 5, name: "N" }] })
        const { result } = renderHook(() => useItemTransfer())
        await act(() => result.current.importItems(null))
        expect(toast.success).toHaveBeenCalledWith("Importato · 2 file saltati")
    })

    it("does nothing when the dialog is cancelled", async () => {
        importItemsFromFile.mockResolvedValue(null)
        const { result } = renderHook(() => useItemTransfer())
        await act(() => result.current.importItems(null))
        expect(getWorkspaceData).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
        expect(toast.success).not.toHaveBeenCalled()
    })

    it("shows the error (for example a whole-workspace file) and creates no undo step", async () => {
        importItemsFromFile.mockRejectedValue(new Error("usa la pagina iniziale"))
        const { result } = renderHook(() => useItemTransfer())
        await act(() => result.current.importItems(null))
        expect(reportError).toHaveBeenCalledWith(expect.anything(), "usa la pagina iniziale")
        expect(create).not.toHaveBeenCalled()
        expect(result.current.isBusy).toBe(false)
    })
})
