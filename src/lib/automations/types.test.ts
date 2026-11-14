import { describe, expect, it } from "vitest"
import {
    ACTIONS_BY_SUBJECT, actionsForTrigger, isAutomationAction, isAutomationTrigger, isGroupTrigger, isStateTrigger, isValidRule, referencedGroups, referencedSections, TRIGGER_TYPES, triggerSubject,
} from "./types"

describe("isAutomationTrigger", () => {
    it("accepts every trigger type with a section or null", () => {
        for (const type of TRIGGER_TYPES.filter(t => t !== "task.movedInto" && !isGroupTrigger(t))) {
            expect(isAutomationTrigger({ type, sectionId: null })).toBe(true)
            expect(isAutomationTrigger({ type, sectionId: 3 })).toBe(true)
        }
    })

    it("movedInto needs a section", () => {
        expect(isAutomationTrigger({ type: "task.movedInto", sectionId: 2 })).toBe(true)
        expect(isAutomationTrigger({ type: "task.movedInto", sectionId: null })).toBe(false)
    })

    it("the group triggers take a group or null, not a section", () => {
        for (const type of ["group.completed", "group.noOpenTasks", "group.hasOpenTasks"]) {
            expect(isAutomationTrigger({ type, groupId: null })).toBe(true)
            expect(isAutomationTrigger({ type, groupId: 4 })).toBe(true)
            for (const value of [{ type }, { type, sectionId: null }, { type, groupId: "1" }, { type, groupId: 1.5 }])
                expect(isAutomationTrigger(value)).toBe(false)
        }
    })

    it("the section state triggers take a section or null, not a group", () => {
        for (const type of ["section.noOpenTasks", "section.hasOpenTasks"]) {
            expect(isAutomationTrigger({ type, sectionId: null })).toBe(true)
            expect(isAutomationTrigger({ type, sectionId: 4 })).toBe(true)
            for (const value of [{ type }, { type, groupId: null }, { type, sectionId: "1" }])
                expect(isAutomationTrigger(value)).toBe(false)
        }
    })

    it("rejects anything else", () => {
        for (const value of [null, undefined, 3, "x", [], {}, { type: "nope", sectionId: null },
            { type: "task.completed" }, { type: "task.completed", sectionId: "1" }, { type: "task.completed", sectionId: 1.5 }])
            expect(isAutomationTrigger(value)).toBe(false)
    })
})

describe("isAutomationAction", () => {
    it("accepts valid actions", () => {
        for (const action of [
            { type: "moveTo", sectionId: 1, at: "top" }, { type: "moveTo", sectionId: 1, at: "bottom" },
            { type: "setCompleted", value: false }, { type: "setPriority", value: true },
            { type: "setColor", color: null }, { type: "setColor", color: "#fff" }, { type: "completeSubtasks" },
            { type: "moveGroup", at: "top" }, { type: "moveGroup", at: "bottom" }, { type: "archiveGroup" },
        ]) expect(isAutomationAction(action)).toBe(true)
    })

    it("rejects invalid ones", () => {
        for (const value of [null, 1, "x", {}, { type: "boom" },
            { type: "moveTo", sectionId: null, at: "top" }, { type: "moveTo", sectionId: 1, at: "middle" }, { type: "moveTo", sectionId: 1 },
            { type: "setCompleted", value: "yes" }, { type: "setPriority" },
            { type: "setColor", color: "" }, { type: "setColor", color: 3 }, { type: "setColor" },
            { type: "moveGroup" }, { type: "moveGroup", at: "middle" }])
            expect(isAutomationAction(value)).toBe(false)
    })
})

describe("referencedSections", () => {
    it("collects the trigger section and the move targets without duplicates", () => {
        expect(referencedSections({
            trigger: { type: "task.completed", sectionId: 1 },
            actions: [{ type: "moveTo", sectionId: 2, at: "top" }, { type: "moveTo", sectionId: 1, at: "bottom" }, { type: "setPriority", value: true }],
        }).sort()).toEqual([1, 2])
    })

    it("ignores a null trigger section and non-move actions", () => {
        expect(referencedSections({ trigger: { type: "task.created", sectionId: null }, actions: [{ type: "completeSubtasks" }] })).toEqual([])
    })
})

it("a group trigger refers to no section", () => {
    expect(referencedSections({ trigger: { type: "group.completed", groupId: 3 }, actions: [{ type: "moveGroup", at: "top" }] })).toEqual([])
})

it("the section state triggers refer to their section, the group ones to their group", () => {
    expect(referencedSections({ trigger: { type: "section.noOpenTasks", sectionId: 4 }, actions: [] })).toEqual([4])
    expect(referencedSections({ trigger: { type: "section.hasOpenTasks", sectionId: null }, actions: [] })).toEqual([])
    expect(referencedSections({ trigger: { type: "group.noOpenTasks", groupId: 4 }, actions: [] })).toEqual([])
    expect(referencedGroups({ trigger: { type: "group.noOpenTasks", groupId: 4 } })).toEqual([4])
    expect(referencedGroups({ trigger: { type: "group.hasOpenTasks", groupId: null } })).toEqual([])
    expect(referencedGroups({ trigger: { type: "section.hasOpenTasks", sectionId: 4 } })).toEqual([])
})

describe("referencedGroups", () => {
    it("is the group of a group trigger", () => {
        expect(referencedGroups({ trigger: { type: "group.completed", groupId: 3 } })).toEqual([3])
    })

    it("is empty for any group and for task triggers", () => {
        expect(referencedGroups({ trigger: { type: "group.completed", groupId: null } })).toEqual([])
        expect(referencedGroups({ trigger: { type: "task.completed", sectionId: 1 } })).toEqual([])
    })
})

describe("subjects", () => {
    it("maps every trigger to its subject", () => {
        for (const type of TRIGGER_TYPES) {
            const expected = type.startsWith("section.") ? "section" : type.startsWith("group.") ? "group" : "task"
            expect(triggerSubject(type)).toBe(expected)
        }
    })

    it("tells the state and the group triggers", () => {
        expect(TRIGGER_TYPES.filter(isStateTrigger)).toEqual(["section.noOpenTasks", "section.hasOpenTasks", "group.noOpenTasks", "group.hasOpenTasks"])
        expect(TRIGGER_TYPES.filter(isGroupTrigger)).toEqual(["group.completed", "group.noOpenTasks", "group.hasOpenTasks"])
    })

    it("every action type belongs to a subject", () => {
        const listed = [...ACTIONS_BY_SUBJECT.task, ...ACTIONS_BY_SUBJECT.group]
        expect(new Set(listed)).toEqual(new Set(["moveTo", "setCompleted", "setPriority", "setColor", "addTag", "removeTag", "completeSubtasks", "moveGroup", "archiveGroup"]))
        expect(ACTIONS_BY_SUBJECT.task).toEqual(["moveTo", "setCompleted", "setPriority", "setColor", "addTag", "removeTag", "completeSubtasks"])
        expect(ACTIONS_BY_SUBJECT.group).toEqual(["setColor", "moveGroup", "archiveGroup"])
        expect(ACTIONS_BY_SUBJECT.section).toEqual(["setColor"])
    })

    it("the state triggers only allow the color, the others their subject's actions", () => {
        for (const type of TRIGGER_TYPES)
            expect(actionsForTrigger(type)).toEqual(isStateTrigger(type) ? ["setColor"] : ACTIONS_BY_SUBJECT[triggerSubject(type)])
    })
})

describe("isValidRule", () => {
    it("accepts the actions of the subject, setColor for both, and an empty list", () => {
        expect(isValidRule({ type: "task.completed", sectionId: null }, [{ type: "setColor", color: null }, { type: "completeSubtasks" }])).toBe(true)
        expect(isValidRule({ type: "group.completed", groupId: null }, [{ type: "setColor", color: "#fff" }, { type: "moveGroup", at: "top" }, { type: "archiveGroup" }])).toBe(true)
        expect(isValidRule({ type: "group.completed", groupId: null }, [])).toBe(true)
    })

    it("rejects the actions of the other subject", () => {
        expect(isValidRule({ type: "task.created", sectionId: null }, [{ type: "archiveGroup" }])).toBe(false)
        expect(isValidRule({ type: "subtasks.completed", sectionId: null }, [{ type: "moveGroup", at: "top" }])).toBe(false)
        expect(isValidRule({ type: "group.completed", groupId: 1 }, [{ type: "archiveGroup" }, { type: "setPriority", value: true }])).toBe(false)
        expect(isValidRule({ type: "group.completed", groupId: 1 }, [{ type: "moveTo", sectionId: 1, at: "top" }])).toBe(false)
    })

    it("the state triggers only accept setColor", () => {
        for (const trigger of [
            { type: "section.noOpenTasks", sectionId: null }, { type: "section.hasOpenTasks", sectionId: 1 },
            { type: "group.noOpenTasks", groupId: null }, { type: "group.hasOpenTasks", groupId: 1 },
        ] as const) {
            expect(isValidRule(trigger, [{ type: "setColor", color: "#0f0" }, { type: "setColor", color: null }])).toBe(true)
            expect(isValidRule(trigger, [{ type: "archiveGroup" }])).toBe(false)
            expect(isValidRule(trigger, [{ type: "moveGroup", at: "top" }])).toBe(false)
            expect(isValidRule(trigger, [{ type: "setPriority", value: true }])).toBe(false)
        }
    })
})
