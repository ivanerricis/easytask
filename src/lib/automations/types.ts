/**
 * The automations of a note: "when <trigger>, then <actions>". A rule only sees and changes its own note.
 * The `task.*` triggers concern the top level tasks of a section; `subtasks.completed` concerns a task whose subtasks
 * have just all been completed (at any depth); `group.completed` concerns a group whose tasks are all completed.
 * @category Automations
 */
export type AutomationTrigger =
    /** A task is completed (sectionId null = in any section of the note). */
    | { type: "task.completed", sectionId: number | null }
    /** A completed task is opened again. */
    | { type: "task.reopened", sectionId: number | null }
    /** A task is created. */
    | { type: "task.created", sectionId: number | null }
    /** A task arrives in a section from another one. */
    | { type: "task.movedInto", sectionId: number }
    /** The last open subtask of a task is completed (the actions apply to that task). */
    | { type: "subtasks.completed", sectionId: number | null }
    /** Every task of a group is completed (groupId null = any group of the note). The actions apply to the group. */
    | { type: "group.completed", groupId: number | null }
    /** State (not event) triggers: they hold while the note is in that state, see syncStateRules. */
    | { type: "section.noOpenTasks", sectionId: number | null }
    | { type: "section.hasOpenTasks", sectionId: number | null }
    | { type: "group.noOpenTasks", groupId: number | null }
    | { type: "group.hasOpenTasks", groupId: number | null }

/**
 * What a rule does to the subject of its trigger (a task or a group).
 * @category Automations
 */
export type AutomationAction =
    /** Moves the task (top level only) to a section of the note, first or last. */
    | { type: "moveTo", sectionId: number, at: "top" | "bottom" }
    | { type: "setCompleted", value: boolean }
    | { type: "setPriority", value: boolean }
    /** Colors the task or the group of the rule; null removes the color. */
    | { type: "setColor", color: string | null }
    /** Completes every subtask (at any depth). */
    | { type: "completeSubtasks" }
    /** Moves the group to the top or to the bottom of the note. */
    | { type: "moveGroup", at: "top" | "bottom" }
    /** Archives the group. */
    | { type: "archiveGroup" }

export type AutomationTriggerType = AutomationTrigger["type"]
export type AutomationActionType = AutomationAction["type"]

/**
 * A rule of a note.
 * @category Automations
 */
export type Automation = {
    id: number
    noteId: number
    /** Optional name shown in the list and in the toasts (null = described from the rule). */
    name: string | null
    enabled: boolean
    trigger: AutomationTrigger
    actions: AutomationAction[]
    position: number
}

/** A rule as it is created or edited (the id, note and position belong to the database). */
export type AutomationDraft = Pick<Automation, "name" | "enabled" | "trigger" | "actions">

/**
 * Something the user did to a task of the open note, after it has been applied.
 * @category Automations
 */
export type AutomationEvent =
    | { type: "task.completed", taskId: number }
    | { type: "task.reopened", taskId: number }
    | { type: "task.created", taskId: number }
    /** `fromSectionId` is the section the task was in before the move. */
    | { type: "task.moved", taskId: number, fromSectionId: number }

export const TRIGGER_TYPES: readonly AutomationTriggerType[] = ["task.completed", "task.reopened", "task.created", "task.movedInto", "subtasks.completed", "group.completed",
    "section.noOpenTasks", "section.hasOpenTasks", "group.noOpenTasks", "group.hasOpenTasks"]

/**
 * What a rule acts on: the task of a `task.*` / `subtasks.completed` trigger, the group of the group triggers, the
 * section of the `section.*` ones.
 * @category Automations
 */
export type AutomationSubject = "task" | "group" | "section"

/** Whether the trigger is a state (it holds while the note is in that state) and not an event. */
export const isStateTrigger = (type: AutomationTriggerType) =>
    type === "section.noOpenTasks" || type === "section.hasOpenTasks" || type === "group.noOpenTasks" || type === "group.hasOpenTasks"

/** Whether the trigger refers to a group (`groupId`) and the rule acts on it. */
export const isGroupTrigger = (type: AutomationTriggerType) =>
    type === "group.completed" || type === "group.noOpenTasks" || type === "group.hasOpenTasks"

/** The subject of the rules with this trigger. */
export const triggerSubject = (type: AutomationTriggerType): AutomationSubject =>
    type === "section.noOpenTasks" || type === "section.hasOpenTasks" ? "section" : isGroupTrigger(type) ? "group" : "task"

/** The actions a rule can have for each subject (`setColor` acts on the subject, whichever it is). */
export const ACTIONS_BY_SUBJECT: Record<AutomationSubject, readonly AutomationActionType[]> = {
    task: ["moveTo", "setCompleted", "setPriority", "setColor", "completeSubtasks"],
    group: ["setColor", "moveGroup", "archiveGroup"],
    section: ["setColor"],
}

/**
 * The actions a rule can have with this trigger: a state trigger holds for as long as the state lasts, so only the
 * color (idempotent) is allowed (e.g. archiving would archive every empty group).
 * @category Automations
 */
export const actionsForTrigger = (type: AutomationTriggerType): readonly AutomationActionType[] =>
    isStateTrigger(type) ? ["setColor"] : ACTIONS_BY_SUBJECT[triggerSubject(type)]

/**
 * Whether every action is allowed for the trigger (the list may be empty: that is checked by the editor).
 * @category Automations
 */
export const isValidRule = (trigger: AutomationTrigger, actions: readonly AutomationAction[]) =>
    actions.every(action => actionsForTrigger(trigger.type).includes(action.type))

const isSectionRef = (value: unknown, allowNull: boolean) =>
    (allowNull && value === null) || (typeof value === "number" && Number.isInteger(value))

/**
 * Whether a parsed JSON value is a valid trigger (the database content is never trusted blindly).
 * @category Automations
 */
export function isAutomationTrigger(value: unknown): value is AutomationTrigger {
    if (typeof value !== "object" || value === null) return false
    const { type, sectionId, groupId } = value as { type?: unknown, sectionId?: unknown, groupId?: unknown }
    if (isGroupTrigger(type as AutomationTriggerType)) return TRIGGER_TYPES.includes(type as AutomationTriggerType) && isSectionRef(groupId, true)
    if (type === "task.movedInto") return isSectionRef(sectionId, false)
    return TRIGGER_TYPES.includes(type as AutomationTriggerType) && isSectionRef(sectionId, true)
}

/**
 * Whether a parsed JSON value is a valid action.
 * @category Automations
 */
export function isAutomationAction(value: unknown): value is AutomationAction {
    if (typeof value !== "object" || value === null) return false
    const action = value as Record<string, unknown>
    switch (action.type) {
        case "moveTo": return isSectionRef(action.sectionId, false) && (action.at === "top" || action.at === "bottom")
        case "setCompleted":
        case "setPriority": return typeof action.value === "boolean"
        case "setColor": return action.color === null || (typeof action.color === "string" && action.color.length > 0)
        case "completeSubtasks":
        case "archiveGroup": return true
        case "moveGroup": return action.at === "top" || action.at === "bottom"
        default: return false
    }
}

/**
 * The sections a rule refers to (its trigger and its moves): a rule whose section is no longer in the note is skipped.
 * @category Automations
 */
export function referencedSections(rule: Pick<Automation, "trigger" | "actions">): number[] {
    const ids = new Set<number>()
    if (!isGroupTrigger(rule.trigger.type) && "sectionId" in rule.trigger && rule.trigger.sectionId !== null) ids.add(rule.trigger.sectionId)
    for (const action of rule.actions) if (action.type === "moveTo") ids.add(action.sectionId)
    return [...ids]
}

/**
 * The group a rule refers to (its trigger): a rule whose group is no longer in the note is skipped.
 * @category Automations
 */
export function referencedGroups(rule: Pick<Automation, "trigger">): number[] {
    return "groupId" in rule.trigger && rule.trigger.groupId !== null ? [rule.trigger.groupId] : []
}
