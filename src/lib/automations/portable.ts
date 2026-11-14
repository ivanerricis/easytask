import type { NoteTemplateContent } from "@/types/template"
import {
    isAutomationAction, isGroupTrigger, isValidRule, TRIGGER_TYPES,
    type Automation, type AutomationAction, type AutomationTrigger, type AutomationTriggerType,
} from "./types"

/**
 * A section of a note content by position: `content.groups[group].sections[section]`, or the direct area of the group
 * (its default section, where the tasks created directly in the group live) when `direct` is set.
 * Ids change when a note is copied or imported, positions in the content do not.
 * @category Automations
 */
export type PortableSectionRef = { group: number, section: number } | { group: number, direct: true }

type GroupTriggerType = "group.completed" | "group.noOpenTasks" | "group.hasOpenTasks"

/**
 * A trigger of a portable rule: the section is a position in the content (null = any section); the group of
 * the group triggers is its index in `content.groups` (null = any group).
 */
type PortableTrigger =
    | { type: Exclude<AutomationTriggerType, GroupTriggerType>, sectionId: PortableSectionRef | null }
    | { type: GroupTriggerType, groupId: number | null }

/** A tag of a portable rule: by name and color, since the ids belong to the workspace (the copy reuses or creates the tag by name). */
export type PortableTag = { name: string, color: string | null }

/** An action of a portable rule: a move targets a position in the content, a tag action names its tag. */
type PortableAction =
    | Exclude<AutomationAction, { type: "moveTo" | "addTag" | "removeTag" }>
    | { type: "moveTo", sectionId: PortableSectionRef, at: "top" | "bottom" }
    | { type: "addTag" | "removeTag", tag: PortableTag }

/**
 * A rule independent of the ids of its note, to be copied or exported together with the note content
 * (see `buildContentWithSectionIds` in src/db/queries/template.ts for the order of the sections).
 * @category Automations
 */
export type PortableAutomation = {
    name: string | null
    enabled: boolean
    trigger: PortableTrigger
    actions: PortableAction[]
}

/**
 * Maps the id of every section of a note to its position in `content` (the default section of a group maps to
 * the direct area of the group).
 * @param content The note content.
 * @param sectionIds The ids of the source sections, in content order (groups first, then the sections of each group).
 * @param defaultSectionIds The ids of the default sections of the groups, in group order.
 * @category Automations
 */
export function buildSectionIndex(
    content: NoteTemplateContent, sectionIds: readonly number[], defaultSectionIds: readonly (number | null)[] = [],
): Map<number, PortableSectionRef> {
    const index = new Map<number, PortableSectionRef>()
    let flat = 0
    content.groups.forEach((group, g) => {
        const direct = defaultSectionIds[g]
        if (direct != null) index.set(direct, { group: g, direct: true })
        group.sections.forEach((_, s) => {
            const id = sectionIds[flat++]
            if (id !== undefined) index.set(id, { group: g, section: s })
        })
    })
    return index
}

/**
 * Maps the id of every group of a note to its index in `content.groups`.
 * @param content The note content.
 * @param groupIds The ids of the source groups, in content order.
 * @category Automations
 */
export function buildGroupIndex(content: NoteTemplateContent, groupIds: readonly number[]): Map<number, number> {
    const index = new Map<number, number>()
    content.groups.forEach((_, g) => {
        const id = groupIds[g]
        if (id !== undefined) index.set(id, g)
    })
    return index
}

/**
 * The position of every section of a content in the flat list of its sections (content order), as `offsets[group] + section`.
 * @category Automations
 */
export function sectionOffsets(content: NoteTemplateContent): number[] {
    let total = 0
    return content.groups.map(group => {
        const start = total
        total += group.sections.length
        return start
    })
}

/**
 * The portable version of a rule, or null when it refers to a section or a group that is not in the index
 * (e.g. an archived section left out of a duplicated content): such a rule cannot be carried over.
 * @param rule The rule of the source note.
 * @param sectionIndex See buildSectionIndex.
 * @param groupIndex See buildGroupIndex; without it the rules of a group are left out.
 * @param tagIndex The name and color of each tag of the workspace by id; a rule with a tag action that is not in it (or without the index) is left out.
 * @category Automations
 */
export function toPortable(
    rule: Pick<Automation, "name" | "enabled" | "trigger" | "actions">,
    sectionIndex: ReadonlyMap<number, PortableSectionRef>,
    groupIndex?: ReadonlyMap<number, number>,
    tagIndex?: ReadonlyMap<number, PortableTag>,
): PortableAutomation | null {
    const source = rule.trigger
    let trigger: PortableTrigger
    if ("groupId" in source) {
        if (source.groupId === null) {
            trigger = { type: source.type, groupId: null }
        } else {
            const index = groupIndex?.get(source.groupId)
            if (index === undefined) return null
            trigger = { type: source.type, groupId: index }
        }
    } else if (source.sectionId === null) {
        trigger = { type: source.type, sectionId: null }
    } else {
        const ref = sectionIndex.get(source.sectionId)
        if (!ref) return null
        trigger = { type: source.type, sectionId: { ...ref } }
    }

    const actions: PortableAction[] = []
    for (const action of rule.actions) {
        if (action.type === "addTag" || action.type === "removeTag") {
            const tag = tagIndex?.get(action.tagId)
            if (!tag) return null
            actions.push({ type: action.type, tag: { name: tag.name, color: tag.color } })
            continue
        }
        if (action.type !== "moveTo") {
            actions.push(action)
            continue
        }
        const ref = sectionIndex.get(action.sectionId)
        if (!ref) return null
        actions.push({ type: "moveTo", sectionId: { ...ref }, at: action.at })
    }
    return { name: rule.name, enabled: rule.enabled, trigger, actions }
}

const isIndex = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0

function isSectionInContent(value: unknown, content: NoteTemplateContent): value is PortableSectionRef {
    if (typeof value !== "object" || value === null) return false
    const { group, section, direct } = value as { group?: unknown, section?: unknown, direct?: unknown }
    if (!isIndex(group) || group >= content.groups.length) return false
    // The direct area of a group has no section index
    if (direct !== undefined) return direct === true && section === undefined
    return isIndex(section) && section < content.groups[group].sections.length
}

/**
 * Whether a parsed JSON value is a valid portable rule for `content` (every section reference must point to an existing
 * section of the content). The file content is never trusted blindly.
 * @category Automations
 */
export function isPortableAutomation(value: unknown, content: NoteTemplateContent): value is PortableAutomation {
    if (typeof value !== "object" || value === null) return false
    const { name, enabled, trigger, actions } = value as Record<string, unknown>
    if (!(name === null || typeof name === "string") || typeof enabled !== "boolean") return false

    if (typeof trigger !== "object" || trigger === null) return false
    const { type, sectionId, groupId } = trigger as { type?: unknown, sectionId?: unknown, groupId?: unknown }
    if (!TRIGGER_TYPES.includes(type as AutomationTriggerType)) return false
    if (isGroupTrigger(type as AutomationTriggerType)) {
        if (!(groupId === null || (isIndex(groupId) && groupId < content.groups.length))) return false
    } else if (sectionId === null ? type === "task.movedInto" : !isSectionInContent(sectionId, content)) return false

    if (!Array.isArray(actions)) return false
    const allowed = actions.every(action => {
        if (typeof action === "object" && action !== null && (action as { type?: unknown }).type === "moveTo") {
            const { sectionId: target, at } = action as { sectionId?: unknown, at?: unknown }
            return isSectionInContent(target, content) && (at === "top" || at === "bottom")
        }
        if (typeof action === "object" && action !== null && ((action as { type?: unknown }).type === "addTag" || (action as { type?: unknown }).type === "removeTag")) {
            const { tag } = action as { tag?: unknown }
            return typeof tag === "object" && tag !== null && typeof (tag as PortableTag).name === "string" && (tag as PortableTag).name.trim().length > 0
                && ((tag as PortableTag).color === null || typeof (tag as PortableTag).color === "string")
        }
        return isAutomationAction(action)
    })
    // The group index of a portable trigger is not an id, but the type is all that isValidRule looks at
    return allowed && isValidRule({ type } as AutomationTrigger, actions as AutomationAction[])
}
