import { memo, useEffect, useState, type ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { WorkspaceProvider } from "../workspace-context"
import { ShortcutsProvider } from "../shortcuts-context"
import { WorkspaceDataProvider, useWorkspaceData } from "../workspace-data"
import { useActiveNote, useActiveNoteActions } from "../use-active-note"
import { useTabsActions } from "../use-tabs"
import { useLayoutActions } from "../use-layout"
import { useWorkspace } from "../use-workspace"
import { UndoProvider } from "./provider"
import { TemplateDraftsContext } from "../template-drafts-context-object"
import type { TemplateDraft } from "@/db/queries/template-draft"
import { useUndo, useUndoRecorder } from "./use-undo"
import { getDBWorkspaceData } from "@/db/queries/workspace"
import { getDBNoteData } from "@/db/queries/note"
import { createDBTask, insertDBTaskAfter, updateDBTaskCompletion } from "@/db/queries/task"
import { moveDBTreeItem } from "@/db/queries/tree"
import { moveDBSection, moveDBTask } from "@/db/queries/move"
import { restoreDBItem } from "@/db/queries/trash"
import { deleteDBItem, renameDBItem, updateDBColor } from "@/db/queries/shared_queries"
import { makeGroup, makeNote, makeSection, makeTask, makeWorkspace } from "@/test/ui-fixtures"
import type { Folder } from "@/types/types"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/queries/tag", () => ({ getDBTags: vi.fn(async () => []), getDBNoteTags: vi.fn(async () => []) }))
vi.mock("@/db/queries/workspace", () => ({ getDBWorkspaces: vi.fn(), createDBWorkspace: vi.fn(), getDBWorkspaceData: vi.fn() }))
vi.mock("@/db/queries/note", () => ({
    createDBNoteInFolder: vi.fn(),
    createDBWorkspaceNote: vi.fn(),
    getDBNoteData: vi.fn(),
}))
vi.mock("@/db/queries/folder", () => ({
    createDBSubFolder: vi.fn(),
    createDBWorkspaceFolder: vi.fn(),
    updateDBFolderColorContent: vi.fn(),
}))
vi.mock("@/db/queries/section", () => ({ createDBSection: vi.fn(), createDBSectionInGroup: vi.fn() }))
vi.mock("@/db/queries/task", () => ({
    createDBSubTask: vi.fn(),
    createDBTask: vi.fn(),
    insertDBTaskAfter: vi.fn(),
    updateDBTaskCompletion: vi.fn(),
    updateDBTaskDescription: vi.fn(),
    updateDBTaskPriority: vi.fn(),
}))
vi.mock("@/db/queries/group", () => ({ updateDBGroupPositions: vi.fn() }))
vi.mock("@/db/queries/tree", () => ({ moveDBTreeItem: vi.fn() }))
vi.mock("@/db/queries/move", () => ({ moveDBSection: vi.fn(), moveDBSectionToNewGroup: vi.fn(), moveDBTask: vi.fn() }))
vi.mock("@/db/queries/trash", () => ({
    getDBTrash: vi.fn(),
    restoreDBItem: vi.fn(),
    purgeDBItem: vi.fn(),
    emptyDBTrash: vi.fn(),
    getDBTrashedWorkspaces: vi.fn(),
}))
vi.mock("@/db/queries/template", () => ({
    countDBTemplates: vi.fn(),
    createDBNoteFromTemplate: vi.fn(),
    createDBTemplateFromNote: vi.fn(),
    getDBTemplates: vi.fn(),
    updateDBTemplateFromNote: vi.fn(),
}))
vi.mock("@/db/queries/template-draft", () => ({ getDBTemplateDrafts: vi.fn(async () => []), createDBTemplateDraft: vi.fn(), saveDBTemplateDraft: vi.fn(), deleteDBTemplateDraft: vi.fn() }))
vi.mock("@/db/queries/shared_queries", () => ({ renameDBItem: vi.fn(), updateDBColor: vi.fn(), deleteDBItem: vi.fn() }))

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
        <WorkspaceProvider>
            <ShortcutsProvider>
                <WorkspaceDataProvider>
                    <UndoProvider>{children}</UndoProvider>
                </WorkspaceDataProvider>
            </ShortcutsProvider>
        </WorkspaceProvider>
    </MemoryRouter>
)

const useAll = () => ({
    workspace: useWorkspace(),
    data: useWorkspaceData(),
    note: useActiveNote(),
    noteActions: useActiveNoteActions(),
    tabs: useTabsActions(),
    layout: useLayoutActions(),
    undo: useUndo(),
    recorder: useUndoRecorder(),
})

const makeFolder = (over: Partial<Folder>): Folder => ({
    id: 1, workspaceID: 1, folderID: null, name: "F", position: 0, creation_date: "", creation_time: "", edit_date: "", edit_time: "",
    subfolders: [], notes: [], ...over,
})

const noteData = () => ({
    groups: [makeGroup({ id: 1, noteID: 10 })],
    sections: [makeSection({ id: 20, groupID: 1, title: "Sec" })],
    tasks: [makeTask({ id: 30, sectionID: 20, text: "Task" })],
})

const taskIds = (result: { current: ReturnType<typeof useAll> }) =>
    result.current.note.noteDataTree?.groups[0]?.sections[0]?.tasks.map(t => t.id)

/** A workspace with a folder (1) holding a note (11), a root note (10, open) and a root folder (2). */
async function setup(note: unknown = noteData(), wrap = wrapper) {
    vi.mocked(getDBWorkspaceData).mockResolvedValue({
        folders: [makeFolder({ id: 1, name: "Docs" }), makeFolder({ id: 2, name: "Other", position: 1 })],
        notes: [makeNote({ id: 10, name: "Open note", position: 0 }), makeNote({ id: 11, folderID: 1, name: "Inner", position: 0 })],
    } as never)
    vi.mocked(getDBNoteData).mockResolvedValue(note as never)

    const hook = renderHook(() => useAll(), { wrapper: wrap })
    await act(async () => { hook.result.current.workspace.setCurrentWorkspace(makeWorkspace({ id: 1 })) })
    await act(() => hook.result.current.data.getWorkspaceData(1))
    await act(async () => { hook.result.current.tabs.openNote(10) })
    await waitFor(() => expect(taskIds(hook.result)).toEqual([30]))
    vi.mocked(getDBWorkspaceData).mockClear()
    vi.mocked(getDBNoteData).mockClear()
    return hook
}

const press = (init: KeyboardEventInit, target: EventTarget = window) => {
    act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })) })
}

beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(renameDBItem).mockResolvedValue(undefined)
    vi.mocked(updateDBColor).mockResolvedValue(undefined)
    vi.mocked(deleteDBItem).mockResolvedValue(undefined)
    vi.mocked(restoreDBItem).mockResolvedValue(undefined)
    vi.mocked(updateDBTaskCompletion).mockResolvedValue(undefined)
    vi.mocked(moveDBTreeItem).mockResolvedValue(undefined)
    vi.mocked(moveDBTask).mockResolvedValue(undefined)
    vi.mocked(moveDBSection).mockResolvedValue(undefined)
    vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("UndoProvider", () => {
    it("useUndo throws outside the provider, the recorder does not", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        expect(() => renderHook(() => useUndo())).toThrow(/UndoProvider/)
        expect(() => renderHook(() => useUndoRecorder().rename("task", 1, "a", "b"))).not.toThrow()
        spy.mockRestore()
    })

    it("a component that only records does not render again when the history changes", async () => {
        let renders = 0
        const Recording = memo(function Recording() { renders++; useUndoRecorder(); return null })
        const { result } = await setup(noteData(), ({ children }) => wrapper({ children: <>{children}<Recording /></> }))
        const before = renders
        await act(async () => {
            await result.current.data.renameItem("note", 10, "Renamed")
            result.current.recorder.rename("note", 10, "Open note", "Renamed")
        })
        expect(result.current.undo.canUndo).toBe(true)
        expect(renders).toBe(before)
    })

    it("starts empty", async () => {
        const { result } = await setup()
        expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: false })
    })

    it("clear empties the whole history, so an entry on a purged (reusable) id can no longer be undone", async () => {
        const { result } = await setup()
        await act(async () => {
            await result.current.data.renameItem("note", 10, "Renamed")
            result.current.recorder.rename("note", 10, "Open note", "Renamed")
        })
        expect(result.current.undo.canUndo).toBe(true)
        act(() => result.current.undo.clear())
        expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: false })
        vi.mocked(renameDBItem).mockClear()
        await act(() => result.current.undo.undo())
        expect(renameDBItem).not.toHaveBeenCalled()
    })

    describe("rename and color of folders and notes", () => {
        it("undoes and redoes a note rename on the sidebar tree without reloading", async () => {
            const { result } = await setup()
            await act(async () => {
                await result.current.data.renameItem("note", 10, "Renamed")
                result.current.recorder.rename("note", 10, "Open note", "Renamed")
            })
            expect(result.current.data.workspaceDataTree!.rootNotes[0].name).toBe("Renamed")
            expect(result.current.undo.undoLabel).toBe("Rinomina nota \"Open note\"")

            await act(() => result.current.undo.undo())
            expect(renameDBItem).toHaveBeenLastCalledWith("note", 10, "Open note")
            expect(result.current.data.workspaceDataTree!.rootNotes[0].name).toBe("Open note")
            expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: true })

            await act(() => result.current.undo.redo())
            expect(renameDBItem).toHaveBeenLastCalledWith("note", 10, "Renamed")
            expect(result.current.data.workspaceDataTree!.rootNotes[0].name).toBe("Renamed")
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
            expect(getDBNoteData).not.toHaveBeenCalled()
        })

        it("restores the color of a folder", async () => {
            const { result } = await setup()
            await act(async () => {
                await result.current.data.updateItemColor("folder", 1, "#fff")
                result.current.recorder.color("folder", 1, "Docs", null, "#fff")
            })
            expect(result.current.data.workspaceDataTree!.rootFolders[0].color).toBe("#fff")
            await act(() => result.current.undo.undo())
            expect(updateDBColor).toHaveBeenLastCalledWith("folder", 1, undefined)
            expect(result.current.data.workspaceDataTree!.rootFolders[0].color).toBeUndefined()
        })
    })

    describe("tasks of the open note", () => {
        it("undoes and redoes a completion in the cached note, without any reload", async () => {
            const { result } = await setup()
            await act(async () => {
                const rollback = result.current.noteActions.patchTask(30, { completed: true })
                await result.current.data.updateTaskCompletion(30, true)
                void rollback
                result.current.recorder.taskCompletion(30, "Task", false, true)
            })
            const completed = () => result.current.note.noteDataTree!.groups[0].sections[0].tasks[0].completed
            expect(completed()).toBe(true)

            await act(() => result.current.undo.undo())
            expect(updateDBTaskCompletion).toHaveBeenLastCalledWith(30, false)
            expect(completed()).toBe(false)
            await act(() => result.current.undo.redo())
            expect(updateDBTaskCompletion).toHaveBeenLastCalledWith(30, true)
            expect(completed()).toBe(true)
            expect(getDBNoteData).not.toHaveBeenCalled()
        })

        it("undoes a task delete by restoring the same id and reloading the note, and redoes it optimistically", async () => {
            const { result } = await setup()
            await act(async () => {
                result.current.noteActions.removeTask(30)
                await result.current.data.deleteItem("task", 30)
                result.current.recorder.remove("task", 30, "Task")
            })
            expect(taskIds(result)).toEqual([])

            await act(() => result.current.undo.undo())
            expect(restoreDBItem).toHaveBeenCalledWith("task", 30)
            expect(deleteDBItem).toHaveBeenCalledTimes(1)
            await waitFor(() => expect(taskIds(result)).toEqual([30]))
            expect(getDBNoteData).toHaveBeenCalledTimes(1)

            await act(() => result.current.undo.redo())
            expect(deleteDBItem).toHaveBeenLastCalledWith("task", 30)
            expect(taskIds(result)).toEqual([])
        })

        it("undoes a task creation by deleting it and redoes it by restoring it", async () => {
            vi.mocked(createDBTask).mockResolvedValue(31 as never)
            const { result } = await setup()
            await act(async () => {
                const id = await result.current.data.createTask(20, "Second")
                result.current.noteActions.appendTask(id, { sectionId: 20 }, "Second")
                result.current.recorder.create("task", id, "Second")
            })
            expect(taskIds(result)).toEqual([30, 31])

            await act(() => result.current.undo.undo())
            expect(deleteDBItem).toHaveBeenCalledWith("task", 31)
            expect(taskIds(result)).toEqual([30])

            vi.mocked(getDBNoteData).mockResolvedValue({
                ...noteData(),
                tasks: [makeTask({ id: 30, sectionID: 20 }), makeTask({ id: 31, sectionID: 20, position: 1 })],
            } as never)
            await act(() => result.current.undo.redo())
            expect(restoreDBItem).toHaveBeenCalledWith("task", 31)
            await waitFor(() => expect(taskIds(result)).toEqual([30, 31]))
        })

        it("undoes a task inserted between two others in a single step", async () => {
            vi.mocked(insertDBTaskAfter).mockResolvedValue({ id: 31, index: 0 })
            const { result } = await setup()
            await act(async () => {
                const { id, index } = await result.current.data.insertTaskAfter({ sectionId: 20 }, null, "Mezzo")
                result.current.noteActions.appendTask(id, { sectionId: 20 }, "Mezzo", index)
                result.current.recorder.create("task", id, "Mezzo")
            })
            expect(taskIds(result)).toEqual([31, 30])

            await act(() => result.current.undo.undo())
            expect(deleteDBItem).toHaveBeenCalledWith("task", 31)
            expect(taskIds(result)).toEqual([30])
            expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: true })
        })

        it("moves a task back to its old place with the optimistic update", async () => {
            const { result } = await setup({
                groups: [makeGroup({ id: 1, noteID: 10 })],
                sections: [makeSection({ id: 20, groupID: 1 }), makeSection({ id: 21, groupID: 1, title: "Other", position: 1 })],
                tasks: [makeTask({ id: 30, sectionID: 20 })],
            })
            const idsOf = (section: number) => result.current.note.noteDataTree!.groups[0].sections[section].tasks.map(t => t.id)
            expect(idsOf(0)).toEqual([30])

            await act(async () => {
                result.current.noteActions.applyTaskMove(30, { sectionId: 21, parentTaskId: null }, 0)
                await result.current.data.moveTask(30, { sectionId: 21, parentTaskId: null }, 0)
                result.current.recorder.taskMove(30, "Task", { sectionId: 20, parentTaskId: null, index: 0 }, { sectionId: 21, parentTaskId: null, index: 0 })
            })
            expect(idsOf(1)).toEqual([30])

            await act(() => result.current.undo.undo())
            expect(moveDBTask).toHaveBeenLastCalledWith(30, { sectionId: 20, parentTaskId: null }, 0)
            expect(idsOf(0)).toEqual([30])
            expect(idsOf(1)).toEqual([])
        })
    })

    describe("two panes", () => {
        /** Note 10 open in the left pane, 11 in the right one, the focus on the left. */
        async function splitSetup() {
            const hook = await setup()
            await act(async () => {
                hook.result.current.layout.split()
                hook.result.current.layout.openInPane(11, 1)
                hook.result.current.layout.focusPane(0)
            })
            vi.mocked(getDBNoteData).mockClear()
            return hook
        }

        it("stamps the commands with the note of the focused pane and reloads that note after an undo done from the other pane", async () => {
            const { result } = await splitSetup()
            await act(async () => { result.current.recorder.taskCompletion(30, "Task", false, true) })

            // The user moves to the other pane: an undo now acts on a note that is open but not focused
            await act(async () => { result.current.layout.focusPane(1) })
            await act(() => result.current.undo.undo())
            expect(updateDBTaskCompletion).toHaveBeenLastCalledWith(30, false)
            expect(getDBNoteData).toHaveBeenCalledWith(10)

            vi.mocked(getDBNoteData).mockClear()
            await act(() => result.current.undo.redo())
            expect(getDBNoteData).toHaveBeenCalledWith(10)
        })

        it("does not reload the note when it is the focused one, nor when it is no longer open", async () => {
            const { result } = await splitSetup()
            await act(async () => { result.current.recorder.taskCompletion(30, "Task", false, true) })
            await act(() => result.current.undo.undo())
            expect(getDBNoteData).not.toHaveBeenCalled()

            await act(async () => { result.current.recorder.taskCompletion(30, "Task", false, true) })
            await act(async () => { result.current.layout.focusPane(1); result.current.tabs.closeNote(10) })
            vi.mocked(getDBNoteData).mockClear()
            await act(() => result.current.undo.undo())
            expect(getDBNoteData).not.toHaveBeenCalled()
        })
    })

    describe("folders and notes", () => {
        it("undoes a note delete by restoring it and reloading the sidebar tree", async () => {
            const { result } = await setup()
            await act(async () => {
                await result.current.data.deleteItem("note", 11)
                result.current.recorder.remove("note", 11, "Inner")
            })
            expect(result.current.data.workspaceDataTree!.rootFolders[0].notes).toEqual([])

            vi.mocked(getDBWorkspaceData).mockResolvedValue({
                folders: [makeFolder({ id: 1, name: "Docs" }), makeFolder({ id: 2, name: "Other", position: 1 })],
                notes: [makeNote({ id: 10, name: "Open note" }), makeNote({ id: 11, folderID: 1, name: "Inner" })],
            } as never)
            await act(() => result.current.undo.undo())
            expect(restoreDBItem).toHaveBeenCalledWith("note", 11)
            expect(getDBWorkspaceData).toHaveBeenCalledWith(1)
            expect(result.current.data.workspaceDataTree!.rootFolders[0].notes.map(n => n.id)).toEqual([11])
        })

        it("undoes a creation by deleting the created folder", async () => {
            const { createDBWorkspaceFolder } = await import("@/db/queries/folder")
            vi.mocked(createDBWorkspaceFolder).mockResolvedValue(9 as never)
            const { result } = await setup()
            let id: number | null = null
            await act(async () => {
                id = await result.current.data.createWorkspaceFolder(1, "New")
                if (id !== null) result.current.recorder.create("folder", id, "New")
            })
            expect(id).toBe(9)
            expect(result.current.data.workspaceDataTree!.rootFolders.map(f => f.id)).toEqual([1, 2, 9])

            await act(() => result.current.undo.undo())
            expect(deleteDBItem).toHaveBeenCalledWith("folder", 9)
            expect(result.current.data.workspaceDataTree!.rootFolders.map(f => f.id)).toEqual([1, 2])
        })

        it("moves a note back to the old folder and index", async () => {
            const { result } = await setup()
            await act(async () => {
                await result.current.data.moveTreeItem("note", 11, null, 1)
                result.current.recorder.treeMove("note", 11, "Inner", { folderId: 1, index: 0 }, { folderId: null, index: 1 })
            })
            await act(() => result.current.undo.undo())
            expect(moveDBTreeItem).toHaveBeenLastCalledWith("note", 11, 1, 0)
            expect(getDBWorkspaceData).toHaveBeenCalledWith(1)
            await act(() => result.current.undo.redo())
            expect(moveDBTreeItem).toHaveBeenLastCalledWith("note", 11, null, 1)
        })
    })

    describe("stack rules", () => {
        it("a new action empties the redo stack, and the inverse operations do not add history", async () => {
            const { result } = await setup()
            await act(async () => {
                await result.current.data.renameItem("note", 10, "B")
                result.current.recorder.rename("note", 10, "A", "B")
            })
            await act(() => result.current.undo.undo())
            expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: true })

            await act(async () => { result.current.recorder.rename("note", 10, "A", "C") })
            expect(result.current.undo).toMatchObject({ canUndo: true, canRedo: false })
            await act(() => result.current.undo.undo())
            expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: true, redoLabel: expect.stringContaining("Rinomina") })
        })

        it("is emptied when the workspace changes", async () => {
            const { result } = await setup()
            await act(async () => { result.current.recorder.rename("note", 10, "A", "B") })
            expect(result.current.undo.canUndo).toBe(true)

            await act(async () => { result.current.workspace.setCurrentWorkspace(makeWorkspace({ id: 2 })) })
            expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: false })
        })

        it("reports a failing undo with a toast, drops the command and stays usable", async () => {
            const { result } = await setup()
            await act(async () => { result.current.recorder.rename("note", 10, "A", "B") })
            vi.mocked(renameDBItem).mockRejectedValueOnce(new Error("name already used"))

            await act(() => result.current.undo.undo())
            expect(toast.error).toHaveBeenCalledWith("Impossibile annullare: Rinomina nota \"A\"")
            expect(console.error).toHaveBeenCalled()
            expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: false })
            expect(result.current.data.workspaceDataTree!.rootNotes[0].name).toBe("Open note")

            await act(async () => { result.current.recorder.rename("note", 10, "A", "B") })
            expect(result.current.undo.canUndo).toBe(true)
        })

        it("a failed restore does not reload anything", async () => {
            const { result } = await setup()
            await act(async () => { result.current.recorder.remove("note", 11, "Inner") })
            vi.mocked(restoreDBItem).mockRejectedValueOnce(new Error("name taken"))
            await act(() => result.current.undo.undo())
            expect(toast.error).toHaveBeenCalledWith("Impossibile annullare: Elimina nota \"Inner\"")
            expect(getDBWorkspaceData).not.toHaveBeenCalled()
        })
    })

    describe("toasts and shortcuts", () => {
        it("shows 'Annullato' with a Ripeti button that redoes the action", async () => {
            const { result } = await setup()
            await act(async () => { result.current.recorder.rename("note", 10, "A", "B") })
            await act(() => result.current.undo.undo())

            const [message, options] = vi.mocked(toast).mock.calls.at(-1)!
            expect(message).toBe("Annullato: Rinomina nota \"A\"")
            expect(options?.action).toMatchObject({ label: "Ripeti" })

            await act(async () => { (options!.action as unknown as { onClick: () => void }).onClick() })
            await waitFor(() => expect(renameDBItem).toHaveBeenLastCalledWith("note", 10, "B"))
            expect(vi.mocked(toast).mock.calls.at(-1)![0]).toBe("Ripetuto: Rinomina nota \"A\"")
            expect(result.current.undo).toMatchObject({ canUndo: true, canRedo: false })
        })

        it("says there is nothing to undo or redo", async () => {
            const { result } = await setup()
            await act(() => result.current.undo.undo())
            expect(toast.info).toHaveBeenLastCalledWith("Niente da annullare", expect.anything())
            await act(() => result.current.undo.redo())
            expect(toast.info).toHaveBeenLastCalledWith("Niente da ripetere", expect.anything())
        })

        it("Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo", async () => {
            const { result } = await setup()
            await act(async () => { result.current.recorder.rename("note", 10, "A", "B") })

            press({ key: "z", ctrlKey: true })
            await waitFor(() => expect(result.current.undo.canRedo).toBe(true))
            press({ key: "y", ctrlKey: true })
            await waitFor(() => expect(result.current.undo.canUndo).toBe(true))
            press({ key: "z", ctrlKey: true })
            await waitFor(() => expect(result.current.undo.canRedo).toBe(true))
            press({ key: "Z", ctrlKey: true, shiftKey: true })
            await waitFor(() => expect(result.current.undo.canUndo).toBe(true))
        })

        it("does not act while typing in a text field", async () => {
            const { result } = await setup()
            await act(async () => { result.current.recorder.rename("note", 10, "A", "B") })
            const input = document.createElement("input")
            document.body.appendChild(input)

            press({ key: "z", ctrlKey: true }, input)
            await act(async () => { await Promise.resolve() })
            expect(renameDBItem).not.toHaveBeenCalled()
            expect(result.current.undo.canUndo).toBe(true)
            input.remove()
        })
    })

    describe("entries and undoTo/redoTo", () => {
        const recordThree = async (result: { current: ReturnType<typeof useAll> }) => {
            await act(async () => {
                result.current.recorder.rename("note", 10, "A", "B")
                result.current.recorder.rename("note", 10, "B", "C")
                result.current.recorder.rename("note", 10, "C", "D")
            })
        }

        it("exposes the labels, most recent first, with a stable identity", async () => {
            const { result } = await setup()
            expect(result.current.undo.entries).toEqual({ undo: [], redo: [] })
            await recordThree(result)
            expect(result.current.undo.entries.undo).toEqual([
                "Rinomina nota \"C\"", "Rinomina nota \"B\"", "Rinomina nota \"A\"",
            ])
            const entries = result.current.undo.entries
            await act(async () => { await Promise.resolve() })
            expect(result.current.undo.entries).toBe(entries)
        })

        it("undoTo undoes up to the entry in order and shows one summary toast with a Ripeti button", async () => {
            const { result } = await setup()
            await recordThree(result)
            await act(() => result.current.undo.undoTo(1))
            expect(vi.mocked(renameDBItem).mock.calls.map(c => c[2])).toEqual(["C", "B"])
            expect(result.current.undo.entries).toEqual({ undo: ["Rinomina nota \"A\""], redo: ["Rinomina nota \"B\"", "Rinomina nota \"C\""] })

            const [message, options] = vi.mocked(toast).mock.calls.at(-1)!
            expect(message).toBe("Annullate 2 azioni")
            expect(options?.action).toMatchObject({ label: "Ripeti" })

            vi.mocked(renameDBItem).mockClear()
            await act(async () => { (options!.action as unknown as { onClick: () => void }).onClick() })
            await waitFor(() => expect(result.current.undo.entries.redo).toEqual([]))
            expect(vi.mocked(renameDBItem).mock.calls.map(c => c[2])).toEqual(["C", "D"])
            expect(vi.mocked(toast).mock.calls.at(-1)![0]).toBe("Ripetute 2 azioni")
        })

        it("redoTo redoes up to the entry and uses the singular for one action", async () => {
            const { result } = await setup()
            await recordThree(result)
            await act(() => result.current.undo.undoTo(2))
            await act(() => result.current.undo.redoTo(0))
            expect(vi.mocked(toast).mock.calls.at(-1)![0]).toBe("Ripetuta 1 azione")
            expect(result.current.undo.entries.undo).toEqual(["Rinomina nota \"A\""])
        })

        it("tells there is nothing to undo, and reports a failure in the middle like the single undo", async () => {
            const { result } = await setup()
            await act(() => result.current.undo.undoTo(0))
            expect(toast.info).toHaveBeenLastCalledWith("Niente da annullare", expect.anything())

            await recordThree(result)
            vi.mocked(renameDBItem).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("taken"))
            await act(() => result.current.undo.undoTo(2))
            expect(toast.error).toHaveBeenCalledWith("Impossibile annullare: Rinomina nota \"B\"")
            expect(vi.mocked(toast).mock.calls.at(-1)![0]).toBe("Annullata 1 azione")
            expect(result.current.undo.entries).toEqual({ undo: ["Rinomina nota \"A\""], redo: ["Rinomina nota \"C\""] })
        })
    })
})

describe("UndoProvider with template drafts", () => {
    const draft = (noteId: number): TemplateDraft => ({ noteId, templateId: 1, templateName: "T", color: null, trashed: false })
    const command = (label: string) => ({ label, undo: vi.fn().mockResolvedValue(undefined), redo: vi.fn().mockResolvedValue(undefined) })

    async function setupWithDrafts() {
        const control: { setDrafts: (drafts: TemplateDraft[]) => void } = { setDrafts: () => {} }
        const Drafts = ({ children }: { children: ReactNode }) => {
            const [drafts, set] = useState<TemplateDraft[]>([draft(11)])
            useEffect(() => { control.setDrafts = set }, [set])
            return <TemplateDraftsContext.Provider value={{ drafts }}>{children}</TemplateDraftsContext.Provider>
        }
        const draftsWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter>
                <WorkspaceProvider>
                    <ShortcutsProvider>
                        <WorkspaceDataProvider>
                            <Drafts><UndoProvider>{children}</UndoProvider></Drafts>
                        </WorkspaceDataProvider>
                    </ShortcutsProvider>
                </WorkspaceProvider>
            </MemoryRouter>
        )
        vi.mocked(getDBWorkspaceData).mockResolvedValue({
            folders: [],
            notes: [makeNote({ id: 10, name: "Open note", position: 0 }), makeNote({ id: 11, name: "Draft", position: 1 })],
        } as never)
        vi.mocked(getDBNoteData).mockResolvedValue(noteData() as never)
        const hook = renderHook(() => useAll(), { wrapper: draftsWrapper })
        await act(async () => { hook.result.current.workspace.setCurrentWorkspace(makeWorkspace({ id: 1 })) })
        await act(() => hook.result.current.data.getWorkspaceData(1))
        await act(async () => { hook.result.current.tabs.openNote(10) })
        await waitFor(() => expect(taskIds(hook.result)).toEqual([30]))
        return { ...hook, setDrafts: (drafts: TemplateDraft[]) => act(() => control.setDrafts(drafts)) }
    }

    it("undoes a change done in a draft only with the draft active, and a normal one from anywhere", async () => {
        const { result } = await setupWithDrafts()
        const normal = command("normal")
        const inDraft = command("in draft")
        act(() => result.current.recorder.record(normal))
        await act(async () => { result.current.tabs.openNote(11) })
        act(() => result.current.recorder.record(inDraft))

        // Another note is active: the draft change is blocked and stays in the history
        await act(async () => { result.current.tabs.openNote(10) })
        await act(() => result.current.undo.undo())
        expect(inDraft.undo).not.toHaveBeenCalled()
        expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("template"), expect.anything())
        expect(result.current.undo.canUndo).toBe(true)

        await act(async () => { result.current.tabs.openNote(11) })
        await act(() => result.current.undo.undo())
        expect(inDraft.undo).toHaveBeenCalledTimes(1)

        // The normal change is undone while the draft is active
        await act(() => result.current.undo.undo())
        expect(normal.undo).toHaveBeenCalledTimes(1)
    })

    it("drops the actions of a draft from both stacks when the draft goes away", async () => {
        const { result, setDrafts } = await setupWithDrafts()
        await act(async () => { result.current.tabs.openNote(11) })
        act(() => result.current.recorder.record(command("a")))
        act(() => result.current.recorder.record(command("b")))
        await act(() => result.current.undo.undo())
        expect(result.current.undo).toMatchObject({ canUndo: true, canRedo: true })

        await setDrafts([])
        expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: false })
    })
})