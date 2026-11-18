import { describe, expect, it } from "vitest"
import { PROGRESS_COLORS, getGroupProgress, resolveGroupColor } from "./group-progress"
import { PALETTE_COLORS } from "@/lib/colors"
import { makeDefaultSection, makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"

describe("getGroupProgress", () => {
    it("is empty without tasks", () => {
        expect(getGroupProgress(makeGroup())).toEqual({ done: 0, total: 0, percent: 0 })
        expect(getGroupProgress(makeGroup({ sections: [makeSection()] })).total).toBe(0)
    })

    it("counts nested subtasks across sections", () => {
        const group = makeGroup({
            sections: [
                makeSection({
                    tasks: [
                        makeTask({
                            id: 1,
                            completed: true,
                            subtasks: [
                                makeTask({ id: 2, completed: false, subtasks: [makeTask({ id: 3, completed: true })] }),
                            ],
                        }),
                    ],
                }),
                makeSection({ id: 2, tasks: [makeTask({ id: 4, completed: false })] }),
            ],
        })
        expect(getGroupProgress(group)).toEqual({ done: 2, total: 4, percent: 50 })
    })

    it("is 100% when everything is done", () => {
        const group = makeGroup({
            sections: [makeSection({ tasks: [makeTask({ completed: true, subtasks: [makeTask({ id: 2, completed: true })] })] })],
        })
        expect(getGroupProgress(group)).toEqual({ done: 2, total: 2, percent: 100 })
    })
})

describe("getGroupProgress with direct tasks", () => {
    it("counts the tasks directly in the group together with those of its sections", () => {
        const group = makeGroup({
            defaultSection: makeDefaultSection({ id: 9, tasks: [makeTask({ id: 1, completed: true }), makeTask({ id: 2 })] }),
            sections: [makeSection({ id: 2, tasks: [makeTask({ id: 3, completed: true })] })],
        })
        expect(getGroupProgress(group)).toEqual({ done: 2, total: 3, percent: (2 / 3) * 100 })
        expect(getGroupProgress(makeGroup({ defaultSection: makeDefaultSection({ tasks: [makeTask()] }) })).total).toBe(1)
    })
})

describe("resolveGroupColor", () => {
    const withTasks = (...done: boolean[]) => makeGroup({ color: "progress", sections: [makeSection({ tasks: done.map((completed, index) => makeTask({ id: index + 1, completed })) })] })

    it("gives a fixed color or none as it is", () => {
        expect(resolveGroupColor(makeGroup({ color: "#112233" }))).toBe("#112233")
        expect(resolveGroupColor(makeGroup({ color: null }))).toBeNull()
        expect(resolveGroupColor(makeGroup({ color: undefined }))).toBeNull()
    })

    it("is green without tasks or with all of them done", () => {
        expect(resolveGroupColor(makeGroup({ color: "progress" }))).toBe(PROGRESS_COLORS.done)
        expect(resolveGroupColor(withTasks(true, true))).toBe(PROGRESS_COLORS.done)
    })

    it("is yellow with at least one task done and red with none", () => {
        expect(resolveGroupColor(withTasks(true, false))).toBe(PROGRESS_COLORS.started)
        expect(resolveGroupColor(withTasks(false, false))).toBe(PROGRESS_COLORS.none)
    })

    it("counts the subtasks like the progress of the group", () => {
        const group = makeGroup({ color: "progress", sections: [makeSection({ tasks: [makeTask({ id: 1, completed: true, subtasks: [makeTask({ id: 2, completed: false })] })] })] })
        expect(resolveGroupColor(group)).toBe(PROGRESS_COLORS.started)
    })

    it("uses the progress it is given", () => {
        expect(resolveGroupColor(makeGroup({ color: "progress" }), { done: 0, total: 3 })).toBe(PROGRESS_COLORS.none)
    })

    it("always picks colors of the palette of the groups", () => {
        for (const color of Object.values(PROGRESS_COLORS)) expect(PALETTE_COLORS).toContain(color)
    })
})
