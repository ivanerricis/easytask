import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NoteDataTree } from "@/types/types"
import type { UndoCommand } from "@/contexts/undo/stack"
import { makeDefaultSection, makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import { findGroup, findSection, findTask } from "@/contexts/note-tree-ops"

/*
 * The drops that cross to the other note: a move updates both cached notes at once, writes, and records ONE undo command; it puts both
 * notes back when the write fails. A copy writes first, reloads the destination and records a command that trashes the copies.
 */
const noteA = (): NoteDataTree => ({
    groups: [
        makeGroup({
            id: 1, noteID: 1, position: 0, sections: [
                makeSection({ id: 10, groupID: 1, title: "S10", tasks: [makeTask({ id: 100, sectionID: 10, text: "Mover", position: 0 }), makeTask({ id: 102, sectionID: 10, text: "Stayer", position: 1 })] }),
                makeSection({ id: 11, groupID: 1, title: "S11", position: 1 }),
            ],
        }),
        makeGroup({ id: 2, noteID: 1, position: 1, sections: [] }),
    ],
})
const noteB = (): NoteDataTree => ({
    groups: [
        makeGroup({ id: 3, noteID: 2, position: 0, defaultSection: makeDefaultSection({ id: 31, groupID: 3 }), sections: [makeSection({ id: 30, groupID: 3, title: "S30", tasks: [makeTask({ id: 300, sectionID: 30, text: "Resident" })] })] }),
    ],
})

const cache = new Map<number, NoteDataTree>()
const setNoteDataTree = vi.fn((tree: NoteDataTree | null, noteId?: number) => { if (tree && noteId !== undefined) cache.set(noteId, tree) })
const getNoteData = vi.fn(async () => undefined)
const deleteItem = vi.fn(async () => undefined)
const restoreItem = vi.fn(async () => undefined)
const recorded: UndoCommand[] = []
const dispatch = vi.fn()
const sync = vi.fn()
const reportError = vi.fn()

vi.mock("@/contexts/use-tabs", () => ({ useActiveNoteId: () => 1 }))
vi.mock("@/contexts/use-active-note", () => ({
    useActiveNoteActions: () => ({ getCachedNoteTree: (id: number) => cache.get(id) ?? null, setNoteDataTree, getNoteData }),
}))
vi.mock("@/contexts/workspace-data", () => ({
    useWorkspaceActions: () => ({ deleteItem, restoreItem }),
    useWorkspaceTags: () => [],
}))
vi.mock("@/contexts/undo/use-undo", () => ({
    useUndoRecorder: () => ({ record: (command: UndoCommand) => { recorded.push(command) }, track: <T,>(write: Promise<T>) => write }),
}))
vi.mock("@/hooks/use-automations", () => ({ useAutomations: () => ({ dispatch, sync }) }))
vi.mock("@/lib/report-error", async importActual => ({ ...await importActual<typeof import("@/lib/report-error")>(), reportError: (...args: unknown[]) => reportError(...args) }))

const db = vi.hoisted(() => ({
    moveDBTaskToNote: vi.fn(), moveDBSectionToNote: vi.fn(), moveDBSectionToNewGroupOfNote: vi.fn(), moveDBGroupToNote: vi.fn(),
    copyDBTasksToNote: vi.fn(), copyDBSectionToNote: vi.fn(), copyDBGroupToNote: vi.fn(), moveDBDirectSection: vi.fn(),
}))
vi.mock("@/db/queries/cross-note", () => db)
const createDBGroup = vi.hoisted(() => vi.fn())
vi.mock("@/db/queries/group", () => ({ createDBGroup }))
vi.mock("@/db/queries/move", () => ({ moveDBDirectSection: db.moveDBDirectSection }))

import { useCrossNoteMoves } from "./note-dnd-cross"

beforeEach(() => {
    cache.clear()
    cache.set(1, noteA())
    cache.set(2, noteB())
    recorded.length = 0
    for (const fn of [setNoteDataTree, getNoteData, deleteItem, restoreItem, dispatch, reportError, ...Object.values(db)]) fn.mockClear()
    for (const fn of Object.values(db)) fn.mockReset().mockResolvedValue(undefined)
})

const setup = () => renderHook(() => useCrossNoteMoves()).result.current

describe("a task dropped on the other note", () => {
    const drop = { kind: "task", id: 100, toNoteId: 2, target: { sectionId: 30, parentTaskId: null, index: 1 }, copy: false } as const

    it("updates both cached notes at once, writes with the cross-note query and tells the rules of the destination note", async () => {
        const { dropAcross } = setup()
        await dropAcross(drop)
        expect(findTask(cache.get(1)!, 100)).toBeUndefined()
        expect(findTask(cache.get(2)!, 100)).toMatchObject({ parent: { sectionId: 30 }, index: 1 })
        expect(db.moveDBTaskToNote).toHaveBeenCalledWith(100, { sectionId: 30, parentTaskId: null }, 1)
        expect(dispatch).toHaveBeenCalledWith({ type: "task.moved", taskId: 100, fromSectionId: 10 }, 2)
        // The state rules of both notes run again (the one without the focus is not synced by itself)
        expect(sync).toHaveBeenCalledWith(1)
        expect(sync).toHaveBeenCalledWith(2)
    })

    it("is ONE undo step: undo moves the task back and reloads both notes, redo moves it again", async () => {
        const { dropAcross } = setup()
        await dropAcross(drop)
        expect(recorded).toHaveLength(1)
        expect(recorded[0].label).toContain("Mover")
        db.moveDBTaskToNote.mockClear()
        await recorded[0].undo()
        expect(db.moveDBTaskToNote).toHaveBeenCalledWith(100, { sectionId: 10, parentTaskId: null }, 0)
        expect(getNoteData).toHaveBeenCalledWith(1)
        expect(getNoteData).toHaveBeenCalledWith(2)
        db.moveDBTaskToNote.mockClear()
        await recorded[0].redo()
        expect(db.moveDBTaskToNote).toHaveBeenCalledWith(100, { sectionId: 30, parentTaskId: null }, 1)
        expect(recorded).toHaveLength(1)
    })

    it("puts both notes back and reports when the write fails, recording nothing", async () => {
        db.moveDBTaskToNote.mockRejectedValue(new Error("boom"))
        const before = [cache.get(1), cache.get(2)]
        const { dropAcross } = setup()
        await dropAcross(drop)
        expect(cache.get(1)).toBe(before[0])
        expect(cache.get(2)).toBe(before[1])
        expect(reportError).toHaveBeenCalled()
        expect(recorded).toHaveLength(0)
        expect(dispatch).not.toHaveBeenCalled()
    })

    it("a move inside the same note (the same note in both panes) changes one tree", async () => {
        const { dropAcross } = setup()
        await dropAcross({ kind: "task", id: 100, toNoteId: 1, target: { sectionId: 11, parentTaskId: null, index: 0 }, copy: false })
        expect(findTask(cache.get(1)!, 100)).toMatchObject({ parent: { sectionId: 11 } })
        expect(db.moveDBTaskToNote).toHaveBeenCalledWith(100, { sectionId: 11, parentTaskId: null }, 0)
    })
})

describe("a section dropped on the other note", () => {
    it("moves the section with its tasks, and undo puts it back", async () => {
        const { dropAcross } = setup()
        await dropAcross({ kind: "section", id: 10, toNoteId: 2, target: { type: "group", groupId: 3, index: 1 }, copy: false })
        expect(findSection(cache.get(1)!, 10)).toBeUndefined()
        expect(findSection(cache.get(2)!, 10)).toMatchObject({ groupId: 3, index: 1 })
        expect(db.moveDBSectionToNote).toHaveBeenCalledWith(10, 3, 1, { beforeList: undefined })
        expect(recorded).toHaveLength(1)
        await recorded[0].undo()
        expect(db.moveDBSectionToNote).toHaveBeenLastCalledWith(10, 1, 0, { beforeList: undefined })
    })

    it("a new group of the other note is created by the write and then filled; undo trashes it", async () => {
        db.moveDBSectionToNewGroupOfNote.mockResolvedValue({ groupId: 50, defaultSectionId: 51 })
        const { dropAcross } = setup()
        await dropAcross({ kind: "section", id: 10, toNoteId: 2, target: { type: "new-group", index: 1 }, copy: false })
        expect(db.moveDBSectionToNewGroupOfNote).toHaveBeenCalledWith(10, 2, 1)
        expect(findGroup(cache.get(2)!, 50)?.group.sections.map(section => section.id)).toEqual([10])
        expect(findSection(cache.get(1)!, 10)).toBeUndefined()
        expect(recorded).toHaveLength(1)
        await recorded[0].undo()
        expect(deleteItem).toHaveBeenCalledWith("section_group", 50)
        await recorded[0].redo()
        expect(restoreItem).toHaveBeenCalledWith("section_group", 50)
        expect(db.moveDBSectionToNote).toHaveBeenLastCalledWith(10, 50, 0, { beforeList: undefined })
    })
})

describe("a group dropped on the other note", () => {
    it("moves the group, renumbering both notes, and undo puts it back at its place", async () => {
        const { dropAcross } = setup()
        await dropAcross({ kind: "group", id: 1, toNoteId: 2, index: 0, copy: false })
        expect(cache.get(2)!.groups.map(group => group.id)).toEqual([1, 3])
        expect(cache.get(1)!.groups.map(group => group.id)).toEqual([2])
        expect(db.moveDBGroupToNote).toHaveBeenCalledWith(1, 2, 0)
        await recorded[0].undo()
        expect(db.moveDBGroupToNote).toHaveBeenLastCalledWith(1, 1, 0)
    })
})

describe("a copy (Alt)", () => {
    it("copies a task with its subtasks and tags, reloads the destination and records a command that trashes the copy", async () => {
        db.copyDBTasksToNote.mockResolvedValue([901])
        const { dropAcross } = setup()
        await dropAcross({ kind: "task", id: 100, toNoteId: 2, target: { sectionId: 30, parentTaskId: null, index: 0 }, copy: true })
        expect(db.copyDBTasksToNote).toHaveBeenCalledWith([expect.objectContaining({ text: "Mover" })], { sectionId: 30, parentTaskId: null }, 0)
        // The original is where it was and nothing moved
        expect(findTask(cache.get(1)!, 100)).toBeDefined()
        expect(db.moveDBTaskToNote).not.toHaveBeenCalled()
        expect(getNoteData).toHaveBeenCalledWith(2)
        expect(recorded).toHaveLength(1)
        expect(recorded[0].label).toContain("Mover")
        await recorded[0].undo()
        expect(deleteItem).toHaveBeenCalledWith("task", 901)
        await recorded[0].redo()
        expect(restoreItem).toHaveBeenCalledWith("task", 901)
    })

    it("copies a section, and a copy in a new group is undone by trashing the group", async () => {
        db.copyDBSectionToNote.mockResolvedValue({ sectionId: 77, groupId: 78 })
        const { dropAcross } = setup()
        await dropAcross({ kind: "section", id: 10, toNoteId: 2, target: { type: "new-group", index: 0 }, copy: true })
        expect(db.copyDBSectionToNote).toHaveBeenCalledWith(10, { type: "new-group", noteId: 2, index: 0 })
        await recorded[0].undo()
        expect(deleteItem).toHaveBeenCalledWith("section_group", 78)
    })

    it("copies a group", async () => {
        db.copyDBGroupToNote.mockResolvedValue(90)
        const { dropAcross } = setup()
        await dropAcross({ kind: "group", id: 1, toNoteId: 2, index: 1, copy: true })
        expect(db.copyDBGroupToNote).toHaveBeenCalledWith(1, 2, 1)
        await recorded[0].undo()
        expect(deleteItem).toHaveBeenCalledWith("section_group", 90)
        expect(cache.get(1)!.groups.map(group => group.id)).toEqual([1, 2])
    })

    it("reports a failed copy and records nothing", async () => {
        db.copyDBTasksToNote.mockRejectedValue(new Error("nope"))
        const { dropAcross } = setup()
        await dropAcross({ kind: "task", id: 100, toNoteId: 2, target: { sectionId: 30, parentTaskId: null, index: 0 }, copy: true })
        expect(reportError).toHaveBeenCalled()
        expect(recorded).toHaveLength(0)
    })
})

describe("a task dropped on the empty area of an empty note", () => {
    const withGroup = () => getNoteData.mockImplementationOnce(async () => {
        cache.set(2, { groups: [makeGroup({ id: 9, noteID: 2, position: 0, defaultSection: makeDefaultSection({ id: 90, groupID: 9 }), sections: [] })] })
        return undefined
    })

    it("creates a group in that note, reads the note again and moves the task into its default section", async () => {
        cache.set(2, { groups: [] })
        createDBGroup.mockResolvedValue({ groupId: 9, defaultSectionId: 90 })
        withGroup()
        const { dropTaskInEmptyNote } = setup()
        await dropTaskInEmptyNote({ id: 100, toNoteId: 2, copy: false })
        expect(createDBGroup).toHaveBeenCalledWith(2, "")
        expect(db.moveDBTaskToNote).toHaveBeenCalledWith(100, { sectionId: 90, parentTaskId: null }, 0)
        expect(findTask(cache.get(2)!, 100)).toMatchObject({ parent: { sectionId: 90 }, index: 0 })
    })

    it("is ONE undo step: undo trashes the group with the move, redo brings both back", async () => {
        cache.set(2, { groups: [] })
        createDBGroup.mockResolvedValue({ groupId: 9, defaultSectionId: 90 })
        withGroup()
        const { dropTaskInEmptyNote } = setup()
        await dropTaskInEmptyNote({ id: 100, toNoteId: 2, copy: false })
        expect(recorded).toHaveLength(1)
        await recorded[0].undo()
        expect(db.moveDBTaskToNote).toHaveBeenLastCalledWith(100, { sectionId: 10, parentTaskId: null }, 0)
        expect(deleteItem).toHaveBeenCalledWith("section_group", 9)
        await recorded[0].redo()
        expect(restoreItem).toHaveBeenCalledWith("section_group", 9)
        expect(db.moveDBTaskToNote).toHaveBeenLastCalledWith(100, { sectionId: 90, parentTaskId: null }, 0)
    })

    it("copies with Alt into the new group, and undoing the copy trashes the group", async () => {
        cache.set(2, { groups: [] })
        createDBGroup.mockResolvedValue({ groupId: 9, defaultSectionId: 90 })
        db.copyDBTasksToNote.mockResolvedValue([501])
        const { dropTaskInEmptyNote } = setup()
        await dropTaskInEmptyNote({ id: 100, toNoteId: 2, copy: true })
        expect(db.copyDBTasksToNote).toHaveBeenCalledWith(expect.anything(), { sectionId: 90, parentTaskId: null }, 0)
        expect(db.moveDBTaskToNote).not.toHaveBeenCalled()
        await recorded[0].undo()
        expect(deleteItem).toHaveBeenCalledWith("section_group", 9)
        expect(deleteItem).not.toHaveBeenCalledWith("task", 501)
    })

    it("trashes the new group again when the move fails", async () => {
        cache.set(2, { groups: [] })
        createDBGroup.mockResolvedValue({ groupId: 9, defaultSectionId: 90 })
        withGroup()
        db.moveDBTaskToNote.mockRejectedValue(new Error("boom"))
        const { dropTaskInEmptyNote } = setup()
        await dropTaskInEmptyNote({ id: 100, toNoteId: 2, copy: false })
        expect(reportError).toHaveBeenCalled()
        expect(deleteItem).toHaveBeenCalledWith("section_group", 9)
        expect(recorded).toHaveLength(0)
    })

    it("reports the failure and moves nothing when the group cannot be created", async () => {
        cache.set(2, { groups: [] })
        createDBGroup.mockRejectedValue(new Error("boom"))
        const { dropTaskInEmptyNote } = setup()
        await dropTaskInEmptyNote({ id: 100, toNoteId: 2, copy: false })
        expect(reportError).toHaveBeenCalled()
        expect(db.moveDBTaskToNote).not.toHaveBeenCalled()
        expect(deleteItem).not.toHaveBeenCalled()
    })
})
