import { describe, expect, it } from "vitest"
import type { NoteDataTree } from "@/types/types"
import { makeDefaultSection, makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import { computeCrossGroupDropZone, computeGroupTarget, computeSectionTarget, computeTaskTarget } from "./note-dnd"

/*
 * The targets of a drag that comes from ANOTHER note of the split view: the item is looked up in the note it leaves (`from`) and the
 * destination in the note that receives it. Nothing is a no-op there, since the item is not in the destination.
 *
 * note A: group 1: S1 [T1 [T1a], T2], S2 [T3]; group 2: S3 []
 * note B: group 10: S10 [T10, T11], S11 []; group 11: S12 [T12] (with direct tasks), group 12
 */
const note = (id: number, sectionID: number, subtasks: ReturnType<typeof makeTask>[] = []) => makeTask({ id, sectionID, text: `T${id}`, subtasks, taskID: null })

const noteA = (): NoteDataTree => ({
    groups: [
        makeGroup({
            id: 1, position: 0, sections: [
                makeSection({ id: 1, groupID: 1, title: "S1", tasks: [note(1, 1, [makeTask({ id: 5, sectionID: 1, taskID: 1, text: "T1a" })]), note(2, 1)] }),
                makeSection({ id: 2, groupID: 1, title: "S2", tasks: [note(3, 2)] }),
            ],
        }),
        makeGroup({ id: 2, position: 1, sections: [makeSection({ id: 3, groupID: 2, title: "S3" })] }),
    ],
})

const noteB = (): NoteDataTree => ({
    groups: [
        makeGroup({
            id: 10, position: 0, sections: [
                makeSection({ id: 10, groupID: 10, title: "S10", tasks: [note(10, 10), note(11, 10)] }),
                makeSection({ id: 11, groupID: 10, title: "S11" }),
            ],
        }),
        makeGroup({ id: 11, position: 1, defaultSection: makeDefaultSection({ id: 20, groupID: 11, tasks: [note(20, 20)] }), sections: [makeSection({ id: 12, groupID: 11, title: "S12", tasks: [note(12, 12)] })] }),
        makeGroup({ id: 12, position: 2, sections: [] }),
    ],
})

describe("computeTaskTarget from another note", () => {
    const from = noteA()
    const to = noteB()

    it("puts the task before, after or inside a task of the other note", () => {
        expect(computeTaskTarget(to, 1, { kind: "task", id: 11 }, "before", from)).toEqual({ sectionId: 10, parentTaskId: null, index: 1 })
        expect(computeTaskTarget(to, 1, { kind: "task", id: 10 }, "after", from)).toEqual({ sectionId: 10, parentTaskId: null, index: 1 })
        expect(computeTaskTarget(to, 1, { kind: "task", id: 10 }, "inside", from)).toEqual({ sectionId: 10, parentTaskId: 10, index: 0 })
    })

    it("a section or a group of the other note takes it as its last task (the direct list for a group)", () => {
        expect(computeTaskTarget(to, 1, { kind: "section", id: 10 }, "inside", from)).toEqual({ sectionId: 10, parentTaskId: null, index: 2 })
        expect(computeTaskTarget(to, 1, { kind: "group", id: 11 }, "inside", from)).toEqual({ sectionId: 20, parentTaskId: null, index: 1 })
    })

    it("works for a subtask, and rejects a task the other note does not have or a group without direct list", () => {
        expect(computeTaskTarget(to, 5, { kind: "section", id: 11 }, "inside", from)).toEqual({ sectionId: 11, parentTaskId: null, index: 0 })
        expect(computeTaskTarget(to, 999, { kind: "section", id: 10 }, "inside", from)).toBeNull()
        expect(computeTaskTarget(to, 1, { kind: "group", id: 12 }, "inside", from)).toBeNull()
    })

    it("without `from` the task is looked up in the destination: a task of another note is not found there", () => {
        expect(computeTaskTarget(to, 1, { kind: "section", id: 10 }, "inside")).toBeNull()
    })
})

describe("computeSectionTarget from another note", () => {
    const from = noteA()
    const to = noteB()

    it("puts the section before or after a section of the other note, or at the end of a group", () => {
        expect(computeSectionTarget(to, 2, { kind: "section", id: 11 }, "before", from)).toEqual({ type: "group", groupId: 10, index: 1 })
        expect(computeSectionTarget(to, 2, { kind: "section", id: 10 }, "after", from)).toEqual({ type: "group", groupId: 10, index: 1 })
        expect(computeSectionTarget(to, 2, { kind: "group", id: 10 }, "inside", from)).toEqual({ type: "group", groupId: 10, index: 2 })
    })

    it("a drop on the slot of a new group is a new group (the caller creates it in the note under the pointer)", () => {
        expect(computeSectionTarget(to, 2, { kind: "new-group", id: 3 }, "inside", from)).toEqual({ type: "new-group", index: 3 })
        // Pulling the only section of a group next to that group is a reorder only inside its own note
        expect(computeSectionTarget(from, 3, { kind: "new-group", id: 0 }, "inside")).toEqual({ type: "new-group", index: 0 })
        expect(computeSectionTarget(from, 3, { kind: "new-group", id: 1 }, "inside")).toBeNull()
        expect(computeSectionTarget(from, 3, { kind: "new-group", id: 2 }, "inside")).toBeNull()
        expect(computeSectionTarget(to, 3, { kind: "new-group", id: 2 }, "inside", from)).toEqual({ type: "new-group", index: 2 })
    })

    it("the section that is not in the note it leaves, or the hidden list of a group, gives nothing", () => {
        expect(computeSectionTarget(to, 999, { kind: "group", id: 10 }, "inside", from)).toBeNull()
        expect(computeSectionTarget(to, 20, { kind: "group", id: 10 }, "inside", noteB())).toBeNull()
    })
})

describe("computeGroupTarget from another note", () => {
    const from = noteA()
    const to = noteB()

    it("goes before or after a group of the other note by the zone", () => {
        expect(computeGroupTarget(to, 1, { kind: "group", id: 11 }, "before", from)).toEqual({ index: 1 })
        expect(computeGroupTarget(to, 1, { kind: "group", id: 11 }, "after", from)).toEqual({ index: 2 })
        expect(computeGroupTarget(to, 2, { kind: "group", id: 10 }, "before", from)).toEqual({ index: 0 })
    })

    it("is never a no-op there, and needs the group and the target", () => {
        expect(computeGroupTarget(to, 1, { kind: "group", id: 12 }, "after", from)).toEqual({ index: 3 })
        expect(computeGroupTarget(to, 999, { kind: "group", id: 12 }, "after", from)).toBeNull()
        expect(computeGroupTarget(to, 1, { kind: "group", id: 999 }, "after", from)).toBeNull()
        expect(computeGroupTarget(to, 1, { kind: "section", id: 10 }, "after", from)).toBeNull()
    })
})

describe("computeCrossGroupDropZone", () => {
    it("is before in the left half of the column and after in the right half", () => {
        const rect = { left: 100, width: 200 }
        expect(computeCrossGroupDropZone(rect, 120)).toBe("before")
        expect(computeCrossGroupDropZone(rect, 199)).toBe("before")
        expect(computeCrossGroupDropZone(rect, 200)).toBe("after")
        expect(computeCrossGroupDropZone(rect, 290)).toBe("after")
    })
})
