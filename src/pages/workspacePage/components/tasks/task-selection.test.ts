import { describe, expect, it } from "vitest"
import { makeDefaultSection, makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import type { NoteDataTree } from "@/types/types"
import { flattenVisibleTasks, getSelectedTasks, getTaskDestinations, getTopMostTasks, parseTaskKey, taskKey } from "./task-selection"

// Gruppo 1 (position 0): direct tasks 1, 2 (with subtask 21); section 10 "A": 3, 4 (done) ; section 11 "B": 5
// Gruppo 2 (position 1, listed first in the array): section 12: 6
const tree: NoteDataTree = {
    groups: [
        makeGroup({
            id: 2, position: 1, name: "Altro",
            sections: [makeSection({ id: 12, groupID: 2, title: "C", tasks: [makeTask({ id: 6, sectionID: 12 })] })],
        }),
        makeGroup({
            id: 1, position: 0,
            defaultSection: makeSection({
                id: 99, groupID: 1, title: "", is_default: true,
                tasks: [makeTask({ id: 1, sectionID: 99 }), makeTask({ id: 2, sectionID: 99, subtasks: [makeTask({ id: 21, sectionID: 99, taskID: 2 })] })],
            }),
            sections: [
                makeSection({ id: 10, groupID: 1, title: "A", tasks: [makeTask({ id: 3, sectionID: 10 }), makeTask({ id: 4, sectionID: 10, completed: true })] }),
                makeSection({ id: 11, groupID: 1, title: "B", tasks: [makeTask({ id: 5, sectionID: 11 })] }),
            ],
        }),
    ],
}

const all = { hideCompleted: false, isGroupOpen: () => true, isSectionOpen: () => true }
const ids = (list: { id: number }[]) => list.map(task => task.id)

describe("keys", () => {
    it("builds and parses the key of a task", () => {
        expect(taskKey(12)).toBe("task-12")
        expect(parseTaskKey("task-12")).toBe(12)
        expect(parseTaskKey("note-12")).toBeNull()
        expect(parseTaskKey("task-x")).toBeNull()
    })
})

describe("flattenVisibleTasks", () => {
    it("leaves out the subtasks of a closed task (and of its closed descendants), the task itself stays", () => {
        expect(ids(flattenVisibleTasks(tree, { ...all, isTaskOpen: () => false }))).toEqual([1, 2, 3, 4, 5, 6])
        expect(ids(flattenVisibleTasks(tree, { ...all, isTaskOpen: id => id !== 2 }))).toEqual([1, 2, 3, 4, 5, 6])
        expect(ids(flattenVisibleTasks(tree, { ...all, isTaskOpen: () => true }))).toEqual([1, 2, 21, 3, 4, 5, 6])
    })

    it("follows the screen: groups by position, direct tasks first, then the sections, subtasks after their parent", () => {
        expect(ids(flattenVisibleTasks(tree, all))).toEqual([1, 2, 21, 3, 4, 5, 6])
    })

    it("leaves out the fully completed tasks when they are hidden", () => {
        expect(ids(flattenVisibleTasks(tree, { ...all, hideCompleted: true }))).toEqual([1, 2, 21, 3, 5, 6])
    })

    it("follows the displayed order with the completed tasks last: open ones first, in each list", () => {
        const mixed: NoteDataTree = { groups: [makeGroup({
            id: 1, position: 0,
            defaultSection: makeSection({ id: 99, groupID: 1, title: "", is_default: true, tasks: [
                makeTask({ id: 1, sectionID: 99, completed: true }),
                makeTask({ id: 2, sectionID: 99, subtasks: [makeTask({ id: 21, sectionID: 99, taskID: 2, completed: true }), makeTask({ id: 22, sectionID: 99, taskID: 2 })] }),
            ] }),
            sections: [makeSection({ id: 10, groupID: 1, title: "A", tasks: [makeTask({ id: 3, sectionID: 10, completed: true }), makeTask({ id: 4, sectionID: 10 })] })],
        })] }
        expect(ids(flattenVisibleTasks(mixed, { ...all, completedLast: true }))).toEqual([2, 22, 21, 1, 4, 3])
        expect(ids(flattenVisibleTasks(mixed, all))).toEqual([1, 2, 21, 22, 3, 4])
        expect(ids(flattenVisibleTasks(mixed, { ...all, completedLast: true, hideCompleted: true }))).toEqual([2, 22, 4])
    })

    it("uses the order of each section, over the preference, also for the subtasks", () => {
        const mixed: NoteDataTree = { groups: [makeGroup({
            id: 1, position: 0,
            sections: [
                makeSection({ id: 10, groupID: 1, title: "A", task_order: "done-first", tasks: [
                    makeTask({ id: 1, sectionID: 10 }), makeTask({ id: 2, sectionID: 10, completed: true, subtasks: [makeTask({ id: 21, sectionID: 10, taskID: 2 }), makeTask({ id: 22, sectionID: 10, taskID: 2, completed: true })] }),
                ] }),
                makeSection({ id: 11, groupID: 1, title: "B", task_order: "manual", tasks: [makeTask({ id: 3, sectionID: 11, completed: true }), makeTask({ id: 4, sectionID: 11 })] }),
                makeSection({ id: 12, groupID: 1, title: "C", tasks: [makeTask({ id: 5, sectionID: 12, completed: true }), makeTask({ id: 6, sectionID: 12 })] }),
            ],
        })] }
        // The preference is on: A is done-first (its own choice), B stays manual, C follows the preference
        expect(ids(flattenVisibleTasks(mixed, { ...all, completedLast: true }))).toEqual([2, 22, 21, 1, 3, 4, 6, 5])
        expect(ids(flattenVisibleTasks(mixed, all))).toEqual([2, 22, 21, 1, 3, 4, 5, 6])
    })

    it("leaves out closed groups and closed sections, but never closes the direct tasks of an open group", () => {
        expect(ids(flattenVisibleTasks(tree, { ...all, isGroupOpen: id => id !== 2 }))).toEqual([1, 2, 21, 3, 4, 5])
        expect(ids(flattenVisibleTasks(tree, { ...all, isSectionOpen: () => false }))).toEqual([1, 2, 21])
        expect(ids(flattenVisibleTasks(tree, { ...all, isSectionOpen: id => id === 11 }))).toEqual([1, 2, 21, 5])
    })
})

describe("getTopMostTasks", () => {
    it("drops a selected task whose ancestor is selected too", () => {
        expect(ids(getTopMostTasks(tree, [21, 2, 3]))).toEqual([2, 3])
        expect(ids(getTopMostTasks(tree, [21, 3]))).toEqual([21, 3])
    })

    it("returns the tasks in tree order and ignores unknown ids", () => {
        expect(ids(getTopMostTasks(tree, [6, 99999, 1]))).toEqual([1, 6])
    })

    it("getSelectedTasks keeps the subtasks of a selected task", () => {
        expect(ids(getSelectedTasks(tree, [21, 2, 7]))).toEqual([2, 21])
    })
})

describe("getTaskDestinations", () => {
    it("lists the direct area of the groups that have one and every section, group by group", () => {
        const destinations = getTaskDestinations(tree)
        expect(destinations.map(d => [d.sectionId, d.label, d.groupLabel])).toEqual([
            [99, "Task diretti", "Gruppo 1"],
            [10, "A", "Gruppo 1"],
            [11, "B", "Gruppo 1"],
            [12, "C", "Altro"],
        ])
    })
})

describe("the list of the direct tasks placed among the sections", () => {
    // Gruppo 1: section A (3, 4), the list (1, 2), section B (5)
    const placed: NoteDataTree = {
        groups: [makeGroup({
            id: 1, position: 0, defaultIndex: 1,
            defaultSection: makeDefaultSection({ id: 99, groupID: 1, tasks: [makeTask({ id: 1, sectionID: 99 }), makeTask({ id: 2, sectionID: 99 })] }),
            sections: [
                makeSection({ id: 10, groupID: 1, title: "A", tasks: [makeTask({ id: 3, sectionID: 10 }), makeTask({ id: 4, sectionID: 10 })] }),
                makeSection({ id: 11, groupID: 1, title: "B", tasks: [makeTask({ id: 5, sectionID: 11 })] }),
            ],
        })],
    }

    it("the range selection follows the real order: the tasks of the list sit between the sections", () => {
        expect(ids(flattenVisibleTasks(placed, all))).toEqual([3, 4, 1, 2, 5])
        expect(ids(flattenVisibleTasks({ groups: [{ ...placed.groups[0], defaultIndex: 2 }] }, all))).toEqual([3, 4, 5, 1, 2])
        // the list is never closed, the sections around it can be
        expect(ids(flattenVisibleTasks(placed, { ...all, isSectionOpen: () => false }))).toEqual([1, 2])
    })

    it("the destinations of the multi-selection list the area of the group where it is", () => {
        expect(getTaskDestinations(placed).map(d => d.sectionId)).toEqual([10, 99, 11])
    })
})
