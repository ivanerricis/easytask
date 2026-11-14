import i18n from "@/i18n"
import { PALETTE_COLORS } from "@/lib/colors"
import { triggerSubject, type Automation, type AutomationAction, type AutomationActionType, type AutomationSubject, type AutomationTrigger, type AutomationTriggerType } from "./types"

/** The i18n key of every trigger type (the keys cannot contain the dot of the type). */
const TRIGGER_KEYS = {
    "task.completed": "taskCompleted",
    "task.reopened": "taskReopened",
    "task.created": "taskCreated",
    "task.movedInto": "taskMovedInto",
    "subtasks.completed": "subtasksCompleted",
    "group.completed": "groupCompleted",
    "section.noOpenTasks": "sectionNoOpenTasks",
    "section.hasOpenTasks": "sectionHasOpenTasks",
    "group.noOpenTasks": "groupNoOpenTasks",
    "group.hasOpenTasks": "groupHasOpenTasks",
} as const satisfies Record<AutomationTriggerType, string>

export const triggerLabel = (type: AutomationTriggerType) => i18n.t(`automations.triggers.${TRIGGER_KEYS[type]}`)
export const actionLabel = (type: AutomationActionType) => i18n.t(`automations.actions.${type}`)

/**
 * What a section of a rule is called: its title, or `{ group }` (the label of the group) for the direct area of a group, which
 * is the hidden default section and has no title of its own.
 */
export type SectionName = string | { group: string }

/** Name of a section of the note, undefined when it no longer exists. */
type SectionTitleOf = (sectionId: number) => SectionName | undefined

/** Label of a group of the note (its name or "Group N"), undefined when it no longer exists. */
type GroupLabelOf = (groupId: number) => string | undefined

const groupName = (labelOf: GroupLabelOf | undefined, id: number) => labelOf?.(id) ?? i18n.t("automations.describe.missingGroup")

/** The section as a plain name; the direct area of a group reads "Group, direct tasks". */
const sectionName = (titleOf: SectionTitleOf, id: number) => {
    const name = titleOf(id)
    if (name === undefined) return i18n.t("automations.describe.missingSection")
    return typeof name === "string" ? name : i18n.t("automations.directTasks", { group: name.group })
}

/** The group label when the section is the direct area of a group. */
const directGroup = (titleOf: SectionTitleOf, id: number) => {
    const name = titleOf(id)
    return typeof name === "object" ? name.group : undefined
}

function describeTrigger(trigger: AutomationTrigger, titleOf: SectionTitleOf, groupLabelOf?: GroupLabelOf): string {
    if ("groupId" in trigger)
        return trigger.groupId === null ? triggerLabel(trigger.type) : i18n.t(`automations.describe.${TRIGGER_KEYS[trigger.type]}` as "automations.describe.groupCompleted", { group: groupName(groupLabelOf, trigger.groupId) })
    if (trigger.type === "section.noOpenTasks" || trigger.type === "section.hasOpenTasks")
        return trigger.sectionId === null ? triggerLabel(trigger.type) : i18n.t(`automations.describe.${TRIGGER_KEYS[trigger.type]}` as "automations.describe.sectionNoOpenTasks", { section: sectionName(titleOf, trigger.sectionId) })
    const text = triggerLabel(trigger.type)
    // "arrives in the section" already names the section in its label
    const direct = trigger.sectionId === null ? undefined : directGroup(titleOf, trigger.sectionId)
    if (trigger.type === "task.movedInto")
        return direct !== undefined ? i18n.t("automations.describe.movedIntoDirect", { group: direct }) : `${text} "${sectionName(titleOf, trigger.sectionId)}"`
    if (trigger.sectionId === null) return text
    return direct !== undefined
        ? i18n.t("automations.describe.inDirect", { trigger: text, group: direct })
        : i18n.t("automations.describe.inSection", { trigger: text, section: sectionName(titleOf, trigger.sectionId) })
}

/** The translated name of a color: the palette ones have their own, any other is "custom color". */
export function colorName(color: string): string {
    const index = (PALETTE_COLORS as readonly string[]).indexOf(color.toLowerCase())
    return i18n.t(index >= 0 ? (`common.colors.c${index + 1}` as "common.colors.c1") : "common.colors.custom")
}

/** A natural list in the current language ("A, B e C"). */
const joinList = (items: string[]) => new Intl.ListFormat(i18n.language, { style: "long", type: "conjunction" }).format(items)

/** Name of a tag of the workspace, undefined when it no longer exists. */
type TagNameOf = (tagId: number) => string | undefined

function describeAction(action: AutomationAction, titleOf: SectionTitleOf, subject: AutomationSubject, tagNameOf?: TagNameOf): string {
    switch (action.type) {
        case "moveTo": {
            const direct = directGroup(titleOf, action.sectionId)
            if (direct !== undefined) return i18n.t(action.at === "top" ? "automations.describe.moveTopDirect" : "automations.describe.moveBottomDirect", { group: direct })
            return i18n.t(action.at === "top" ? "automations.describe.moveTop" : "automations.describe.moveBottom", { section: sectionName(titleOf, action.sectionId) })
        }
        case "setCompleted": return i18n.t(action.value ? "automations.describe.complete" : "automations.describe.reopen")
        case "setPriority": return i18n.t(action.value ? "automations.describe.addPriority" : "automations.describe.removePriority")
        case "setColor": {
            const suffix = subject === "group" ? "Group" : subject === "section" ? "Section" : ""
            return i18n.t(`automations.describe.${action.color ? "setColor" : "removeColor"}${suffix}`, { color: action.color ? colorName(action.color) : "" })
        }
        case "addTag":
        case "removeTag":
            return i18n.t(action.type === "addTag" ? "automations.describe.addTag" : "automations.describe.removeTag", { tag: tagNameOf?.(action.tagId) ?? i18n.t("automations.describe.missingTag") })
        case "completeSubtasks": return i18n.t("automations.describe.completeSubtasks")
        case "moveGroup": return i18n.t(action.at === "top" ? "automations.describe.moveGroupTop" : "automations.describe.moveGroupBottom")
        case "archiveGroup": return i18n.t("automations.describe.archiveGroup")
    }
}

/**
 * The rule as a sentence ("When a task is completed in "Doing", move to the bottom of "Done"").
 * @param groupLabelOf Resolves the group of a group rule; without it the group is shown as deleted.
 * @param tagNameOf Resolves the tag of a tag action; without it the tag is shown as deleted.
 * @category Automations
 */
export function describeAutomation(rule: Pick<Automation, "trigger" | "actions">, titleOf: SectionTitleOf, groupLabelOf?: GroupLabelOf, tagNameOf?: TagNameOf): string {
    return i18n.t("automations.describe.rule", {
        trigger: describeTrigger(rule.trigger, titleOf, groupLabelOf),
        actions: joinList(rule.actions.map(action => describeAction(action, titleOf, triggerSubject(rule.trigger.type), tagNameOf))),
    })
}

/**
 * The name shown for a rule: its own name, or its description.
 * @category Automations
 */
export const automationName = (rule: Pick<Automation, "name" | "trigger" | "actions">, titleOf: SectionTitleOf, groupLabelOf?: GroupLabelOf, tagNameOf?: TagNameOf) =>
    rule.name ?? describeAutomation(rule, titleOf, groupLabelOf, tagNameOf)
