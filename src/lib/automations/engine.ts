import type { Group, NoteDataTree, Task } from "@/types/types"
import { isDefaultSection, taskSections } from "@/lib/group-sections"
import { findGroup, findSection, findTask, mapTask, moveGroupInList, moveTask, patchGroup, patchSection, patchTask, removeGroup } from "@/contexts/note-tree-ops"
import { isStateTrigger, isValidRule, referencedGroups, referencedSections, referencedTags, type Automation, type AutomationAction, type AutomationEvent, type AutomationTrigger } from "./types"

/**
 * Most events handled for one user action: the actions of a rule raise new events (a move, a completion…) and the
 * rules can feed each other, so the chain is bounded (besides, a rule runs at most once per task in a chain).
 * @category Automations
 */
export const MAX_AUTOMATION_STEPS = 50

/**
 * The events seen by the rules: the user events plus "the subtasks of this task are now all completed" and
 * "the tasks of this group are now all completed".
 */
type EngineEvent =
    | AutomationEvent
    | { type: "subtasks.completed", taskId: number }
    | { type: "group.completed", groupId: number }

/**
 * Outcome of the rules for one event: the note after every action, the rules that changed something (in order), the
 * tasks the actions changed (not the tasks that only shifted because another one moved) and the groups they changed
 * (recolored, moved or archived: an archived group is no longer in `tree`). `archivedGroups` has the groups archived by
 * the actions exactly as they were then (with the changes the earlier actions made to their tasks), so that those
 * changes can still be persisted.
 * `tree` is the very tree given in input when nothing changed.
 * @category Automations
 */
type AutomationOutcome = { tree: NoteDataTree, applied: Automation[], touched: number[], touchedGroups: number[], archivedGroups: Group[] }

/** Whether every task under `task` (at any depth) is completed; false without subtasks. */
export function allSubtasksCompleted(task: Task): boolean {
    const visit = (tasks: Task[]): boolean => tasks.every(sub => !!sub.completed && visit(sub.subtasks))
    return task.subtasks.length > 0 && visit(task.subtasks)
}

/**
 * Whether a group has at least one task and every task of its sections (the direct tasks of the group included), at any depth, is completed.
 * @category Automations
 */
export function allTasksCompleted(group: Group): boolean {
    const visit = (tasks: Task[]): boolean => tasks.every(task => !!task.completed && visit(task.subtasks))
    const tasks = taskSections(group).flatMap(section => section.tasks)
    return tasks.length > 0 && visit(tasks)
}

function matches(trigger: AutomationTrigger, event: EngineEvent, tree: NoteDataTree): boolean {
    // The state triggers are not events: syncStateRules handles them
    if (isStateTrigger(trigger.type)) return false
    // The group rules only see group events, the task rules never do
    if ("groupId" in trigger) {
        if (trigger.type !== "group.completed") return false
        if (event.type !== "group.completed") return false
        if (trigger.groupId !== null && trigger.groupId !== event.groupId) return false
        const found = findGroup(tree, event.groupId)
        return !!found && allTasksCompleted(found.group)
    }
    if (event.type === "group.completed") return false

    const found = findTask(tree, event.taskId)
    if (!found) return false
    const topLevel = "sectionId" in found.parent
    const section = found.task.sectionID
    const inSection = trigger.sectionId === null || trigger.sectionId === section
    switch (trigger.type) {
        case "task.completed": return event.type === "task.completed" && topLevel && inSection && !!found.task.completed
        case "task.reopened": return event.type === "task.reopened" && topLevel && inSection && !found.task.completed
        case "task.created": return event.type === "task.created" && topLevel && inSection
        case "task.movedInto": return event.type === "task.moved" && topLevel && section === trigger.sectionId && event.fromSectionId !== section
        case "subtasks.completed": return event.type === "subtasks.completed" && inSection && allSubtasksCompleted(found.task)
        default: return false
    }
}

/**
 * The events implied by another one: completing the last open subtask completes the subtasks of the parent, and a
 * completion (of a task or of its subtasks) may complete every task of its group.
 */
function derivedEvents(tree: NoteDataTree, event: EngineEvent): EngineEvent[] {
    if (event.type !== "task.completed" && event.type !== "subtasks.completed") return []
    const found = findTask(tree, event.taskId)
    if (!found) return []
    const events: EngineEvent[] = []
    if (event.type === "task.completed" && "parentTaskId" in found.parent) {
        const parent = findTask(tree, found.parent.parentTaskId)
        if (parent && allSubtasksCompleted(parent.task)) events.push({ type: "subtasks.completed", taskId: parent.task.id })
    }
    const sectionId = found.task.sectionID
    const section = sectionId === null || sectionId === undefined ? undefined : findSection(tree, sectionId)
    const group = section && findGroup(tree, section.groupId)
    if (group && allTasksCompleted(group.group)) events.push({ type: "group.completed", groupId: group.group.id })
    return events
}

const descendantIds = (task: Task): number[] => task.subtasks.flatMap(sub => [sub.id, ...descendantIds(sub)])

const completeAll = (task: Task): Task => ({
    ...task,
    subtasks: task.subtasks.map(sub => ({ ...completeAll(sub), completed: true })),
})

/** Applies one action to a group: the new tree (the same one when nothing changed). The task actions do nothing. */
function applyGroupAction(tree: NoteDataTree, groupId: number, action: AutomationAction): NoteDataTree {
    const found = findGroup(tree, groupId)
    if (!found) return tree
    switch (action.type) {
        case "setColor":
            return (found.group.color ?? null) === action.color ? tree : patchGroup(tree, groupId, { color: action.color })
        case "moveGroup": {
            const ordered = [...tree.groups].sort((a, b) => a.position - b.position)
            const index = action.at === "top" ? 0 : ordered.length - 1
            if (ordered[index].id === groupId) return tree
            const groups = moveGroupInList(tree.groups, groupId, index)
            return groups ? { groups } : tree
        }
        case "archiveGroup": return removeGroup(tree, groupId)
        default: return tree
    }
}

/** Applies one action to a task: the new tree (the same one when nothing changed) and the events it raises. */
function applyAction(tree: NoteDataTree, taskId: number, action: AutomationAction): { tree: NoteDataTree, events: EngineEvent[] } {
    const found = findTask(tree, taskId)
    const none = { tree, events: [] }
    if (!found) return none
    const task = found.task

    switch (action.type) {
        case "moveTo": {
            // Only the top level tasks move: a subtask stays under its parent
            if (!("sectionId" in found.parent)) return none
            const target = findSection(tree, action.sectionId)
            if (!target) return none
            const from = found.parent.sectionId
            const others = target.section.tasks.filter(other => other.id !== taskId).length
            const index = action.at === "top" ? 0 : others
            if (from === action.sectionId && found.index === index) return none
            const next = moveTask(tree, taskId, { sectionId: action.sectionId, parentTaskId: null }, index)
            if (next === tree) return none
            return { tree: next, events: from !== action.sectionId ? [{ type: "task.moved", taskId, fromSectionId: from }] : [] }
        }
        case "setCompleted":
            if (!!task.completed === action.value) return none
            return {
                tree: patchTask(tree, taskId, { completed: action.value }),
                events: [{ type: action.value ? "task.completed" : "task.reopened", taskId }],
            }
        case "setPriority":
            if (!!task.priority === action.value) return none
            return { tree: patchTask(tree, taskId, { priority: action.value }), events: [] }
        case "setColor":
            if ((task.color ?? null) === action.color) return none
            return { tree: patchTask(tree, taskId, { color: action.color }), events: [] }
        case "addTag": {
            const tags = task.tagIDs ?? []
            if (tags.includes(action.tagId)) return none
            return { tree: patchTask(tree, taskId, { tagIDs: [...tags, action.tagId] }), events: [] }
        }
        case "removeTag": {
            const tags = task.tagIDs ?? []
            if (!tags.includes(action.tagId)) return none
            return { tree: patchTask(tree, taskId, { tagIDs: tags.filter(id => id !== action.tagId) }), events: [] }
        }
        case "completeSubtasks":
            if (task.subtasks.length === 0 || allSubtasksCompleted(task)) return none
            return { tree: mapTask(tree, taskId, completeAll), events: [{ type: "subtasks.completed", taskId }] }
        // The group actions belong to the rules of a group
        case "moveGroup":
        case "archiveGroup": return none
    }
}

/**
 * Runs the rules of a note on an event, on the note as it is after the user action.
 * Pure: it computes the resulting note, the caller persists it (see diffTaskStatements and diffGroupStatements).
 * - the enabled rules run in their order; a rule whose sections or group are no longer in the note, or that has an
 *   action not allowed for its trigger, is skipped;
 * - the events raised by the actions are handled in turn (at most MAX_AUTOMATION_STEPS events);
 * - a rule runs at most once per task (or group) in a chain, so two rules cannot bounce a task forever.
 * - a rule whose tag no longer exists (`tagIds`, the tags of the workspace; omitted = not checked) is skipped.
 * @param tree The note after the user action.
 * @param rules The rules of the note.
 * @param event What the user did.
 * @param tagIds The ids of the tags of the workspace.
 * @category Automations
 */
export function runAutomations(tree: NoteDataTree, rules: readonly Automation[], event: AutomationEvent, tagIds?: ReadonlySet<number>): AutomationOutcome {
    const active = rules
        .filter(rule => rule.enabled
            && !isStateTrigger(rule.trigger.type)
            && isValidRule(rule.trigger, rule.actions)
            && referencedSections(rule).every(id => !!findSection(tree, id))
            && referencedGroups(rule).every(id => !!findGroup(tree, id))
            && (!tagIds || referencedTags(rule).every(id => tagIds.has(id))))
        .sort((a, b) => a.position - b.position || a.id - b.id)
    if (active.length === 0) return { tree, applied: [], touched: [], touchedGroups: [], archivedGroups: [] }

    const queue: EngineEvent[] = [event]
    const fired = new Set<string>()
    const applied = new Map<number, Automation>()
    const touched = new Set<number>()
    const touchedGroups = new Set<number>()
    const archivedGroups: Group[] = []
    let current = tree

    for (let steps = 0; queue.length > 0 && steps < MAX_AUTOMATION_STEPS; steps++) {
        const next = queue.shift() as EngineEvent
        for (const derived of derivedEvents(current, next)) {
            // Two completions that finish the same group raise a single "group completed" while it is waiting
            if (derived.type === "group.completed" && queue.some(item => item.type === "group.completed" && item.groupId === derived.groupId)) continue
            queue.push(derived)
        }

        for (const rule of active) {
            if (!matches(rule.trigger, next, current)) continue
            const key = next.type === "group.completed" ? `${rule.id}:g${next.groupId}` : `${rule.id}:t${next.taskId}`
            if (fired.has(key)) continue
            fired.add(key)
            for (const action of rule.actions) {
                if (next.type === "group.completed") {
                    const result = applyGroupAction(current, next.groupId, action)
                    if (result !== current) {
                        const group = action.type === "archiveGroup" ? findGroup(current, next.groupId)?.group : undefined
                        if (group) archivedGroups.push(group)
                        applied.set(rule.id, rule)
                        touchedGroups.add(next.groupId)
                    }
                    current = result
                    continue
                }
                const result = applyAction(current, next.taskId, action)
                if (result.tree !== current) {
                    applied.set(rule.id, rule)
                    touched.add(next.taskId)
                    if (action.type === "completeSubtasks") {
                        const found = findTask(current, next.taskId)
                        if (found) descendantIds(found.task).forEach(id => touched.add(id))
                    }
                }
                current = result.tree
                queue.push(...result.events)
            }
        }
    }
    return { tree: current, applied: [...applied.values()], touched: [...touched], touchedGroups: [...touchedGroups], archivedGroups }
}

/** Whether a task counts as done: completed, or with subtasks that are all done (at any depth). */
const isTaskDone = (task: Task): boolean => !!task.completed || (task.subtasks.length > 0 && task.subtasks.every(isTaskDone))

/** Records the color the setColor actions of a rule give to a target (the last action wins). */
function record(colors: Map<number, string | null>, id: number, actions: readonly AutomationAction[]) {
    for (const action of actions) if (action.type === "setColor") colors.set(id, action.color)
}

/**
 * Applies the state rules ("a section/group has no open tasks" / "has open tasks") to a note: the color of every
 * target whose state matches the trigger of an enabled rule. Pure and idempotent: a color already equal is left alone,
 * and nothing else (tasks, order, archive) is touched. An empty section or group has no open tasks. A rule that is
 * paused (its section or group is gone), invalid or disabled is skipped; when several rules hit the same target the
 * last one (by position, then id) wins.
 * @param tree The note.
 * @param rules The rules of the note (the event rules are ignored).
 * @returns The new note (the very `tree` when nothing changed) and the sections and groups that changed color.
 * @category Automations
 */
export function syncStateRules(tree: NoteDataTree, rules: readonly Automation[]): { tree: NoteDataTree, touchedSections: number[], touchedGroups: number[] } {
    const active = rules
        .filter(rule => rule.enabled
            && isStateTrigger(rule.trigger.type)
            && isValidRule(rule.trigger, rule.actions)
            && referencedSections(rule).every(id => !!findSection(tree, id))
            && referencedGroups(rule).every(id => !!findGroup(tree, id)))
        .sort((a, b) => a.position - b.position || a.id - b.id)

    // The color each target should have: later rules overwrite earlier ones
    const sectionColors = new Map<number, string | null>()
    const groupColors = new Map<number, string | null>()
    for (const { trigger, actions } of active) {
        const wantsNoOpen = trigger.type === "section.noOpenTasks" || trigger.type === "group.noOpenTasks"
        const holds = (tasks: Task[]) => tasks.every(isTaskDone) === wantsNoOpen
        if (trigger.type === "section.noOpenTasks" || trigger.type === "section.hasOpenTasks") {
            for (const group of tree.groups)
                // "Any section" means the visible sections: the direct area of a group is colored only when a rule names it
                for (const section of taskSections(group))
                    if ((trigger.sectionId === section.id || (trigger.sectionId === null && !isDefaultSection(section))) && holds(section.tasks)) record(sectionColors, section.id, actions)
        } else if (trigger.type === "group.noOpenTasks" || trigger.type === "group.hasOpenTasks") {
            for (const group of tree.groups)
                if ((trigger.groupId === null || trigger.groupId === group.id) && holds(taskSections(group).flatMap(section => section.tasks))) record(groupColors, group.id, actions)
        }
    }

    let current = tree
    const touchedSections: number[] = []
    const touchedGroups: number[] = []
    for (const [id, color] of sectionColors) {
        const found = findSection(current, id)
        if (!found || (found.section.color ?? null) === color) continue
        current = patchSection(current, id, { color })
        touchedSections.push(id)
    }
    for (const [id, color] of groupColors) {
        const found = findGroup(current, id)
        if (!found || (found.group.color ?? null) === color) continue
        current = patchGroup(current, id, { color })
        touchedGroups.push(id)
    }
    return { tree: current, touchedSections, touchedGroups }
}
