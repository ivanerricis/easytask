import { describe, expect, it } from "vitest"
import type { NoteTemplateContent } from "@/types/template"
import { buildGroupIndex, buildSectionIndex, isPortableAutomation, sectionOffsets, toPortable } from "./portable"

const section = (title: string) => ({ title, color: null, position: 0, tasks: [] })
const content: NoteTemplateContent = {
    version: 1,
    groups: [
        { name: "A", color: null, position: 0, sections: [section("s0"), section("s1")] },
        { name: null, color: null, position: 1, sections: [section("s2")] },
    ],
}

describe("buildSectionIndex", () => {
    it("maps the source ids to positions in content order", () => {
        const index = buildSectionIndex(content, [10, 11, 20])
        expect(index.get(10)).toEqual({ group: 0, section: 0 })
        expect(index.get(11)).toEqual({ group: 0, section: 1 })
        expect(index.get(20)).toEqual({ group: 1, section: 0 })
        expect(index.size).toBe(3)
    })
})

describe("sectionOffsets", () => {
    it("gives the flat position of the first section of every group", () => {
        expect(sectionOffsets(content)).toEqual([0, 2])
    })
})

describe("toPortable", () => {
    const index = buildSectionIndex(content, [10, 11, 20])

    it("replaces the section ids with positions", () => {
        expect(toPortable({
            name: "n", enabled: false,
            trigger: { type: "task.movedInto", sectionId: 11 },
            actions: [{ type: "setColor", color: "#fff" }, { type: "moveTo", sectionId: 20, at: "bottom" }],
        }, index)).toEqual({
            name: "n", enabled: false,
            trigger: { type: "task.movedInto", sectionId: { group: 0, section: 1 } },
            actions: [{ type: "setColor", color: "#fff" }, { type: "moveTo", sectionId: { group: 1, section: 0 }, at: "bottom" }],
        })
    })

    it("keeps a null trigger section", () => {
        expect(toPortable({ name: null, enabled: true, trigger: { type: "task.created", sectionId: null }, actions: [] }, index))
            .toEqual({ name: null, enabled: true, trigger: { type: "task.created", sectionId: null }, actions: [] })
    })

    it("returns null when a referenced section is not in the content", () => {
        expect(toPortable({ name: null, enabled: true, trigger: { type: "task.completed", sectionId: 99 }, actions: [] }, index)).toBeNull()
        expect(toPortable({
            name: null, enabled: true, trigger: { type: "task.completed", sectionId: null },
            actions: [{ type: "moveTo", sectionId: 99, at: "top" }],
        }, index)).toBeNull()
    })
})

describe("isPortableAutomation", () => {
    const ok = {
        name: null, enabled: true,
        trigger: { type: "task.completed", sectionId: { group: 1, section: 0 } },
        actions: [{ type: "moveTo", sectionId: { group: 0, section: 1 }, at: "top" }, { type: "completeSubtasks" }],
    }

    it("accepts a valid rule", () => {
        expect(isPortableAutomation(ok, content)).toBe(true)
        expect(isPortableAutomation({ ...ok, trigger: { type: "task.created", sectionId: null }, actions: [] }, content)).toBe(true)
    })

    it("rejects invalid structures and out of bounds positions", () => {
        const invalid: unknown[] = [
            null, 3, {}, { ...ok, enabled: 1 }, { ...ok, name: undefined }, { ...ok, actions: {} },
            { ...ok, trigger: { type: "task.movedInto", sectionId: null } },
            { ...ok, trigger: { type: "bogus", sectionId: null } },
            { ...ok, trigger: { type: "task.completed", sectionId: { group: 2, section: 0 } } },
            { ...ok, trigger: { type: "task.completed", sectionId: { group: 0, section: 2 } } },
            { ...ok, trigger: { type: "task.completed", sectionId: { group: -1, section: 0 } } },
            { ...ok, trigger: { type: "task.completed", sectionId: { group: 0.5, section: 0 } } },
            { ...ok, trigger: { type: "task.completed", sectionId: 3 } },
            { ...ok, actions: [{ type: "moveTo", sectionId: 3, at: "top" }] },
            { ...ok, actions: [{ type: "moveTo", sectionId: { group: 0, section: 5 }, at: "top" }] },
            { ...ok, actions: [{ type: "moveTo", sectionId: { group: 0, section: 0 }, at: "middle" }] },
            { ...ok, actions: [{ type: "setCompleted", value: "x" }] },
        ]
        for (const value of invalid) expect(isPortableAutomation(value, content)).toBe(false)
    })
})

describe("buildGroupIndex", () => {
    it("maps the source group ids to their index in the content", () => {
        const index = buildGroupIndex(content, [5, 8])
        expect(index.get(5)).toBe(0)
        expect(index.get(8)).toBe(1)
        expect(index.size).toBe(2)
    })

    it("ignores ids missing for a group", () => {
        expect(buildGroupIndex(content, [5]).size).toBe(1)
    })
})

describe("toPortable with group rules", () => {
    const sections = buildSectionIndex(content, [10, 11, 20])
    const groups = buildGroupIndex(content, [5, 8])
    const rule = (groupId: number | null) => ({
        name: null, enabled: true,
        trigger: { type: "group.completed" as const, groupId },
        actions: [{ type: "setColor" as const, color: "#fff" }, { type: "moveGroup" as const, at: "bottom" as const }, { type: "archiveGroup" as const }],
    })

    it("replaces the group id with its index in the content", () => {
        expect(toPortable(rule(8), sections, groups)).toEqual({ ...rule(8), trigger: { type: "group.completed", groupId: 1 } })
    })

    it("keeps a null group", () => {
        expect(toPortable(rule(null), sections, groups)).toEqual(rule(null))
        expect(toPortable(rule(null), sections)).toEqual(rule(null))
    })

    it("returns null when the group is not in the content or no group index is given", () => {
        expect(toPortable(rule(99), sections, groups)).toBeNull()
        expect(toPortable(rule(5), sections)).toBeNull()
    })
})

describe("isPortableAutomation with group rules", () => {
    const ok = {
        name: null, enabled: true,
        trigger: { type: "group.completed", groupId: 1 },
        actions: [{ type: "setColor", color: null }, { type: "moveGroup", at: "top" }, { type: "archiveGroup" }],
    }

    it("accepts a group index in the content, or null", () => {
        expect(isPortableAutomation(ok, content)).toBe(true)
        expect(isPortableAutomation({ ...ok, trigger: { type: "group.completed", groupId: 0 } }, content)).toBe(true)
        expect(isPortableAutomation({ ...ok, trigger: { type: "group.completed", groupId: null } }, content)).toBe(true)
    })

    it("rejects an invalid group index", () => {
        for (const groupId of [2, -1, 0.5, "0", undefined, { group: 0, section: 0 }])
            expect(isPortableAutomation({ ...ok, trigger: { type: "group.completed", groupId } }, content)).toBe(false)
        expect(isPortableAutomation({ ...ok, trigger: { type: "group.completed", sectionId: null } }, content)).toBe(false)
    })

    it("rejects actions of the wrong subject, either way", () => {
        expect(isPortableAutomation({ ...ok, actions: [{ type: "setPriority", value: true }] }, content)).toBe(false)
        expect(isPortableAutomation({ ...ok, actions: [{ type: "moveTo", sectionId: { group: 0, section: 0 }, at: "top" }] }, content)).toBe(false)
        expect(isPortableAutomation({
            name: null, enabled: true, trigger: { type: "task.completed", sectionId: null }, actions: [{ type: "archiveGroup" }],
        }, content)).toBe(false)
        expect(isPortableAutomation({ ...ok, actions: [{ type: "moveGroup", at: "middle" }] }, content)).toBe(false)
    })
})

describe("portable state rules", () => {
    const sections = buildSectionIndex(content, [10, 11, 20])
    const groups = buildGroupIndex(content, [5, 8])
    const colorRule = [{ type: "setColor" as const, color: "#0f0" }]

    it("maps the group state triggers like group.completed", () => {
        for (const type of ["group.noOpenTasks", "group.hasOpenTasks"] as const) {
            const rule = (groupId: number | null) => ({ name: null, enabled: true, trigger: { type, groupId }, actions: colorRule })
            expect(toPortable(rule(8), sections, groups)).toEqual(rule(1))
            expect(toPortable(rule(null), sections, groups)).toEqual(rule(null))
            expect(toPortable(rule(99), sections, groups)).toBeNull()
            expect(isPortableAutomation(rule(1), content)).toBe(true)
            expect(isPortableAutomation(rule(2), content)).toBe(false)
        }
    })

    it("maps the section state triggers like the section ones, null allowed", () => {
        for (const type of ["section.noOpenTasks", "section.hasOpenTasks"] as const) {
            const rule = (sectionId: unknown) => ({ name: null, enabled: true, trigger: { type, sectionId }, actions: colorRule })
            expect(toPortable(rule(11) as never, sections, groups)).toEqual(rule({ group: 0, section: 1 }))
            expect(toPortable(rule(null) as never, sections, groups)).toEqual(rule(null))
            expect(toPortable(rule(99) as never, sections, groups)).toBeNull()
            expect(isPortableAutomation(rule({ group: 1, section: 0 }), content)).toBe(true)
            expect(isPortableAutomation(rule(null), content)).toBe(true)
            expect(isPortableAutomation(rule({ group: 1, section: 1 }), content)).toBe(false)
        }
    })

    it("rejects a state rule with another action", () => {
        const trigger = { type: "section.noOpenTasks", sectionId: null }
        expect(isPortableAutomation({ name: null, enabled: true, trigger, actions: [{ type: "setPriority", value: true }] }, content)).toBe(false)
        expect(isPortableAutomation({ name: null, enabled: true, trigger: { type: "group.noOpenTasks", groupId: null }, actions: [{ type: "archiveGroup" }] }, content)).toBe(false)
    })
})

describe("direct area of a group", () => {
    const direct = buildSectionIndex(content, [10, 11, 20], [100, 200])

    it("maps the default sections to the direct area of their group", () => {
        expect(direct.get(100)).toEqual({ group: 0, direct: true })
        expect(direct.get(200)).toEqual({ group: 1, direct: true })
        expect(direct.get(11)).toEqual({ group: 0, section: 1 })
        expect(direct.size).toBe(5)
        // A group without a default section is simply left out
        expect(buildSectionIndex(content, [10, 11, 20], [null, 200]).size).toBe(4)
    })

    it("turns the ids of a rule into direct references, in the trigger and in the actions", () => {
        expect(toPortable({
            name: null, enabled: true,
            trigger: { type: "task.movedInto", sectionId: 200 },
            actions: [{ type: "moveTo", sectionId: 100, at: "top" }],
        }, direct)).toEqual({
            name: null, enabled: true,
            trigger: { type: "task.movedInto", sectionId: { group: 1, direct: true } },
            actions: [{ type: "moveTo", sectionId: { group: 0, direct: true }, at: "top" }],
        })
    })

    it("leaves a reference to the direct area out when the index does not know it", () => {
        const withoutDirect = buildSectionIndex(content, [10, 11, 20])
        expect(toPortable({ name: null, enabled: true, trigger: { type: "task.completed", sectionId: 100 }, actions: [] }, withoutDirect)).toBeNull()
    })

    it("accepts a valid reference and rejects a malformed one", () => {
        const rule = (ref: unknown) => ({
            name: null, enabled: true, trigger: { type: "task.completed", sectionId: ref },
            actions: [{ type: "moveTo", sectionId: ref, at: "bottom" }],
        })
        expect(isPortableAutomation(rule({ group: 1, direct: true }), content)).toBe(true)
        for (const ref of [{ group: 2, direct: true }, { group: 0, direct: false }, { group: 0, direct: 1 }, { group: 0, section: 0, direct: true }, { group: -1, direct: true }, { direct: true }])
            expect(isPortableAutomation(rule(ref), content)).toBe(false)
    })
})

describe("tag actions", () => {
    const index = buildSectionIndex(content, [10, 11, 20])
    const tags = new Map([[3, { name: "Bug", color: "#ff0000" }]])
    const rule = (actions: never[]) => ({ name: null, enabled: true, trigger: { type: "task.completed" as const, sectionId: null }, actions })

    it("names the tag in the portable rule", () => {
        expect(toPortable(rule([{ type: "addTag", tagId: 3 }] as never), index, undefined, tags)?.actions).toEqual([
            { type: "addTag", tag: { name: "Bug", color: "#ff0000" } },
        ])
    })

    it("leaves the rule out when its tag is unknown (or the tags are not given)", () => {
        expect(toPortable(rule([{ type: "removeTag", tagId: 4 }] as never), index, undefined, tags)).toBeNull()
        expect(toPortable(rule([{ type: "removeTag", tagId: 3 }] as never), index)).toBeNull()
    })

    it("validates a portable tag action", () => {
        const portable = (action: unknown) => ({ name: null, enabled: true, trigger: { type: "task.completed", sectionId: null }, actions: [action] })
        expect(isPortableAutomation(portable({ type: "addTag", tag: { name: "Bug", color: null } }), content)).toBe(true)
        expect(isPortableAutomation(portable({ type: "addTag", tag: { name: " ", color: null } }), content)).toBe(false)
        expect(isPortableAutomation(portable({ type: "removeTag", tag: { name: "Bug", color: 3 } }), content)).toBe(false)
        expect(isPortableAutomation(portable({ type: "removeTag" }), content)).toBe(false)
        // A state trigger only has the color
        expect(isPortableAutomation({ ...portable({ type: "addTag", tag: { name: "Bug", color: null } }), trigger: { type: "section.noOpenTasks", sectionId: null } }, content)).toBe(false)
    })
})
