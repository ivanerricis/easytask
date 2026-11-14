import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Tag } from "@/types/types"
import { createDBTag, deleteDBTag, getDBTags, renameDBTag, restoreDBTag, setDBTaskTag, updateDBTagColor } from "@/db/queries/tag"
import { createReloadTags, createTagsStore, useTagActions, useTagsOf, useWorkspaceTags, WorkspaceTagsContext } from "./tags"
import type { Runtime } from "./types"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/queries/tag", () => ({
    createDBTag: vi.fn(), deleteDBTag: vi.fn(), getDBTags: vi.fn(), renameDBTag: vi.fn(), restoreDBTag: vi.fn(), setDBTaskTag: vi.fn(), updateDBTagColor: vi.fn(),
}))

const tag = (id: number, name: string, over: Partial<Tag> = {}): Tag => ({ id, workspaceID: 1, name, color: null, position: id, ...over })

let store: ReturnType<typeof createTagsStore>

const setup = () => {
    const runtime = { withLoading: <T,>(operation: () => Promise<T>) => operation(), tags: store, reloadTags: createReloadTags(store) } as unknown as Runtime
    return renderHook(() => useTagActions(runtime)).result.current
}
const names = () => store.getState().tags.map(item => item.name)

beforeEach(() => {
    vi.clearAllMocks()
    store = createTagsStore()
    store.set({ workspaceId: 1, tags: [tag(1, "Bug"), tag(2, "Urgent")] })
})

describe("tag actions", () => {
    it("create adds the new tag to the list of its workspace only", async () => {
        const actions = setup()
        vi.mocked(createDBTag).mockResolvedValueOnce(tag(3, "Later"))
        await expect(actions.createTag(1, "Later")).resolves.toMatchObject({ id: 3 })
        expect(names()).toEqual(["Bug", "Urgent", "Later"])
        vi.mocked(createDBTag).mockResolvedValueOnce(tag(4, "Elsewhere", { workspaceID: 2 }))
        await actions.createTag(2, "Elsewhere")
        expect(names()).toEqual(["Bug", "Urgent", "Later"])
    })

    it("a failed write leaves the list as it is", async () => {
        const actions = setup()
        vi.mocked(renameDBTag).mockRejectedValueOnce(new Error("taken"))
        await expect(actions.renameTag(1, "Urgent")).rejects.toThrow("taken")
        expect(names()).toEqual(["Bug", "Urgent"])
    })

    it("rename and color update the tag in place", async () => {
        const actions = setup()
        await actions.renameTag(1, "  Defect ")
        await actions.updateTagColor(2, "#ff0000")
        expect(store.getState().tags).toEqual([tag(1, "Defect"), tag(2, "Urgent", { color: "#ff0000" })])
        expect(renameDBTag).toHaveBeenCalledWith(1, "  Defect ")
        expect(updateDBTagColor).toHaveBeenCalledWith(2, "#ff0000")
    })

    it("delete removes the tag and resolves with its tasks, restore puts it back in its place", async () => {
        const actions = setup()
        vi.mocked(deleteDBTag).mockResolvedValueOnce([5, 6])
        await expect(actions.deleteTag(1)).resolves.toEqual([5, 6])
        expect(names()).toEqual(["Urgent"])
        await actions.restoreTag(tag(1, "Bug"), [5, 6])
        expect(restoreDBTag).toHaveBeenCalledWith(tag(1, "Bug"), [5, 6])
        expect(names()).toEqual(["Bug", "Urgent"])
    })

    it("giving a tag only writes (the note is patched by the caller)", async () => {
        const actions = setup()
        await actions.setTaskTag(1, [5], true)
        expect(setDBTaskTag).toHaveBeenCalledWith(1, [5], true)
        expect(names()).toEqual(["Bug", "Urgent"])
    })

    it("reloadTags reads the list again, ignores a workspace that changed meanwhile, and reports a failure instead of throwing", async () => {
        const actions = setup()
        vi.mocked(getDBTags).mockResolvedValueOnce([tag(1, "Bug"), tag(2, "Urgent"), tag(9, "From a template")])
        await actions.reloadTags()
        expect(names()).toEqual(["Bug", "Urgent", "From a template"])
        vi.mocked(getDBTags).mockImplementationOnce(async () => { store.set({ workspaceId: 2, tags: [] }); return [tag(1, "Stale")] })
        await actions.reloadTags()
        expect(store.getState()).toEqual({ workspaceId: 2, tags: [] })
        vi.mocked(getDBTags).mockRejectedValueOnce(new Error("boom"))
        store.set({ workspaceId: 1, tags: [tag(1, "Bug")] })
        await expect(actions.reloadTags()).resolves.toBeUndefined()
        expect(names()).toEqual(["Bug"])
    })
})

describe("tag hooks", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <WorkspaceTagsContext.Provider value={store}>{children}</WorkspaceTagsContext.Provider>

    it("useWorkspaceTags follows the store and is empty without a provider", () => {
        const { result } = renderHook(() => useWorkspaceTags(), { wrapper })
        expect(result.current.map(item => item.name)).toEqual(["Bug", "Urgent"])
        act(() => store.set({ workspaceId: 1, tags: [tag(2, "Urgent")] }))
        expect(result.current.map(item => item.name)).toEqual(["Urgent"])
        expect(renderHook(() => useWorkspaceTags()).result.current).toEqual([])
    })

    it("useTagsOf keeps the list order, skips unknown ids and keeps its identity while nothing changes", () => {
        const ids = [2, 1, 99]
        const { result, rerender } = renderHook(() => useTagsOf(ids), { wrapper })
        expect(result.current.map(item => item.name)).toEqual(["Bug", "Urgent"])
        const first = result.current
        rerender()
        expect(result.current).toBe(first)
        expect(renderHook(() => useTagsOf(undefined), { wrapper }).result.current).toEqual([])
    })
})
