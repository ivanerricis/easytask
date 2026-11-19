import { describe, expect, it } from "vitest"
import type { NoteDataTree } from "@/types/types"
import { makeDefaultSection, makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import { findGroup, findSection, findTask } from "./note-tree-ops"
import { moveGroupAcross, moveSectionAcross, moveSectionToNewGroupAcross, moveTaskAcross } from "./cross-note-ops"

/*
 * note A: group 1: S10 [T100 [T101], T102], S11; group 2: S20 [T200]
 * note B: group 3: S30 [T300] (+ direct list 31); group 4
 */
const noteA = (): NoteDataTree => ({
    groups: [
        makeGroup({
            id: 1, noteID: 1, position: 0, sections: [
                makeSection({
                    id: 10, groupID: 1, title: "S10", tasks: [
                        makeTask({ id: 100, sectionID: 10, position: 0, subtasks: [makeTask({ id: 101, sectionID: 10, taskID: 100 })] }),
                        makeTask({ id: 102, sectionID: 10, position: 1 }),
                    ],
                }),
                makeSection({ id: 11, groupID: 1, title: "S11", position: 1 }),
            ],
        }),
        makeGroup({ id: 2, noteID: 1, position: 1, sections: [makeSection({ id: 20, groupID: 2, title: "S20", tasks: [makeTask({ id: 200, sectionID: 20 })] })] }),
    ],
})

const noteB = (): NoteDataTree => ({
    groups: [
        makeGroup({ id: 3, noteID: 2, position: 0, defaultSection: makeDefaultSection({ id: 31, groupID: 3 }), sections: [makeSection({ id: 30, groupID: 3, title: "S30", tasks: [makeTask({ id: 300, sectionID: 30 })] })] }),
        makeGroup({ id: 4, noteID: 2, position: 1, sections: [] }),
    ],
})

describe("moveTaskAcross", () => {
    it("takes the task with its subtasks out of one tree and puts it, with the section of the destination, in the other", () => {
        const pair = moveTaskAcross(noteA(), noteB(), 100, { sectionId: 30, parentTaskId: null }, 0)!
        expect(findTask(pair.from, 100)).toBeUndefined()
        expect(findTask(pair.from, 101)).toBeUndefined()
        expect(findTask(pair.from, 102)?.index).toBe(0)
        const moved = findTask(pair.to, 100)!
        expect(moved.parent).toEqual({ sectionId: 30 })
        expect(moved.index).toBe(0)
        expect(moved.task.sectionID).toBe(30)
        expect(moved.task.subtasks[0]).toMatchObject({ id: 101, sectionID: 30, taskID: 100 })
        expect(findTask(pair.to, 300)?.index).toBe(1)
    })

    it("goes under a task of the other note", () => {
        const pair = moveTaskAcross(noteA(), noteB(), 102, { sectionId: 30, parentTaskId: 300 }, 0)!
        expect(findTask(pair.to, 102)).toMatchObject({ parent: { parentTaskId: 300 }, index: 0 })
        expect(findTask(pair.to, 102)?.task).toMatchObject({ sectionID: 30, taskID: 300 })
    })

    it("does not change the trees it was given, and returns null when it cannot apply", () => {
        const from = noteA()
        const to = noteB()
        moveTaskAcross(from, to, 100, { sectionId: 30, parentTaskId: null }, 0)
        expect(findTask(from, 100)).toBeDefined()
        expect(findTask(to, 100)).toBeUndefined()
        expect(moveTaskAcross(from, to, 999, { sectionId: 30, parentTaskId: null }, 0)).toBeNull()
        expect(moveTaskAcross(from, to, 100, { sectionId: 999, parentTaskId: null }, 0)).toBeNull()
    })

    it("the same note twice: one tree takes the task out and puts it back", () => {
        const tree = noteA()
        const pair = moveTaskAcross(tree, tree, 102, { sectionId: 20, parentTaskId: null }, 0, true)!
        expect(pair.from).toBe(pair.to)
        expect(findTask(pair.to, 102)).toMatchObject({ parent: { sectionId: 20 }, index: 0 })
        expect(findTask(pair.to, 200)?.index).toBe(1)
    })
})

describe("moveSectionAcross", () => {
    it("moves a section with its tasks to a group of the other tree", () => {
        const pair = moveSectionAcross(noteA(), noteB(), 10, 3, 0)!
        expect(findSection(pair.from, 10)).toBeUndefined()
        expect(findSection(pair.to, 10)).toMatchObject({ groupId: 3, index: 0 })
        expect(findSection(pair.to, 10)?.section.groupID).toBe(3)
        expect(findTask(pair.to, 100)).toBeDefined()
        expect(findSection(pair.to, 30)?.index).toBe(1)
    })

    it("the list of direct tasks keeps its place before the section when asked (beforeList)", () => {
        const before = moveSectionAcross(noteA(), noteB(), 10, 3, 0, true)!
        expect(findGroup(before.to, 3)?.group.defaultIndex).toBe(1)
        const after = moveSectionAcross(noteA(), noteB(), 10, 3, 0, false)!
        expect(findGroup(after.to, 3)?.group.defaultIndex ?? 0).toBe(0)
    })

    it("refuses the hidden list of a group and a missing group", () => {
        expect(moveSectionAcross(noteB(), noteA(), 31, 1, 0)).toBeNull()
        expect(moveSectionAcross(noteA(), noteB(), 10, 999, 0)).toBeNull()
    })
})

describe("moveSectionToNewGroupAcross", () => {
    it("creates the group in the other tree at the index, with its list, and puts the section in it", () => {
        const pair = moveSectionToNewGroupAcross(noteA(), noteB(), 10, 2, 50, 51, 1)!
        expect(pair.to.groups.map(group => group.id)).toEqual([3, 50, 4])
        expect(pair.to.groups.map(group => group.position)).toEqual([0, 1, 2])
        const group = findGroup(pair.to, 50)!.group
        expect(group.noteID).toBe(2)
        expect(group.defaultSection?.id).toBe(51)
        expect(group.sections.map(section => section.id)).toEqual([10])
        expect(findSection(pair.from, 10)).toBeUndefined()
    })

    it("needs the ids the write returned", () => {
        expect(moveSectionToNewGroupAcross(noteA(), noteB(), 10, 2, Number.NaN, 51, 1)).toBeNull()
        expect(moveSectionToNewGroupAcross(noteA(), noteB(), 999, 2, 50, 51, 1)).toBeNull()
    })
})

describe("moveGroupAcross", () => {
    it("moves a group to the other tree and renumbers both lists", () => {
        const pair = moveGroupAcross(noteA(), noteB(), 1, 2, 1)!
        expect(pair.from.groups.map(group => [group.id, group.position])).toEqual([[2, 0]])
        expect(pair.to.groups.map(group => [group.id, group.position])).toEqual([[3, 0], [1, 1], [4, 2]])
        expect(findGroup(pair.to, 1)?.group.noteID).toBe(2)
        expect(findTask(pair.to, 100)).toBeDefined()
    })

    it("clamps the index and refuses an unknown group", () => {
        expect(moveGroupAcross(noteA(), noteB(), 2, 2, 99)!.to.groups.map(group => group.id)).toEqual([3, 4, 2])
        expect(moveGroupAcross(noteA(), noteB(), 999, 2, 0)).toBeNull()
    })

    it("the same note twice reorders its groups", () => {
        const tree = noteA()
        const pair = moveGroupAcross(tree, tree, 1, 1, 1, true)!
        expect(pair.from).toBe(pair.to)
        expect(pair.to.groups.map(group => [group.id, group.position])).toEqual([[2, 0], [1, 1]])
    })
})
