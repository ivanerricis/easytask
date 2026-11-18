import { describe, expect, it } from "vitest"
import type { NoteDataTree } from "@/types/types"
import { makeDefaultSection, makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import { moveGroupInList } from "./note-dnd"
import { getDirectStep, getGroupStep, getSectionStep, getTaskStep } from "./note-steps"

/*
 * group 1 (position 0): S1 [A, B(done), C [C1, C2]], S2 [D]
 * group 2 (position 1): S3 []
 * group 3 (position 2): S4 [E]
 */
const top = (id: number, sectionID: number, text: string, over: Partial<ReturnType<typeof makeTask>> = {}) =>
    makeTask({ id, sectionID, taskID: null, text, ...over })

function buildTree(): NoteDataTree {
    const c1 = makeTask({ id: 31, sectionID: 1, taskID: 3, text: "C1" })
    const c2 = makeTask({ id: 32, sectionID: 1, taskID: 3, text: "C2" })
    return {
        groups: [
            // The groups are given out of order on purpose: steps follow the position, not the array order
            makeGroup({ id: 3, position: 2, sections: [makeSection({ id: 4, groupID: 3, tasks: [top(5, 4, "E")] })] }),
            makeGroup({
                id: 1, position: 0, sections: [
                    makeSection({ id: 1, groupID: 1, tasks: [top(1, 1, "A"), top(2, 1, "B", { completed: true }), top(3, 1, "C", { subtasks: [c1, c2] })] }),
                    makeSection({ id: 2, groupID: 1, tasks: [top(4, 2, "D")] }),
                ],
            }),
            makeGroup({ id: 2, position: 1, sections: [makeSection({ id: 3, groupID: 2 })] }),
        ],
    }
}

describe("getTaskStep", () => {
    it("moves a task down by jumping over the next sibling", () => {
        expect(getTaskStep(buildTree(), 1, 1, false)).toEqual({ sectionId: 1, parentTaskId: null, index: 1 })
    })

    it("moves a task up by jumping over the previous sibling", () => {
        expect(getTaskStep(buildTree(), 3, -1, false)).toEqual({ sectionId: 1, parentTaskId: null, index: 1 })
    })

    it("has nowhere to go from the first (up) and last (down) position", () => {
        expect(getTaskStep(buildTree(), 1, -1, false)).toBeNull()
        expect(getTaskStep(buildTree(), 3, 1, false)).toBeNull()
        expect(getTaskStep(buildTree(), 4, 1, false)).toBeNull()
    })

    it("works among the subtasks of a task", () => {
        expect(getTaskStep(buildTree(), 31, 1, false)).toEqual({ sectionId: 1, parentTaskId: 3, index: 1 })
        expect(getTaskStep(buildTree(), 32, -1, false)).toEqual({ sectionId: 1, parentTaskId: 3, index: 0 })
        expect(getTaskStep(buildTree(), 31, -1, false)).toBeNull()
    })

    it("jumps over the completed tasks while they are hidden", () => {
        // A down: B (index 1) is hidden, so it jumps over C (index 2)
        expect(getTaskStep(buildTree(), 1, 1, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 2 })
        // C up: B is hidden, so it jumps over A
        expect(getTaskStep(buildTree(), 3, -1, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 0 })
        // ...and over a visible sibling it is the plain next one
        expect(getTaskStep(buildTree(), 1, 1, false)?.index).toBe(1)
    })

    it("does not jump over a completed task that stays visible because of an open subtask", () => {
        const tree = buildTree()
        const section = tree.groups.find(g => g.id === 1)!.sections[0]
        section.tasks[1].subtasks = [makeTask({ id: 21, sectionID: 1, taskID: 2, text: "B1" })]
        // A down: B is completed but shown (B1 is open), so it is the next sibling
        expect(getTaskStep(tree, 1, 1, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 1 })
    })

    it("with the completed tasks last, steps within the displayed order and never between the open and the completed block", () => {
        // Displayed: A, C (open) then B (completed); stored: A, B, C
        // A down: it jumps over C, whose stored index is 2
        expect(getTaskStep(buildTree(), 1, 1, false, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 2 })
        // C up: over A
        expect(getTaskStep(buildTree(), 3, -1, false, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 0 })
        // The edges of the blocks: C is the last open one, B the only completed one
        expect(getTaskStep(buildTree(), 3, 1, false, true)).toBeNull()
        expect(getTaskStep(buildTree(), 2, -1, false, true)).toBeNull()
        expect(getTaskStep(buildTree(), 2, 1, false, true)).toBeNull()
        expect(getTaskStep(buildTree(), 1, -1, false, true)).toBeNull()
    })

    it("with the completed tasks last, swaps two completed tasks and works among the subtasks", () => {
        const tree: NoteDataTree = { groups: [makeGroup({ id: 1, position: 0, sections: [makeSection({ id: 1, groupID: 1, tasks: [
            top(1, 1, "A", { completed: true }), top(2, 1, "B"), top(3, 1, "C", { completed: true }), top(4, 1, "D"),
            top(5, 1, "E", { subtasks: [
                makeTask({ id: 51, sectionID: 1, taskID: 5, completed: true }), makeTask({ id: 52, sectionID: 1, taskID: 5 }),
            ] }),
        ] })] })] }
        // Displayed: B, D, E, A, C. A down: over C (stored index 2)
        expect(getTaskStep(tree, 1, 1, false, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 2 })
        expect(getTaskStep(tree, 3, -1, false, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 0 })
        // B down: over D (stored index 3), D down: over E
        expect(getTaskStep(tree, 2, 1, false, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 3 })
        expect(getTaskStep(tree, 4, 1, false, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 4 })
        // Subtasks: 52 (open) is displayed before 51 (completed)
        expect(getTaskStep(tree, 51, -1, false, true)).toBeNull()
        expect(getTaskStep(tree, 52, 1, false, true)).toBeNull()
    })

    it("with the completed tasks last and hidden, still skips the hidden ones", () => {
        // Displayed: A, C; B is hidden. A down: over C
        expect(getTaskStep(buildTree(), 1, 1, true, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 2 })
        expect(getTaskStep(buildTree(), 3, -1, true, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 0 })
    })

    it("a section with its own order wins over the preference, in both directions", () => {
        const withOrder = (task_order: "manual" | "open-first" | "done-first") => {
            const tree = buildTree()
            tree.groups.find(g => g.id === 1)!.sections[0].task_order = task_order
            return tree
        }
        // Stored: A, B(done), C. "manual" ignores the preference "completed tasks last": A down jumps over B
        expect(getTaskStep(withOrder("manual"), 1, 1, false, true)).toEqual({ sectionId: 1, parentTaskId: null, index: 1 })
        // "open-first" sorts although the preference is off: A down jumps over C
        expect(getTaskStep(withOrder("open-first"), 1, 1, false, false)).toEqual({ sectionId: 1, parentTaskId: null, index: 2 })
        // "done-first": displayed B, A, C. B is the first and cannot cross to the open block; C up goes over A
        expect(getTaskStep(withOrder("done-first"), 2, 1, false, false)).toBeNull()
        expect(getTaskStep(withOrder("done-first"), 3, -1, false, false)).toEqual({ sectionId: 1, parentTaskId: null, index: 0 })
        // Another section follows the preference
        expect(getTaskStep(withOrder("done-first"), 4, -1, false, false)).toBeNull()
    })

    it("gives the expected order once applied (the index is the final one among the siblings)", () => {
        const order = (ids: number[], id: number, index: number) => { const rest = ids.filter(x => x !== id); rest.splice(index, 0, id); return rest }
        expect(order([1, 2, 3], 1, getTaskStep(buildTree(), 1, 1, false)!.index)).toEqual([2, 1, 3])
        expect(order([1, 2, 3], 3, getTaskStep(buildTree(), 3, -1, false)!.index)).toEqual([1, 3, 2])
        expect(order([1, 2, 3], 1, getTaskStep(buildTree(), 1, 1, true)!.index)).toEqual([2, 3, 1])
    })

    it("is null for an unknown task", () => {
        expect(getTaskStep(buildTree(), 999, 1, false)).toBeNull()
    })
})

describe("getSectionStep", () => {
    it("moves a section within its group", () => {
        expect(getSectionStep(buildTree(), 1, 1)).toEqual({ type: "group", groupId: 1, index: 1 })
        expect(getSectionStep(buildTree(), 2, -1)).toEqual({ type: "group", groupId: 1, index: 0 })
    })

    it("is null at the ends and for a section alone in its group", () => {
        expect(getSectionStep(buildTree(), 1, -1)).toBeNull()
        expect(getSectionStep(buildTree(), 2, 1)).toBeNull()
        expect(getSectionStep(buildTree(), 3, 1)).toBeNull()
        expect(getSectionStep(buildTree(), 3, -1)).toBeNull()
    })
})

describe("getGroupStep", () => {
    it("follows the position of the groups, not the order of the array", () => {
        expect(getGroupStep(buildTree(), 1, 1)).toBe(1)
        expect(getGroupStep(buildTree(), 2, -1)).toBe(0)
        expect(getGroupStep(buildTree(), 3, -1)).toBe(1)
    })

    it("is null at the ends", () => {
        expect(getGroupStep(buildTree(), 1, -1)).toBeNull()
        expect(getGroupStep(buildTree(), 3, 1)).toBeNull()
    })

    it("is accepted by moveGroupInList: the groups end up swapped", () => {
        const tree = buildTree()
        const moved = moveGroupInList(tree.groups, 1, getGroupStep(tree, 1, 1)!)
        expect(moved?.map(group => group.id)).toEqual([2, 1, 3])
    })
})

describe("getTaskStep for the direct tasks of a group", () => {
    // group 1: direct [X, Y], section S1 [A]
    const directTree = (): NoteDataTree => ({
        groups: [makeGroup({
            id: 1,
            defaultSection: makeDefaultSection({ id: 10, groupID: 1, tasks: [top(1, 10, "X"), top(2, 10, "Y")] }),
            sections: [makeSection({ id: 11, groupID: 1, tasks: [top(3, 11, "A")] })],
        })],
    })

    it("steps among the direct tasks", () => {
        expect(getTaskStep(directTree(), 1, 1, false)).toEqual({ sectionId: 10, parentTaskId: null, index: 1 })
        expect(getTaskStep(directTree(), 2, -1, false)).toEqual({ sectionId: 10, parentTaskId: null, index: 0 })
    })

    it("does not step out of the direct area: the last direct task has no way down, the section's first no way up", () => {
        expect(getTaskStep(directTree(), 2, 1, false)).toBeNull()
        expect(getTaskStep(directTree(), 1, -1, false)).toBeNull()
        expect(getTaskStep(directTree(), 3, -1, false)).toBeNull()
    })
})

describe("steps with the list of the direct tasks among the sections", () => {
    // group 1: sections S1 (id 1), S2 (id 2), S3 (id 3) with the list (id 9) before the `defaultIndex`-th section
    const tree = (defaultIndex: number): NoteDataTree => ({
        groups: [makeGroup({
            id: 1, position: 0, defaultIndex, defaultSection: makeDefaultSection({ id: 9, groupID: 1 }),
            sections: [1, 2, 3].map(id => makeSection({ id, groupID: 1 })),
        })],
    })

    it("a section that would jump over the list moves the list the other way", () => {
        // [L, S1, S2, S3]: S1 up jumps over L = the list goes after S1
        expect(getSectionStep(tree(0), 1, -1)).toEqual({ type: "direct", groupId: 1, index: 1 })
        // [S1, L, S2, S3]: S1 down jumps over L = the list goes before S1; S2 up the same, with the list after S1
        expect(getSectionStep(tree(1), 1, 1)).toEqual({ type: "direct", groupId: 1, index: 0 })
        expect(getSectionStep(tree(1), 2, -1)).toEqual({ type: "direct", groupId: 1, index: 2 })
    })

    it("other steps stay plain section moves", () => {
        expect(getSectionStep(tree(1), 2, 1)).toEqual({ type: "group", groupId: 1, index: 2 })
        expect(getSectionStep(tree(1), 3, -1)).toEqual({ type: "group", groupId: 1, index: 1 })
        expect(getSectionStep(tree(0), 2, -1)).toEqual({ type: "group", groupId: 1, index: 0 })
        expect(getSectionStep(tree(0), 3, 1)).toBeNull()
        expect(getSectionStep(tree(1), 1, -1)).toBeNull()
    })

    it("a section stepping down onto the place of the list stays above it (one move, beforeList)", () => {
        // [S1, S2, S3, L]: S2 down lands on the last place among the sections, where the move would also pass the list
        expect(getSectionStep(tree(3), 2, 1)).toEqual({ type: "group", groupId: 1, index: 2, beforeList: true })
        // [S1, S2, L, S3]: S1 down = after S2, above the list
        expect(getSectionStep(tree(2), 1, 1)).toEqual({ type: "group", groupId: 1, index: 1, beforeList: true })
        // going up never needs it: the section lands above the section it jumps over, wherever the list is
        expect(getSectionStep(tree(3), 3, -1)).toEqual({ type: "group", groupId: 1, index: 1 })
        // ...but with the list elsewhere (or before the end) nothing more is needed
        expect(getSectionStep(tree(2), 2, 1)).toEqual({ type: "direct", groupId: 1, index: 1 })
        expect(getSectionStep(tree(1), 1, 1)).toEqual({ type: "direct", groupId: 1, index: 0 })
        expect(getSectionStep(tree(0), 2, 1)).toEqual({ type: "group", groupId: 1, index: 2 })
        // S3 is already the last section but the list is below it: it jumps over the list
        expect(getSectionStep(tree(3), 3, 1)).toEqual({ type: "direct", groupId: 1, index: 2 })
    })

    it("getDirectStep moves the list one section up or down, null at the ends or without list", () => {
        expect(getDirectStep(tree(0), 1, 1)).toBe(1)
        expect(getDirectStep(tree(0), 1, -1)).toBeNull()
        expect(getDirectStep(tree(2), 1, -1)).toBe(1)
        expect(getDirectStep(tree(3), 1, 1)).toBeNull()
        expect(getDirectStep(tree(3), 1, -1)).toBe(2)
        expect(getDirectStep(tree(0), 99, 1)).toBeNull()
        expect(getDirectStep(buildTree(), 1, 1)).toBeNull()
    })
})