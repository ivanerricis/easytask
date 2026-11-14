import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NoteDataTree, Tag } from "@/types/types"
import { makeUndoRecorderMock } from "@/test/mocks"
import { makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import { useTagMutations } from "./use-tag-mutations"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/lib/report-error", async () => (await import("@/test/mocks")).reportErrorMock())

const tag = (id: number, name: string): Tag => ({ id, workspaceID: 1, name, color: null, position: id })
let tags: Tag[]
const actions = { createTag: vi.fn(), renameTag: vi.fn(), updateTagColor: vi.fn(), deleteTag: vi.fn(), setTaskTag: vi.fn() }
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => actions, useWorkspaceTags: () => tags }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: 1 } }) }))

let tree: NoteDataTree
const rollback = vi.fn()
const note = { getNoteTree: () => tree, patchTask: vi.fn(() => rollback), refreshActiveNote: vi.fn() }
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => note }))
const recorder = makeUndoRecorderMock()
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))

const bug = tag(1, "Bug")

beforeEach(() => {
    vi.clearAllMocks()
    tags = [bug]
    tree = { groups: [makeGroup({ sections: [makeSection({ id: 1, tasks: [makeTask({ id: 10 }), makeTask({ id: 11, tagIDs: [1] })] })] })] }
    for (const fn of Object.values(actions)) fn.mockResolvedValue(undefined)
    note.refreshActiveNote.mockResolvedValue(undefined)
})

const mutations = () => renderHook(() => useTagMutations()).result.current

describe("useTagMutations", () => {
    it("gives the tag only to the tasks that lack it, patches the note first and records ONE step", async () => {
        await mutations().assign(bug, [10, 11], true)
        expect(note.patchTask).toHaveBeenCalledTimes(1)
        expect(note.patchTask).toHaveBeenCalledWith(10, { tagIDs: [1] })
        expect(actions.setTaskTag).toHaveBeenCalledWith(1, [10], true)
        expect(recorder.tagAssign).toHaveBeenCalledWith(bug, [10], true)
    })

    it("does nothing (no write, no step) when every task is already in the wanted state", async () => {
        await mutations().assign(bug, [11], true)
        expect(actions.setTaskTag).not.toHaveBeenCalled()
        expect(recorder.tagAssign).not.toHaveBeenCalled()
    })

    it("puts the note back and records nothing when the write fails", async () => {
        actions.setTaskTag.mockRejectedValueOnce(new Error("fail"))
        await expect(mutations().assign(bug, [10], true)).rejects.toThrow("fail")
        expect(rollback).toHaveBeenCalledTimes(1)
        expect(recorder.tagAssign).not.toHaveBeenCalled()
    })

    it("creates a tag for the tasks as ONE step with the tasks it was given to", async () => {
        const later = tag(2, "Later")
        actions.createTag.mockResolvedValueOnce(later)
        await expect(mutations().create("  Later ", [10, 11])).resolves.toBe(later)
        expect(actions.createTag).toHaveBeenCalledWith(1, "Later")
        expect(actions.setTaskTag).toHaveBeenCalledWith(2, [10, 11], true)
        expect(recorder.tagCreate).toHaveBeenCalledWith(later, [10, 11])
        expect(recorder.tagAssign).not.toHaveBeenCalled()
    })

    it("a name that exists (any case) gives that tag instead of creating another", async () => {
        await expect(mutations().create("bug", [10])).resolves.toBe(bug)
        expect(actions.createTag).not.toHaveBeenCalled()
        expect(recorder.tagAssign).toHaveBeenCalledWith(bug, [10], true)
        expect(await mutations().create("   ", [10])).toBeNull()
    })

    it("a tag whose assignment fails is still created, and recorded without tasks", async () => {
        const later = tag(2, "Later")
        actions.createTag.mockResolvedValueOnce(later)
        actions.setTaskTag.mockRejectedValueOnce(new Error("fail"))
        await mutations().create("Later", [10])
        expect(rollback).toHaveBeenCalledTimes(1)
        expect(recorder.tagCreate).toHaveBeenCalledWith(later, [])
    })

    it("rename and recolor skip a change that changes nothing, and record the old and new values", async () => {
        const m = mutations()
        await m.rename(bug, " Bug ")
        await m.recolor(bug, null)
        expect(actions.renameTag).not.toHaveBeenCalled()
        expect(actions.updateTagColor).not.toHaveBeenCalled()
        await m.rename(bug, "Defect")
        await m.recolor(bug, "#ff0000")
        expect(recorder.tagRename).toHaveBeenCalledWith(1, "Bug", "Defect")
        expect(recorder.tagColor).toHaveBeenCalledWith(1, "Bug", null, "#ff0000")
    })

    it("delete records the tasks that had the tag and refreshes the open note", async () => {
        actions.deleteTag.mockResolvedValueOnce([10, 11])
        await mutations().remove(bug)
        expect(recorder.tagDelete).toHaveBeenCalledWith(bug, [10, 11])
        expect(note.refreshActiveNote).toHaveBeenCalledTimes(1)
    })
})
