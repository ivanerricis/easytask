import { describe, expect, it } from "vitest"
import { makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import type { NoteDataTree } from "@/types/types"
import { collectMatches, findMatchRanges, normalizeForSearch, searchKey } from "./note-search"

describe("normalizeForSearch", () => {
    it("lowercases and strips the accents", () => {
        expect(normalizeForSearch("Città È ÀÙ")).toBe("citta e au")
    })
})

describe("findMatchRanges", () => {
    it("finds every occurrence, ignoring case", () => {
        expect(findMatchRanges("Casa casa CASA", "casa")).toEqual([[0, 4], [5, 9], [10, 14]])
    })

    it("ignores the accents on both sides and keeps the ranges of the original text", () => {
        expect(findMatchRanges("Perché la città", "perche")).toEqual([[0, 6]])
        expect(findMatchRanges("Perche la citta", "città")).toEqual([[10, 15]])
        // A letter written as base + combining accent still maps to the original text
        expect(findMatchRanges("café ok", "cafe")).toEqual([[0, 4]])
    })

    it("does not overlap the occurrences", () => {
        expect(findMatchRanges("aaaa", "aa")).toEqual([[0, 2], [2, 4]])
        expect(findMatchRanges("aaa", "aa")).toEqual([[0, 2]])
    })

    it("has no matches for an empty query, an empty text or a text without the query", () => {
        expect(findMatchRanges("abc", "")).toEqual([])
        expect(findMatchRanges("abc", "́")).toEqual([])
        expect(findMatchRanges("", "a")).toEqual([])
        expect(findMatchRanges("abc", "d")).toEqual([])
    })

    it("treats the query as plain text", () => {
        expect(findMatchRanges("a.c abc (x)", ".c")).toEqual([[1, 3]])
        expect(findMatchRanges("a.c abc (x)", "(x)")).toEqual([[8, 11]])
    })
})

// Group 1 (position 0): name "Spesa"; direct tasks 1 "Latte" and 2 "Pane" (subtask 21 "latte di soia", done subtask 22 "Latte")
//   section 10 "Latte e uova": task 3 "uova" ; task 4 "Latte" (done)
// Group 2 (position 1, first in the array): name "Casa"; section 12 "Altro": task 6 "Il latte"
const tree: NoteDataTree = {
    groups: [
        makeGroup({
            id: 2, position: 1, name: "Casa",
            sections: [makeSection({ id: 12, groupID: 2, title: "Altro", tasks: [makeTask({ id: 6, sectionID: 12, text: "Il latte" })] })],
        }),
        makeGroup({
            id: 1, position: 0, name: " Spesa latte ",
            defaultSection: makeSection({
                id: 99, groupID: 1, title: "", is_default: true,
                tasks: [
                    makeTask({ id: 1, sectionID: 99, text: "Latte" }),
                    makeTask({
                        id: 2, sectionID: 99, text: "Pane", subtasks: [
                            makeTask({ id: 21, sectionID: 99, taskID: 2, text: "LATTE di soia" }),
                            makeTask({ id: 22, sectionID: 99, taskID: 2, text: "Latte", completed: true }),
                        ],
                    }),
                ],
            }),
            sections: [makeSection({
                id: 10, groupID: 1, title: "Latte e uova",
                tasks: [makeTask({ id: 3, sectionID: 10, text: "uova" }), makeTask({ id: 4, sectionID: 10, text: "Latte", completed: true })],
            })],
        }),
    ],
}

const summary = (query: string, hideCompleted = false) =>
    collectMatches(tree, query, { hideCompleted }).map(m => m.id)

describe("collectMatches", () => {
    it("lists the matches in the order they are drawn", () => {
        expect(summary("latte")).toEqual([
            "group-1#0", "task-1#0", "task-21#0", "task-22#0", "section-10#0", "task-4#0", "task-6#0",
        ])
    })

    it("counts every occurrence inside a text", () => {
        expect(collectMatches(tree, "a", { hideCompleted: false }).filter(m => m.key === searchKey("task", 21)).map(m => m.occurrence)).toEqual([0, 1])
    })

    it("does not count the tasks hidden because they are completed", () => {
        expect(summary("latte", true)).toEqual(["group-1#0", "task-1#0", "task-21#0", "section-10#0", "task-6#0"])
    })

    it("keeps a completed parent that still has open subtasks, and tells where a match sits", () => {
        const open = collectMatches({
            groups: [makeGroup({
                id: 1, position: 0, sections: [makeSection({
                    id: 5, groupID: 1, tasks: [makeTask({ id: 7, sectionID: 5, completed: true, text: "padre", subtasks: [makeTask({ id: 8, sectionID: 5, taskID: 7, text: "figlio" })] })],
                })],
            })],
        }, "figlio", { hideCompleted: true })
        expect(open).toEqual([{ id: "task-8#0", key: "task-8", kind: "task", itemId: 8, groupId: 1, sectionId: 5, taskPath: [7], occurrence: 0 }])
    })

    it("finds tasks put directly in a group and the names of groups and sections", () => {
        const direct = collectMatches(tree, "pane", { hideCompleted: false })
        expect(direct).toHaveLength(1)
        expect(direct[0]).toMatchObject({ kind: "task", itemId: 2, groupId: 1, sectionId: 99, taskPath: [] })
        expect(collectMatches(tree, "casa", { hideCompleted: false })[0]).toMatchObject({ kind: "group", itemId: 2, groupId: 2 })
        expect(collectMatches(tree, "altro", { hideCompleted: false })[0]).toMatchObject({ kind: "section", itemId: 12, sectionId: 12, groupId: 2 })
    })

    it("lists the matches in the displayed order when the completed tasks go last", () => {
        const mixed: NoteDataTree = { groups: [makeGroup({
            id: 1, position: 0, name: "x", sections: [makeSection({
                id: 5, groupID: 1, title: "y", tasks: [
                    makeTask({ id: 7, sectionID: 5, completed: true, text: "voce uno" }),
                    makeTask({ id: 8, sectionID: 5, text: "voce due" }),
                ],
            })],
        })] }
        expect(collectMatches(mixed, "voce", { hideCompleted: false }).map(m => m.id)).toEqual(["task-7#0", "task-8#0"])
        expect(collectMatches(mixed, "voce", { hideCompleted: false, completedLast: true }).map(m => m.id)).toEqual(["task-8#0", "task-7#0"])
    })

    it("follows the order of each section, over the preference", () => {
        const mixed: NoteDataTree = { groups: [makeGroup({
            id: 1, position: 0, name: "x", sections: [
                makeSection({ id: 5, groupID: 1, title: "y", task_order: "manual", tasks: [
                    makeTask({ id: 7, sectionID: 5, completed: true, text: "voce uno" }), makeTask({ id: 8, sectionID: 5, text: "voce due" }),
                ] }),
                makeSection({ id: 6, groupID: 1, title: "z", task_order: "done-first", tasks: [
                    makeTask({ id: 9, sectionID: 6, text: "voce tre" }), makeTask({ id: 10, sectionID: 6, completed: true, text: "voce quattro" }),
                ] }),
            ],
        })] }
        const ids = (completedLast: boolean) => collectMatches(mixed, "voce", { hideCompleted: false, completedLast }).map(m => m.id)
        expect(ids(true)).toEqual(["task-7#0", "task-8#0", "task-10#0", "task-9#0"])
        expect(ids(false)).toEqual(["task-7#0", "task-8#0", "task-10#0", "task-9#0"])
    })

    it("has no matches for an empty query", () => {
        expect(summary("")).toEqual([])
        expect(summary("   ".trim())).toEqual([])
    })
})

describe("collectMatches with the list of the direct tasks placed among the sections", () => {
    it("lists the matches in the order they are drawn: the list between the sections", () => {
        const placed: NoteDataTree = {
            groups: [makeGroup({
                id: 1, position: 0, name: "Spesa", defaultIndex: 1,
                defaultSection: makeSection({ id: 99, groupID: 1, title: "", is_default: true, tasks: [makeTask({ id: 1, sectionID: 99, text: "latte diretto" })] }),
                sections: [
                    makeSection({ id: 10, groupID: 1, title: "Prima", tasks: [makeTask({ id: 3, sectionID: 10, text: "latte uno" })] }),
                    makeSection({ id: 11, groupID: 1, title: "Dopo", tasks: [makeTask({ id: 5, sectionID: 11, text: "latte due" })] }),
                ],
            })],
        }
        expect(collectMatches(placed, "latte", { hideCompleted: false }).map(m => m.id)).toEqual(["task-3#0", "task-1#0", "task-5#0"])
        expect(collectMatches(placed, "dopo", { hideCompleted: false }).map(m => m.id)).toEqual(["section-11#0"])
    })
})
