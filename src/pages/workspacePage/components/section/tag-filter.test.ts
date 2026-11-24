import { describe, expect, it } from "vitest"
import { makeDefaultSection, makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import type { NoteDataTree } from "@/types/types"
import { createTabUiStore } from "@/contexts/tab-ui-store"
import { collectMatches } from "../note-search"
import { getTaskStep } from "../note-steps"
import { flattenVisibleTasks } from "../tasks/task-selection"
import { orderedVisibleTasks } from "./hide-completed"
import { containerTagFilter, passesTagFilter, subtaskTagFilter } from "./tag-filter"

const A = 1
const B = 2
const C = 3

const tagged = makeTask({ id: 1, text: "milk", tagIDs: [A] })
const plain = makeTask({ id: 2, text: "milk too" })
const other = makeTask({ id: 3, text: "milk three", tagIDs: [B] })
const parent = makeTask({ id: 4, text: "milk parent", subtasks: [makeTask({ id: 41, text: "milk deep", tagIDs: [A] }), makeTask({ id: 42, text: "milk shallow" })] })
const tasks = [tagged, plain, other, parent]

describe("tag filter rules", () => {
    it("shows everything without a filter (same array)", () => {
        expect(orderedVisibleTasks(tasks, { hideCompleted: false, order: "manual" })).toBe(tasks)
        expect(orderedVisibleTasks(tasks, { hideCompleted: false, order: "manual", tagFilter: null })).toBe(tasks)
    })

    it("keeps the tasks with any of the tags (OR) and the ancestors of a tagged subtask", () => {
        expect(orderedVisibleTasks(tasks, { hideCompleted: false, order: "manual", tagFilter: [A] }).map(t => t.id)).toEqual([1, 4])
        expect(orderedVisibleTasks(tasks, { hideCompleted: false, order: "manual", tagFilter: [A, B] }).map(t => t.id)).toEqual([1, 3, 4])
        expect(orderedVisibleTasks(tasks, { hideCompleted: false, order: "manual", tagFilter: [C] })).toEqual([])
    })

    it("combines with hide completed", () => {
        const done = makeTask({ id: 5, completed: true, tagIDs: [A] })
        expect(orderedVisibleTasks([tagged, done], { hideCompleted: true, order: "manual", tagFilter: [A] }).map(t => t.id)).toEqual([1])
    })

    it("a task with a filter tag shows all its subtasks, one that passes only through a descendant filters them", () => {
        expect(subtaskTagFilter(tagged, [A])).toBeNull()
        expect(subtaskTagFilter(parent, [A])).toEqual([A])
        expect(passesTagFilter(parent, [A])).toBe(true)
        expect(orderedVisibleTasks(parent.subtasks, { hideCompleted: false, order: "manual", tagFilter: subtaskTagFilter(parent, [A]) }).map(t => t.id)).toEqual([41])
    })

    it("a group or section with a filter tag shows all its tasks", () => {
        expect(containerTagFilter([A], [B], [C])).toEqual([A])
        expect(containerTagFilter([A], [B], [A])).toBeNull()
        expect(containerTagFilter([A], undefined, undefined)).toEqual([A])
        expect(containerTagFilter(null, [A])).toBeNull()
    })
})

const tree: NoteDataTree = {
    groups: [
        makeGroup({
            id: 1, position: 0, name: "g1", tagIDs: [C],
            defaultSection: makeDefaultSection({ id: 90, groupID: 1, tasks: [makeTask({ id: 10, sectionID: 90, text: "milk direct" })] }),
            sections: [makeSection({ id: 11, groupID: 1, title: "s", tasks: [makeTask({ id: 12, sectionID: 11, text: "milk in s" })] })],
        }),
        makeGroup({
            id: 2, position: 1, name: "g2",
            sections: [
                makeSection({ id: 21, groupID: 2, title: "tagged section", tagIDs: [A], tasks: [makeTask({ id: 22, sectionID: 21, text: "milk plain" })] }),
                makeSection({ id: 23, groupID: 2, title: "plain section", tasks: [
                    makeTask({ id: 24, sectionID: 23, text: "milk a" }),
                    makeTask({ id: 25, sectionID: 23, text: "milk b", tagIDs: [A] }),
                    makeTask({ id: 26, sectionID: 23, text: "milk c", tagIDs: [A] }),
                ] }),
            ],
        }),
    ],
}

describe("tag filter on the tree", () => {
    it("the search counts only what is on the screen", () => {
        const ids = (tagFilter: number[] | null) => collectMatches(tree, "milk", { hideCompleted: false, tagFilter }).map(m => m.itemId)
        expect(ids(null)).toEqual([10, 12, 22, 24, 25, 26])
        // group 1 has tag C, section 21 has tag A: their tasks stay; in section 23 only the tagged ones
        expect(ids([A, C])).toEqual([10, 12, 22, 25, 26])
        expect(ids([B])).toEqual([])
    })

    it("the range selection follows the filtered order", () => {
        const open = { isGroupOpen: () => true, isSectionOpen: () => true }
        expect(flattenVisibleTasks(tree, { hideCompleted: false, tagFilter: [A], ...open }).map(t => t.id)).toEqual([22, 25, 26])
    })

    it("a step jumps over the siblings the filter hides, and the stored index stays the data one", () => {
        // 25 -> down: 26 (visible). 26 up: 25. Without a filter 25 up is 24
        expect(getTaskStep(tree, 25, -1, false, false, null)).toEqual({ sectionId: 23, parentTaskId: null, index: 0 })
        expect(getTaskStep(tree, 25, -1, false, false, [A])).toBeNull()
        expect(getTaskStep(tree, 26, -1, false, false, [A])).toEqual({ sectionId: 23, parentTaskId: null, index: 1 })
    })
})

describe("tag filter in the tab UI store", () => {
    it("is per note, stable until it changes, and dropped with the closed tab", () => {
        const store = createTabUiStore()
        let calls = 0
        store.subscribe(() => { calls += 1 })
        expect(store.getTagFilter(1)).toEqual([])
        expect(store.getTagFilter(1)).toBe(store.getTagFilter(2))
        store.setTagFilter(1, [A, B])
        const first = store.getTagFilter(1)
        store.setTagFilter(1, [A, B])
        expect(store.getTagFilter(1)).toBe(first)
        expect(calls).toBe(1)
        expect(store.getTagFilter(2)).toEqual([])
        store.retain([2])
        expect(store.getTagFilter(1)).toEqual([])
        store.setTagFilter(2, [C])
        store.setTagFilter(2, [])
        expect(store.getTagFilter(2)).toEqual([])
    })
})
