import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { UndoContext, UndoRecorderContext } from "@/contexts/undo/context"
import { PreferencesContext, type PreferencesContextType } from "@/contexts/preferences-context-object"
import { useSkippableDelete } from "./use-delete-item"
import { SKIP_KEYS, useConfirmSkipped } from "./use-skipped-confirm"

const deleteItem = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ deleteItem }) }))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const recorder = { remove: vi.fn() }
const undo = vi.fn()

const wrapperFor = (skipped: string[] | null) => ({ children }: { children: ReactNode }) => {
    const tree = (
        <UndoRecorderContext.Provider value={recorder as never}>
            <UndoContext.Provider value={{ undo } as never}>{children}</UndoContext.Provider>
        </UndoRecorderContext.Provider>
    )
    return skipped === null ? tree : <PreferencesContext.Provider value={{ skippedConfirms: skipped } as unknown as PreferencesContextType}>{tree}</PreferencesContext.Provider>
}

beforeEach(() => {
    vi.resetAllMocks()
    deleteItem.mockResolvedValue(undefined)
})

describe("useConfirmSkipped", () => {
    it("is true only for the keys in the preference, and false without a provider", () => {
        expect(renderHook(() => useConfirmSkipped("task-trash"), { wrapper: wrapperFor(["task-trash"]) }).result.current).toBe(true)
        expect(renderHook(() => useConfirmSkipped("tag-delete"), { wrapper: wrapperFor(["task-trash"]) }).result.current).toBe(false)
        expect(renderHook(() => useConfirmSkipped("task-trash"), { wrapper: wrapperFor(null) }).result.current).toBe(false)
    })

    it("has one distinct key per confirmation that can be skipped", () => {
        const keys = Object.values(SKIP_KEYS)
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys).toEqual(["task-trash", "folder-trash", "tree-selection-trash", "media-remove", "tag-delete", "automation-delete"])
    })
})

describe("useSkippableDelete", () => {
    const options = (openDialog: () => void) => ({ item: { id: 4, name: "Cartella" }, itemType: "folder" as const, skipKey: SKIP_KEYS.folderTrash, openDialog })

    it("opens the confirmation when it was not skipped", () => {
        const openDialog = vi.fn()
        const { result } = renderHook(() => useSkippableDelete(options(openDialog)), { wrapper: wrapperFor([]) })
        act(() => result.current.request())
        expect(openDialog).toHaveBeenCalledTimes(1)
        expect(deleteItem).not.toHaveBeenCalled()
    })

    it("moves the item to the trash at once, with the undo toast, when it was skipped", async () => {
        const openDialog = vi.fn()
        const { result } = renderHook(() => useSkippableDelete(options(openDialog)), { wrapper: wrapperFor(["folder-trash"]) })
        act(() => result.current.request())
        await waitFor(() => expect(deleteItem).toHaveBeenCalledWith("folder", 4))
        expect(openDialog).not.toHaveBeenCalled()
        expect(recorder.remove).toHaveBeenCalledWith("folder", 4, "Cartella")
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Elemento spostato nel cestino", expect.objectContaining({ action: expect.objectContaining({ label: "Annulla" }) })))
    })

    it("reports a failure with an error toast and records nothing", async () => {
        deleteItem.mockRejectedValue(new Error("constraint"))
        const { result } = renderHook(() => useSkippableDelete(options(vi.fn())), { wrapper: wrapperFor(["folder-trash"]) })
        act(() => result.current.request())
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(recorder.remove).not.toHaveBeenCalled()
    })
})
