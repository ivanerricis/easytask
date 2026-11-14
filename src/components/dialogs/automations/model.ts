import i18n from "@/i18n"
import { getDBNoteData } from "@/db/queries/note"
import { getDBAutomations } from "@/db/queries/automation"
import { getDBNoteTags } from "@/db/queries/tag"
import type { Tag } from "@/types/types"
import { buildNoteTreeFromData } from "@/contexts/tree-builders"
import { PALETTE_COLORS } from "@/lib/colors"
import {
    isGroupTrigger, isStateTrigger, isValidRule, triggerSubject,
    type Automation, type AutomationAction, type AutomationActionType, type AutomationDraft, type AutomationTrigger, type AutomationTriggerType,
} from "@/lib/automations/types"

/** A section a rule can point to; `group` is set for the direct area of a group (its default section), `title` is then its picker label. */
export type SectionOption = { id: number, title: string, group?: string }
/** `direct` is the direct area of the group, listed ahead of its sections. */
export type GroupOption = { id: number, label: string, direct?: SectionOption, sections: SectionOption[] }

export type DialogData = { rules: Automation[], groups: GroupOption[], tags: Tag[] }

/** The steps of the editor: when (trigger), then (actions), summary (sentence, name, on/off). */
export const STEPS = ["when", "then", "summary"] as const
export type Step = 0 | 1 | 2
export const LAST_STEP: Step = 2

/** Whether the data of a step is complete (only the actions can be wrong: the trigger always has a valid section or group). */
export const stepValid = (step: number, draft: AutomationDraft) =>
    step !== 1 || (draft.actions.length > 0 && isValidRule(draft.trigger, draft.actions))
/** A step can be reached when all the steps before it are valid. */
export const stepReachable = (step: number, draft: AutomationDraft) => STEPS.slice(0, step).every((_, index) => stepValid(index, draft))

/** The rules of a note and its sections, grouped by group. */
export async function loadDialogData(noteId: number): Promise<DialogData> {
    const [rules, data, tags] = await Promise.all([getDBAutomations(noteId), getDBNoteData(noteId), getDBNoteTags(noteId)])
    const tree = buildNoteTreeFromData(data)
    const groups = tree.groups.map((group, index): GroupOption => {
        const label = group.name?.trim() || i18n.t("groups.defaultLabel", { index: index + 1 })
        return {
            id: group.id,
            label,
            direct: group.defaultSection ? { id: group.defaultSection.id, title: i18n.t("automations.directTasks", { group: label }), group: label } : undefined,
            sections: group.sections.map(section => ({ id: section.id, title: section.title })),
        }
    })
    return { rules, groups, tags }
}

/** The default action of a type (moves go to the first section other than the one of the trigger). */
export function defaultAction(type: AutomationActionType, sections: SectionOption[], avoid: number | null, tags: readonly Tag[] = []): AutomationAction {
    switch (type) {
        case "moveTo": return { type, sectionId: (sections.find(s => s.id !== avoid) ?? sections[0]).id, at: "bottom" }
        case "setCompleted":
        case "setPriority": return { type, value: true }
        case "setColor": return { type, color: PALETTE_COLORS[0] }
        case "addTag":
        case "removeTag": return { type, tagId: tags[0]?.id ?? 0 }
        case "completeSubtasks":
        case "archiveGroup": return { type }
        case "moveGroup": return { type, at: "bottom" }
    }
}

/** The actions a new rule of this trigger starts with (a state trigger only has the color). */
export const defaultActions = (type: AutomationTriggerType, sections: SectionOption[], avoid: number | null): AutomationAction[] => {
    if (isStateTrigger(type)) return [defaultAction("setColor", sections, avoid)]
    return [triggerSubject(type) === "group" ? { type: "archiveGroup" } : defaultAction("moveTo", sections, avoid)]
}

/** Two triggers share their actions when they have the same subject and are both events or both states. */
export const sameActions = (a: AutomationTriggerType, b: AutomationTriggerType) =>
    triggerSubject(a) === triggerSubject(b) && isStateTrigger(a) === isStateTrigger(b)

/** The trigger of a type, keeping the section of the previous trigger; a group trigger starts on `groupId` (null = any group). */
export function defaultTrigger(type: AutomationTriggerType, sectionId: number | null, sections: SectionOption[], groupId: number | null = null): AutomationTrigger {
    if (isGroupTrigger(type)) return { type, groupId } as AutomationTrigger
    if (type === "task.movedInto") return { type, sectionId: sectionId ?? sections[0].id }
    // The colors of the state triggers belong to the visible sections: the direct area of a group is not offered for them
    if (isStateTrigger(type) && sections.find(section => section.id === sectionId)?.group !== undefined) return { type, sectionId: null } as AutomationTrigger
    return { type, sectionId } as AutomationTrigger
}
