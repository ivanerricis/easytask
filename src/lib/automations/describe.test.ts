import { describe, expect, it } from "vitest"
import { actionLabel, automationName, describeAutomation, triggerLabel } from "./describe"
import { ACTIONS_BY_SUBJECT, TRIGGER_TYPES } from "./types"

const titleOf = (id: number) => id === 1 ? "Doing" : id === 2 ? "Done" : undefined
const groupLabelOf = (id: number) => id === 7 ? "Sprint 3" : undefined

describe("labels", () => {
    it("every trigger and action type has a label", () => {
        for (const type of TRIGGER_TYPES) expect(triggerLabel(type)).not.toMatch(/^automations\./)
        for (const type of new Set(Object.values(ACTIONS_BY_SUBJECT).flat())) expect(actionLabel(type)).not.toMatch(/^automations\./)
    })
})

describe("describeAutomation", () => {
    it("describes a task rule", () => {
        expect(describeAutomation({
            trigger: { type: "task.completed", sectionId: 1 },
            actions: [{ type: "moveTo", sectionId: 2, at: "bottom" }, { type: "setColor", color: "#fff" }],
        }, titleOf)).toBe("Quando un task viene completato in \"Doing\", sposta in fondo a \"Done\" e colora di Colore personalizzato")
    })

    it("names a section that no longer exists", () => {
        expect(describeAutomation({ trigger: { type: "task.movedInto", sectionId: 9 }, actions: [] }, titleOf)).toContain("(sezione eliminata)")
    })

    it("describes a group rule with a specific group", () => {
        expect(describeAutomation({
            trigger: { type: "group.completed", groupId: 7 },
            actions: [{ type: "setColor", color: "#fff" }, { type: "moveGroup", at: "bottom" }, { type: "archiveGroup" }],
        }, titleOf, groupLabelOf)).toBe(
            "Quando tutti i task del gruppo \"Sprint 3\" sono completati, colora il gruppo di Colore personalizzato, sposta il gruppo in fondo alla nota e archivia il gruppo")
    })

    it("describes a group rule for any group", () => {
        expect(describeAutomation({
            trigger: { type: "group.completed", groupId: null },
            actions: [{ type: "setColor", color: null }, { type: "moveGroup", at: "top" }],
        }, titleOf, groupLabelOf)).toBe(
            "Quando tutti i task di un gruppo sono completati, rimuovi il colore dal gruppo e sposta il gruppo in cima alla nota")
    })

    it("describes the state rules of a section", () => {
        expect(describeAutomation({
            trigger: { type: "section.noOpenTasks", sectionId: null }, actions: [{ type: "setColor", color: "#fff" }],
        }, titleOf)).toBe("Quando una sezione non ha task da completare, colora la sezione di Colore personalizzato")
        expect(describeAutomation({
            trigger: { type: "section.hasOpenTasks", sectionId: 1 }, actions: [{ type: "setColor", color: null }],
        }, titleOf)).toBe("Quando la sezione \"Doing\" ha almeno un task da completare, rimuovi il colore dalla sezione")
        expect(describeAutomation({ trigger: { type: "section.noOpenTasks", sectionId: 9 }, actions: [] }, titleOf)).toContain("(sezione eliminata)")
    })

    it("describes the state rules of a group", () => {
        expect(describeAutomation({
            trigger: { type: "group.noOpenTasks", groupId: null }, actions: [{ type: "setColor", color: "#fff" }],
        }, titleOf, groupLabelOf)).toBe("Quando un gruppo non ha task da completare, colora il gruppo di Colore personalizzato")
        expect(describeAutomation({
            trigger: { type: "group.hasOpenTasks", groupId: 7 }, actions: [{ type: "setColor", color: null }],
        }, titleOf, groupLabelOf)).toBe("Quando il gruppo \"Sprint 3\" ha almeno un task da completare, rimuovi il colore dal gruppo")
        expect(describeAutomation({ trigger: { type: "group.noOpenTasks", groupId: 3 }, actions: [] }, titleOf)).toContain("(gruppo eliminato)")
    })

    it("shows a missing group, also without a resolver", () => {
        const rule = { trigger: { type: "group.completed", groupId: 3 } as const, actions: [{ type: "archiveGroup" } as const] }
        expect(describeAutomation(rule, titleOf, groupLabelOf)).toContain("(gruppo eliminato)")
        expect(describeAutomation(rule, titleOf)).toContain("(gruppo eliminato)")
    })
})

describe("automationName", () => {
    it("prefers the own name", () => {
        const rule = { name: "Fine sprint", trigger: { type: "group.completed", groupId: null } as const, actions: [] }
        expect(automationName(rule, titleOf)).toBe("Fine sprint")
        expect(automationName({ ...rule, name: null }, titleOf, groupLabelOf)).toBe(describeAutomation(rule, titleOf, groupLabelOf))
    })
})

describe("direct area of a group", () => {
    const named = (id: number) => id === 1 ? { group: "Sprint 3" } : id === 2 ? "Done" : undefined

    it("describes a move into the direct tasks of a group", () => {
        expect(describeAutomation({
            trigger: { type: "task.completed", sectionId: 2 },
            actions: [{ type: "moveTo", sectionId: 1, at: "bottom" }, { type: "moveTo", sectionId: 1, at: "top" }],
        }, named)).toBe("Quando un task viene completato in \"Done\", sposta in fondo ai task diretti di \"Sprint 3\" e sposta in cima ai task diretti di \"Sprint 3\"")
    })

    it("describes a trigger on the direct tasks of a group", () => {
        expect(describeAutomation({ trigger: { type: "task.created", sectionId: 1 }, actions: [{ type: "setPriority", value: true }] }, named))
            .toBe("Quando un task viene creato nei task diretti di \"Sprint 3\", aggiungi la priorità")
        expect(describeAutomation({ trigger: { type: "task.movedInto", sectionId: 1 }, actions: [{ type: "setCompleted", value: true }] }, named))
            .toBe("Quando un task arriva nei task diretti di \"Sprint 3\", segna come completato")
    })

    it("names the direct area like the pickers do where there is no special sentence", () => {
        expect(describeAutomation({ trigger: { type: "section.noOpenTasks", sectionId: 1 }, actions: [{ type: "setColor", color: null }] }, named))
            .toContain("\"Sprint 3, task diretti\"")
    })

    it("still reports a deleted section", () => {
        expect(describeAutomation({ trigger: { type: "task.movedInto", sectionId: 9 }, actions: [] }, named)).toContain("(sezione eliminata)")
    })
})
