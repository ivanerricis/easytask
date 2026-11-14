import { describe, expect, it } from "vitest"
import { buildPositionUpdate } from "@/db/queries/ordering"
import type { NoteDataTree } from "@/types/types"
import { moveGroupInList, moveTask, patchGroup, patchSection, patchTask, removeGroup, removeSection, removeTask } from "@/contexts/note-tree-ops"
import { groupIds, layout, makeGroups, makeRule, makeTree, taskOf, withDirectArea } from "@/test/automation-fixtures"
import { diffGroupStatements, diffSectionStatements, diffTaskStatements, groupChanges, restoreGroups, restoreTasks, taskChanges, withGroups } from "./diff"
import { runAutomations } from "./engine"

const base = () => makeTree({
    1: [{ id: 10, subs: [{ id: 11 }, { id: 12 }] }, { id: 13 }],
    2: [{ id: 20 }],
    3: [],
})

describe("diffTaskStatements", () => {
    it("returns nothing when the trees are the same or equal", () => {
        const tree = base()
        expect(diffTaskStatements(tree, tree)).toEqual([])
        expect(diffTaskStatements(tree, base())).toEqual([])
    })

    it("writes only the changed flag columns", () => {
        const before = base()
        expect(diffTaskStatements(before, patchTask(before, 13, { completed: true }))).toEqual([
            { sql: "UPDATE task SET completed = ? WHERE id = ?", params: [1, 13] },
        ])
        expect(diffTaskStatements(before, patchTask(before, 13, { priority: true }))).toEqual([
            { sql: "UPDATE task SET priority = ? WHERE id = ?", params: [1, 13] },
        ])
        expect(diffTaskStatements(before, patchTask(before, 13, { color: "#ff0000" }))).toEqual([
            { sql: "UPDATE task SET color = ? WHERE id = ?", params: ["#ff0000", 13] },
        ])
    })

    it("writes several changed columns of a task in one statement, in a fixed order", () => {
        const before = patchTask(base(), 13, { completed: true, priority: true, color: "#00ff00" })
        const after = patchTask(before, 13, { completed: false, priority: false, color: null })
        expect(diffTaskStatements(before, after)).toEqual([
            { sql: "UPDATE task SET completed = ?, priority = ?, color = ? WHERE id = ?", params: [0, 0, null, 13] },
        ])
    })

    it("treats an undefined color like null", () => {
        const before = base()
        const after = patchTask(before, 13, { color: undefined })
        expect(diffTaskStatements(before, after)).toEqual([])
    })

    it("a move produces the recursive subtree update and the position updates of both lists", () => {
        const before = base()
        const after = moveTask(before, 10, { sectionId: 2, parentTaskId: null }, 0)
        const statements = diffTaskStatements(before, after)
        expect(statements).toHaveLength(3)
        expect(statements[0].sql).toContain("WITH RECURSIVE subtree")
        expect(statements[0].sql).toContain("UPDATE task SET")
        expect(statements[0].params).toEqual([10, 2, 10, null, 10])
        // source list first (as it appears in the tree), then destination
        expect(statements.slice(1)).toEqual([buildPositionUpdate("task", [13]), buildPositionUpdate("task", [10, 20])])
    })

    it("an emptied list gets no position update", () => {
        const before = makeTree({ 1: [{ id: 10 }], 2: [] })
        const after = moveTask(before, 10, { sectionId: 2, parentTaskId: null }, 0)
        const statements = diffTaskStatements(before, after)
        expect(statements).toHaveLength(2)
        expect(statements[1]).toEqual(buildPositionUpdate("task", [10]))
    })

    it("moving a task under another task sets the new parent", () => {
        const before = base()
        const after = moveTask(before, 13, { sectionId: 1, parentTaskId: 12 }, 0)
        const statements = diffTaskStatements(before, after)
        expect(statements[0].params).toEqual([13, 1, 13, 12, 13])
    })

    it("a reorder inside a list only renumbers it", () => {
        const before = base()
        const after = moveTask(before, 13, { sectionId: 1, parentTaskId: null }, 0)
        expect(diffTaskStatements(before, after)).toEqual([buildPositionUpdate("task", [13, 10])])
    })

    it("a move plus a flag change in the same task", () => {
        const before = base()
        const after = patchTask(moveTask(before, 13, { sectionId: 3, parentTaskId: null }, 0), 13, { priority: true })
        const statements = diffTaskStatements(before, after)
        expect(statements.map(s => s.sql.startsWith("WITH") ? "move" : s.sql.startsWith("UPDATE task SET priority") ? "flag" : "pos")).toEqual(["move", "flag", "pos", "pos"])
    })

    it("ignores tasks present in only one tree", () => {
        const before = base()
        const after = removeTask(before, 20)
        expect(diffTaskStatements(before, after)).toEqual([])
    })
})


describe("taskChanges", () => {
    it("is empty for equal trees", () => {
        expect(taskChanges(base(), base(), [10, 11, 12, 13, 20])).toEqual([])
    })

    it("reports which parts differ, only for the given ids", () => {
        const before = base()
        const moved = moveTask(before, 13, { sectionId: 2, parentTaskId: null }, 0)
        // 20 only shifted its index: it is a change of place when asked for
        expect(taskChanges(before, moved, [13, 20, 10])).toEqual([
            { id: 13, place: true, completed: false, priority: false, color: false, tags: false },
            { id: 20, place: true, completed: false, priority: false, color: false, tags: false },
        ])
        expect(taskChanges(before, moved, [])).toEqual([])
        expect(taskChanges(before, patchTask(before, 11, { completed: true }), [11])).toEqual([
            { id: 11, place: false, completed: true, priority: false, color: false, tags: false },
        ])
        expect(taskChanges(before, patchTask(before, 12, { color: "#fff", priority: true }), [12])).toEqual([
            { id: 12, place: false, completed: false, priority: true, color: true, tags: false },
        ])
    })

    it("omits missing ids", () => {
        const before = removeTask(base(), 20)
        expect(taskChanges(before, base(), [20, 999])).toEqual([])
        expect(taskChanges(base(), before, [20])).toEqual([])
    })
})

describe("restoreTasks", () => {
    const rules = [
        makeRule(1, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 2, at: "top" }, { type: "setColor", color: "#ff0000" }]),
        makeRule(2, { type: "task.movedInto", sectionId: 2 }, [{ type: "setPriority", value: true }]),
    ]
    const run = () => {
        const before = patchTask(base(), 13, { completed: true })
        const outcome = runAutomations(before, rules, { type: "task.completed", taskId: 13 })
        return { before, ...outcome }
    }

    it("undoes an automation: the diff against the original is empty", () => {
        const { before, tree: after, touched } = run()
        expect(layout(after)).toEqual({ 1: [10], 2: [13, 20], 3: [] })
        const restored = restoreTasks(after, before, taskChanges(before, after, touched))
        expect(diffTaskStatements(before, restored)).toEqual([])
        expect(layout(restored)).toEqual(layout(before))
        expect(taskChanges(before, restored, touched)).toEqual([])
    })

    it("redoes an automation on the original tree", () => {
        const { before, tree: after, touched } = run()
        const redone = restoreTasks(before, after, taskChanges(after, before, touched))
        expect(diffTaskStatements(after, redone)).toEqual([])
    })

    it("restores subtasks, moves included, with their place under the parent", () => {
        const before = base()
        const after = moveTask(patchTask(before, 11, { completed: true }), 11, { sectionId: 1, parentTaskId: 12 }, 0)
        const restored = restoreTasks(after, before, taskChanges(before, after, [11]))
        expect(diffTaskStatements(before, restored)).toEqual([])
    })

    it("keeps later edits of a bystander and of fields the automation did not change", () => {
        const { before, tree: after, touched } = run()
        expect(touched).toEqual([13])
        // 20 only shifted; 13 got a priority/color/place change but its text-independent fields below were not touched
        const latest = patchTask(patchTask(after, 20, { color: "#00ff00" }), 13, { completed: false })
        const restored = restoreTasks(latest, before, taskChanges(before, after, touched))
        expect(taskOf(restored, 20).color).toBe("#00ff00")
        // completed was not changed by the automation: the later edit stays
        expect(taskOf(restored, 13).completed).toBe(false)
        // what the automation changed is undone
        expect(taskOf(restored, 13).sectionID).toBe(1)
        expect(taskOf(restored, 13).color).toBeNull()
        expect(taskOf(restored, 13).priority).toBe(false)
    })

    it("skips tasks that no longer exist", () => {
        const { before, tree: after, touched } = run()
        const latest = removeTask(after, 13)
        expect(restoreTasks(latest, before, taskChanges(before, after, touched))).toEqual(latest)
    })

    it("skips a task whose destination section no longer exists", () => {
        const { before, tree: after } = run()
        const latest = removeSection(after, 1)
        const restored = restoreTasks(latest, before, [{ id: 13, place: true, completed: false, priority: false, color: false, tags: false }])
        expect(layout(restored)).toEqual(layout(latest))
    })

    it("skips a subtask whose parent no longer exists", () => {
        const before = base()
        const after = patchTask(before, 11, { completed: true })
        const latest = removeTask(after, 10)
        expect(restoreTasks(latest, before, [{ id: 11, place: true, completed: true, priority: false, color: false, tags: false }])).toBe(latest)
    })

    it("does nothing without changes", () => {
        const tree = base()
        expect(restoreTasks(tree, base(), [])).toBe(tree)
    })
})

describe("groups", () => {
    const groups = () => makeGroups({
        1: { 1: [{ id: 10, completed: true }], 2: [{ id: 11 }] },
        2: { 3: [{ id: 20 }] },
        3: { 4: [{ id: 30 }] },
    })
    const reorder = (tree: NoteDataTree, id: number, index: number): NoteDataTree => ({ groups: moveGroupInList(tree.groups, id, index)! })

    describe("diffGroupStatements", () => {
        it("returns nothing for equal trees", () => {
            const tree = groups()
            expect(diffGroupStatements(tree, tree)).toEqual([])
            expect(diffGroupStatements(tree, groups())).toEqual([])
        })

        it("writes a changed color, and treats undefined like null", () => {
            const before = groups()
            expect(diffGroupStatements(before, patchGroup(before, 2, { color: "#ff0000" }))).toEqual([
                { sql: "UPDATE section_group SET color = ? WHERE id = ?", params: ["#ff0000", 2] },
            ])
            expect(diffGroupStatements(patchGroup(before, 2, { color: "#ff0000" }), patchGroup(before, 2, { color: null }))).toEqual([
                { sql: "UPDATE section_group SET color = ? WHERE id = ?", params: [null, 2] },
            ])
            expect(diffGroupStatements(before, patchGroup(before, 2, { color: undefined }))).toEqual([])
        })

        it("renumbers the groups when their order changed", () => {
            const before = groups()
            expect(diffGroupStatements(before, reorder(before, 1, 2))).toEqual([buildPositionUpdate("section_group", [2, 3, 1])])
            expect(diffGroupStatements(before, reorder(before, 3, 0))).toEqual([buildPositionUpdate("section_group", [3, 1, 2])])
        })

        it("archives a group only in before, guarded, and does not renumber the others", () => {
            const before = groups()
            expect(diffGroupStatements(before, removeGroup(before, 2))).toEqual([{
                sql: "UPDATE section_group SET archived_at = datetime('now','localtime') WHERE id = ? AND archived_at IS NULL AND deleted_at IS NULL",
                params: [2],
            }])
        })

        it("unarchives a group only in after", () => {
            const after = groups()
            expect(diffGroupStatements(removeGroup(after, 2), after)).toEqual([
                { sql: "UPDATE section_group SET archived_at = NULL WHERE id = ?", params: [2] },
            ])
        })

        it("an archive combined with a move of another group renumbers the groups present in both", () => {
            const before = groups()
            const statements = diffGroupStatements(before, reorder(removeGroup(before, 2), 3, 0))
            expect(statements).toHaveLength(2)
            expect(statements[1]).toEqual(buildPositionUpdate("section_group", [3, 1]))
        })

        it("does not touch the tasks of a group present in one tree only", () => {
            const before = groups()
            expect(diffTaskStatements(before, removeGroup(before, 2))).toEqual([])
        })
    })

    describe("groupChanges", () => {
        it("is empty for equal trees", () => {
            expect(groupChanges(groups(), groups(), [1, 2, 3])).toEqual([])
        })

        it("reports place, color and archived for the given ids only", () => {
            const before = groups()
            const moved = reorder(before, 1, 2)
            expect(groupChanges(before, moved, [1, 2])).toEqual([
                { id: 1, place: true, color: false, archived: false },
                { id: 2, place: true, color: false, archived: false },
            ])
            expect(groupChanges(before, moved, [])).toEqual([])
            expect(groupChanges(before, patchGroup(before, 3, { color: "#fff" }), [3])).toEqual([
                { id: 3, place: false, color: true, archived: false },
            ])
            expect(groupChanges(before, removeGroup(before, 2), [2])).toEqual([{ id: 2, place: false, color: false, archived: true }])
            expect(groupChanges(removeGroup(before, 2), before, [2])).toEqual([{ id: 2, place: false, color: false, archived: true }])
        })

        it("an archived group does not make the others look moved", () => {
            const before = groups()
            expect(groupChanges(before, removeGroup(before, 1), [2, 3])).toEqual([])
        })

        it("omits ids missing from both trees", () => {
            expect(groupChanges(groups(), groups(), [999])).toEqual([])
        })
    })

    describe("restoreGroups", () => {
        const rules = [
            makeRule(2, { type: "group.completed", groupId: 1 }, [{ type: "setColor", color: "#ff0000" }, { type: "moveGroup", at: "bottom" }]),
            makeRule(3, { type: "group.completed", groupId: 2 }, [{ type: "archiveGroup" }]),
        ]
        const run = () => {
            const before = makeGroups({
                1: { 1: [{ id: 10, completed: true }], 2: [{ id: 11 }] },
                2: { 3: [{ id: 20 }] },
                3: { 4: [{ id: 30 }] },
            })
            // The user finishes group 1 (recolored, moved last) and then group 2 (archived)
            const first = runAutomations(patchTask(before, 11, { completed: true }), rules, { type: "task.completed", taskId: 11 })
            const second = runAutomations(patchTask(first.tree, 20, { completed: true }), rules, { type: "task.completed", taskId: 20 })
            return { before, first, second }
        }

        it("undoes a color and a move", () => {
            const { before, first } = run()
            expect(groupIds(first.tree)).toEqual([2, 3, 1])
            const restored = restoreGroups(first.tree, before, groupChanges(before, first.tree, first.touchedGroups))
            expect(groupIds(restored)).toEqual([1, 2, 3])
            expect(restored.groups.find(group => group.id === 1)?.color ?? null).toBeNull()
            expect(diffGroupStatements(before, restored)).toEqual([])
        })

        it("brings an archived group back with its sections and tasks at its place, and redoes the archive", () => {
            const { before, first, second } = run()
            const afterRun = second.tree
            expect(groupIds(afterRun)).toEqual([3, 1])
            const archived = patchTask(first.tree, 20, { completed: true })
            const changes = groupChanges(archived, afterRun, second.touchedGroups)
            expect(changes).toEqual([{ id: 2, place: false, color: false, archived: true }])
            const undone = restoreGroups(afterRun, archived, changes)
            expect(groupIds(undone)).toEqual([2, 3, 1])
            expect(layout(undone)).toEqual(layout(archived))
            expect(taskOf(undone, 20).completed).toBe(true)
            expect(diffGroupStatements(archived, undone)).toEqual([])
            // redo: the same changes taken from the tree after the run
            const redone = restoreGroups(undone, afterRun, groupChanges(archived, afterRun, [2]))
            expect(groupIds(redone)).toEqual([3, 1])
            expect(diffGroupStatements(afterRun, redone)).toEqual([])
            expect(before.groups).toHaveLength(3)
        })

        it("keeps the color a later edit gave to a group the automation only moved", () => {
            const before = groups()
            const after = reorder(before, 1, 2)
            const latest = patchGroup(after, 1, { color: "#00ff00" })
            const restored = restoreGroups(latest, before, groupChanges(before, after, [1]))
            expect(groupIds(restored)).toEqual([1, 2, 3])
            expect(restored.groups.find(group => group.id === 1)?.color).toBe("#00ff00")
        })

        it("skips a recolored group that is gone, and does not duplicate a group that is back", () => {
            const before = groups()
            const after = patchGroup(before, 2, { color: "#fff" })
            const latest = removeGroup(after, 2)
            expect(restoreGroups(latest, before, groupChanges(before, after, [2]))).toBe(latest)
            const change = [{ id: 2, place: false, color: false, archived: true }]
            const once = restoreGroups(removeGroup(before, 2), before, change)
            expect(restoreGroups(once, before, change).groups).toHaveLength(3)
        })

        it("removes a group that is archived in the source", () => {
            const before = groups()
            const archived = removeGroup(before, 3)
            const restored = restoreGroups(before, archived, [{ id: 3, place: false, color: false, archived: true }])
            expect(groupIds(restored)).toEqual([1, 2])
        })

        it("does nothing without changes", () => {
            const tree = groups()
            expect(restoreGroups(tree, groups(), [])).toBe(tree)
        })
    })
})

describe("withGroups", () => {
    it("appends only the groups the tree does not have", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10 }] }, 2: { 2: [{ id: 20 }] } })
        const extra = makeGroups({ 2: { 2: [{ id: 20, completed: true }] }, 3: { 3: [{ id: 30 }] } }).groups
        const merged = withGroups(tree, extra)
        expect(groupIds(merged)).toEqual([1, 2, 3])
        expect(taskOf(merged, 20).completed).toBeFalsy()
        expect(withGroups(tree, [])).toBe(tree)
        expect(withGroups(tree, tree.groups)).toBe(tree)
    })

    it("lets the task diff see the tasks of an archived group", () => {
        const before = makeGroups({ 1: { 1: [{ id: 10 }] }, 2: { 2: [{ id: 20 }] } })
        const archived = makeGroups({ 1: { 1: [{ id: 10, completed: true }] } }).groups
        const after = removeGroup(before, 1)
        expect(diffTaskStatements(before, after)).toEqual([])
        expect(diffTaskStatements(before, withGroups(after, archived))).toEqual([
            { sql: "UPDATE task SET completed = ? WHERE id = ?", params: [1, 10] },
        ])
    })
})

describe("diffSectionStatements", () => {
    it("returns nothing for equal trees", () => {
        const tree = base()
        expect(diffSectionStatements(tree, tree)).toEqual([])
        expect(diffSectionStatements(tree, base())).toEqual([])
    })

    it("writes the changed colors only, and treats undefined like null", () => {
        const before = base()
        const after = patchSection(patchSection(before, 2, { color: "#00ff00" }), 3, { color: undefined })
        expect(diffSectionStatements(before, after)).toEqual([
            { sql: "UPDATE section SET color = ? WHERE id = ?", params: ["#00ff00", 2] },
        ])
        expect(diffSectionStatements(after, patchSection(after, 2, { color: null }))).toEqual([
            { sql: "UPDATE section SET color = ? WHERE id = ?", params: [null, 2] },
        ])
    })

    it("ignores the sections present in only one of the trees", () => {
        const before = patchSection(base(), 1, { color: "#f00" })
        expect(diffSectionStatements(before, removeSection(before, 1))).toEqual([])
        expect(diffSectionStatements(removeSection(before, 1), before)).toEqual([])
    })
})

describe("direct area of a group", () => {
    const direct = () => withDirectArea(makeTree({ 1: [{ id: 10 }, { id: 11 }], 2: [] }), 1, 90, [{ id: 91 }, { id: 92 }])

    it("does not treat the direct tasks as deleted: an unchanged tree has no statements", () => {
        const tree = direct()
        expect(diffTaskStatements(tree, tree)).toEqual([])
        expect(diffTaskStatements(tree, direct())).toEqual([])
    })

    it("writes the flags of a direct task", () => {
        const before = direct()
        expect(diffTaskStatements(before, patchTask(before, 91, { completed: true }))).toEqual([
            { sql: "UPDATE task SET completed = ? WHERE id = ?", params: [1, 91] },
        ])
    })

    it("moves a task into the direct area and renumbers both lists", () => {
        const before = direct()
        const after = moveTask(before, 10, { sectionId: 90, parentTaskId: null }, 1)
        expect(diffTaskStatements(before, after)).toEqual([
            { sql: expect.stringContaining("sectionID = ?"), params: expect.arrayContaining([90, 10]) },
            buildPositionUpdate("task", [91, 10, 92]),
            buildPositionUpdate("task", [11]),
        ])
    })

    it("reports a task moved by an automation as touched, and reverts it", () => {
        const before = direct()
        const rule = makeRule(1, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 90, at: "top" }])
        const { tree } = runAutomations(patchTask(before, 10, { completed: true }), [rule], { type: "task.completed", taskId: 10 })
        expect(layout(tree)[90]).toEqual([10, 91, 92])
        expect(taskChanges(before, tree, [10])).toEqual([expect.objectContaining({ id: 10 })])
    })

    it("writes the color of a section that changed, the default one included", () => {
        const before = direct()
        const after = patchSection(before, 90, { color: "#123456" })
        expect(diffSectionStatements(before, after)).toEqual([{ sql: "UPDATE section SET color = ? WHERE id = ?", params: ["#123456", 90] }])
    })
})
