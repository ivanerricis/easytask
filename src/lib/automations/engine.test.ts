import { describe, expect, it } from "vitest"
import { groupIds, layout, makeGroups, makeRule, makeTree, taskOf, withDirectArea, type TaskSpec } from "@/test/automation-fixtures"
import { allSubtasksCompleted, allTasksCompleted, MAX_AUTOMATION_STEPS, runAutomations, syncStateRules } from "./engine"
import { patchTask } from "@/contexts/note-tree-ops"
import type { AutomationAction, AutomationEvent } from "./types"

const completed = (taskId: number): AutomationEvent => ({ type: "task.completed", taskId })

describe("allSubtasksCompleted", () => {
    it("is false without subtasks", () => {
        expect(allSubtasksCompleted(taskOf(makeTree({ 1: [{ id: 1 }] }), 1))).toBe(false)
    })

    it("needs every subtask, at any depth, to be completed", () => {
        const done = makeTree({ 1: [{ id: 1, subs: [{ id: 2, completed: true, subs: [{ id: 3, completed: true }] }] }] })
        expect(allSubtasksCompleted(taskOf(done, 1))).toBe(true)
        const deepOpen = makeTree({ 1: [{ id: 1, subs: [{ id: 2, completed: true, subs: [{ id: 3 }] }] }] })
        expect(allSubtasksCompleted(taskOf(deepOpen, 1))).toBe(false)
        const someOpen = makeTree({ 1: [{ id: 1, subs: [{ id: 2, completed: true }, { id: 3 }] }] })
        expect(allSubtasksCompleted(taskOf(someOpen, 1))).toBe(false)
    })
})

describe("task.completed", () => {
    const base = () => makeTree({ 1: [{ id: 10, completed: true }, { id: 11 }], 2: [{ id: 20 }, { id: 21 }] })

    it("moves the task to the bottom of a section", () => {
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 2, at: "bottom" }])
        const { tree, applied } = runAutomations(base(), [rule], completed(10))
        expect(layout(tree)).toEqual({ 1: [11], 2: [20, 21, 10] })
        expect(applied).toEqual([rule])
        expect(taskOf(tree, 10).sectionID).toBe(2)
    })

    it("moves the task to the top of a section", () => {
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        expect(layout(runAutomations(base(), [rule], completed(10)).tree)).toEqual({ 1: [11], 2: [10, 20, 21] })
    })

    it("applies the section filter", () => {
        const specific = makeRule(1, { type: "task.completed", sectionId: 1 }, [{ type: "setPriority", value: true }])
        expect(taskOf(runAutomations(base(), [specific], completed(10)).tree, 10).priority).toBe(true)
        const other = makeRule(2, { type: "task.completed", sectionId: 2 }, [{ type: "setPriority", value: true }])
        const input = base()
        const outcome = runAutomations(input, [other], completed(10))
        expect(outcome.tree).toBe(input)
        expect(outcome.applied).toEqual([])
    })

    it("does not fire when the task is not completed any more", () => {
        const input = makeTree({ 1: [{ id: 10 }], 2: [] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        expect(runAutomations(input, [rule], completed(10)).tree).toBe(input)
    })

    it("ignores subtasks", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, completed: true }, { id: 12 }] }], 2: [] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        const outcome = runAutomations(input, [rule], completed(11))
        expect(outcome.tree).toBe(input)
        expect(outcome.applied).toEqual([])
    })

    it("ignores an unknown task", () => {
        const input = base()
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [rule], completed(999)).tree).toBe(input)
    })

    it("does not fire on other event types", () => {
        const input = base()
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [rule], { type: "task.reopened", taskId: 10 }).tree).toBe(input)
    })
})

describe("task.reopened and task.created", () => {
    it("reopened fires for an open top level task", () => {
        const input = makeTree({ 1: [{ id: 10, priority: true }], 2: [] })
        const rule = makeRule(1, { type: "task.reopened", sectionId: 1 }, [{ type: "moveTo", sectionId: 2, at: "top" }, { type: "setPriority", value: false }])
        const { tree } = runAutomations(input, [rule], { type: "task.reopened", taskId: 10 })
        expect(layout(tree)).toEqual({ 1: [], 2: [10] })
        expect(taskOf(tree, 10).priority).toBe(false)
    })

    it("reopened does not fire when the task is still completed", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }] })
        const rule = makeRule(1, { type: "task.reopened", sectionId: null }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [rule], { type: "task.reopened", taskId: 10 }).tree).toBe(input)
    })

    it("created colors the new task, only in the right section", () => {
        const input = makeTree({ 1: [{ id: 10 }], 2: [{ id: 20 }] })
        const rule = makeRule(1, { type: "task.created", sectionId: 1 }, [{ type: "setColor", color: "#ff0000" }])
        expect(taskOf(runAutomations(input, [rule], { type: "task.created", taskId: 10 }).tree, 10).color).toBe("#ff0000")
        expect(runAutomations(input, [rule], { type: "task.created", taskId: 20 }).tree).toBe(input)
    })

    it("created ignores a subtask", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11 }] }] })
        const rule = makeRule(1, { type: "task.created", sectionId: null }, [{ type: "setColor", color: "#ff0000" }])
        expect(runAutomations(input, [rule], { type: "task.created", taskId: 11 }).tree).toBe(input)
    })
})

describe("task.movedInto", () => {
    it("fires only when the task comes from another section", () => {
        const input = makeTree({ 1: [], 2: [{ id: 10 }] })
        const rule = makeRule(1, { type: "task.movedInto", sectionId: 2 }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [rule], { type: "task.moved", taskId: 10, fromSectionId: 1 }).applied).toEqual([rule])
        // a reorder inside the section is reported with the same section
        expect(runAutomations(input, [rule], { type: "task.moved", taskId: 10, fromSectionId: 2 }).tree).toBe(input)
    })

    it("does not fire for another destination", () => {
        const input = makeTree({ 1: [{ id: 10 }], 2: [] })
        const rule = makeRule(1, { type: "task.movedInto", sectionId: 2 }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [rule], { type: "task.moved", taskId: 10, fromSectionId: 2 }).tree).toBe(input)
    })

    it("chains: a rule moves to S2, another one on movedInto S2 sets the priority", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }], 2: [{ id: 20 }] })
        const a = makeRule(1, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        const b = makeRule(2, { type: "task.movedInto", sectionId: 2 }, [{ type: "setPriority", value: true }])
        const { tree, applied } = runAutomations(input, [a, b], completed(10))
        expect(layout(tree)).toEqual({ 1: [], 2: [10, 20] })
        expect(taskOf(tree, 10).priority).toBe(true)
        expect(applied).toEqual([a, b])
    })

    it("a rule listed before the one that moves the task still runs in the chain", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }], 2: [] })
        const b = makeRule(1, { type: "task.movedInto", sectionId: 2 }, [{ type: "setPriority", value: true }])
        const a = makeRule(2, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        const { tree } = runAutomations(input, [b, a], completed(10))
        expect(taskOf(tree, 10).priority).toBe(true)
    })
})

describe("subtasks.completed", () => {
    it("fires when the last subtask is completed and acts on the parent", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, completed: true }, { id: 12, completed: true }] }], 2: [] })
        const rule = makeRule(1, { type: "subtasks.completed", sectionId: null }, [{ type: "moveTo", sectionId: 2, at: "bottom" }])
        const { tree, applied } = runAutomations(input, [rule], completed(12))
        expect(layout(tree)).toEqual({ 1: [], 2: [10] })
        expect(applied).toEqual([rule])
    })

    it("does not fire while a subtask is open", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, completed: true }, { id: 12 }] }], 2: [] })
        const rule = makeRule(1, { type: "subtasks.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [rule], completed(11)).tree).toBe(input)
    })

    it("respects the section filter", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, completed: true }] }], 2: [] })
        const rule = makeRule(1, { type: "subtasks.completed", sectionId: 2 }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [rule], completed(11)).tree).toBe(input)
    })

    it("works with nested subtasks: the parent is the direct parent of the completed task", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, subs: [{ id: 12, completed: true }] }] }] })
        const rule = makeRule(1, { type: "subtasks.completed", sectionId: null }, [{ type: "setColor", color: "#00ff00" }])
        const { tree } = runAutomations(input, [rule], completed(12))
        expect(taskOf(tree, 11).color).toBe("#00ff00")
        // 11 itself is still open, so 10 did not get its subtasks completed
        expect(taskOf(tree, 10).color).toBeNull()
    })

    it("cascades upward through several levels with a setCompleted rule", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, subs: [{ id: 12, completed: true }] }] }] })
        const rule = makeRule(1, { type: "subtasks.completed", sectionId: null }, [{ type: "setCompleted", value: true }])
        const { tree } = runAutomations(input, [rule], completed(12))
        expect(taskOf(tree, 11).completed).toBe(true)
        expect(taskOf(tree, 10).completed).toBe(true)
    })

    it("the cascade reaches the top level task, which then raises task.completed", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, completed: true }] }], 2: [] })
        const complete = makeRule(1, { type: "subtasks.completed", sectionId: null }, [{ type: "setCompleted", value: true }])
        const move = makeRule(2, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        const { tree, applied } = runAutomations(input, [complete, move], completed(11))
        expect(layout(tree)).toEqual({ 1: [], 2: [10] })
        expect(taskOf(tree, 10).completed).toBe(true)
        expect(applied).toEqual([complete, move])
    })

    it("completeSubtasks completes every subtask and raises subtasks.completed", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true, subs: [{ id: 11, subs: [{ id: 12 }] }, { id: 13 }] }], 2: [] })
        const complete = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "completeSubtasks" }])
        const mark = makeRule(2, { type: "subtasks.completed", sectionId: null }, [{ type: "setColor", color: "#123456" }])
        const { tree, applied } = runAutomations(input, [complete, mark], completed(10))
        for (const id of [11, 12, 13]) expect(taskOf(tree, id).completed).toBe(true)
        expect(taskOf(tree, 10).color).toBe("#123456")
        expect(applied).toEqual([complete, mark])
    })

    it("completeSubtasks is a no-op without subtasks or when all are completed", () => {
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "completeSubtasks" }])
        const none = makeTree({ 1: [{ id: 10, completed: true }] })
        expect(runAutomations(none, [rule], completed(10))).toEqual({ tree: none, applied: [], touched: [], touchedGroups: [], archivedGroups: [] })
        const all = makeTree({ 1: [{ id: 10, completed: true, subs: [{ id: 11, completed: true }] }] })
        expect(runAutomations(all, [rule], completed(10)).tree).toBe(all)
    })
})

describe("actions", () => {
    it("setPriority / setColor / setCompleted that change nothing keep the tree and are not applied", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true, priority: true, color: "#abcdef" }] })
        const rules = [
            makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }]),
            makeRule(2, { type: "task.completed", sectionId: null }, [{ type: "setColor", color: "#abcdef" }]),
            makeRule(3, { type: "task.completed", sectionId: null }, [{ type: "setCompleted", value: true }]),
        ]
        const outcome = runAutomations(input, rules, completed(10))
        expect(outcome.tree).toBe(input)
        expect(outcome.applied).toEqual([])
    })

    it("setColor null removes the color", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true, color: "#abcdef" }] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setColor", color: null }])
        expect(taskOf(runAutomations(input, [rule], completed(10)).tree, 10).color).toBeNull()
    })

    it("a rule with several actions is applied when only one of them changes something", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true, priority: true }] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }, { type: "setColor", color: "#111111" }])
        const outcome = runAutomations(input, [rule], completed(10))
        expect(outcome.applied).toEqual([rule])
        expect(taskOf(outcome.tree, 10).color).toBe("#111111")
    })

    it("moveTo the place the task already has is a no-op", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }, { id: 11 }] })
        const top = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 1, at: "top" }])
        expect(runAutomations(input, [top], completed(10)).tree).toBe(input)
        const bottom = makeRule(2, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 1, at: "bottom" }])
        expect(layout(runAutomations(input, [bottom], completed(10)).tree)).toEqual({ 1: [11, 10] })
    })

    it("moveTo within the same section reorders without raising task.moved", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }, { id: 11 }] })
        const move = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 1, at: "bottom" }])
        const into = makeRule(2, { type: "task.movedInto", sectionId: 1 }, [{ type: "setPriority", value: true }])
        const { tree } = runAutomations(input, [move, into], completed(10))
        expect(layout(tree)).toEqual({ 1: [11, 10] })
        expect(taskOf(tree, 10).priority).toBe(false)
    })

    it("moveTo never moves a subtask", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, subs: [{ id: 12, completed: true }] }] }], 2: [] })
        const move = makeRule(1, { type: "subtasks.completed", sectionId: null }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        const outcome = runAutomations(input, [move], completed(12))
        expect(outcome.tree).toBe(input)
        expect(outcome.applied).toEqual([])
        expect(layout(outcome.tree)).toEqual({ 1: [10], 2: [] })
    })

    it("moves a task with its subtree and updates the section of the subtasks", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true, subs: [{ id: 11 }] }], 2: [] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        const { tree } = runAutomations(input, [rule], completed(10))
        expect(taskOf(tree, 11).sectionID).toBe(2)
        expect(taskOf(tree, 11).taskID).toBe(10)
    })
})

describe("touched", () => {
    it("lists the tasks an action changed, not the ones that only shifted", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }], 2: [{ id: 20 }] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        const outcome = runAutomations(input, [rule], completed(10))
        expect(outcome.touched).toEqual([10])
        expect(outcome.touched).not.toContain(20)
    })

    it("is empty for no-op actions and when nothing runs", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true, priority: true }] })
        const noop = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [noop], completed(10)).touched).toEqual([])
        expect(runAutomations(input, [], completed(10)).touched).toEqual([])
    })

    it("completeSubtasks touches the task and all its descendants", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true, subs: [{ id: 11, subs: [{ id: 12 }] }, { id: 13 }] }] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "completeSubtasks" }])
        expect(runAutomations(input, [rule], completed(10)).touched.sort()).toEqual([10, 11, 12, 13])
    })

    it("collects the tasks of a whole chain", () => {
        const input = makeTree({ 1: [{ id: 10, subs: [{ id: 11, subs: [{ id: 12, completed: true }] }] }] })
        const rule = makeRule(1, { type: "subtasks.completed", sectionId: null }, [{ type: "setCompleted", value: true }])
        expect(runAutomations(input, [rule], completed(12)).touched.sort()).toEqual([10, 11])
    })
})

describe("rule selection", () => {
    it("skips disabled rules", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }], { enabled: false })
        const outcome = runAutomations(input, [rule], completed(10))
        expect(outcome.tree).toBe(input)
        expect(outcome.applied).toEqual([])
    })

    it("skips rules whose trigger section is missing", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }] })
        const rule = makeRule(1, { type: "task.completed", sectionId: 99 }, [{ type: "setPriority", value: true }])
        expect(runAutomations(input, [rule], completed(10)).tree).toBe(input)
    })

    it("skips rules whose move target is missing, without running their other actions", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }] })
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }, { type: "moveTo", sectionId: 99, at: "top" }])
        const outcome = runAutomations(input, [rule], completed(10))
        expect(outcome.tree).toBe(input)
        expect(outcome.applied).toEqual([])
    })

    it("runs the rules by position (then id), not by array order", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }] })
        const first = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setColor", color: "#111111" }], { position: 5 })
        const second = makeRule(2, { type: "task.completed", sectionId: null }, [{ type: "setColor", color: "#222222" }], { position: 1 })
        const outcome = runAutomations(input, [first, second], completed(10))
        // the rule with the lower position runs first, so the other one has the last word
        expect(outcome.applied).toEqual([second, first])
        expect(taskOf(outcome.tree, 10).color).toBe("#111111")
    })

    it("breaks position ties by id", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }] })
        const a = makeRule(7, { type: "task.completed", sectionId: null }, [{ type: "setColor", color: "#777777" }], { position: 0 })
        const b = makeRule(3, { type: "task.completed", sectionId: null }, [{ type: "setColor", color: "#333333" }], { position: 0 })
        expect(runAutomations(input, [a, b], completed(10)).applied).toEqual([b, a])
    })

    it("returns the same tree with no rules", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }] })
        const outcome = runAutomations(input, [], completed(10))
        expect(outcome.tree).toBe(input)
        expect(outcome.applied).toEqual([])
    })

    it("does not mutate the input tree", () => {
        const input = makeTree({ 1: [{ id: 10, completed: true }], 2: [] })
        const snapshot = JSON.stringify(input)
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 2, at: "top" }, { type: "setPriority", value: true }])
        runAutomations(input, [rule], completed(10))
        expect(JSON.stringify(input)).toBe(snapshot)
    })
})

describe("loop protection", () => {
    it("two rules bouncing a task between two sections terminate, each rule firing once per task", () => {
        const input = makeTree({ 1: [{ id: 10 }], 2: [] })
        const toTwo = makeRule(1, { type: "task.movedInto", sectionId: 1 }, [{ type: "moveTo", sectionId: 2, at: "bottom" }])
        const toOne = makeRule(2, { type: "task.movedInto", sectionId: 2 }, [{ type: "moveTo", sectionId: 1, at: "bottom" }])
        // the user moved the task from S2 to S1
        const { tree, applied } = runAutomations(input, [toTwo, toOne], { type: "task.moved", taskId: 10, fromSectionId: 2 })
        expect(applied).toEqual([toTwo, toOne])
        // S1 -> S2 (rule 1), S2 -> S1 (rule 2); rule 1 cannot fire again for the same task
        expect(layout(tree)).toEqual({ 1: [10], 2: [] })
    })

    it("a rule that moves the task out of its own destination runs once", () => {
        const input = makeTree({ 1: [{ id: 10 }, { id: 11 }], 2: [] })
        const rule = makeRule(1, { type: "task.movedInto", sectionId: 1 }, [{ type: "moveTo", sectionId: 2, at: "top" }])
        const { tree, applied } = runAutomations(input, [rule], { type: "task.moved", taskId: 10, fromSectionId: 2 })
        expect(layout(tree)).toEqual({ 1: [11], 2: [10] })
        expect(applied).toEqual([rule])
    })

    it("is bounded by MAX_AUTOMATION_STEPS", () => {
        // a chain of nested tasks, each completion completing the parent, deeper than the step limit
        const depth = MAX_AUTOMATION_STEPS + 20
        let spec: TaskSpec = { id: depth, completed: true }
        for (let id = depth - 1; id >= 1; id--) spec = { id, subs: [spec] }
        const input = makeTree({ 1: [spec] })
        const rule = makeRule(1, { type: "subtasks.completed", sectionId: null }, [{ type: "setCompleted", value: true }])
        const { tree } = runAutomations(input, [rule], completed(depth))
        expect(taskOf(tree, depth - 1).completed).toBe(true)
        // the chain stopped before reaching the root
        expect(taskOf(tree, 1).completed).toBe(false)
    })
})

describe("allTasksCompleted", () => {
    const groupOf = (specs: Record<number, TaskSpec[]>) => makeGroups({ 1: specs }).groups[0]

    it("is false for a group without tasks", () => {
        expect(allTasksCompleted(groupOf({ 1: [] }))).toBe(false)
        expect(allTasksCompleted({ ...groupOf({}), sections: [] })).toBe(false)
    })

    it("needs every task of every section, at any depth, to be completed", () => {
        expect(allTasksCompleted(groupOf({ 1: [{ id: 1, completed: true }], 2: [{ id: 2, completed: true, subs: [{ id: 3, completed: true }] }] }))).toBe(true)
        expect(allTasksCompleted(groupOf({ 1: [{ id: 1, completed: true }], 2: [{ id: 2 }] }))).toBe(false)
        expect(allTasksCompleted(groupOf({ 1: [{ id: 1, completed: true, subs: [{ id: 3 }] }] }))).toBe(false)
    })

    it("ignores empty sections", () => {
        expect(allTasksCompleted(groupOf({ 1: [{ id: 1, completed: true }], 2: [] }))).toBe(true)
    })
})

describe("group.completed", () => {
    const archive = [{ type: "archiveGroup" as const }]
    // Group 1 (sections 1 and 2) has just been finished by completing task 11; group 2 (section 3) is open
    const finishing = () => ({
        tree: makeGroups({ 1: { 1: [{ id: 10, completed: true }], 2: [{ id: 11, completed: true }] }, 2: { 3: [{ id: 20 }] } }),
        event: completed(11),
    })

    it("fires when the last open task of the group is completed, and the actions apply to that group", () => {
        const { tree, event } = finishing()
        const rule = makeRule(1, { type: "group.completed", groupId: null }, archive)
        const outcome = runAutomations(tree, [rule], event)
        expect(groupIds(outcome.tree)).toEqual([2])
        expect(outcome.applied).toEqual([rule])
        expect(outcome.touchedGroups).toEqual([1])
        expect(outcome.touched).toEqual([])
    })

    it("returns the archived group with the task changes made before the archive", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10, completed: true, subs: [{ id: 11 }] }] }, 2: { 3: [{ id: 20 }] } })
        const rules = [
            makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "completeSubtasks" }]),
            makeRule(2, { type: "group.completed", groupId: 1 }, archive),
        ]
        const outcome = runAutomations(tree, rules, completed(10))
        expect(groupIds(outcome.tree)).toEqual([2])
        expect(outcome.archivedGroups.map(group => group.id)).toEqual([1])
        expect(outcome.archivedGroups[0].sections[0].tasks[0].subtasks[0].completed).toBe(true)
        expect(outcome.touched).toEqual([10, 11])
    })

    it("does not fire while a task is still open", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10, completed: true }], 2: [{ id: 11 }] } })
        const rule = makeRule(1, { type: "group.completed", groupId: null }, archive)
        const outcome = runAutomations(tree, [rule], completed(10))
        expect(outcome.tree).toBe(tree)
        expect(outcome.applied).toEqual([])
        expect(outcome.touchedGroups).toEqual([])
    })

    it("fires once even when several completions in the chain finish the group", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10, completed: true, subs: [{ id: 11, completed: true }] }] } })
        const rule = makeRule(1, { type: "group.completed", groupId: 1 }, [{ type: "setColor", color: "#ff0000" }])
        // completing the last subtask raises task.completed (group done) and the subtasks.completed of the parent (group done again)
        const outcome = runAutomations(tree, [rule], completed(11))
        expect(outcome.applied).toEqual([rule])
        expect(outcome.touchedGroups).toEqual([1])
        expect(outcome.tree.groups[0].color).toBe("#ff0000")
    })

    it("the last open subtask finishes the group only when the parents are completed too", () => {
        const rule = makeRule(1, { type: "group.completed", groupId: null }, archive)
        const parentOpen = makeGroups({ 1: { 1: [{ id: 10, subs: [{ id: 11, completed: true }] }] } })
        expect(runAutomations(parentOpen, [rule], completed(11)).tree).toBe(parentOpen)
        const parentDone = makeGroups({ 1: { 1: [{ id: 10, completed: true, subs: [{ id: 11, completed: true }] }] } })
        expect(groupIds(runAutomations(parentDone, [rule], completed(11)).tree)).toEqual([])
    })

    it("fires when another rule completes the last task (setCompleted)", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10, completed: true }, { id: 11 }] } })
        const task = makeRule(1, { type: "task.created", sectionId: null }, [{ type: "setCompleted", value: true }])
        const group = makeRule(2, { type: "group.completed", groupId: 1 }, archive)
        const outcome = runAutomations(tree, [task, group], { type: "task.created", taskId: 11 })
        expect(groupIds(outcome.tree)).toEqual([])
        expect(outcome.applied).toEqual([task, group])
        expect(outcome.touched).toEqual([11])
        expect(outcome.touchedGroups).toEqual([1])
    })

    it("fires when another rule completes the subtasks (completeSubtasks)", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10, completed: true, subs: [{ id: 11 }, { id: 12 }] }] } })
        const task = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "completeSubtasks" }])
        const group = makeRule(2, { type: "group.completed", groupId: null }, [{ type: "setColor", color: "#00ff00" }])
        const outcome = runAutomations(tree, [task, group], completed(10))
        expect(outcome.tree.groups[0].color).toBe("#00ff00")
        expect(outcome.touchedGroups).toEqual([1])
    })

    it("a specific group only reacts to its own completion", () => {
        const { tree, event } = finishing()
        const other = makeRule(1, { type: "group.completed", groupId: 2 }, archive)
        expect(runAutomations(tree, [other], event).tree).toBe(tree)
        const own = makeRule(2, { type: "group.completed", groupId: 1 }, archive)
        expect(groupIds(runAutomations(tree, [own], event).tree)).toEqual([2])
    })

    it("any group reacts to the group of the completed task only", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10, completed: true }] }, 2: { 2: [{ id: 20, completed: true }] } })
        const rule = makeRule(1, { type: "group.completed", groupId: null }, [{ type: "setColor", color: "#123456" }])
        const outcome = runAutomations(tree, [rule], completed(10))
        expect(outcome.tree.groups.map(group => group.color ?? null)).toEqual(["#123456", null])
    })

    it("never fires for an empty group", () => {
        const tree = makeGroups({ 1: { 1: [] }, 2: { 2: [{ id: 20 }] } })
        const rule = makeRule(1, { type: "group.completed", groupId: null }, archive)
        expect(runAutomations(tree, [rule], { type: "task.created", taskId: 20 }).tree).toBe(tree)
        expect(runAutomations(tree, [rule], completed(20)).tree).toBe(tree)
    })

    it("creating, moving or reopening a task does not fire it, even if the group is complete", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10, completed: true }], 2: [] } })
        const rule = makeRule(1, { type: "group.completed", groupId: null }, archive)
        expect(runAutomations(tree, [rule], { type: "task.created", taskId: 10 }).tree).toBe(tree)
        expect(runAutomations(tree, [rule], { type: "task.moved", taskId: 10, fromSectionId: 2 }).tree).toBe(tree)
        expect(runAutomations(tree, [rule], { type: "task.reopened", taskId: 10 }).tree).toBe(tree)
    })

    it("skips a rule whose group is not in the note, and a disabled one", () => {
        const { tree, event } = finishing()
        expect(runAutomations(tree, [makeRule(1, { type: "group.completed", groupId: 99 }, archive)], event).tree).toBe(tree)
        expect(runAutomations(tree, [makeRule(1, { type: "group.completed", groupId: null }, archive, { enabled: false })], event).tree).toBe(tree)
    })

    it("setColor colors the group, removes its color, and is a no-op when already set", () => {
        const { tree, event } = finishing()
        const color = makeRule(1, { type: "group.completed", groupId: 1 }, [{ type: "setColor", color: "#ff0000" }])
        const colored = runAutomations(tree, [color], event)
        expect(colored.tree.groups[0].color).toBe("#ff0000")
        expect(colored.touchedGroups).toEqual([1])
        expect(runAutomations(colored.tree, [color], event).tree).toBe(colored.tree)
        const clear = makeRule(1, { type: "group.completed", groupId: 1 }, [{ type: "setColor", color: null }])
        expect(runAutomations(colored.tree, [clear], event).tree.groups[0].color).toBeNull()
        expect(runAutomations(tree, [clear], event).tree).toBe(tree)
    })

    it("moveGroup moves the group to the bottom or to the top of the note", () => {
        const { tree, event } = finishing()
        const bottom = makeRule(1, { type: "group.completed", groupId: 1 }, [{ type: "moveGroup", at: "bottom" }])
        const moved = runAutomations(tree, [bottom], event)
        expect(groupIds(moved.tree)).toEqual([2, 1])
        expect(moved.touchedGroups).toEqual([1])
        // already last: nothing changes
        expect(runAutomations(moved.tree, [bottom], event).tree).toBe(moved.tree)

        const top = makeRule(1, { type: "group.completed", groupId: 1 }, [{ type: "moveGroup", at: "top" }])
        const stay = runAutomations(tree, [top], event)
        expect(stay.tree).toBe(tree)
        expect(stay.applied).toEqual([])
        expect(stay.touchedGroups).toEqual([])
        expect(groupIds(runAutomations(moved.tree, [top], event).tree)).toEqual([1, 2])
    })

    it("runs the actions in order and the ones after an archive are no-ops", () => {
        const { tree, event } = finishing()
        const rule = makeRule(1, { type: "group.completed", groupId: 1 }, [
            { type: "setColor", color: "#ff0000" }, { type: "moveGroup", at: "bottom" }, { type: "archiveGroup" },
            { type: "setColor", color: "#00ff00" }, { type: "moveGroup", at: "top" },
        ])
        const outcome = runAutomations(tree, [rule], event)
        expect(groupIds(outcome.tree)).toEqual([2])
        expect(outcome.touchedGroups).toEqual([1])
        expect(outcome.applied).toEqual([rule])
        expect(layout(outcome.tree)).toEqual({ 3: [20] })
    })

    it("skips a rule with an action of the wrong subject", () => {
        const { tree, event } = finishing()
        const groupRule = makeRule(1, { type: "group.completed", groupId: null }, [{ type: "setPriority", value: true }, { type: "archiveGroup" }])
        expect(runAutomations(tree, [groupRule], event).tree).toBe(tree)
        const taskRule = makeRule(2, { type: "task.completed", sectionId: null }, [{ type: "archiveGroup" }, { type: "moveGroup", at: "bottom" }])
        const outcome = runAutomations(tree, [taskRule], event)
        expect(outcome.tree).toBe(tree)
        expect(outcome.applied).toEqual([])
    })

    it("a group rule does not react to task events and a task rule not to group events", () => {
        const { tree, event } = finishing()
        const taskRule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        const groupRule = makeRule(2, { type: "group.completed", groupId: null }, [{ type: "setColor", color: "#fff" }])
        const outcome = runAutomations(tree, [taskRule, groupRule], event)
        expect(outcome.touched).toEqual([11])
        expect(taskOf(outcome.tree, 10).priority).toBe(false)
        expect(outcome.touchedGroups).toEqual([1])
        expect(outcome.tree.groups[0].color).toBe("#fff")
        // the group rule alone does nothing on a task event that finishes nothing
        const open = makeGroups({ 1: { 1: [{ id: 10, completed: true }, { id: 12 }] } })
        expect(runAutomations(open, [groupRule], completed(10)).tree).toBe(open)
    })

    it("tasks and groups with the same id keep separate once-per-chain keys", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 1, completed: true }] } })
        const taskRule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        const groupRule = makeRule(1, { type: "group.completed", groupId: null }, [{ type: "setColor", color: "#abc" }])
        const outcome = runAutomations(tree, [taskRule, groupRule], completed(1))
        expect(taskOf(outcome.tree, 1).priority).toBe(true)
        expect(outcome.tree.groups[0].color).toBe("#abc")
    })

    it("the chain stays bounded when task rules bounce a completion that keeps finishing the group", () => {
        const tree = makeGroups({ 1: { 1: [{ id: 10, completed: true }] } })
        const rules = [
            makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setCompleted", value: false }]),
            makeRule(2, { type: "task.reopened", sectionId: null }, [{ type: "setCompleted", value: true }]),
            makeRule(3, { type: "group.completed", groupId: null }, [{ type: "setColor", color: "#fff" }]),
        ]
        const outcome = runAutomations(tree, rules, completed(10))
        expect(outcome.touchedGroups.length).toBeLessThanOrEqual(1)
        expect(outcome.tree.groups[0].color).toBe("#fff")
    })
})

describe("syncStateRules", () => {
    const green = [{ type: "setColor", color: "#0f0" }] as const
    const red = [{ type: "setColor", color: "#f00" }] as const
    const sectionPair = (id = 1, sectionId: number | null = null) => [
        makeRule(id, { type: "section.noOpenTasks", sectionId }, [...green]),
        makeRule(id + 1, { type: "section.hasOpenTasks", sectionId }, [...red]),
    ]
    const colors = (tree: ReturnType<typeof makeTree>) =>
        Object.fromEntries(tree.groups.flatMap(group => group.sections).map(section => [section.id, section.color ?? null]))

    it("colors the sections by their state, an empty one counting as without open tasks", () => {
        const tree = makeTree({ 1: [{ id: 10, completed: true }], 2: [{ id: 20, completed: true }, { id: 21 }], 3: [] })
        const outcome = syncStateRules(tree, sectionPair())
        expect(colors(outcome.tree)).toEqual({ 1: "#0f0", 2: "#f00", 3: "#0f0" })
        expect(outcome.touchedSections).toEqual([1, 3, 2])
        expect(outcome.touchedGroups).toEqual([])
    })

    it("counts a task whose subtasks are all done, at any depth, as done", () => {
        const done = makeTree({ 1: [{ id: 10, subs: [{ id: 11, completed: true }, { id: 12, subs: [{ id: 13, completed: true }] }] }] })
        expect(colors(syncStateRules(done, sectionPair()).tree)).toEqual({ 1: "#0f0" })
        const open = makeTree({ 1: [{ id: 10, subs: [{ id: 11, completed: true }, { id: 12, subs: [{ id: 13 }] }] }] })
        expect(colors(syncStateRules(open, sectionPair()).tree)).toEqual({ 1: "#f00" })
    })

    it("applies a rule on a specific section only", () => {
        const tree = makeTree({ 1: [{ id: 10 }], 2: [{ id: 20 }] })
        const outcome = syncStateRules(tree, [makeRule(1, { type: "section.hasOpenTasks", sectionId: 2 }, [...red])])
        expect(colors(outcome.tree)).toEqual({ 1: null, 2: "#f00" })
        expect(outcome.touchedSections).toEqual([2])
    })

    it("colors the groups looking at all their sections", () => {
        const tree = makeGroups({
            1: { 1: [{ id: 10, completed: true }], 2: [{ id: 11 }] },
            2: { 3: [{ id: 20, completed: true }] },
            3: { 4: [] },
        })
        const rules = [
            makeRule(1, { type: "group.noOpenTasks", groupId: null }, [...green]),
            makeRule(2, { type: "group.hasOpenTasks", groupId: null }, [...red]),
        ]
        const outcome = syncStateRules(tree, rules)
        expect(outcome.tree.groups.map(group => group.color)).toEqual(["#f00", "#0f0", "#0f0"])
        expect(outcome.touchedGroups).toEqual([2, 3, 1])
        expect(outcome.touchedSections).toEqual([])
        const specific = syncStateRules(tree, [makeRule(1, { type: "group.hasOpenTasks", groupId: 1 }, [...red])])
        expect(specific.tree.groups.map(group => group.color ?? null)).toEqual(["#f00", null, null])
    })

    it("can remove the color", () => {
        const tree = makeTree({ 1: [{ id: 10 }] })
        const colored = { groups: [{ ...tree.groups[0], sections: tree.groups[0].sections.map(section => ({ ...section, color: "#f00" })) }] }
        const outcome = syncStateRules(colored, [makeRule(1, { type: "section.hasOpenTasks", sectionId: null }, [{ type: "setColor", color: null }])])
        expect(colors(outcome.tree)).toEqual({ 1: null })
        expect(outcome.touchedSections).toEqual([1])
    })

    it("returns the very tree when every color is already right", () => {
        const tree = makeTree({ 1: [{ id: 10 }], 2: [] })
        const first = syncStateRules(tree, sectionPair())
        const second = syncStateRules(first.tree, sectionPair())
        expect(second.tree).toBe(first.tree)
        expect(second.touchedSections).toEqual([])
        const none = syncStateRules(tree, [])
        expect(none.tree).toBe(tree)
    })

    it("lets the last rule by position win on the same target", () => {
        const tree = makeTree({ 1: [] })
        const a = makeRule(1, { type: "section.noOpenTasks", sectionId: null }, [{ type: "setColor", color: "#aaa" }], { position: 5 })
        const b = makeRule(2, { type: "section.noOpenTasks", sectionId: 1 }, [{ type: "setColor", color: "#bbb" }], { position: 1 })
        expect(colors(syncStateRules(tree, [a, b]).tree)).toEqual({ 1: "#aaa" })
        expect(colors(syncStateRules(tree, [b, { ...a, position: 0 }]).tree)).toEqual({ 1: "#bbb" })
        // same position: the higher id wins
        expect(colors(syncStateRules(tree, [{ ...a, position: 1 }, b]).tree)).toEqual({ 1: "#bbb" })
    })

    it("skips disabled, paused and invalid rules", () => {
        const tree = makeTree({ 1: [] })
        const disabled = makeRule(1, { type: "section.noOpenTasks", sectionId: null }, [...green], { enabled: false })
        const pausedSection = makeRule(2, { type: "section.noOpenTasks", sectionId: 99 }, [...green])
        const pausedGroup = makeRule(3, { type: "group.noOpenTasks", groupId: 99 }, [...green])
        const invalid = makeRule(4, { type: "section.noOpenTasks", sectionId: null }, [{ type: "archiveGroup" }])
        const outcome = syncStateRules(tree, [disabled, pausedSection, pausedGroup, invalid])
        expect(outcome.tree).toBe(tree)
        expect(outcome.touchedSections).toEqual([])
        expect(outcome.touchedGroups).toEqual([])
    })

    it("leaves tasks, order and archive alone, and ignores the event rules", () => {
        const tree = makeTree({ 1: [{ id: 10, completed: true }], 2: [] })
        const event = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        const outcome = syncStateRules(tree, [event, ...sectionPair(2)])
        expect(layout(outcome.tree)).toEqual(layout(tree))
        expect(taskOf(outcome.tree, 10).priority).toBe(false)
        expect(outcome.tree.groups).toHaveLength(1)
    })

    it("is ignored by runAutomations, even when the section is empty or the event is related", () => {
        const tree = makeTree({ 1: [{ id: 10, completed: true }], 2: [] })
        const rules = [...sectionPair(), makeRule(5, { type: "group.noOpenTasks", groupId: null }, [...green])]
        const outcome = runAutomations(tree, rules, completed(10))
        expect(outcome.tree).toBe(tree)
        expect(outcome.applied).toEqual([])
    })
})

describe("direct area of a group (default section)", () => {
    // group 1: direct area 90 [D1, D2], sections 1 [T10, T11], 2 [T20]
    const base = () => withDirectArea(makeTree({ 1: [{ id: 10 }, { id: 11, completed: true }], 2: [{ id: 20 }] }), 1, 90, [{ id: 91 }, { id: 92 }])

    it("moves a completed task into the direct area, at the top or the bottom", () => {
        const bottom = makeRule(1, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 90, at: "bottom" }])
        const { tree } = runAutomations(base(), [bottom], completed(11))
        expect(layout(tree)).toEqual({ 90: [91, 92, 11], 1: [10], 2: [20] })
        expect(taskOf(tree, 11).sectionID).toBe(90)
        const top = makeRule(1, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 90, at: "top" }])
        expect(layout(runAutomations(base(), [top], completed(11)).tree)[90]).toEqual([11, 91, 92])
    })

    it("fires for a task of the direct area when the rule names it, and moves it to a section", () => {
        const input = withDirectArea(makeTree({ 1: [{ id: 10 }], 2: [] }), 1, 90, [{ id: 91, completed: true }, { id: 92 }])
        const rule = makeRule(1, { type: "task.completed", sectionId: 90 }, [{ type: "moveTo", sectionId: 2, at: "bottom" }])
        const { tree, applied } = runAutomations(input, [rule], completed(91))
        expect(applied).toEqual([rule])
        expect(layout(tree)).toEqual({ 90: [92], 1: [10], 2: [91] })
        // The same rule does not fire for a task of a normal section
        const other = withDirectArea(makeTree({ 1: [{ id: 10, completed: true }], 2: [] }), 1, 90, [])
        expect(runAutomations(other, [rule], completed(10)).tree).toBe(other)
    })

    it("a rule on any section also sees the direct area", () => {
        const input = withDirectArea(makeTree({ 1: [] }), 1, 90, [{ id: 91, completed: true }])
        const rule = makeRule(1, { type: "task.completed", sectionId: null }, [{ type: "setPriority", value: true }])
        expect(taskOf(runAutomations(input, [rule], completed(91)).tree, 91).priority).toBe(true)
    })

    it("task.movedInto fires when a task arrives in the direct area, and not for a move inside it", () => {
        const rule = makeRule(1, { type: "task.movedInto", sectionId: 90 }, [{ type: "setPriority", value: true }])
        const moveRule = makeRule(2, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 90, at: "bottom" }])
        const { tree, applied } = runAutomations(base(), [moveRule, rule], completed(11))
        expect(applied).toEqual([moveRule, rule])
        expect(taskOf(tree, 11).priority).toBe(true)
        // Reordering inside the direct area is not an arrival
        const inside = withDirectArea(makeTree({ 1: [] }), 1, 90, [{ id: 91, completed: true }, { id: 92 }])
        const reorder = makeRule(1, { type: "task.completed", sectionId: 90 }, [{ type: "moveTo", sectionId: 90, at: "bottom" }])
        const out = runAutomations(inside, [reorder, makeRule(2, { type: "task.movedInto", sectionId: 90 }, [{ type: "setPriority", value: true }])], completed(91))
        expect(layout(out.tree)[90]).toEqual([92, 91])
        expect(out.applied).toEqual([reorder])
    })

    it("a rule that points to a direct area that no longer exists does nothing", () => {
        const input = base()
        const rule = makeRule(1, { type: "task.completed", sectionId: 1 }, [{ type: "moveTo", sectionId: 777, at: "top" }])
        expect(runAutomations(input, [rule], completed(11)).tree).toBe(input)
    })

    it("group.completed counts the tasks directly in the group", () => {
        const rule = makeRule(1, { type: "group.completed", groupId: 1 }, [{ type: "setColor", color: "#112233" }])
        // Every task of the sections is done but a direct one is open: the group is not completed
        const open = withDirectArea(makeTree({ 1: [{ id: 10, completed: true }] }), 1, 90, [{ id: 91 }])
        expect(allTasksCompleted(open.groups[0])).toBe(false)
        expect(runAutomations(open, [rule], completed(10)).tree).toBe(open)
        const done = withDirectArea(makeTree({ 1: [{ id: 10, completed: true }] }), 1, 90, [{ id: 91, completed: true }])
        expect(allTasksCompleted(done.groups[0])).toBe(true)
        expect(runAutomations(done, [rule], completed(91)).tree.groups[0].color).toBe("#112233")
        // A group whose only tasks are direct counts them too
        expect(allTasksCompleted(withDirectArea(makeTree({ 1: [] }), 1, 90, [{ id: 91, completed: true }]).groups[0])).toBe(true)
    })

    it("state rules: the group sees its direct tasks, 'any section' colors only the visible sections", () => {
        const input = withDirectArea(makeTree({ 1: [{ id: 10, completed: true }] }), 1, 90, [{ id: 91 }])
        const group = makeRule(1, { type: "group.hasOpenTasks", groupId: 1 }, [{ type: "setColor", color: "#aa0000" }])
        const sync = syncStateRules(input, [group])
        expect(sync.touchedGroups).toEqual([1])
        expect(sync.tree.groups[0].color).toBe("#aa0000")

        // The direct area has an open task but no rule names it: it is never colored by an "any section" rule
        const any = makeRule(2, { type: "section.hasOpenTasks", sectionId: null }, [{ type: "setColor", color: "#00aa00" }])
        const synced = syncStateRules(input, [any])
        expect(synced.touchedSections).toEqual([])
        expect(synced.tree.groups[0].defaultSection?.color ?? null).toBeNull()
        // ... but a rule that names it does
        const named = makeRule(3, { type: "section.hasOpenTasks", sectionId: 90 }, [{ type: "setColor", color: "#0000aa" }])
        expect(syncStateRules(input, [named]).tree.groups[0].defaultSection?.color).toBe("#0000aa")
    })
})

describe("tag actions", () => {
    const tagged = () => patchTask(makeTree({ 1: [{ id: 10, completed: true }, { id: 11 }], 2: [] }), 10, { tagIDs: [5] })
    const rule = (actions: AutomationAction[], id = 1) => makeRule(id, { type: "task.completed", sectionId: null }, actions)

    it("adds a tag to the task, once", () => {
        const input = tagged()
        const { tree, applied, touched } = runAutomations(input, [rule([{ type: "addTag", tagId: 6 }])], completed(10))
        expect(taskOf(tree, 10).tagIDs).toEqual([5, 6])
        expect(applied).toHaveLength(1)
        expect(touched).toEqual([10])
        const again = runAutomations(tree, [rule([{ type: "addTag", tagId: 6 }])], completed(10))
        expect(again.tree).toBe(tree)
        expect(again.applied).toEqual([])
    })

    it("removes a tag the task has, and does nothing when it has not", () => {
        const input = tagged()
        expect(taskOf(runAutomations(input, [rule([{ type: "removeTag", tagId: 5 }])], completed(10)).tree, 10).tagIDs).toEqual([])
        const none = runAutomations(input, [rule([{ type: "removeTag", tagId: 9 }])], completed(10))
        expect(none.tree).toBe(input)
    })

    it("skips a rule whose tag no longer exists in the workspace, and checks nothing when the tags are not given", () => {
        const input = tagged()
        const add = rule([{ type: "addTag", tagId: 6 }])
        expect(runAutomations(input, [add], completed(10), new Set([5])).tree).toBe(input)
        expect(taskOf(runAutomations(input, [add], completed(10), new Set([5, 6])).tree, 10).tagIDs).toEqual([5, 6])
        expect(taskOf(runAutomations(input, [add], completed(10)).tree, 10).tagIDs).toEqual([5, 6])
    })
})
