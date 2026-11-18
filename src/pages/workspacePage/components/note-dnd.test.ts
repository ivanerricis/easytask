import { describe, expect, it } from "vitest"
import type { NoteDataTree } from "@/types/types"
import { makeDefaultSection, makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import {
    computeDropZone, computeGroupDropZone, computeGroupTarget, computeSectionTarget, moveGroupInList, computeTaskTarget, findSection, findTask,
    ACCEPTS, getSectionMoveDestinations, getTaskMoveDestinations, indexTree,
} from "./note-dnd"

/*
 * group 1: S1 [T1 [T1a [T1a1], T1b], T2], S2 [T3]
 * group 2: S3 []
 * group 3: S4 [T4]
 */
const task = (id: number, sectionID: number, subtasks: ReturnType<typeof makeTask>[] = []) =>
    makeTask({ id, sectionID, text: `T${id}`, subtasks, taskID: null })

function buildTree(): NoteDataTree {
    const t1a1 = makeTask({ id: 13, sectionID: 1, taskID: 11, text: "T1a1" })
    const t1a = makeTask({ id: 11, sectionID: 1, taskID: 1, text: "T1a", subtasks: [t1a1] })
    const t1b = makeTask({ id: 12, sectionID: 1, taskID: 1, text: "T1b" })
    return {
        groups: [
            makeGroup({
                id: 1, position: 0, sections: [
                    makeSection({ id: 1, groupID: 1, title: "S1", tasks: [task(1, 1, [t1a, t1b]), task(2, 1)] }),
                    makeSection({ id: 2, groupID: 1, title: "S2", tasks: [task(3, 2)] }),
                ],
            }),
            makeGroup({ id: 2, position: 1, sections: [makeSection({ id: 3, groupID: 2, title: "S3" })] }),
            makeGroup({ id: 3, position: 2, sections: [makeSection({ id: 4, groupID: 3, title: "S4", tasks: [task(4, 4)] })] }),
        ],
    }
}

const rect = { top: 100, height: 40 }

describe("computeDropZone", () => {
    it("splits a task row in before / inside / after", () => {
        expect(computeDropZone("task", "task", rect, 102)).toBe("before")
        expect(computeDropZone("task", "task", rect, 120)).toBe("inside")
        expect(computeDropZone("task", "task", rect, 138)).toBe("after")
    })

    it("uses inside-start instead of after for a task with subtasks", () => {
        expect(computeDropZone("task", "task", rect, 138, { hasSubtasks: true })).toBe("inside-start")
    })

    it("splits a section card hovered by a section in before / after", () => {
        expect(computeDropZone("section", "section", rect, 110)).toBe("before")
        expect(computeDropZone("section", "section", rect, 130)).toBe("after")
    })

    it("is inside for a task over a section, a group or a new-group slot", () => {
        expect(computeDropZone("task", "section", rect, 101)).toBe("inside")
        expect(computeDropZone("section", "group", rect, 101)).toBe("inside")
        expect(computeDropZone("section", "new-group", rect, 101)).toBe("inside")
    })
})

describe("computeSectionTarget", () => {
    const tree = buildTree()

    it("reorders inside the group (final index semantics)", () => {
        expect(computeSectionTarget(tree, 1, { kind: "section", id: 2 }, "after")).toEqual({ type: "group", groupId: 1, index: 1 })
        expect(computeSectionTarget(tree, 2, { kind: "section", id: 1 }, "before")).toEqual({ type: "group", groupId: 1, index: 0 })
    })

    it("returns null for a no-op or for itself", () => {
        expect(computeSectionTarget(tree, 1, { kind: "section", id: 2 }, "before")).toBeNull()
        expect(computeSectionTarget(tree, 2, { kind: "section", id: 1 }, "after")).toBeNull()
        expect(computeSectionTarget(tree, 1, { kind: "section", id: 1 }, "after")).toBeNull()
    })

    it("moves before / after a section of another group", () => {
        expect(computeSectionTarget(tree, 1, { kind: "section", id: 4 }, "before")).toEqual({ type: "group", groupId: 3, index: 0 })
        expect(computeSectionTarget(tree, 1, { kind: "section", id: 4 }, "after")).toEqual({ type: "group", groupId: 3, index: 1 })
    })

    it("appends to a group when dropped on its empty area", () => {
        expect(computeSectionTarget(tree, 1, { kind: "group", id: 2 }, "inside")).toEqual({ type: "group", groupId: 2, index: 1 })
        expect(computeSectionTarget(tree, 1, { kind: "group", id: 1 }, "inside")).toEqual({ type: "group", groupId: 1, index: 1 })
        expect(computeSectionTarget(tree, 2, { kind: "group", id: 1 }, "inside")).toBeNull()
    })

    it("creates a new group at the slot index", () => {
        expect(computeSectionTarget(tree, 1, { kind: "new-group", id: 3 }, "inside")).toEqual({ type: "new-group", index: 3 })
        expect(computeSectionTarget(tree, 1, { kind: "new-group", id: 0 }, "inside")).toEqual({ type: "new-group", index: 0 })
    })

    it("does not offer a new group next to the group of a lone section", () => {
        // S3 is alone in group index 1: slots 1 and 2 are just a group reorder
        expect(computeSectionTarget(tree, 3, { kind: "new-group", id: 1 }, "inside")).toBeNull()
        expect(computeSectionTarget(tree, 3, { kind: "new-group", id: 2 }, "inside")).toBeNull()
        expect(computeSectionTarget(tree, 3, { kind: "new-group", id: 0 }, "inside")).toEqual({ type: "new-group", index: 0 })
    })

    it("returns null for unknown ids", () => {
        expect(computeSectionTarget(tree, 99, { kind: "group", id: 1 }, "inside")).toBeNull()
        expect(computeSectionTarget(tree, 1, { kind: "group", id: 99 }, "inside")).toBeNull()
    })
})

describe("computeTaskTarget", () => {
    const tree = buildTree()

    it("inherits the parent of the hovered task for before / after", () => {
        expect(computeTaskTarget(tree, 3, { kind: "task", id: 1 }, "before")).toEqual({ sectionId: 1, parentTaskId: null, index: 0 })
        expect(computeTaskTarget(tree, 3, { kind: "task", id: 1 }, "after")).toEqual({ sectionId: 1, parentTaskId: null, index: 1 })
        // a subtask dropped next to a subtask of another task becomes its sibling
        expect(computeTaskTarget(tree, 2, { kind: "task", id: 12 }, "after")).toEqual({ sectionId: 1, parentTaskId: 1, index: 2 })
    })

    it("nests inside a task (last position, or first with inside-start)", () => {
        expect(computeTaskTarget(tree, 3, { kind: "task", id: 1 }, "inside")).toEqual({ sectionId: 1, parentTaskId: 1, index: 2 })
        expect(computeTaskTarget(tree, 3, { kind: "task", id: 1 }, "inside-start")).toEqual({ sectionId: 1, parentTaskId: 1, index: 0 })
        expect(computeTaskTarget(tree, 3, { kind: "task", id: 4 }, "inside")).toEqual({ sectionId: 4, parentTaskId: 4, index: 0 })
    })

    it("turns a subtask into a top level task of a section (last position)", () => {
        expect(computeTaskTarget(tree, 13, { kind: "section", id: 4 }, "inside")).toEqual({ sectionId: 4, parentTaskId: null, index: 1 })
        expect(computeTaskTarget(tree, 13, { kind: "section", id: 3 }, "inside")).toEqual({ sectionId: 3, parentTaskId: null, index: 0 })
    })

    it("moves a subtask under a task of another section and group", () => {
        expect(computeTaskTarget(tree, 13, { kind: "task", id: 4 }, "inside")).toEqual({ sectionId: 4, parentTaskId: 4, index: 0 })
    })

    it("never drops a task under itself or a descendant", () => {
        expect(computeTaskTarget(tree, 1, { kind: "task", id: 1 }, "inside")).toBeNull()
        expect(computeTaskTarget(tree, 1, { kind: "task", id: 11 }, "inside")).toBeNull()
        expect(computeTaskTarget(tree, 1, { kind: "task", id: 13 }, "after")).toBeNull()
        expect(computeTaskTarget(tree, 1, { kind: "task", id: 12 }, "before")).toBeNull()
    })

    it("returns null for no-ops", () => {
        expect(computeTaskTarget(tree, 1, { kind: "task", id: 2 }, "before")).toBeNull()
        expect(computeTaskTarget(tree, 2, { kind: "task", id: 1 }, "after")).toBeNull()
        expect(computeTaskTarget(tree, 2, { kind: "section", id: 1 }, "inside")).toBeNull()
    })

    it("reorders subtasks under the same parent", () => {
        expect(computeTaskTarget(tree, 12, { kind: "task", id: 11 }, "before")).toEqual({ sectionId: 1, parentTaskId: 1, index: 0 })
    })

    it("returns null for groups and unknown ids", () => {
        expect(computeTaskTarget(tree, 1, { kind: "group", id: 1 }, "inside")).toBeNull()
        expect(computeTaskTarget(tree, 99, { kind: "section", id: 1 }, "inside")).toBeNull()
    })
})

describe("lookups", () => {
    const tree = buildTree()
    it("finds sections and nested tasks", () => {
        expect(findSection(tree, 2)?.title).toBe("S2")
        expect(findTask(tree, 13)?.text).toBe("T1a1")
        expect(findTask(tree, 99)).toBeUndefined()
    })

    it("indexes a tree once and a replaced tree again", () => {
        expect(indexTree(tree)).toBe(indexTree(tree))
        // A change replaces the tree: the new one is indexed from scratch, the old index is not reused
        const renamed: NoteDataTree = {
            groups: tree.groups.map(group => ({
                ...group,
                sections: group.sections.map(section => section.id === 2 ? { ...section, title: "S2 bis" } : section),
            })),
        }
        expect(indexTree(renamed)).not.toBe(indexTree(tree))
        expect(findSection(renamed, 2)?.title).toBe("S2 bis")
        expect(findSection(tree, 2)?.title).toBe("S2")
    })
})

describe("getSectionMoveDestinations", () => {
    const tree = buildTree()

    it("lists the other groups with their section titles", () => {
        const result = getSectionMoveDestinations(tree, 1)
        expect(result.groups).toEqual([
            { id: 2, label: "Gruppo 2", hint: "S3" },
            { id: 3, label: "Gruppo 3", hint: "S4" },
        ])
        expect(result.canCreateGroup).toBe(true)
        expect(result.newGroupIndex).toBe(3)
    })

    it("labels a named group with its name and the others with 'Gruppo N'", () => {
        const named = buildTree()
        named.groups[1].name = "Da fare"
        expect(getSectionMoveDestinations(named, 1).groups.map(g => g.label)).toEqual(["Da fare", "Gruppo 3"])
        expect(getTaskMoveDestinations(named, 1).find(d => d.key === "section-3")?.hint).toBe("Da fare")
    })

    it("does not offer a new group for the only section of a group", () => {
        expect(getSectionMoveDestinations(tree, 3).canCreateGroup).toBe(false)
    })
})

describe("getTaskMoveDestinations", () => {
    const tree = buildTree()
    const keys = (id: number) => getTaskMoveDestinations(tree, id).map(d => d.key)

    it("excludes the task, its subtree, its section (if top level) and its parent", () => {
        // T1 is top level of S1: no S1 entry, none of T1/T1a/T1b/T1a1
        expect(keys(1)).toEqual(["task-2", "section-2", "task-3", "section-3", "section-4", "task-4"])
    })

    it("offers the parent section for a subtask but not its current parent", () => {
        // T1a1 is a subtask of T1a: T1a excluded, S1 offered (becomes top level)
        expect(keys(13)).toEqual([
            "section-1", "task-1", "task-12", "task-2", "section-2", "task-3", "section-3", "section-4", "task-4",
        ])
    })

    it("indents the tasks under their section", () => {
        const list = getTaskMoveDestinations(tree, 3)
        expect(list.find(d => d.key === "task-11")).toMatchObject({ depth: 2, sectionId: 1, parentTaskId: 11 })
        expect(list.find(d => d.key === "section-1")).toMatchObject({ depth: 0, parentTaskId: null, hint: "Gruppo 1" })
    })

    it("returns nothing for an unknown task", () => {
        expect(keys(99)).toEqual([])
    })
})

describe("group reorder", () => {
    const ids = (groups: NoteDataTree["groups"]) => groups.map(group => group.id)

    it("the side of a group is its place in the resting order: after a later group, before an earlier one", () => {
        const tree = buildTree()
        expect(computeGroupDropZone(tree, 1, 2)).toBe("after")
        expect(computeGroupDropZone(tree, 1, 3)).toBe("after")
        expect(computeGroupDropZone(tree, 3, 2)).toBe("before")
        expect(computeGroupDropZone(tree, 3, 1)).toBe("before")
        // The positions decide, not the order of the array
        const shuffled = { groups: [...tree.groups].reverse() }
        expect(computeGroupDropZone(shuffled, 1, 3)).toBe("after")
        expect(computeGroupDropZone(shuffled, 3, 1)).toBe("before")
    })

    it("entering the neighbour column swaps with it, in both directions", () => {
        const tree = buildTree()
        const swap = (active: number, over: number) => computeGroupTarget(tree, active, { kind: "group", id: over }, computeGroupDropZone(tree, active, over))
        expect(swap(1, 2)).toEqual({ index: 1 })
        expect(swap(2, 1)).toEqual({ index: 0 })
        expect(swap(2, 3)).toEqual({ index: 2 })
        expect(swap(3, 2)).toEqual({ index: 1 })
        expect(swap(1, 3)).toEqual({ index: 2 })
        expect(swap(3, 1)).toEqual({ index: 0 })
    })

    it("computes the final index before / after another group", () => {
        const tree = buildTree()
        expect(computeGroupTarget(tree, 1, { kind: "group", id: 3 }, "after")).toEqual({ index: 2 })
        expect(computeGroupTarget(tree, 1, { kind: "group", id: 3 }, "before")).toEqual({ index: 1 })
        expect(computeGroupTarget(tree, 3, { kind: "group", id: 1 }, "before")).toEqual({ index: 0 })
        expect(computeGroupTarget(tree, 3, { kind: "group", id: 2 }, "after")).toBeNull()
    })

    it("returns null for no-ops and invalid targets", () => {
        const tree = buildTree()
        expect(computeGroupTarget(tree, 1, { kind: "group", id: 1 }, "after")).toBeNull()
        expect(computeGroupTarget(tree, 1, { kind: "group", id: 2 }, "before")).toBeNull()
        expect(computeGroupTarget(tree, 2, { kind: "group", id: 1 }, "after")).toBeNull()
        expect(computeGroupTarget(tree, 1, { kind: "section", id: 3 }, "after")).toBeNull()
        expect(computeGroupTarget(tree, 1, { kind: "group", id: 99 }, "after")).toBeNull()
        expect(computeGroupTarget(tree, 99, { kind: "group", id: 1 }, "after")).toBeNull()
    })

    it("reorders and renumbers the positions", () => {
        const moved = moveGroupInList(buildTree().groups, 1, 2)!
        expect(ids(moved)).toEqual([2, 3, 1])
        expect(moved.map(group => group.position)).toEqual([0, 1, 2])
        expect(moveGroupInList(buildTree().groups, 99, 0)).toBeNull()
    })

    it("does not offer groups as a drop target for a section or task in a group-only way", () => {
        expect(computeSectionTarget(buildTree(), 4, { kind: "group", id: 1 }, "inside")).toEqual({ type: "group", groupId: 1, index: 2 })
        expect(computeTaskTarget(buildTree(), 4, { kind: "group", id: 1 }, "inside")).toBeNull()
    })
})

describe("computeTaskTarget with hidden completed tasks", () => {
    // Full list of the section: A, B (done), C (done), D, X. With the completed hidden the user only sees A, D, X
    const hiddenTree = (): NoteDataTree => ({
        groups: [makeGroup({
            id: 1, sections: [makeSection({
                id: 1, groupID: 1, tasks: [
                    makeTask({ id: 1, sectionID: 1, text: "A" }),
                    makeTask({ id: 2, sectionID: 1, text: "B", completed: true }),
                    makeTask({ id: 3, sectionID: 1, text: "C", completed: true }),
                    makeTask({ id: 4, sectionID: 1, text: "D" }),
                    makeTask({ id: 5, sectionID: 1, text: "X" }),
                ],
            })],
        })],
    })

    it("maps a drop next to a visible neighbour to the index of the full list", () => {
        const tree = hiddenTree()
        // "Before D" lands after the hidden B and C; "after A" lands right after A (before the hidden ones)
        expect(computeTaskTarget(tree, 5, { kind: "task", id: 4 }, "before")).toEqual({ sectionId: 1, parentTaskId: null, index: 3 })
        expect(computeTaskTarget(tree, 5, { kind: "task", id: 1 }, "after")).toEqual({ sectionId: 1, parentTaskId: null, index: 1 })
        expect(computeTaskTarget(tree, 1, { kind: "task", id: 4 }, "after")).toEqual({ sectionId: 1, parentTaskId: null, index: 3 })
    })

    it("appends to the end of the full list when dropped on the section", () => {
        expect(computeTaskTarget(hiddenTree(), 1, { kind: "section", id: 1 }, "inside")).toEqual({ sectionId: 1, parentTaskId: null, index: 4 })
    })
})

describe("direct area of a group (default section)", () => {
    // group 1: direct [T5], S1 [T1, T2]; group 2 (named "Fatto"): direct [], S3 []
    function directTree(): NoteDataTree {
        return {
            groups: [
                makeGroup({
                    id: 1, position: 0,
                    defaultSection: makeDefaultSection({ id: 50, groupID: 1, tasks: [task(5, 50)] }),
                    sections: [makeSection({ id: 1, groupID: 1, title: "S1", tasks: [task(1, 1), task(2, 1)] })],
                }),
                makeGroup({
                    id: 2, position: 1, name: "Fatto",
                    defaultSection: makeDefaultSection({ id: 51, groupID: 2 }),
                    sections: [makeSection({ id: 3, groupID: 2, title: "S3" })],
                }),
            ],
        }
    }

    it("indexes the tasks of the default section", () => {
        const { tasks, sections } = indexTree(directTree())
        expect(tasks.get(5)).toMatchObject({ sectionId: 50, parentId: null })
        expect(sections.get(50)).toMatchObject({ groupId: 1 })
        expect(findTask(directTree(), 5)?.text).toBe("T5")
    })

    it("moves a task between a section and the direct area", () => {
        const tree = directTree()
        // Over the direct area (a section droppable): last direct task
        expect(computeTaskTarget(tree, 1, { kind: "section", id: 50 }, "inside")).toEqual({ sectionId: 50, parentTaskId: null, index: 1 })
        // Over a direct task: before it
        expect(computeTaskTarget(tree, 1, { kind: "task", id: 5 }, "before")).toEqual({ sectionId: 50, parentTaskId: null, index: 0 })
        // From the direct area to a section
        expect(computeTaskTarget(tree, 5, { kind: "section", id: 3 }, "inside")).toEqual({ sectionId: 3, parentTaskId: null, index: 0 })
    })

    it("a task dropped on the empty area of a group becomes its last direct task", () => {
        const tree = directTree()
        expect(computeTaskTarget(tree, 1, { kind: "group", id: 2 }, "inside")).toEqual({ sectionId: 51, parentTaskId: null, index: 0 })
        // Already the only direct task: nothing to do
        expect(computeTaskTarget(tree, 5, { kind: "group", id: 1 }, "inside")).toBeNull()
        expect(computeTaskTarget(tree, 1, { kind: "group", id: 99 }, "inside")).toBeNull()
        expect(computeTaskTarget({ groups: [makeGroup({ id: 7 })] }, 1, { kind: "group", id: 7 }, "inside")).toBeNull()
    })

    it("the group droppable accepts tasks", () => {
        expect(ACCEPTS.group).toContain("task")
    })

    it("a section dropped on the direct area goes before it (top half) or after it (bottom half)", () => {
        const tree = directTree()
        // group 1 is [(list), S1]: S3 above the list takes the first place, below it the place of S1's index 0 (after the list)
        expect(computeSectionTarget(tree, 3, { kind: "section", id: 50 }, "before")).toEqual({ type: "group", groupId: 1, index: 0, beforeList: true })
        expect(computeSectionTarget(tree, 3, { kind: "section", id: 50 }, "after")).toEqual({ type: "group", groupId: 1, index: 0 })
        // a plain "inside" over the area is still a drop on the group: appended
        expect(computeSectionTarget(tree, 3, { kind: "section", id: 50 }, "inside")).toEqual({ type: "group", groupId: 1, index: 1 })
        expect(computeSectionTarget(tree, 3, { kind: "group", id: 1 }, "inside")).toEqual({ type: "group", groupId: 1, index: 1 })
        // Over the direct area of its own group: [(list), S3] already is last
        expect(computeSectionTarget(tree, 3, { kind: "section", id: 51 }, "after")).toBeNull()
        expect(computeSectionTarget(tree, 3, { kind: "section", id: 51 }, "before")).toEqual({ type: "group", groupId: 2, index: 0, beforeList: true })
    })

    it("lists one destination per group, labelled with the group, ahead of its sections", () => {
        const list = getTaskMoveDestinations(directTree(), 1)
        expect(list.map(d => d.key)).toEqual(["section-50", "task-5", "task-2", "section-51", "section-3"])
        expect(list[0]).toMatchObject({ sectionId: 50, parentTaskId: null, label: "Gruppo 1", hint: "Task del gruppo", direct: true, depth: 0 })
        expect(list.find(d => d.key === "section-51")).toMatchObject({ label: "Fatto", direct: true })
        // The direct area where the task already is, is not offered
        expect(getTaskMoveDestinations(directTree(), 5).map(d => d.key)).not.toContain("section-50")
    })

    it("does not offer the default section as a section to move", () => {
        const destinations = getSectionMoveDestinations(directTree(), 3)
        expect(destinations.groups.map(g => g.id)).toEqual([1])
        expect(destinations.groups[0].hint).toBe("S1")
        expect(computeSectionTarget(directTree(), 50, { kind: "group", id: 2 }, "inside")).toBeNull()
    })
})

describe("sections dragged around the list of the direct tasks", () => {
    // group 1: [S1, S2, (list 50), S3, S4]
    const placed = (defaultIndex: number): NoteDataTree => ({
        groups: [makeGroup({
            id: 1, position: 0, defaultIndex,
            defaultSection: makeDefaultSection({ id: 50, groupID: 1, tasks: [task(5, 50)] }),
            sections: [1, 2, 3, 4].map(id => makeSection({ id, groupID: 1, title: `S${id}` })),
        })],
    })

    it("right under the section above the list means above the list (beforeList)", () => {
        // [S1, S2, L, S3, S4]: S4 after S2 = [S1, S2, S4, L, S3]
        expect(computeSectionTarget(placed(2), 4, { kind: "section", id: 2 }, "after")).toEqual({ type: "group", groupId: 1, index: 2, beforeList: true })
        // S3 after S2 is above the list, not where it is now (below it)
        expect(computeSectionTarget(placed(2), 3, { kind: "section", id: 2 }, "after")).toEqual({ type: "group", groupId: 1, index: 2, beforeList: true })
    })

    it("right above the section below the list means below the list", () => {
        // S1 before S3: [S2, L, S1, S3, S4]
        expect(computeSectionTarget(placed(2), 1, { kind: "section", id: 3 }, "before")).toEqual({ type: "group", groupId: 1, index: 1 })
        // S4 before S3: [S1, S2, L, S4, S3]
        expect(computeSectionTarget(placed(2), 4, { kind: "section", id: 3 }, "before")).toEqual({ type: "group", groupId: 1, index: 2 })
        // S3 before S3 itself, or S4 after S3 / S3 before S4: nothing changes
        expect(computeSectionTarget(placed(2), 4, { kind: "section", id: 3 }, "after")).toBeNull()
    })

    it("over the list itself: top half = just above it, bottom half = just below it", () => {
        expect(computeSectionTarget(placed(2), 4, { kind: "section", id: 50 }, "before")).toEqual({ type: "group", groupId: 1, index: 2, beforeList: true })
        expect(computeSectionTarget(placed(2), 4, { kind: "section", id: 50 }, "after")).toEqual({ type: "group", groupId: 1, index: 2 })
        // S2 is right above the list, S3 right below it: dropping them next to it again is a no-op
        expect(computeSectionTarget(placed(2), 2, { kind: "section", id: 50 }, "before")).toBeNull()
        expect(computeSectionTarget(placed(2), 3, { kind: "section", id: 50 }, "after")).toBeNull()
        // ...while S2 below the list jumps over it
        expect(computeSectionTarget(placed(2), 2, { kind: "section", id: 50 }, "after")).toEqual({ type: "group", groupId: 1, index: 1 })
    })

    it("counts the dragged section out when it was above the list", () => {
        // [S1, S2, L, S3, S4]: S1 dragged below the list: the list sits after one other section once S1 is out
        expect(computeSectionTarget(placed(2), 1, { kind: "section", id: 50 }, "after")).toEqual({ type: "group", groupId: 1, index: 1 })
        expect(computeSectionTarget(placed(2), 1, { kind: "section", id: 50 }, "before")).toEqual({ type: "group", groupId: 1, index: 1, beforeList: true })
    })

    it("a list on top or at the end: above the first section, or at the end with the list last", () => {
        // [L, S1, S2, S3, S4]: S2 above S1 goes below the list; over the list, above it
        expect(computeSectionTarget(placed(0), 2, { kind: "section", id: 1 }, "before")).toEqual({ type: "group", groupId: 1, index: 0 })
        expect(computeSectionTarget(placed(0), 2, { kind: "section", id: 50 }, "before")).toEqual({ type: "group", groupId: 1, index: 0, beforeList: true })
        // [S1, S2, S3, S4, L]: S1 after S4 stays above the list; dropped on the empty area of the group it goes after the list
        expect(computeSectionTarget(placed(4), 1, { kind: "section", id: 4 }, "after")).toEqual({ type: "group", groupId: 1, index: 3, beforeList: true })
        expect(computeSectionTarget(placed(4), 1, { kind: "group", id: 1 }, "inside")).toEqual({ type: "group", groupId: 1, index: 3 })
        // S4 is above the list: dropped on the empty area it jumps over the list
        expect(computeSectionTarget(placed(4), 4, { kind: "group", id: 1 }, "inside")).toEqual({ type: "group", groupId: 1, index: 3 })
    })

    it("a section from another group lands where the list is by the same rule", () => {
        const tree: NoteDataTree = { groups: [...placed(2).groups, makeGroup({ id: 2, position: 1, sections: [makeSection({ id: 9, groupID: 2, title: "S9" })] })] }
        expect(computeSectionTarget(tree, 9, { kind: "section", id: 2 }, "after")).toEqual({ type: "group", groupId: 1, index: 2, beforeList: true })
        expect(computeSectionTarget(tree, 9, { kind: "section", id: 3 }, "before")).toEqual({ type: "group", groupId: 1, index: 2 })
    })

    it("the move-to menu of a task shows the area of the group where the list is", () => {
        const tree: NoteDataTree = { groups: [makeGroup({
            id: 1, position: 0, defaultIndex: 1,
            defaultSection: makeDefaultSection({ id: 50, groupID: 1 }),
            sections: [makeSection({ id: 1, groupID: 1, title: "S1", tasks: [task(1, 1)] }), makeSection({ id: 2, groupID: 1, title: "S2" })],
        })] }
        expect(getTaskMoveDestinations(tree, 1).map(d => d.key)).toEqual(["section-50", "section-2"])
        const other: NoteDataTree = { groups: [{ ...tree.groups[0], defaultSection: makeDefaultSection({ id: 50, groupID: 1, tasks: [task(5, 50)] }) }] }
        expect(getTaskMoveDestinations(other, 5).map(d => d.key)).toEqual(["section-1", "task-1", "section-2"])
    })
})
