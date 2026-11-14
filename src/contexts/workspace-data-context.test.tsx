import type { ReactNode } from "react"
import { act, render, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WorkspaceDataProvider, useWorkspaceActions, useWorkspaceLoading, useWorkspaceState, useWorkspaceVersion } from "./workspace-data"
import { useActiveNote, useActiveNoteActions } from "./use-active-note"
import { useTabs, useTabsActions } from "./use-tabs"
import { getDBWorkspaceData } from "@/db/queries/workspace"
import { getDBNoteData, updateDBNoteBackground } from "@/db/queries/note"
import { updateDBGroupPositions, updateDBGroupWidth } from "@/db/queries/group"
import { setDBCollapsed } from "@/db/queries/collapsed"
import { createDBTask } from "@/db/queries/task"
import { deleteDBItem, renameDBItem, updateDBColor } from "@/db/queries/shared_queries"
import { createDBSection } from "@/db/queries/section"
import { createDBNoteInFolder, createDBWorkspaceNote } from "@/db/queries/note"
import { createDBSubFolder, createDBWorkspaceFolder, updateDBFolderColorContent } from "@/db/queries/folder"
import { moveDBTreeItem } from "@/db/queries/tree"
import { moveDBSection, moveDBSectionToNewGroup, moveDBTask } from "@/db/queries/move"
import { getDBTemplateDrafts } from "@/db/queries/template-draft"
import { emptyDBTrash, getDBTrash, getDBTrashCount, purgeDBItem, restoreDBItem } from "@/db/queries/trash"
import { createDBNoteFromTemplate } from "@/db/queries/template"
import { archiveDBItem, getDBArchive, getDBArchiveCount, unarchiveDBItem } from "@/db/queries/archive"
import { deferred } from "@/test/ui-render"
import { getOpenGroupWidth, setOpenGroupWidth } from "@/lib/group-widths"
import { makeGroup, makeNote, makeSection, makeTask } from "@/test/ui-fixtures"
import type { Folder } from "@/types/types"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/queries/tag", () => ({ getDBTags: vi.fn(async () => []), getDBNoteTags: vi.fn(async () => []) }))
vi.mock("@/db/queries/workspace", () => ({ getDBWorkspaceData: vi.fn() }))
vi.mock("@/db/queries/note", () => ({
    updateDBNoteBackground: vi.fn(),
    createDBNoteInFolder: vi.fn(),
    createDBWorkspaceNote: vi.fn(),
    getDBNoteData: vi.fn(),
}))
vi.mock("@/db/queries/folder", () => ({
    createDBSubFolder: vi.fn(),
    createDBWorkspaceFolder: vi.fn(),
    updateDBFolderColorContent: vi.fn(),
}))
vi.mock("@/db/queries/section", () => ({
    createDBSection: vi.fn(),
    createDBSectionInGroup: vi.fn(),
}))
vi.mock("@/db/queries/task", () => ({
    createDBSubTask: vi.fn(),
    createDBTask: vi.fn(),
    updateDBTaskCompletion: vi.fn(),
    updateDBTaskDescription: vi.fn(),
    updateDBTaskPriority: vi.fn(),
}))
vi.mock("@/db/queries/group", () => ({ updateDBGroupPositions: vi.fn(), updateDBGroupWidth: vi.fn() }))
vi.mock("@/db/queries/collapsed", () => ({ setDBCollapsed: vi.fn() }))
vi.mock("@/db/queries/tree", () => ({ moveDBTreeItem: vi.fn() }))
vi.mock("@/db/queries/move", () => ({ moveDBSection: vi.fn(), moveDBSectionToNewGroup: vi.fn(), moveDBTask: vi.fn() }))
vi.mock("@/db/queries/trash", () => ({
    getDBTrash: vi.fn(),
    getDBTrashCount: vi.fn(),
    restoreDBItem: vi.fn(),
    purgeDBItem: vi.fn(),
    emptyDBTrash: vi.fn(),
}))
vi.mock("@/db/queries/archive", () => ({
    archiveDBItem: vi.fn(),
    unarchiveDBItem: vi.fn(),
    getDBArchive: vi.fn(),
    getDBArchiveCount: vi.fn(),
}))
vi.mock("@/db/queries/template", () => ({
    countDBTemplates: vi.fn(),
    createDBNoteFromTemplate: vi.fn(),
    createDBTemplateFromNote: vi.fn(),
    getDBTemplates: vi.fn(),
    updateDBTemplateFromNote: vi.fn(),
}))
vi.mock("@/db/queries/template-draft", () => ({ getDBTemplateDrafts: vi.fn(async () => []), createDBTemplateDraft: vi.fn(), saveDBTemplateDraft: vi.fn(), deleteDBTemplateDraft: vi.fn() }))
vi.mock("@/db/queries/shared_queries", () => ({
    renameDBItem: vi.fn(),
    updateDBColor: vi.fn(),
    deleteDBItem: vi.fn(),
}))

const wrapper = ({ children }: { children: ReactNode }) => <WorkspaceDataProvider>{children}</WorkspaceDataProvider>

/** Every context of the provider tree in one object, like the old single context. */
const useAll = () => ({
    ...useWorkspaceState(),
    ...useWorkspaceActions(),
    trashVersion: useWorkspaceVersion("trash"),
    archiveVersion: useWorkspaceVersion("archive"),
    audioVersion: useWorkspaceVersion("audio"),
    templatesVersion: useWorkspaceVersion("templates"),
    isLoading: useWorkspaceLoading(),
    ...useTabs(),
    ...useTabsActions(),
    ...useActiveNote(),
    ...useActiveNoteActions(),
})

const makeFolder = (over: Partial<Folder>): Folder => ({
    id: 1,
    workspaceID: 1,
    folderID: null,
    name: "F",
    position: 0,
    creation_date: "",
    creation_time: "",
    edit_date: "",
    edit_time: "",
    subfolders: [],
    notes: [],
    ...over,
})

describe("WorkspaceDataContext", () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it("throws when used outside the provider", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        expect(() => renderHook(() => useAll())).toThrow(/WorkspaceDataProvider/)
        spy.mockRestore()
    })

    describe("version counters", () => {
        it("re-renders only the readers of a counter when it is bumped, not the consumers of the tree", async () => {
            vi.mocked(restoreDBItem).mockResolvedValue(undefined as never)
            const onTree = vi.fn(), onTrash = vi.fn(), onTemplates = vi.fn(), onActions = vi.fn()
            function Tree() { useWorkspaceState(); onTree(); return null }
            function Trash() { onTrash(useWorkspaceVersion("trash")); return null }
            function Templates() { useWorkspaceVersion("templates"); onTemplates(); return null }
            function Grab() { onActions(useWorkspaceActions()); return null }
            render(<WorkspaceDataProvider><Grab /><Tree /><Trash /><Templates /></WorkspaceDataProvider>)
            const before = { tree: onTree.mock.calls.length, trash: onTrash.mock.calls.length, templates: onTemplates.mock.calls.length }

            await act(() => onActions.mock.lastCall![0].restoreItem("task", 1))

            expect(onTrash).toHaveBeenLastCalledWith(1)
            expect(onTrash.mock.calls.length).toBe(before.trash + 1)
            expect(onTree.mock.calls.length).toBe(before.tree)
            expect(onTemplates.mock.calls.length).toBe(before.templates)
        })
    })

    describe("getWorkspaceData", () => {
        it("builds the folder tree with nested folders and notes", async () => {
            const root = makeFolder({ id: 1 })
            const child = makeFolder({ id: 2, folderID: 1 })
            const noteInChild = makeNote({ id: 10, folderID: 2 })
            const rootNote = makeNote({ id: 11, folderID: null })
            vi.mocked(getDBWorkspaceData).mockResolvedValue({
                folders: [root, child],
                notes: [noteInChild, rootNote],
            } as never)
            const { result } = renderHook(() => useAll(), { wrapper })

            await act(() => result.current.getWorkspaceData(1))

            const tree = result.current.workspaceDataTree!
            expect(tree.rootFolders.map(f => f.id)).toEqual([1])
            expect(tree.rootFolders[0].subfolders.map(f => f.id)).toEqual([2])
            expect(tree.rootFolders[0].subfolders[0].notes.map(n => n.id)).toEqual([10])
            expect(tree.rootNotes.map(n => n.id)).toEqual([11])
        })

        it("handles an empty result", async () => {
            vi.mocked(getDBWorkspaceData).mockResolvedValue(undefined as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(() => result.current.getWorkspaceData(1))
            expect(result.current.workspaceDataTree).toEqual({ rootFolders: [], rootNotes: [] })
        })

        it("sets the error, rethrows and resets isLoading on failure", async () => {
            vi.mocked(getDBWorkspaceData).mockRejectedValue(new Error("boom"))
            const { result } = renderHook(() => useAll(), { wrapper })

            await act(async () => {
                await expect(result.current.getWorkspaceData(1)).rejects.toThrow("boom")
            })
            expect(result.current.error).toBe("Impossibile caricare i dati del workspace")
            expect(result.current.isLoading).toBe(false)
        })
    })

    describe("optimistic sidebar tree", () => {
        const load = async (result: { current: ReturnType<typeof useAll> }) => {
            const root = makeFolder({ id: 1, name: "Root" })
            const child = makeFolder({ id: 2, folderID: 1, name: "Child" })
            vi.mocked(getDBWorkspaceData).mockResolvedValue({
                folders: [root, child],
                notes: [makeNote({ id: 10, folderID: 2, name: "In child" }), makeNote({ id: 11, folderID: null, name: "Root note" })],
            } as never)
            await act(() => result.current.getWorkspaceData(1))
            vi.mocked(getDBWorkspaceData).mockClear()
        }

        it("adds a created subfolder to the tree and to the flat folders without reloading", async () => {
            vi.mocked(createDBSubFolder).mockResolvedValue(5 as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)

            await act(() => result.current.createSubFolder(1, 1, "New"))

            const root = result.current.workspaceDataTree!.rootFolders[0]
            expect(root.subfolders.map(f => f.id)).toEqual([2, 5])
            expect(root.subfolders[1]).toMatchObject({ name: "New", folderID: 1, workspaceID: 1, position: 1 })
            expect(result.current.folders.map(f => f.id).sort()).toEqual([1, 2, 5])
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
        })

        it("adds created notes and folders at the workspace root and in a folder", async () => {
            vi.mocked(createDBWorkspaceFolder).mockResolvedValue(6 as never)
            vi.mocked(createDBWorkspaceNote).mockResolvedValue(12 as never)
            vi.mocked(createDBNoteInFolder).mockResolvedValue(13 as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)

            await act(() => result.current.createWorkspaceFolder(1, "Top", "#fff"))
            await act(() => result.current.createWorkspaceNote(1, "Loose"))
            await act(() => result.current.createNoteInFolder(1, 2, "Inner"))

            const tree = result.current.workspaceDataTree!
            expect(tree.rootFolders.map(f => f.id)).toEqual([1, 6])
            expect(tree.rootFolders[1].color).toBe("#fff")
            expect(tree.rootNotes.map(n => n.id)).toEqual([11, 12])
            expect(tree.rootFolders[0].subfolders[0].notes.map(n => n.id)).toEqual([10, 13])
            expect(result.current.notes.map(n => n.id).sort()).toEqual([10, 11, 12, 13])
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
        })

        it("reloads in background when the created id is unknown", async () => {
            vi.mocked(createDBWorkspaceNote).mockResolvedValue(undefined as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)

            await act(() => result.current.createWorkspaceNote(1, "Loose"))
            await waitFor(() => expect(getDBWorkspaceData).toHaveBeenCalledWith(1))
        })

        it("renames a folder or a note at once and restores the name when the write fails", async () => {
            const write = deferred()
            vi.mocked(renameDBItem).mockReturnValueOnce(write.promise as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)

            let pending!: Promise<void>
            act(() => { pending = result.current.renameItem("folder", 2, "Renamed") })
            expect(result.current.workspaceDataTree!.rootFolders[0].subfolders[0].name).toBe("Renamed")
            expect(result.current.folders.find(f => f.id === 2)!.name).toBe("Renamed")

            await act(async () => {
                write.reject(new Error("boom"))
                await expect(pending).rejects.toThrow("boom")
            })
            expect(result.current.workspaceDataTree!.rootFolders[0].subfolders[0].name).toBe("Child")

            await act(() => result.current.renameItem("note", 11, "Renamed note"))
            expect(result.current.workspaceDataTree!.rootNotes[0].name).toBe("Renamed note")
            expect(result.current.notes.find(n => n.id === 11)!.name).toBe("Renamed note")
        })

        it("does not touch the tree when renaming items that are not in it", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            const before = result.current.workspaceDataTree
            await act(() => result.current.renameItem("task", 3, "x"))
            expect(renameDBItem).toHaveBeenCalledWith("task", 3, "x")
            expect(result.current.workspaceDataTree).toBe(before)
        })

        it("changes the color of a note at once and restores it on failure", async () => {
            vi.mocked(updateDBColor).mockRejectedValueOnce(new Error("boom"))
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)

            await act(async () => {
                await expect(result.current.updateItemColor("note", 11, "#f00")).rejects.toThrow("boom")
            })
            expect(result.current.workspaceDataTree!.rootNotes[0].color).toBeUndefined()

            await act(() => result.current.updateItemColor("note", 11, "#f00"))
            expect(result.current.workspaceDataTree!.rootNotes[0].color).toBe("#f00")
        })

        it("changes the background of a note at once, clears it and restores it on failure", async () => {
            vi.mocked(updateDBNoteBackground).mockRejectedValueOnce(new Error("boom"))
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)

            await act(async () => {
                await expect(result.current.updateNoteBackground(11, "#f00")).rejects.toThrow("boom")
            })
            expect(result.current.workspaceDataTree!.rootNotes[0].bg_color ?? null).toBeNull()

            await act(() => result.current.updateNoteBackground(11, "#f00"))
            expect(updateDBNoteBackground).toHaveBeenLastCalledWith(11, "#f00")
            expect(result.current.workspaceDataTree!.rootNotes[0].bg_color).toBe("#f00")
            // The color of the note itself is a different thing
            expect(result.current.workspaceDataTree!.rootNotes[0].color).toBeUndefined()

            await act(() => result.current.updateNoteBackground(11))
            expect(updateDBNoteBackground).toHaveBeenLastCalledWith(11, undefined)
            expect(result.current.workspaceDataTree!.rootNotes[0].bg_color).toBeNull()
        })

        it("colors a folder with its whole content and restores the previous tree on failure", async () => {
            vi.mocked(updateDBFolderColorContent).mockRejectedValueOnce(new Error("boom"))
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            const before = result.current.workspaceDataTree

            await act(async () => {
                await expect(result.current.updateFolderColorContent(1, "#0f0")).rejects.toThrow("boom")
            })
            expect(result.current.workspaceDataTree).toBe(before)

            await act(() => result.current.updateFolderColorContent(1, "#0f0"))
            const root = result.current.workspaceDataTree!.rootFolders[0]
            expect(root.color).toBe("#0f0")
            expect(root.subfolders[0].color).toBe("#0f0")
            expect(root.subfolders[0].notes[0].color).toBe("#0f0")
            expect(result.current.workspaceDataTree!.rootNotes[0].color).toBeUndefined()
        })

        it("removes a deleted note or folder from the tree at once and restores it when the write fails", async () => {
            const write = deferred()
            vi.mocked(deleteDBItem).mockReturnValueOnce(write.promise as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)

            let pending!: Promise<void>
            act(() => { pending = result.current.deleteItem("note", 10) })
            expect(result.current.workspaceDataTree!.rootFolders[0].subfolders[0].notes).toEqual([])
            expect(result.current.notes.map(n => n.id)).toEqual([11])
            await act(async () => {
                write.reject(new Error("boom"))
                await expect(pending).rejects.toThrow("boom")
            })
            expect(result.current.workspaceDataTree!.rootFolders[0].subfolders[0].notes.map(n => n.id)).toEqual([10])

            await act(() => result.current.deleteItem("folder", 1))
            expect(result.current.workspaceDataTree!.rootFolders).toEqual([])
            expect(deleteDBItem).toHaveBeenLastCalledWith("folder", 1)
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
        })

        it("bumps trashVersion and clears the current folder when a folder with the current one inside is deleted", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            act(() => result.current.setCurrentFolder(result.current.folders.find(f => f.id === 2)!))
            await act(() => result.current.deleteItem("folder", 1))
            expect(result.current.trashVersion).toBe(1)
            expect(result.current.currentFolder).toBeNull()
        })

        it("keeps the flat folders and notes derived from the tree (same references until the tree changes)", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            const { folders, notes } = result.current
            expect(folders.map(f => f.id)).toEqual([1, 2])
            act(() => result.current.setCurrentFolder(folders[0]))
            expect(result.current.folders).toBe(folders)
            expect(result.current.notes).toBe(notes)
            await act(() => result.current.deleteItem("note", 10))
            expect(result.current.notes).not.toBe(notes)
            expect(result.current.notes.map(n => n.id)).toEqual([11])
        })

        it("forgets the remembered open width of a group when it is deleted or purged", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            setOpenGroupWidth(901, 300)
            setOpenGroupWidth(902, 310)
            setOpenGroupWidth(903, 320)
            await act(() => result.current.deleteItem("section_group", 901))
            await act(() => result.current.purgeItem("section_group", 902))
            await act(() => result.current.deleteItem("section", 903))
            expect(getOpenGroupWidth(901)).toBeUndefined()
            expect(getOpenGroupWidth(902)).toBeUndefined()
            expect(getOpenGroupWidth(903)).toBe(320)
        })

        it("bumps audioVersion only for what can change the visible audio, not for task moves", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            expect(result.current.audioVersion).toBe(0)
            await act(() => result.current.deleteItem("task", 5))
            await act(() => result.current.moveTask(9, { sectionId: 4, parentTaskId: null }, 0))
            await act(() => result.current.moveSection(4, 2, 1))
            expect(result.current.audioVersion).toBe(0)
            expect(result.current.trashVersion).toBe(1)

            let expected = 0
            const ops: Array<() => Promise<unknown>> = [
                () => result.current.deleteItem("section_group", 3),
                () => result.current.deleteItem("audio_file", 3),
                () => result.current.restoreItem("section", 1),
                () => result.current.purgeItem("note", 1),
                () => result.current.emptyTrash(4),
            ]
            for (const op of ops) {
                await act(() => op())
                expected += 1
                expect(result.current.audioVersion).toBe(expected)
            }
        })

        it("a task or section move bumps no version and reads no template draft", async () => {
            vi.mocked(getDBWorkspaceData).mockResolvedValue({ folders: [], notes: [] } as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(() => result.current.getWorkspaceData(1))
            vi.mocked(getDBTemplateDrafts).mockClear()
            const before = [result.current.trashVersion, result.current.archiveVersion, result.current.audioVersion, result.current.templatesVersion]
            await act(() => result.current.moveTask(9, { sectionId: 4, parentTaskId: null }, 0))
            await act(() => result.current.moveSection(4, 2, 1))
            await act(() => result.current.moveSectionToNewGroup(4, 0))
            expect([result.current.trashVersion, result.current.archiveVersion, result.current.audioVersion, result.current.templatesVersion]).toEqual(before)
            expect(getDBTemplateDrafts).not.toHaveBeenCalled()
        })

        it("does not bump audioVersion when the delete fails", async () => {
            vi.mocked(deleteDBItem).mockRejectedValueOnce(new Error("nope"))
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(async () => {
                await expect(result.current.deleteItem("section_group", 1)).rejects.toThrow("nope")
            })
            expect(result.current.audioVersion).toBe(0)
        })

        it("getTrashCount asks the database without touching isLoading", async () => {
            vi.mocked(getDBTrashCount).mockResolvedValue(4)
            const { result } = renderHook(() => useAll(), { wrapper })
            await expect(result.current.getTrashCount(1)).resolves.toBe(4)
            expect(getDBTrashCount).toHaveBeenCalledWith(1)
            expect(result.current.isLoading).toBe(false)
        })

        it("updateFolderColorContent resolves with the previous colors of everything it touched", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            const previous = await act(() => result.current.updateFolderColorContent(1, "#0f0"))
            expect(previous.map(p => [p.itemType, p.id])).toEqual([["folder", 1], ["folder", 2], ["note", 10]])
            expect(previous.every(p => p.before === undefined || typeof p.before === "string")).toBe(true)
        })

        it("adds a note created from a template to the tree without reloading", async () => {
            vi.mocked(createDBNoteFromTemplate).mockResolvedValue(20 as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)

            await act(async () => {
                expect(await result.current.createNoteFromTemplate(3, 1, 2, " From tpl ", "#abc")).toBe(20)
            })
            const tree = result.current.workspaceDataTree!
            expect(tree.rootFolders[0].subfolders[0].notes.map(n => n.id)).toEqual([10, 20])
            expect(tree.rootFolders[0].subfolders[0].notes[1]).toMatchObject({ name: "From tpl", color: "#abc", folderID: 2, position: 1 })
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
        })

        it("reloads the tree when the folder of a note created from a template is not in it", async () => {
            vi.mocked(createDBNoteFromTemplate).mockResolvedValue(20 as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            await act(() => result.current.createNoteFromTemplate(3, 1, 99, "Lost"))
            expect(getDBWorkspaceData).toHaveBeenCalledWith(1)
        })

        it("is not overwritten by a reload that started before the optimistic update", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            const slow = deferred<unknown>()
            vi.mocked(getDBWorkspaceData).mockReturnValueOnce(slow.promise as never)
            vi.mocked(createDBWorkspaceFolder).mockResolvedValue(6 as never)

            let reload!: Promise<void>
            act(() => { reload = result.current.getWorkspaceData(1) })
            await act(() => result.current.createWorkspaceFolder(1, "Top"))
            // The refetch after the discarded response already sees the new folder
            vi.mocked(getDBWorkspaceData).mockResolvedValue({ folders: [makeFolder({ id: 1 }), makeFolder({ id: 6 })], notes: [] } as never)
            await act(async () => {
                slow.resolve({ folders: [makeFolder({ id: 1 })], notes: [] })
                await reload
            })

            expect(result.current.workspaceDataTree!.rootFolders.map(f => f.id)).toEqual([1, 6])
            expect(getDBWorkspaceData).toHaveBeenCalledTimes(2)
        })

        it("refetches a bounded number of times when every response is overtaken, then applies the last one", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            let calls = 0
            vi.mocked(getDBWorkspaceData).mockImplementation(async () => {
                calls += 1
                // An optimistic update lands during every fetch
                await act(() => result.current.updateItemColor("folder", 1, `#00${calls}`))
                return { folders: [makeFolder({ id: 1 }), makeFolder({ id: 100 + calls })], notes: [] } as never
            })
            await act(() => result.current.getWorkspaceData(1))
            expect(calls).toBe(4)
            expect(result.current.workspaceDataTree!.rootFolders.map(f => f.id)).toEqual([1, 104])
        })

        it("applies only the latest of two overlapping reloads", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            const first = deferred<unknown>()
            const second = deferred<unknown>()
            vi.mocked(getDBWorkspaceData).mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never)
            let p1!: Promise<void>
            let p2!: Promise<void>
            act(() => { p1 = result.current.getWorkspaceData(1) })
            act(() => { p2 = result.current.getWorkspaceData(1) })
            await act(async () => { second.resolve({ folders: [makeFolder({ id: 2 })], notes: [] }); await p2 })
            await act(async () => { first.resolve({ folders: [makeFolder({ id: 1 })], notes: [] }); await p1 })
            expect(result.current.workspaceDataTree!.rootFolders.map(f => f.id)).toEqual([2])
        })

        it("setWorkspaceDataTree replaces the tree and the derived flat lists", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await load(result)
            act(() => result.current.setWorkspaceDataTree({ rootFolders: [makeFolder({ id: 9 })], rootNotes: [makeNote({ id: 90 })] }))
            expect(result.current.folders.map(f => f.id)).toEqual([9])
            expect(result.current.notes.map(n => n.id)).toEqual([90])
        })
    })

    describe("note data of the active note", () => {
        const open = async (result: { current: ReturnType<typeof useAll> }, id = 1) => {
            await act(async () => { result.current.openNote(id) })
            await waitFor(() => expect(result.current.noteDataTree).not.toBeNull())
        }

        it("builds the note tree with sections, tasks and subtasks", async () => {
            vi.mocked(getDBNoteData).mockResolvedValue({
                groups: [makeGroup({ id: 1 })],
                sections: [makeSection({ id: 5, groupID: 1 })],
                tasks: [
                    makeTask({ id: 100, sectionID: 5, taskID: null }),
                    makeTask({ id: 101, sectionID: 5, taskID: 100 }),
                ],
            } as never)
            const { result } = renderHook(() => useAll(), { wrapper })

            await open(result)

            const section = result.current.noteDataTree!.groups[0].sections[0]
            expect(section.tasks.map(t => t.id)).toEqual([100])
            expect(section.tasks[0].subtasks.map(t => t.id)).toEqual([101])
        })

        it("keeps the input order and nests groups, sections, tasks and deep subtasks", async () => {
            vi.mocked(getDBNoteData).mockResolvedValue({
                groups: [makeGroup({ id: 2 }), makeGroup({ id: 1 })],
                sections: [
                    makeSection({ id: 7, groupID: 1 }),
                    makeSection({ id: 6, groupID: 2 }),
                    makeSection({ id: 5, groupID: 2 }),
                ],
                tasks: [
                    makeTask({ id: 12, sectionID: 5, taskID: null }),
                    makeTask({ id: 11, sectionID: 5, taskID: null }),
                    makeTask({ id: 21, sectionID: 5, taskID: 11 }),
                    makeTask({ id: 20, sectionID: 5, taskID: 11 }),
                    makeTask({ id: 30, sectionID: 5, taskID: 20 }),
                    makeTask({ id: 40, sectionID: 7, taskID: null }),
                ],
            } as never)
            const { result } = renderHook(() => useAll(), { wrapper })

            await open(result)

            const [first, second] = result.current.noteDataTree!.groups
            expect(first.id).toBe(2)
            expect(first.sections.map(s => s.id)).toEqual([6, 5])
            expect(first.sections[0].tasks).toEqual([])
            const tasks = first.sections[1].tasks
            expect(tasks.map(t => t.id)).toEqual([12, 11])
            expect(tasks[0].subtasks).toEqual([])
            expect(tasks[1].subtasks.map(t => t.id)).toEqual([21, 20])
            expect(tasks[1].subtasks[1].subtasks.map(t => t.id)).toEqual([30])
            expect(second.sections.map(s => s.id)).toEqual([7])
            expect(second.sections[0].tasks.map(t => t.id)).toEqual([40])
        })

        it("rejects and keeps the cached data when a refresh fails", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {})
            vi.mocked(getDBNoteData).mockResolvedValueOnce({ groups: [makeGroup({ id: 1 })], sections: [], tasks: [] } as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await open(result)

            vi.mocked(getDBNoteData).mockRejectedValueOnce(new Error("nope"))
            await act(async () => {
                await expect(result.current.refreshActiveNote()).rejects.toThrow("nope")
            })
            expect(result.current.noteDataTree!.groups.map(g => g.id)).toEqual([1])
        })
    })

    describe("isLoading counter", () => {
        it("stays true until all overlapping operations settle", async () => {
            const a = deferred()
            const b = deferred()
            vi.mocked(createDBTask).mockReturnValueOnce(a.promise as never)
            vi.mocked(createDBSection).mockReturnValueOnce(b.promise as never)
            const { result } = renderHook(() => useAll(), { wrapper })

            let pa!: Promise<unknown>
            let pb!: Promise<unknown>
            act(() => {
                pa = result.current.createTask(1, "t")
                pb = result.current.createSection(1, "s", 0)
            })
            expect(result.current.isLoading).toBe(true)

            await act(async () => {
                a.resolve()
                await pa
            })
            expect(result.current.isLoading).toBe(true)

            await act(async () => {
                b.reject(new Error("x"))
                await expect(pb).rejects.toThrow("x")
            })
            expect(result.current.isLoading).toBe(false)
        })
    })

    describe("create / rename / delete", () => {
        it("forwards createTask to the db layer", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(() => result.current.createTask(3, "hello"))
            // No position: the db layer appends (its own default)
            expect(createDBTask).toHaveBeenCalledWith(3, "hello", undefined)
            await act(() => result.current.createTask(3, "first", "top"))
            expect(createDBTask).toHaveBeenLastCalledWith(3, "first", "top")
        })

        it("forwards renameItem and propagates errors", async () => {
            vi.mocked(renameDBItem).mockRejectedValueOnce(new Error("rename failed"))
            const { result } = renderHook(() => useAll(), { wrapper })

            await act(async () => {
                await expect(result.current.renameItem("task", 4, "new")).rejects.toThrow("rename failed")
            })
            expect(renameDBItem).toHaveBeenCalledWith("task", 4, "new")
            expect(result.current.isLoading).toBe(false)
        })

        it("forwards deleteItem and updateItemColor", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(async () => {
                await result.current.deleteItem("note", 9)
                await result.current.updateItemColor("note", 9, "#000")
            })
            expect(deleteDBItem).toHaveBeenCalledWith("note", 9)
            expect(updateDBColor).toHaveBeenCalledWith("note", 9, "#000")
        })
    })

    describe("deleteItem and the tabs", () => {
        // The tabs follow the notes list: a deleted note disappears from the tabs once the workspace data is reloaded
        const setup = async (folders: Folder[], noteList: ReturnType<typeof makeNote>[], open: number[], current: number | null) => {
            vi.mocked(getDBNoteData).mockResolvedValue({ groups: [], sections: [], tasks: [] } as never)
            vi.mocked(getDBWorkspaceData).mockResolvedValue({ folders, notes: noteList } as never)
            const hook = renderHook(() => useAll(), { wrapper })
            await act(() => hook.result.current.getWorkspaceData(1))
            await act(async () => {
                open.forEach(id => hook.result.current.openNote(id))
                if (current !== null) hook.result.current.activateNote(current)
            })
            return hook.result
        }
        const reload = (result: { current: ReturnType<typeof useAll> }, folders: Folder[], noteList: ReturnType<typeof makeNote>[]) => {
            vi.mocked(getDBWorkspaceData).mockResolvedValue({ folders, notes: noteList } as never)
            return act(() => result.current.getWorkspaceData(1))
        }
        const n = (id: number, folderID: number | null = null) => makeNote({ id, folderID })

        it("removes a deleted note from the tabs and selects the neighbour", async () => {
            const result = await setup([], [n(1), n(2), n(3)], [1, 2, 3], 2)
            await act(() => result.current.deleteItem("note", 2))
            await reload(result, [], [n(1), n(3)])
            expect(result.current.tabs.map(x => x.id)).toEqual([1, 3])
            expect(result.current.currentNote?.id).toBe(3)
        })

        it("selects the previous tab when the last tab is deleted, and null when none is left", async () => {
            const result = await setup([], [n(1), n(2)], [1, 2], 2)
            await act(() => result.current.deleteItem("note", 2))
            await reload(result, [], [n(1)])
            expect(result.current.currentNote?.id).toBe(1)
            await act(() => result.current.deleteItem("note", 1))
            await reload(result, [], [])
            expect(result.current.tabs).toEqual([])
            expect(result.current.currentNote).toBeNull()
        })

        it("keeps the current note when a background tab is deleted", async () => {
            const result = await setup([], [n(1), n(2)], [1, 2], 1)
            await act(() => result.current.deleteItem("note", 2))
            await reload(result, [], [n(1)])
            expect(result.current.tabs.map(x => x.id)).toEqual([1])
            expect(result.current.currentNote?.id).toBe(1)
        })

        it("closes the tabs of every note inside a deleted folder and clears the current folder", async () => {
            const folders = [makeFolder({ id: 1 }), makeFolder({ id: 2, folderID: 1 }), makeFolder({ id: 3 })]
            const result = await setup(folders, [n(10, 1), n(11, 2), n(12, 3), n(13)], [10, 12, 11, 13], 11)
            act(() => result.current.setCurrentFolder(folders[1]))
            await act(() => result.current.deleteItem("folder", 1))
            await reload(result, [makeFolder({ id: 3 })], [n(12, 3), n(13)])
            expect(result.current.tabs.map(x => x.id)).toEqual([12, 13])
            expect(result.current.currentNote?.id).toBe(13)
            expect(result.current.currentFolder).toBeNull()
        })

        it("reopens the tab of a note whose delete failed after the optimistic removal closed it", async () => {
            const result = await setup([], [n(1), n(2), n(3)], [1, 2, 3], 2)
            const write = deferred()
            vi.mocked(deleteDBItem).mockReturnValueOnce(write.promise as never)
            let pending!: Promise<void>
            act(() => { pending = result.current.deleteItem("note", 2) })
            expect(result.current.tabs.map(x => x.id)).toEqual([1, 3])
            await act(async () => {
                write.reject(new Error("nope"))
                await expect(pending).rejects.toThrow("nope")
            })
            expect(result.current.tabs.map(x => x.id)).toEqual([1, 2, 3])
            expect(result.current.currentNote?.id).toBe(2)
        })

        it("does not touch the tabs when the db delete fails", async () => {
            const result = await setup([], [n(1)], [1], 1)
            vi.mocked(deleteDBItem).mockRejectedValueOnce(new Error("nope"))
            await act(async () => {
                await expect(result.current.deleteItem("note", 1)).rejects.toThrow("nope")
            })
            expect(result.current.tabs).toHaveLength(1)
        })
    })

    describe("move and trash", () => {
        it("forwards moveTreeItem without reloading data", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(() => result.current.moveTreeItem("note", 3, null, 2))
            expect(moveDBTreeItem).toHaveBeenCalledWith("note", 3, null, 2)
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
        })

        it("forwards the section and task moves without reloading data", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(() => result.current.moveSection(4, 2, 1))
            await act(() => result.current.moveSectionToNewGroup(4, 0))
            await act(() => result.current.moveTask(9, { sectionId: 4, parentTaskId: 7 }, 3))
            expect(moveDBSection).toHaveBeenCalledWith(4, 2, 1)
            await act(() => result.current.moveSection(4, 2, 1, true))
            expect(moveDBSection).toHaveBeenLastCalledWith(4, 2, 1, { beforeList: true })
            expect(moveDBSectionToNewGroup).toHaveBeenCalledWith(4, 0)
            expect(moveDBTask).toHaveBeenCalledWith(9, { sectionId: 4, parentTaskId: 7 }, 3)
            expect(getDBNoteData).not.toHaveBeenCalled()
        })

        it("propagates task move errors", async () => {
            vi.mocked(moveDBTask).mockRejectedValueOnce({ code: "TASK_MOVE_INVALID", message: "x" })
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(async () => {
                await expect(result.current.moveTask(1, { sectionId: 1, parentTaskId: 1 }, 0)).rejects.toMatchObject({ code: "TASK_MOVE_INVALID" })
            })
            expect(result.current.isLoading).toBe(false)
        })

        it("propagates move errors", async () => {
            vi.mocked(moveDBTreeItem).mockRejectedValueOnce({ code: "FOLDER_MOVE_INVALID", message: "x" })
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(async () => {
                await expect(result.current.moveTreeItem("folder", 1, 1, 0)).rejects.toMatchObject({ code: "FOLDER_MOVE_INVALID" })
            })
            expect(result.current.isLoading).toBe(false)
        })

        it("forwards the trash methods", async () => {
            const items = [{ type: "note", id: 1, name: "n", context: "", deleted_at: "2026-01-01" }]
            vi.mocked(getDBTrash).mockResolvedValue(items as never)
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(async () => {
                expect(await result.current.getTrash(4)).toBe(items)
                await result.current.restoreItem("note", 1)
                await result.current.purgeItem("folder", 2)
                await result.current.emptyTrash(4)
            })
            expect(getDBTrash).toHaveBeenCalledWith(4)
            expect(restoreDBItem).toHaveBeenCalledWith("note", 1)
            expect(purgeDBItem).toHaveBeenCalledWith("folder", 2)
            expect(emptyDBTrash).toHaveBeenCalledWith(4)
        })

        it("increments trashVersion after every successful trash-changing operation", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            expect(result.current.trashVersion).toBe(0)
            let expected = 0
            const ops: Array<() => Promise<unknown>> = [
                () => result.current.deleteItem("task", 5),
                () => result.current.restoreItem("note", 1),
                () => result.current.purgeItem("folder", 2),
                () => result.current.emptyTrash(4),
            ]
            for (const op of ops) {
                await act(() => op())
                expected += 1
                expect(result.current.trashVersion).toBe(expected)
            }
        })

        it("does not increment trashVersion when the operation fails or is unrelated", async () => {
            vi.mocked(deleteDBItem).mockRejectedValueOnce(new Error("nope"))
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(async () => {
                await expect(result.current.deleteItem("task", 1)).rejects.toThrow("nope")
            })
            await act(() => result.current.createTask(1, "x"))
            await act(() => result.current.renameItem("task", 1, "y"))
            expect(result.current.trashVersion).toBe(0)
        })

        it("forwards createNoteInFolder with the workspace id", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(() => result.current.createNoteInFolder(1, 2, "x"))
            expect(createDBNoteInFolder).toHaveBeenCalledWith(1, 2, "x")
        })
    })

    describe("archive", () => {
        const loadTree = async (result: { current: ReturnType<typeof useAll> }) => {
            const root = makeFolder({ id: 1, name: "Root" })
            const child = makeFolder({ id: 2, folderID: 1, name: "Child" })
            vi.mocked(getDBWorkspaceData).mockResolvedValue({
                folders: [root, child], notes: [makeNote({ id: 10, folderID: 2 }), makeNote({ id: 11, folderID: null })],
            } as never)
            await act(() => result.current.getWorkspaceData(1))
        }

        it("archives a folder or a note by removing it from the tree at once, without reloading", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await loadTree(result)
            vi.mocked(getDBWorkspaceData).mockClear()
            await act(() => result.current.archiveItem("note", 10))
            expect(archiveDBItem).toHaveBeenLastCalledWith("note", 10)
            expect(result.current.notes.map(n => n.id)).toEqual([11])
            await act(() => result.current.archiveItem("folder", 1))
            expect(result.current.workspaceDataTree!.rootFolders).toEqual([])
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
        })

        it("puts the item back and keeps archiveVersion when the write fails", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await loadTree(result)
            vi.mocked(archiveDBItem).mockRejectedValueOnce(new Error("nope"))
            await act(async () => {
                await expect(result.current.archiveItem("note", 11)).rejects.toThrow("nope")
            })
            expect(result.current.notes.map(n => n.id).sort()).toEqual([10, 11])
            expect(result.current.archiveVersion).toBe(0)
        })

        it("clears the current folder when an archived folder contains it", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await loadTree(result)
            act(() => result.current.setCurrentFolder(result.current.folders.find(f => f.id === 2)!))
            await act(() => result.current.archiveItem("folder", 1))
            expect(result.current.currentFolder).toBeNull()
        })

        it("a group or a section is archived without touching the tree (the caller updates the open note)", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await loadTree(result)
            const tree = result.current.workspaceDataTree
            await act(() => result.current.archiveItem("section_group", 3))
            await act(() => result.current.archiveItem("section", 4))
            expect(archiveDBItem).toHaveBeenCalledWith("section_group", 3)
            expect(archiveDBItem).toHaveBeenCalledWith("section", 4)
            expect(result.current.workspaceDataTree).toBe(tree)
        })

        it("unarchiveItem writes and does not reload; getArchive and getArchiveCount do not change any state", async () => {
            vi.mocked(getDBArchive).mockResolvedValue([])
            vi.mocked(getDBArchiveCount).mockResolvedValue(3)
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(() => result.current.unarchiveItem("note", 5))
            expect(unarchiveDBItem).toHaveBeenCalledWith("note", 5)
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
            expect(await result.current.getArchive(4)).toEqual([])
            expect(await result.current.getArchiveCount(4)).toBe(3)
            expect(getDBArchive).toHaveBeenCalledWith(4)
            expect(getDBArchiveCount).toHaveBeenCalledWith(4)
            expect(result.current.archiveVersion).toBe(1)
        })

        it("bumps archiveVersion on archive, unarchive and every trash operation, not on unrelated writes or failures", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            expect(result.current.archiveVersion).toBe(0)
            let expected = 0
            const ops: Array<() => Promise<unknown>> = [
                () => result.current.archiveItem("section", 1),
                () => result.current.unarchiveItem("section", 1),
                () => result.current.deleteItem("note", 1),
                () => result.current.restoreItem("note", 1),
                () => result.current.purgeItem("note", 1),
                () => result.current.emptyTrash(4),
            ]
            for (const op of ops) {
                await act(() => op())
                expected += 1
                expect(result.current.archiveVersion).toBe(expected)
            }
            vi.mocked(unarchiveDBItem).mockRejectedValueOnce(new Error("exists"))
            await act(async () => {
                await expect(result.current.unarchiveItem("note", 1)).rejects.toThrow("exists")
            })
            await act(() => result.current.renameItem("task", 1, "y"))
            expect(result.current.archiveVersion).toBe(expected)
        })

        it("bumps audioVersion when a group, note or folder is archived or unarchived, not for a section", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            await act(() => result.current.archiveItem("section", 1))
            expect(result.current.audioVersion).toBe(0)
            let expected = 0
            for (const [type, id] of [["section_group", 1], ["note", 2], ["folder", 3]] as const) {
                await act(() => result.current.archiveItem(type, id))
                expected += 1
                expect(result.current.audioVersion).toBe(expected)
            }
            await act(() => result.current.unarchiveItem("section_group", 1))
            expect(result.current.audioVersion).toBe(expected + 1)
        })
    })

    describe("updateGroupsPositions", () => {
        it("persists the new positions", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })
            const newGroups = [makeGroup({ id: 2, position: 0 }), makeGroup({ id: 1, position: 1 })]

            await act(() => result.current.updateGroupsPositions(newGroups))

            expect(updateDBGroupPositions).toHaveBeenCalledWith(newGroups)
        })

        it("rejects when the db update fails", async () => {
            vi.mocked(updateDBGroupPositions).mockRejectedValue(new Error("fail"))
            const { result } = renderHook(() => useAll(), { wrapper })

            await act(async () => {
                await expect(result.current.updateGroupsPositions([makeGroup({ id: 1 })])).rejects.toThrow("fail")
            })
            expect(result.current.isLoading).toBe(false)
        })
    })

    describe("setGroupWidth", () => {
        it("persists the width, or null for the automatic one", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })

            await act(() => result.current.setGroupWidth(3, 420))
            await act(() => result.current.setGroupWidth(3, null))

            expect(updateDBGroupWidth).toHaveBeenNthCalledWith(1, 3, 420)
            expect(updateDBGroupWidth).toHaveBeenNthCalledWith(2, 3, null)
        })

        it("rejects when the db update fails", async () => {
            vi.mocked(updateDBGroupWidth).mockRejectedValue(new Error("fail"))
            const { result } = renderHook(() => useAll(), { wrapper })

            await act(async () => {
                await expect(result.current.setGroupWidth(1, 300)).rejects.toThrow("fail")
            })
            expect(result.current.isLoading).toBe(false)
        })
    })

    describe("setCollapsed", () => {
        it("persists the open/closed state of a group, a section or a task", async () => {
            const { result } = renderHook(() => useAll(), { wrapper })

            await act(() => result.current.setCollapsed("group", 3, true))
            await act(() => result.current.setCollapsed("task", 8, false))

            expect(setDBCollapsed).toHaveBeenNthCalledWith(1, "group", 3, true)
            expect(setDBCollapsed).toHaveBeenNthCalledWith(2, "task", 8, false)
        })

        it("rejects when the db update fails", async () => {
            vi.mocked(setDBCollapsed).mockRejectedValue(new Error("fail"))
            const { result } = renderHook(() => useAll(), { wrapper })

            await act(async () => {
                await expect(result.current.setCollapsed("section", 1, true)).rejects.toThrow("fail")
            })
            expect(result.current.isLoading).toBe(false)
        })
    })

    it("resetData closes every tab and clears the current folder", async () => {
        vi.mocked(getDBNoteData).mockResolvedValue({ groups: [], sections: [], tasks: [] } as never)
        vi.mocked(getDBWorkspaceData).mockResolvedValue({ folders: [], notes: [makeNote({ id: 1 })] } as never)
        const { result } = renderHook(() => useAll(), { wrapper })
        await act(() => result.current.getWorkspaceData(1))
        await act(async () => { result.current.openNote(1) })
        await waitFor(() => expect(result.current.noteDataTree).not.toBeNull())
        expect(result.current.currentNote).not.toBeNull()

        act(() => result.current.resetData())
        expect(result.current.currentNote).toBeNull()
        expect(result.current.tabs).toEqual([])
        expect(result.current.noteDataTree).toBeNull()
    })
})
