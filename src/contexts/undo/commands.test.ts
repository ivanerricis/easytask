import { beforeEach, describe, expect, it, vi } from "vitest"
import {
    NOOP_RECORDER, eachInOrder, manyCommand, captureSectionPlace, captureTaskPlace, captureTreePlace, createUndoCommands, createUndoRecorder,
    getItemName, isUndoableType, makeLabel, type UndoDeps,
} from "./commands"
import type { UndoCommand } from "./stack"
import { makeDefaultSection, makeGroup, makeNote, makeSection, makeTask } from "@/test/ui-fixtures"
import type { Folder, NoteDataTree } from "@/types/types"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const fn = () => vi.fn().mockResolvedValue(undefined)

function makeDeps() {
    const rollbacks = { patch: vi.fn(), remove: vi.fn(), section: vi.fn(), task: vi.fn() }
    const deps = {
        getWorkspaceId: vi.fn(() => 7 as number | null),
        workspace: {
            renameItem: fn(), updateItemColor: fn(), updateNoteBackground: fn(), deleteItem: fn(), restoreItem: fn(), archiveItem: fn(), unarchiveItem: fn(), moveTreeItem: fn(),
            moveSection: fn(), moveDirectSection: fn(), moveTask: fn(), updateTaskCompletion: fn(), updateTaskPriority: fn(),
            updateTaskDescription: fn(), updateFolderColorContent: fn(), getWorkspaceData: fn(),
        },
        note: {
            patchTask: vi.fn(() => rollbacks.patch), patchSection: vi.fn(() => rollbacks.patch), patchGroup: vi.fn(() => rollbacks.patch),
            removeGroup: vi.fn(() => rollbacks.remove), removeSection: vi.fn(() => rollbacks.remove), removeTask: vi.fn(() => rollbacks.remove),
            applySectionMove: vi.fn(() => rollbacks.section), applyDirectSectionMove: vi.fn(() => rollbacks.section), applyTaskMove: vi.fn(() => rollbacks.task),
            getNoteTree: vi.fn((): NoteDataTree | undefined => undefined),
            refreshActiveNote: fn(),
        },
    }
    return { deps: deps as unknown as UndoDeps & typeof deps, rollbacks }
}

const folder = (over: Partial<Folder>): Folder => ({
    id: 1, workspaceID: 1, folderID: null, name: "F", position: 0, creation_date: "", creation_time: "", edit_date: "", edit_time: "",
    subfolders: [], notes: [], ...over,
})

let ctx: ReturnType<typeof makeDeps>
let commands: ReturnType<typeof createUndoCommands>

beforeEach(() => {
    ctx = makeDeps()
    commands = createUndoCommands(ctx.deps)
    vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("labels", () => {
    it("composes the action, the type and the shortened name", () => {
        expect(makeLabel("delete", "note", "Spesa")).toBe("Elimina nota \"Spesa\"")
        expect(makeLabel("create", "section_group", "")).toBe("Crea gruppo")
        expect(makeLabel("move", "task", "x".repeat(100))).toContain("…")
        expect(makeLabel("rename", "folder", "  a \n  b ")).toBe("Rinomina cartella \"a b\"")
    })

    it("reads the name of any item", () => {
        expect(getItemName({ name: "n" })).toBe("n")
        expect(getItemName({ title: "t" })).toBe("t")
        expect(getItemName({ text: "x" })).toBe("x")
        expect(getItemName({})).toBeUndefined()
    })

    it("knows which item types are undoable", () => {
        expect(["folder", "note", "section_group", "section", "task"].every(t => isUndoableType(t as never))).toBe(true)
        expect(["workspace", "audio_file", "note_template"].some(t => isUndoableType(t as never))).toBe(false)
    })
})

describe("rename", () => {
    it("undoes to the old name and redoes to the new one, patching the note optimistically", async () => {
        const command = commands.rename("task", 5, "old", "new")
        expect(command.label).toBe("Rinomina task \"old\"")

        await command.undo()
        expect(ctx.deps.note.patchTask).toHaveBeenLastCalledWith(5, { text: "old" })
        expect(ctx.deps.workspace.renameItem).toHaveBeenLastCalledWith("task", 5, "old")
        await command.redo()
        expect(ctx.deps.note.patchTask).toHaveBeenLastCalledWith(5, { text: "new" })
        expect(ctx.deps.workspace.renameItem).toHaveBeenLastCalledWith("task", 5, "new")
        expect(ctx.rollbacks.patch).not.toHaveBeenCalled()
    })

    it("patches sections by title and groups by name (blank = unnamed)", async () => {
        await commands.rename("section", 2, "a", "b").redo()
        expect(ctx.deps.note.patchSection).toHaveBeenCalledWith(2, { title: "b" })
        await commands.rename("section_group", 3, "Named", "").redo()
        expect(ctx.deps.note.patchGroup).toHaveBeenCalledWith(3, { name: null })
        expect(ctx.deps.workspace.renameItem).toHaveBeenLastCalledWith("section_group", 3, "")
    })

    it("leaves folders and notes to renameItem (it patches the sidebar tree itself)", async () => {
        await commands.rename("folder", 1, "a", "b").undo()
        await commands.rename("note", 2, "a", "b").undo()
        expect(ctx.deps.note.patchTask).not.toHaveBeenCalled()
        expect(ctx.deps.note.patchSection).not.toHaveBeenCalled()
        expect(ctx.deps.note.patchGroup).not.toHaveBeenCalled()
        expect(ctx.deps.workspace.renameItem).toHaveBeenCalledTimes(2)
    })

    it("rolls the optimistic patch back and rejects when the write fails", async () => {
        ctx.deps.workspace.renameItem.mockRejectedValueOnce(new Error("UNIQUE"))
        await expect(commands.rename("task", 5, "old", "new").undo()).rejects.toThrow("UNIQUE")
        expect(ctx.rollbacks.patch).toHaveBeenCalledTimes(1)
    })
})

describe("background", () => {
    it("restores the previous background (none meaning null) and applies the new one again, with a translated label", async () => {
        const command = commands.background(3, "Spesa", null, "#e6194b")
        expect(command.label).toBe(makeLabel("background", "note", "Spesa"))
        await command.redo()
        expect(ctx.deps.workspace.updateNoteBackground).toHaveBeenLastCalledWith(3, "#e6194b")
        await command.undo()
        expect(ctx.deps.workspace.updateNoteBackground).toHaveBeenLastCalledWith(3, undefined)
        await commands.background(3, "Spesa", "#000", undefined).redo()
        expect(ctx.deps.workspace.updateNoteBackground).toHaveBeenLastCalledWith(3, undefined)
    })

    it("lets a failure reach the history", async () => {
        ctx.deps.workspace.updateNoteBackground.mockRejectedValueOnce(new Error("fail"))
        await expect(commands.background(3, "N", null, "#fff").redo()).rejects.toThrow("fail")
    })
})

describe("color", () => {
    it("restores the previous color, none meaning null/undefined", async () => {
        const command = commands.color("section", 4, "S", null, "#fff")
        await command.redo()
        expect(ctx.deps.note.patchSection).toHaveBeenLastCalledWith(4, { color: "#fff" })
        expect(ctx.deps.workspace.updateItemColor).toHaveBeenLastCalledWith("section", 4, "#fff")
        await command.undo()
        expect(ctx.deps.note.patchSection).toHaveBeenLastCalledWith(4, { color: null })
        expect(ctx.deps.workspace.updateItemColor).toHaveBeenLastCalledWith("section", 4, undefined)
    })

    it("works for tasks, and for folders without patching the note", async () => {
        await commands.color("task", 4, "T", "#000", undefined).redo()
        expect(ctx.deps.note.patchTask).toHaveBeenCalledWith(4, { color: null })
        await commands.color("folder", 1, "F", "#000", "#111").undo()
        expect(ctx.deps.workspace.updateItemColor).toHaveBeenLastCalledWith("folder", 1, "#000")
        expect(ctx.deps.note.patchSection).not.toHaveBeenCalled()
    })

    it("undoes and redoes the color of a group, with a translated label", async () => {
        const command = commands.color("section_group", 6, "Sprint", null, "#fff")
        expect(command.label).toBe(makeLabel("color", "section_group", "Sprint"))
        expect(command.label).toContain("gruppo")
        await command.redo()
        expect(ctx.deps.note.patchGroup).toHaveBeenLastCalledWith(6, { color: "#fff" })
        expect(ctx.deps.workspace.updateItemColor).toHaveBeenLastCalledWith("section_group", 6, "#fff")
        await command.undo()
        expect(ctx.deps.note.patchGroup).toHaveBeenLastCalledWith(6, { color: null })
        expect(ctx.deps.workspace.updateItemColor).toHaveBeenLastCalledWith("section_group", 6, undefined)
    })

    it("rolls back the group color on failure", async () => {
        ctx.deps.workspace.updateItemColor.mockRejectedValueOnce(new Error("fail"))
        await expect(commands.color("section_group", 6, "G", null, "#fff").redo()).rejects.toThrow("fail")
        expect(ctx.rollbacks.patch).toHaveBeenCalled()
    })

    it("rolls back and rejects on failure", async () => {
        ctx.deps.workspace.updateItemColor.mockRejectedValueOnce(new Error("fail"))
        await expect(commands.color("task", 1, "T", null, "#fff").redo()).rejects.toThrow("fail")
        expect(ctx.rollbacks.patch).toHaveBeenCalled()
    })
})

describe("task flags", () => {
    it("completion goes back to the previous value and forward again", async () => {
        const command = commands.taskCompletion(9, "Buy milk", false, true)
        expect(command.label).toBe("Completa task \"Buy milk\"")
        await command.undo()
        expect(ctx.deps.note.patchTask).toHaveBeenLastCalledWith(9, { completed: false })
        expect(ctx.deps.workspace.updateTaskCompletion).toHaveBeenLastCalledWith(9, false)
        await command.redo()
        expect(ctx.deps.workspace.updateTaskCompletion).toHaveBeenLastCalledWith(9, true)
        expect(commands.taskCompletion(9, "x", true, false).label).toBe("Riapri task \"x\"")
    })

    it("priority goes back and forward", async () => {
        const command = commands.taskPriority(9, "Buy milk", false, true)
        expect(command.label).toBe("Aggiungi priorità a task \"Buy milk\"")
        await command.undo()
        expect(ctx.deps.note.patchTask).toHaveBeenLastCalledWith(9, { priority: false })
        expect(ctx.deps.workspace.updateTaskPriority).toHaveBeenLastCalledWith(9, false)
        await command.redo()
        expect(ctx.deps.workspace.updateTaskPriority).toHaveBeenLastCalledWith(9, true)
        expect(commands.taskPriority(9, "x", true, false).label).toBe("Rimuovi priorità da task \"x\"")
    })

    it("description: an empty one is stored as undefined", async () => {
        const command = commands.taskDescription(9, "T", "old text", "")
        await command.redo()
        expect(ctx.deps.workspace.updateTaskDescription).toHaveBeenLastCalledWith(9, undefined)
        expect(ctx.deps.note.patchTask).toHaveBeenLastCalledWith(9, { description: "" })
        await command.undo()
        expect(ctx.deps.workspace.updateTaskDescription).toHaveBeenLastCalledWith(9, "old text")
    })

    it.each([
        ["taskCompletion", "updateTaskCompletion", [1, "T", false, true]],
        ["taskPriority", "updateTaskPriority", [1, "T", false, true]],
        ["taskDescription", "updateTaskDescription", [1, "T", "a", "b"]],
    ] as const)("%s rolls back and rejects when the write fails", async (builder, action, args) => {
        ctx.deps.workspace[action].mockRejectedValueOnce(new Error("fail"))
        const command = (commands[builder] as (...a: unknown[]) => UndoCommand)(...args)
        await expect(command.undo()).rejects.toThrow("fail")
        expect(ctx.rollbacks.patch).toHaveBeenCalledTimes(1)
    })
})

describe("remove and create", () => {
    it("a deleted folder or note is restored (same id) and the tree is reloaded", async () => {
        const command = commands.remove("note", 3, "Spesa")
        expect(command.label).toBe("Elimina nota \"Spesa\"")
        await command.undo()
        expect(ctx.deps.workspace.restoreItem).toHaveBeenCalledWith("note", 3)
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledWith(7)
        expect(ctx.deps.note.refreshActiveNote).not.toHaveBeenCalled()
    })

    it("redo of a delete moves the item to the trash again", async () => {
        await commands.remove("folder", 3, "F").redo()
        expect(ctx.deps.workspace.deleteItem).toHaveBeenCalledWith("folder", 3)
        expect(ctx.deps.note.removeSection).not.toHaveBeenCalled()
    })

    it.each([
        ["section_group", "removeGroup"],
        ["section", "removeSection"],
        ["task", "removeTask"],
    ] as const)("a deleted %s is restored by id and the open note is reloaded; redo removes it optimistically", async (type, removal) => {
        const command = commands.remove(type, 11, "N")
        await command.undo()
        expect(ctx.deps.workspace.restoreItem).toHaveBeenCalledWith(type, 11)
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
        expect(ctx.deps.workspace.getWorkspaceData).not.toHaveBeenCalled()

        await command.redo()
        expect(ctx.deps.note[removal]).toHaveBeenCalledWith(11)
        expect(ctx.deps.workspace.deleteItem).toHaveBeenCalledWith(type, 11)
    })

    it("a creation is undone by deleting the new item and redone by restoring it", async () => {
        const command = commands.create("task", 21, "New")
        expect(command.label).toBe("Crea task \"New\"")
        await command.undo()
        expect(ctx.deps.note.removeTask).toHaveBeenCalledWith(21)
        expect(ctx.deps.workspace.deleteItem).toHaveBeenCalledWith("task", 21)
        await command.redo()
        expect(ctx.deps.workspace.restoreItem).toHaveBeenCalledWith("task", 21)
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
    })

    it("a created folder is undone through deleteItem (it updates the tree) and redone with a tree reload", async () => {
        const command = commands.create("folder", 2, "F")
        await command.undo()
        expect(ctx.deps.workspace.deleteItem).toHaveBeenCalledWith("folder", 2)
        await command.redo()
        expect(ctx.deps.workspace.restoreItem).toHaveBeenCalledWith("folder", 2)
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledWith(7)
    })

    it("a duplicated note (no name known) is undone by deleting the copy and redone by restoring it with a tree reload", async () => {
        const command = commands.create("note", 30, null)
        expect(command.label).toBe("Crea nota")
        await command.undo()
        expect(ctx.deps.workspace.deleteItem).toHaveBeenCalledWith("note", 30)
        await command.redo()
        expect(ctx.deps.workspace.restoreItem).toHaveBeenCalledWith("note", 30)
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledWith(7)
    })

    it("a duplicated section is undone by removing it from the note and redone by restoring it with a note reload", async () => {
        const command = commands.create("section", 31, null)
        await command.undo()
        expect(ctx.deps.note.removeSection).toHaveBeenCalledWith(31)
        expect(ctx.deps.workspace.deleteItem).toHaveBeenCalledWith("section", 31)
        await command.redo()
        expect(ctx.deps.workspace.restoreItem).toHaveBeenCalledWith("section", 31)
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
    })

    it("puts the optimistic removal back and rejects when the delete fails", async () => {
        ctx.deps.workspace.deleteItem.mockRejectedValueOnce(new Error("locked"))
        await expect(commands.create("section", 2, "S").undo()).rejects.toThrow("locked")
        expect(ctx.rollbacks.remove).toHaveBeenCalledTimes(1)
    })

    it("rejects when the restore fails (e.g. name taken) and does not reload", async () => {
        ctx.deps.workspace.restoreItem.mockRejectedValueOnce(new Error("name taken"))
        await expect(commands.remove("note", 1, "N").undo()).rejects.toThrow("name taken")
        expect(ctx.deps.workspace.getWorkspaceData).not.toHaveBeenCalled()
    })

    it("a failing reload after a successful restore does not fail the command", async () => {
        ctx.deps.workspace.getWorkspaceData.mockRejectedValueOnce(new Error("reload"))
        await expect(commands.remove("note", 1, "N").undo()).resolves.toBeUndefined()
        ctx.deps.note.refreshActiveNote.mockRejectedValueOnce(new Error("reload"))
        await expect(commands.remove("task", 1, "N").undo()).resolves.toBeUndefined()
    })

    it("skips the tree reload outside a workspace", async () => {
        ctx.deps.getWorkspaceId.mockReturnValue(null)
        await commands.remove("note", 1, "N").undo()
        expect(ctx.deps.workspace.getWorkspaceData).not.toHaveBeenCalled()
    })
})

describe("moves", () => {
    it("treeMove goes back to the old parent and index and reloads the tree", async () => {
        const command = commands.treeMove("note", 5, "N", { folderId: 2, index: 1 }, { folderId: null, index: 4 })
        await command.undo()
        expect(ctx.deps.workspace.moveTreeItem).toHaveBeenLastCalledWith("note", 5, 2, 1)
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledWith(7)
        await command.redo()
        expect(ctx.deps.workspace.moveTreeItem).toHaveBeenLastCalledWith("note", 5, null, 4)
    })

    it("treeMove rejects without reloading when the move fails", async () => {
        ctx.deps.workspace.moveTreeItem.mockRejectedValueOnce(new Error("into itself"))
        await expect(commands.treeMove("folder", 5, "F", { folderId: null, index: 0 }, { folderId: 1, index: 0 }).undo()).rejects.toThrow("into itself")
        expect(ctx.deps.workspace.getWorkspaceData).not.toHaveBeenCalled()
    })

    it("sectionMove is optimistic both ways and rolls back on failure", async () => {
        const command = commands.sectionMove(8, "S", { groupId: 1, index: 2 }, { groupId: 3, index: 0 })
        await command.undo()
        expect(ctx.deps.note.applySectionMove).toHaveBeenLastCalledWith(8, 1, 2)
        expect(ctx.deps.workspace.moveSection).toHaveBeenLastCalledWith(8, 1, 2)
        await command.redo()
        expect(ctx.deps.workspace.moveSection).toHaveBeenLastCalledWith(8, 3, 0)

        ctx.deps.workspace.moveSection.mockRejectedValueOnce(new Error("dup title"))
        await expect(command.undo()).rejects.toThrow("dup title")
        expect(ctx.rollbacks.section).toHaveBeenCalledTimes(1)
    })

    it("sectionMove keeps beforeList on redo, so the section lands above the list again", async () => {
        const command = commands.sectionMove(8, "S", { groupId: 1, index: 0 }, { groupId: 1, index: 1, beforeList: true })
        await command.redo()
        expect(ctx.deps.note.applySectionMove).toHaveBeenLastCalledWith(8, 1, 1, true)
        expect(ctx.deps.workspace.moveSection).toHaveBeenLastCalledWith(8, 1, 1, true)
    })

    it("directMove has its own label, with the name of the group", () => {
        const label = commands.directMove(1, "Spesa", 0, 2).label
        expect(label).toContain("Sposta lista task")
        expect(label).toContain("Spesa")
        expect(commands.directMove(1, "", 0, 2).label).toBe("Sposta lista task")
    })

    it("sectionMove: undoing puts the list of the direct tasks back where it was, when it moved", async () => {
        const place = { groupId: 1, index: 0, listIndex: 0 }
        const command = commands.sectionMove(8, "S", place, { groupId: 1, index: 1 })
        // [S8, (list), S9] -> [(list), S9, S8]: the list is now first
        ctx.deps.note.getNoteTree.mockReturnValue({ groups: [makeGroup({ id: 1, defaultIndex: 1 })] })
        await command.undo()
        expect(ctx.deps.workspace.moveSection).toHaveBeenLastCalledWith(8, 1, 0)
        expect(ctx.deps.note.applyDirectSectionMove).toHaveBeenLastCalledWith(1, 0)
        expect(ctx.deps.workspace.moveDirectSection).toHaveBeenLastCalledWith(1, 0)
        // redo repeats the move only
        ctx.deps.workspace.moveDirectSection.mockClear()
        await command.redo()
        expect(ctx.deps.workspace.moveDirectSection).not.toHaveBeenCalled()
    })

    it("sectionMove: nothing is written for the list when it already is where it was", async () => {
        ctx.deps.note.getNoteTree.mockReturnValue({ groups: [makeGroup({ id: 1, defaultIndex: 2 })] })
        await commands.sectionMove(8, "S", { groupId: 1, index: 0, listIndex: 2 }, { groupId: 1, index: 1 }).undo()
        expect(ctx.deps.workspace.moveDirectSection).not.toHaveBeenCalled()
        // an old place without listIndex never touches the list
        await commands.sectionMove(8, "S", { groupId: 1, index: 0 }, { groupId: 1, index: 1 }).undo()
        expect(ctx.deps.workspace.moveDirectSection).not.toHaveBeenCalled()
    })

    it("sectionMoveToNewGroup: undo puts the list of the source group back too", async () => {
        ctx.deps.note.getNoteTree.mockReturnValue({ groups: [makeGroup({ id: 1, defaultIndex: 0 })] })
        await commands.sectionMoveToNewGroup(8, "S", 40, { groupId: 1, index: 1, listIndex: 2 }).undo()
        expect(ctx.deps.workspace.moveSection).toHaveBeenCalledWith(8, 1, 1)
        expect(ctx.deps.workspace.moveDirectSection).toHaveBeenCalledWith(1, 2)
        expect(ctx.deps.workspace.deleteItem).toHaveBeenCalledWith("section_group", 40)
    })

    it("directMove moves the list both ways, optimistic, with a rollback on failure", async () => {
        const command = commands.directMove(1, "", 0, 2)
        await command.redo()
        expect(ctx.deps.note.applyDirectSectionMove).toHaveBeenLastCalledWith(1, 2)
        expect(ctx.deps.workspace.moveDirectSection).toHaveBeenLastCalledWith(1, 2)
        await command.undo()
        expect(ctx.deps.workspace.moveDirectSection).toHaveBeenLastCalledWith(1, 0)

        ctx.deps.workspace.moveDirectSection.mockRejectedValueOnce(new Error("boom"))
        await expect(command.redo()).rejects.toThrow("boom")
        expect(ctx.rollbacks.section).toHaveBeenCalledTimes(1)
    })

    it("sectionMoveToNewGroup: undo moves the section back and trashes the empty group; redo restores the same group", async () => {
        const command = commands.sectionMoveToNewGroup(8, "S", 40, { groupId: 1, index: 2 })
        await command.undo()
        expect(ctx.deps.workspace.moveSection).toHaveBeenCalledWith(8, 1, 2)
        expect(ctx.deps.note.removeGroup).toHaveBeenCalledWith(40)
        expect(ctx.deps.workspace.deleteItem).toHaveBeenCalledWith("section_group", 40)
        const order = [ctx.deps.workspace.moveSection.mock.invocationCallOrder[0], ctx.deps.workspace.deleteItem.mock.invocationCallOrder[0]]
        expect(order[0]).toBeLessThan(order[1])

        await command.redo()
        expect(ctx.deps.workspace.restoreItem).toHaveBeenCalledWith("section_group", 40)
        expect(ctx.deps.workspace.moveSection).toHaveBeenLastCalledWith(8, 40, 0)
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
    })

    it("sectionMoveToNewGroup: a failed move back leaves the group alone", async () => {
        ctx.deps.workspace.moveSection.mockRejectedValueOnce(new Error("bad"))
        await expect(commands.sectionMoveToNewGroup(8, "S", 40, { groupId: 1, index: 0 }).undo()).rejects.toThrow("bad")
        expect(ctx.deps.workspace.deleteItem).not.toHaveBeenCalled()
    })

    it("sectionMoveToNewGroup: a failed delete of the group rejects after the section moved back", async () => {
        ctx.deps.workspace.deleteItem.mockRejectedValueOnce(new Error("locked"))
        await expect(commands.sectionMoveToNewGroup(8, "S", 40, { groupId: 1, index: 0 }).undo()).rejects.toThrow("locked")
        expect(ctx.rollbacks.remove).toHaveBeenCalledTimes(1)
    })

    it("taskMove moves back to the old section/parent/index with an optimistic update", async () => {
        const command = commands.taskMove(6, "T", { sectionId: 1, parentTaskId: null, index: 3 }, { sectionId: 2, parentTaskId: 9, index: 0 })
        await command.undo()
        expect(ctx.deps.note.applyTaskMove).toHaveBeenLastCalledWith(6, { sectionId: 1, parentTaskId: null }, 3)
        expect(ctx.deps.workspace.moveTask).toHaveBeenLastCalledWith(6, { sectionId: 1, parentTaskId: null }, 3)
        await command.redo()
        expect(ctx.deps.workspace.moveTask).toHaveBeenLastCalledWith(6, { sectionId: 2, parentTaskId: 9 }, 0)

        ctx.deps.workspace.moveTask.mockRejectedValueOnce(new Error("invalid"))
        await expect(command.undo()).rejects.toThrow("invalid")
        expect(ctx.rollbacks.task).toHaveBeenCalledTimes(1)
    })
})

describe("recorder", () => {
    it("records the command built by every builder", () => {
        const record = vi.fn()
        const recorder = createUndoRecorder(commands, record)
        recorder.rename("task", 1, "a", "b")
        recorder.create("note", 2, "N")
        expect(record).toHaveBeenCalledTimes(2)
        expect((record.mock.calls[0][0] as UndoCommand).label).toBe("Rinomina task \"a\"")
        expect((record.mock.calls[1][0] as UndoCommand).label).toBe("Crea nota \"N\"")
        const own: UndoCommand = { label: "x", undo: fn(), redo: fn() }
        recorder.record(own)
        expect(record).toHaveBeenLastCalledWith(own)
    })

    it("stamps every command with the note active in the focused pane, keeping a note id that is already set", () => {
        const record = vi.fn()
        let active: number | null = 10
        const recorder = createUndoRecorder(commands, record, undefined, undefined, () => active)
        recorder.rename("task", 1, "a", "b")
        active = 11
        recorder.create("note", 2, "N")
        recorder.record({ label: "own", noteId: 5, undo: fn(), redo: fn() })
        active = null
        recorder.rename("task", 1, "a", "c")
        expect(record.mock.calls.map(call => (call[0] as UndoCommand).noteId)).toEqual([10, 11, 5, undefined])
    })

    it("the no-op recorder accepts every call", () => {
        expect(() => {
            NOOP_RECORDER.rename("task", 1, "a", "b")
            NOOP_RECORDER.taskMove(1, "t", { sectionId: 1, parentTaskId: null, index: 0 }, { sectionId: 1, parentTaskId: null, index: 1 })
            NOOP_RECORDER.record({ label: "x", undo: fn(), redo: fn() })
        }).not.toThrow()
    })
})

describe("archive", () => {
    it("an archived folder or note is unarchived (same id) with a tree reload; redo archives it again", async () => {
        const command = commands.archive("note", 3, "Spesa")
        expect(command.label).toBe("Archivia nota \"Spesa\"")
        await command.undo()
        expect(ctx.deps.workspace.unarchiveItem).toHaveBeenCalledWith("note", 3)
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledWith(7)
        expect(ctx.deps.note.refreshActiveNote).not.toHaveBeenCalled()
        await command.redo()
        expect(ctx.deps.workspace.archiveItem).toHaveBeenCalledWith("note", 3)
        expect(ctx.deps.note.removeGroup).not.toHaveBeenCalled()
    })

    it.each([
        ["section_group", "removeGroup"],
        ["section", "removeSection"],
    ] as const)("an archived %s is unarchived by id and the open note reloaded; redo removes it optimistically", async (type, removal) => {
        const command = commands.archive(type, 11, "N")
        await command.undo()
        expect(ctx.deps.workspace.unarchiveItem).toHaveBeenCalledWith(type, 11)
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
        expect(ctx.deps.workspace.getWorkspaceData).not.toHaveBeenCalled()
        await command.redo()
        expect(ctx.deps.note[removal]).toHaveBeenCalledWith(11)
        expect(ctx.deps.workspace.archiveItem).toHaveBeenCalledWith(type, 11)
    })

    it("rolls the optimistic removal back when the archive write fails", async () => {
        ctx.deps.workspace.archiveItem.mockRejectedValueOnce(new Error("nope"))
        await expect(commands.archive("section", 4, "S").redo()).rejects.toThrow("nope")
        expect(ctx.rollbacks.remove).toHaveBeenCalledTimes(1)
    })

    it("unarchive is the mirror of archive", async () => {
        const command = commands.unarchive("folder", 2, "F")
        expect(command.label).toBe("Ripristina cartella dall'archivio \"F\"")
        await command.redo()
        expect(ctx.deps.workspace.unarchiveItem).toHaveBeenCalledWith("folder", 2)
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledWith(7)
        await command.undo()
        expect(ctx.deps.workspace.archiveItem).toHaveBeenCalledWith("folder", 2)
    })

    it("archiveMany is ONE step: undo unarchives all in reverse with one reload, redo archives in order", async () => {
        const items = [{ itemType: "folder", id: 1, name: "F" }, { itemType: "note", id: 2, name: "N" }, { itemType: "note", id: 3, name: "M" }] as const
        const command = commands.archiveMany([...items])
        expect(command.label).toBe("Archivia 3 elementi")
        await command.undo()
        expect(ctx.deps.workspace.unarchiveItem.mock.calls).toEqual([["note", 3], ["note", 2], ["folder", 1]])
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledTimes(1)
        await command.redo()
        expect(ctx.deps.workspace.archiveItem.mock.calls).toEqual([["folder", 1], ["note", 2], ["note", 3]])
        expect(commands.archiveMany([items[1]]).label).toBe("Archivia 1 elemento")

        const record = vi.fn()
        createUndoRecorder(commands, record).archiveMany([...items])
        expect(record).toHaveBeenCalledTimes(1)
    })

    it("the no-op recorder has the archive commands", () => {
        expect(() => {
            NOOP_RECORDER.archive("note", 1, "n")
            NOOP_RECORDER.unarchive("note", 1, "n")
            NOOP_RECORDER.archiveMany([])
        }).not.toThrow()
    })
})

describe("multi-selection commands (one undo step)", () => {
    it("removeMany trashes and restores everything, reloading the tree once on undo", async () => {
        const command = commands.removeMany([
            { itemType: "folder", id: 1, name: "F" }, { itemType: "note", id: 2, name: "N" }, { itemType: "note", id: 3, name: "M" },
        ])
        expect(command.label).toBe("Elimina 3 elementi")
        await command.undo()
        expect(ctx.deps.workspace.restoreItem.mock.calls).toEqual([["note", 3], ["note", 2], ["folder", 1]])
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledTimes(1)
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledWith(7)
        await command.redo()
        expect(ctx.deps.workspace.deleteItem.mock.calls).toEqual([["folder", 1], ["note", 2], ["note", 3]])
    })

    it("removeMany has a singular label and records as a single history entry", () => {
        expect(commands.removeMany([{ itemType: "note", id: 2, name: "N" }]).label).toBe("Elimina 1 elemento")
        const record = vi.fn()
        const recorder = createUndoRecorder(commands, record)
        recorder.removeMany([{ itemType: "note", id: 1, name: "a" }, { itemType: "note", id: 2, name: "b" }])
        expect(record).toHaveBeenCalledTimes(1)
    })

    it("removeMany stops at the first failure", async () => {
        ctx.deps.workspace.restoreItem.mockRejectedValueOnce(new Error("gone"))
        await expect(commands.removeMany([{ itemType: "note", id: 1, name: "a" }, { itemType: "note", id: 2, name: "b" }]).undo()).rejects.toThrow("gone")
        expect(ctx.deps.workspace.restoreItem).toHaveBeenCalledTimes(1)
    })

    it("colorMany restores every previous color (none = remove) and reapplies the new one", async () => {
        const command = commands.colorMany([
            { itemType: "note", id: 1, name: "a", before: "#111111", after: "#ff0000" },
            { itemType: "folder", id: 2, name: "b", before: null, after: "#ff0000" },
        ])
        expect(command.label).toBe("Cambia colore di 2 elementi")
        await command.undo()
        expect(ctx.deps.workspace.updateItemColor.mock.calls).toEqual([["folder", 2, undefined], ["note", 1, "#111111"]])
        ctx.deps.workspace.updateItemColor.mockClear()
        await command.redo()
        expect(ctx.deps.workspace.updateItemColor.mock.calls).toEqual([["note", 1, "#ff0000"], ["folder", 2, "#ff0000"]])
    })

    it("colorContent gives every touched item its previous color back and recolors the whole folder on redo", async () => {
        const command = commands.colorContent(1, "F", "#ff0000", [
            { itemType: "folder", id: 1, name: "F", before: "#111111" },
            { itemType: "note", id: 10, name: "n", before: undefined },
        ])
        expect(command.label).toContain("F")
        await command.undo()
        expect(ctx.deps.workspace.updateItemColor.mock.calls).toEqual([["note", 10, undefined], ["folder", 1, "#111111"]])
        await command.redo()
        expect(ctx.deps.workspace.updateFolderColorContent).toHaveBeenCalledWith(1, "#ff0000")
        const record = vi.fn()
        createUndoRecorder(commands, record).colorContent(1, "F", null, [])
        expect(record).toHaveBeenCalledTimes(1)
    })

    it("treeMoveMany replays the steps backwards to the old places and forwards to the new ones", async () => {
        const command = commands.treeMoveMany([
            { itemType: "note", id: 1, name: "a", from: { folderId: null, index: 0 }, to: { folderId: 5, index: 0 } },
            { itemType: "folder", id: 2, name: "b", from: { folderId: 3, index: 1 }, to: { folderId: 5, index: 2 } },
        ])
        expect(command.label).toBe("Sposta 2 elementi")
        await command.undo()
        expect(ctx.deps.workspace.moveTreeItem.mock.calls).toEqual([["folder", 2, 3, 1], ["note", 1, null, 0]])
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledTimes(1)
        ctx.deps.workspace.moveTreeItem.mockClear()
        await command.redo()
        expect(ctx.deps.workspace.moveTreeItem.mock.calls).toEqual([["note", 1, 5, 0], ["folder", 2, 5, 2]])
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledTimes(2)
    })
})

describe("multi-selection commands on tasks (one undo step, the note is reloaded)", () => {
    const tasks = [{ itemType: "task", id: 1, name: "a" }, { itemType: "task", id: 2, name: "b" }] as const

    it("removeMany restores the tasks in reverse and reloads the note, not the tree", async () => {
        const command = commands.removeMany([...tasks])
        await command.undo()
        expect(ctx.deps.workspace.restoreItem.mock.calls).toEqual([["task", 2], ["task", 1]])
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
        expect(ctx.deps.workspace.getWorkspaceData).not.toHaveBeenCalled()
        await command.redo()
        expect(ctx.deps.workspace.deleteItem.mock.calls).toEqual([["task", 1], ["task", 2]])
        expect(ctx.deps.note.removeTask.mock.calls).toEqual([[1], [2]])
    })

    it("a mix of notes and tasks reloads both", async () => {
        await commands.removeMany([{ itemType: "note", id: 9, name: "n" }, tasks[0]]).undo()
        expect(ctx.deps.workspace.getWorkspaceData).toHaveBeenCalledTimes(1)
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
    })

    it("archiveMany unarchives the tasks in reverse and archives them again in order", async () => {
        const command = commands.archiveMany([...tasks])
        expect(command.label).toBe("Archivia 2 elementi")
        await command.undo()
        expect(ctx.deps.workspace.unarchiveItem.mock.calls).toEqual([["task", 2], ["task", 1]])
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
        await command.redo()
        expect(ctx.deps.workspace.archiveItem.mock.calls).toEqual([["task", 1], ["task", 2]])
    })

    it("colorMany patches the note and restores the previous colors in reverse", async () => {
        const command = commands.colorMany([
            { itemType: "task", id: 1, name: "a", before: null, after: "#f00" },
            { itemType: "task", id: 2, name: "b", before: "#0f0", after: "#f00" },
        ])
        await command.undo()
        expect(ctx.deps.note.patchTask.mock.calls).toEqual([[2, { color: "#0f0" }], [1, { color: null }]])
        await command.redo()
        expect(ctx.deps.workspace.updateItemColor).toHaveBeenLastCalledWith("task", 2, "#f00")
    })

    it("taskMoveMany replays the steps backwards to the old places and forwards to the new ones, reloading once each time", async () => {
        const command = commands.taskMoveMany([
            { id: 1, name: "a", from: { sectionId: 1, parentTaskId: null, index: 0 }, to: { sectionId: 5, parentTaskId: null, index: 1_000_000 } },
            { id: 2, name: "b", from: { sectionId: 1, parentTaskId: null, index: 0 }, to: { sectionId: 5, parentTaskId: null, index: 1_000_000 } },
        ])
        expect(command.label).toBe("Sposta 2 elementi")
        await command.undo()
        expect(ctx.deps.workspace.moveTask.mock.calls).toEqual([[2, { sectionId: 1, parentTaskId: null }, 0], [1, { sectionId: 1, parentTaskId: null }, 0]])
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(1)
        ctx.deps.workspace.moveTask.mockClear()
        await command.redo()
        expect(ctx.deps.workspace.moveTask.mock.calls.map(call => call[0])).toEqual([1, 2])
        expect(ctx.deps.note.refreshActiveNote).toHaveBeenCalledTimes(2)

        const record = vi.fn()
        createUndoRecorder(commands, record).taskMoveMany([])
        expect(record).toHaveBeenCalledTimes(1)
        expect(() => NOOP_RECORDER.taskMoveMany([])).not.toThrow()
    })
})

describe("place capture", () => {
    it("finds the parent and index of a folder or a note in the sidebar tree", () => {
        const tree = {
            rootFolders: [folder({ id: 1, notes: [makeNote({ id: 10, name: "A", folderID: 1 }), makeNote({ id: 11, name: "B", folderID: 1 })], subfolders: [folder({ id: 2, name: "Sub", folderID: 1 })] })],
            rootNotes: [makeNote({ id: 12, name: "Root" })],
        }
        expect(captureTreePlace(tree, "note", 11)).toEqual({ folderId: 1, index: 1, name: "B" })
        expect(captureTreePlace(tree, "note", 12)).toEqual({ folderId: null, index: 0, name: "Root" })
        expect(captureTreePlace(tree, "folder", 2)).toEqual({ folderId: 1, index: 0, name: "Sub" })
        expect(captureTreePlace(tree, "note", 99)).toBeNull()
        expect(captureTreePlace(null, "note", 1)).toBeNull()
    })

    it("finds where a section and a task sit in the note", () => {
        const sub = makeTask({ id: 31, sectionID: 20, taskID: 30, text: "sub" })
        const tree = {
            groups: [
                makeGroup({ id: 1, sections: [makeSection({ id: 19, groupID: 1 }), makeSection({ id: 20, groupID: 1, title: "S", tasks: [makeTask({ id: 30, sectionID: 20, text: "top", subtasks: [sub] })] })] }),
            ],
        }
        expect(captureSectionPlace(tree, 20)).toEqual({ groupId: 1, index: 1, name: "S" })
        expect(captureSectionPlace(tree, 99)).toBeNull()
        expect(captureTaskPlace(tree, 30)).toEqual({ sectionId: 20, parentTaskId: null, index: 0, name: "top" })
        expect(captureTaskPlace(tree, 31)).toEqual({ sectionId: 20, parentTaskId: 30, index: 0, name: "sub" })
        expect(captureTaskPlace(tree, 99)).toBeNull()
        expect(captureTaskPlace(undefined, 1)).toBeNull()
    })
})

describe("places in the direct area of a group (default section)", () => {
    const tree = {
        groups: [makeGroup({
            id: 1,
            defaultSection: makeDefaultSection({ id: 90, groupID: 1, tasks: [
                makeTask({ id: 300, sectionID: 90, text: "direct", subtasks: [makeTask({ id: 301, sectionID: 90, taskID: 300, text: "direct sub" })] }),
                makeTask({ id: 302, sectionID: 90, text: "second" }),
            ] }),
            sections: [makeSection({ id: 20, groupID: 1, title: "S" })],
        })],
    }

    it("captureTaskPlace gives the real id of the default section", () => {
        expect(captureTaskPlace(tree, 300)).toEqual({ sectionId: 90, parentTaskId: null, index: 0, name: "direct" })
        expect(captureTaskPlace(tree, 302)).toEqual({ sectionId: 90, parentTaskId: null, index: 1, name: "second" })
        expect(captureTaskPlace(tree, 301)).toEqual({ sectionId: 90, parentTaskId: 300, index: 0, name: "direct sub" })
    })

    it("captureSectionPlace does not capture the default section (it never moves), but sections keep their index", () => {
        expect(captureSectionPlace(tree, 90)).toBeNull()
        expect(captureSectionPlace(tree, 20)).toEqual({ groupId: 1, index: 0, name: "S" })
    })

    it("captureSectionPlace records the place of the list of the group", () => {
        const withList = { groups: [{ ...tree.groups[0], defaultIndex: 1 }] }
        expect(captureSectionPlace(withList, 20)).toEqual({ groupId: 1, index: 0, listIndex: 1, name: "S" })
    })
})

describe("eachInOrder", () => {
    it("awaits the items one after the other, in order or from the last", async () => {
        const seen: number[] = []
        const fn = async (n: number) => { await Promise.resolve(); seen.push(n) }
        await eachInOrder([1, 2, 3], false, fn)
        await eachInOrder([1, 2, 3], true, fn)
        expect(seen).toEqual([1, 2, 3, 3, 2, 1])
    })
})

describe("manyCommand", () => {
    const build = (over: Partial<Parameters<typeof manyCommand<number>>[0]> = {}) => {
        const calls: string[] = []
        const command = manyCommand<number>({
            label: "many", items: [1, 2, 3],
            undoEach: async n => { calls.push(`u${n}`) },
            redoEach: async n => { calls.push(`r${n}`) },
            ...over,
        })
        return { calls, command }
    }

    it("undoes from the last item, redoes in order, and reloads once when asked", async () => {
        const reload = vi.fn(async () => {})
        const { calls, command } = build({ reloadUndo: reload })
        await command.undo()
        expect(calls).toEqual(["u3", "u2", "u1"])
        expect(reload).toHaveBeenCalledTimes(1)
        await command.redo()
        expect(calls.slice(3)).toEqual(["r1", "r2", "r3"])
        expect(reload).toHaveBeenCalledTimes(1)
        expect(command.label).toBe("many")
    })

    it("does not reload after a failure unless reloadEvenOnFailure is set", async () => {
        const reload = vi.fn(async () => {})
        const failing = async (n: number) => { if (n === 2) throw new Error("boom") }
        await expect(build({ undoEach: failing, reloadUndo: reload }).command.undo()).rejects.toThrow("boom")
        expect(reload).not.toHaveBeenCalled()
        await expect(build({ redoEach: failing, reloadRedo: reload, reloadEvenOnFailure: true }).command.redo()).rejects.toThrow("boom")
        expect(reload).toHaveBeenCalledTimes(1)
    })
})
