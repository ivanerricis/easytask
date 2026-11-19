import { getSectionLabel } from "./section/section-label"
import { getGroupLabel } from "./groups/group-label"
import type { Group, NoteDataTree, Section, Task } from "@/types/types"
import i18n from "@/i18n"
import { directIndexOf, isDefaultSection, orderedItems, taskSections } from "@/lib/group-sections"

// Lives with the other tree operations (the automations use it too); re-exported for the drag & drop callers
export { moveGroupInList } from "@/contexts/note-tree-ops"

/**
 * Pure logic of the drag & drop of sections and tasks inside the open note.
 * Everything here works on the NoteDataTree and never touches the DOM or the database.
 * @category Note DnD
 */

export type NoteDragKind = "section" | "task" | "group"
export type NoteDragRef = { kind: NoteDragKind, id: number }

/**
 * What the pointer is over:
 * - section: a section card (drop of a section = before/after it, drop of a task = last top level task); the direct
 *   area of a group (its default section) is a section too: a section dropped on it counts as a drop on the group
 * - group: the empty area of a group (a section is appended to it; a dragged group goes before / after it; a task
 *   becomes the last direct task of the group)
 * - task: a task row (before / after / inside it)
 * - new-group: an insertion slot between groups (id = index in the list of groups) that creates a new group
 */
export type NoteOverKind = "section" | "task" | "group" | "new-group"
export type NoteOverRef = { kind: NoteOverKind, id: number }

/** Index used to mean "append at the end"; the backend clamps it. */
export const END_INDEX = 1_000_000

export type DropZone = "before" | "after" | "inside" | "inside-start"

/** Which dragged items every kind of droppable accepts. */
export const ACCEPTS: Record<NoteOverKind, NoteDragKind[]> = {
    section: ["section", "task"],
    task: ["task"],
    group: ["section", "group", "task"],
    "new-group": ["section"],
}

export type SectionTarget =
    | { type: "group", groupId: number, index: number, beforeList?: true }
    | { type: "new-group", index: number }

export type TaskTarget = { sectionId: number, parentTaskId: number | null, index: number }

type Rect = { top: number, height: number }

/**
 * Maps the pointer position over a droppable to a drop zone.
 * - task row: top 25% = before, bottom 25% = after, middle = inside (last subtask). When the task already has
 *   subtasks its bottom 25% means "inside, first position" ("after" would land below all its subtasks).
 * - section card hovered by a section: top half = before, bottom half = after.
 * - anything else: inside.
 * @param dragKind What is being dragged.
 * @param overKind What the pointer is over.
 * @param rect Bounding rect of the hovered droppable (only top and height are used).
 * @param pointerY Vertical pointer position (same coordinate space as rect).
 * @param opts hasSubtasks: the hovered task has subtasks.
 * @category Note DnD
 */
export function computeDropZone(
    dragKind: NoteDragKind,
    overKind: NoteOverKind,
    rect: Rect,
    pointerY: number,
    opts: { hasSubtasks?: boolean } = {},
): DropZone {
    const ratio = (pointerY - rect.top) / (rect.height || 1)
    if (overKind === "task") {
        if (ratio < 0.25) return "before"
        if (ratio > 0.75) return opts.hasSubtasks ? "inside-start" : "after"
        return "inside"
    }
    if (overKind === "section" && dragKind === "section") return ratio < 0.5 ? "before" : "after"
    return "inside"
}

/**
 * Drop zone of a group dragged over a group of ANOTHER note: it has no resting order to follow, so the half of the column the
 * pointer is in decides (left half = before it, right half = after it).
 * @category Note DnD
 */
export const computeCrossGroupDropZone = (rect: { left: number, width: number }, pointerX: number): DropZone =>
    pointerX < rect.left + rect.width / 2 ? "before" : "after"

/**
 * Drop zone of a group dragged over another group: entering the column of the other group is enough, no half to pass. The side
 * is the one the dragged group comes from: "after" the other group when that one stands later in the row than the dragged
 * group at rest, "before" it when it stands earlier. The same rule is used while hovering and on the drop.
 * @category Note DnD
 */
export function computeGroupDropZone(tree: NoteDataTree, activeId: number, overId: number): DropZone {
    const sorted = sortGroups(tree.groups)
    const activeIndex = sorted.findIndex(group => group.id === activeId)
    const overIndex = sorted.findIndex(group => group.id === overId)
    return overIndex >= 0 && activeIndex >= 0 && overIndex < activeIndex ? "before" : "after"
}

type TaskInfo = { task: Task, sectionId: number, parentId: number | null }
type TreeIndex = { sections: Map<number, { section: Section, groupId: number }>, tasks: Map<number, TaskInfo> }

// The tree is immutable (every change replaces it): its index is built once and reused, a drag asks for it on every pointer move
const treeIndexes = new WeakMap<NoteDataTree, TreeIndex>()

/** Flat lookups over the tree (built once per tree). */
export function indexTree(tree: NoteDataTree): TreeIndex {
    const cached = treeIndexes.get(tree)
    if (cached) return cached
    const sections = new Map<number, { section: Section, groupId: number }>()
    const tasks = new Map<number, TaskInfo>()
    const visit = (list: Task[], sectionId: number, parentId: number | null) => {
        for (const task of list) {
            tasks.set(task.id, { task, sectionId, parentId })
            visit(task.subtasks ?? [], sectionId, task.id)
        }
    }
    for (const group of tree.groups) {
        // The default section is indexed too: it is where the direct tasks of the group live
        for (const section of taskSections(group)) {
            sections.set(section.id, { section, groupId: group.id })
            visit(section.tasks ?? [], section.id, null)
        }
    }
    const index = { sections, tasks }
    treeIndexes.set(tree, index)
    return index
}

/** Finds a section in the tree. */
export const findSection = (tree: NoteDataTree, id: number): Section | undefined => indexTree(tree).sections.get(id)?.section

/** Finds a task (or subtask, at any depth) in the tree. */
export const findTask = (tree: NoteDataTree, id: number): Task | undefined => indexTree(tree).tasks.get(id)?.task

/** Ids of a task and of all its descendants. */
function getTaskSubtreeIds(task: Task): Set<number> {
    const result = new Set<number>()
    const visit = (current: Task) => {
        result.add(current.id)
        current.subtasks?.forEach(visit)
    }
    visit(task)
    return result
}

/**
 * Where the list of the direct tasks of a group sits among the other sections once `activeId` is taken out: the number of
 * sections with a header before it (the `index` of the database moves counts the same way). Null when the group has no list.
 */
function listIndexWithout(group: Group, activeId: number): number | null {
    if (!group.defaultSection) return null
    const list = directIndexOf(group)
    const activeIndex = group.sections.findIndex(section => section.id === activeId)
    return activeIndex >= 0 && activeIndex < list ? list - 1 : list
}

/**
 * True when moving `activeId` to `index` (`beforeList`: see {@link SectionTarget}) leaves the rows of its group (the sections and
 * the list of the direct tasks) as they are. Mirrors the order the database gives the move.
 */
function isSameOrder(group: Group, activeId: number, index: number, beforeList: boolean): boolean {
    const LIST = -1
    const current = orderedItems(group).map(section => isDefaultSection(section) ? LIST : section.id)
    const rows = current.filter(id => id !== activeId)
    const headed = rows.filter(id => id !== LIST)
    const at = Math.max(0, Math.min(index, headed.length))
    let before = at < headed.length ? rows.indexOf(headed[at]) : rows.length
    if (beforeList && before > 0 && rows[before - 1] === LIST) before -= 1
    rows.splice(before, 0, activeId)
    return rows.every((id, position) => id === current[position])
}

/**
 * Computes the destination of a dragged section. The returned index is the final index among the sections
 * of the destination group once the section has been moved (the semantics of `moveSection`), or the index
 * among the current groups for a new group (the semantics of `moveSectionToNewGroup`).
 * The list of the direct tasks of the group is one of the rows: that index counts only the sections with a header, so a
 * section dropped right above the list is a move before the list (`beforeList`), one dropped right below it a plain index.
 * The list itself is a drop target (top half = before it, bottom half = after it) but cannot be dragged.
 * Returns null when the drop is invalid or would not change anything.
 * `tree` is the note that receives the section; `from` is the note the section is dragged out of when that is another one (the other
 * pane of the split view): the section is looked up there and, in a note that is not its own, no drop is a no-op.
 * @category Note DnD
 */
export function computeSectionTarget(
    tree: NoteDataTree,
    activeId: number,
    over: NoteOverRef,
    zone: DropZone,
    from: NoteDataTree = tree,
): SectionTarget | null {
    const { sections } = indexTree(tree)
    const active = indexTree(from).sections.get(activeId)
    if (!active || isDefaultSection(active.section)) return null
    const sourceGroup = from.groups.find(group => group.id === active.groupId)
    if (!sourceGroup) return null
    const across = from !== tree

    // The list of a group is a row among the sections: before / after it by the half of the area, or the whole group as a drop on the group
    const overSection = over.kind === "section" ? sections.get(over.id) : undefined
    const overList = !!overSection && isDefaultSection(overSection.section)
    if (overSection && overList && zone !== "before" && zone !== "after") over = { kind: "group", id: overSection.groupId }

    if (over.kind === "new-group") {
        const sourceIndex = tree.groups.findIndex(group => group.id === active.groupId)
        // Pulling out the only section of a group next to that group is just a group reorder: not offered (in another note it is a move)
        if (!across && sourceGroup.sections.length === 1 && (over.id === sourceIndex || over.id === sourceIndex + 1)) return null
        return { type: "new-group", index: over.id }
    }

    let group: Group | undefined
    let index: number
    let beforeList = false
    if (over.kind === "group") {
        group = tree.groups.find(g => g.id === over.id)
        if (!group) return null
        index = group.sections.filter(section => section.id !== activeId).length
    } else if (over.kind === "section") {
        if (over.id === activeId) return null
        const target = sections.get(over.id)
        if (!target) return null
        group = tree.groups.find(g => g.id === target.groupId)
        if (!group) return null
        const listIndex = listIndexWithout(group, activeId)
        if (overList) {
            // Above the list: before it (the index of the next section would be after it); below it: the plain index
            index = listIndex ?? 0
            beforeList = zone === "before"
        } else {
            const without = group.sections.filter(section => section.id !== activeId)
            const overIndex = without.findIndex(section => section.id === over.id)
            if (overIndex < 0) return null
            index = zone === "after" ? overIndex + 1 : overIndex
            // Right under a section the list follows: stay above the list, whose place the plain index would take
            beforeList = zone === "after" && listIndex === index
        }
    } else {
        return null
    }

    if (!across && group.id === active.groupId && isSameOrder(group, activeId, index, beforeList)) return null
    return { type: "group", groupId: group.id, index, ...(beforeList ? { beforeList: true as const } : {}) }
}

/**
 * Computes the destination of a dragged task (or subtask). The returned index is the final index among the
 * new siblings once the task has been moved (the semantics of `moveTask`).
 * A task can never go under itself or one of its descendants.
 * Returns null when the drop is invalid or would not change anything.
 * `tree` is the note that receives the task; `from` is the note it is dragged out of when that is another one (see {@link computeSectionTarget}).
 * @category Note DnD
 */
export function computeTaskTarget(
    tree: NoteDataTree,
    activeId: number,
    over: NoteOverRef,
    zone: DropZone,
    from: NoteDataTree = tree,
): TaskTarget | null {
    const { sections, tasks } = indexTree(tree)
    const active = indexTree(from).tasks.get(activeId)
    if (!active) return null
    const subtree = getTaskSubtreeIds(active.task)

    const siblingsOf = (sectionId: number, parentId: number | null): Task[] => {
        if (parentId == null) return sections.get(sectionId)?.section.tasks ?? []
        return tasks.get(parentId)?.task.subtasks ?? []
    }

    let sectionId: number
    let parentTaskId: number | null
    let index: number

    if (over.kind === "section") {
        if (!sections.has(over.id)) return null
        sectionId = over.id
        parentTaskId = null
        index = siblingsOf(sectionId, null).filter(task => task.id !== activeId).length
    } else if (over.kind === "group") {
        // The empty area of a group: the task becomes its last direct task
        const direct = tree.groups.find(group => group.id === over.id)?.defaultSection
        if (!direct) return null
        sectionId = direct.id
        parentTaskId = null
        index = siblingsOf(sectionId, null).filter(task => task.id !== activeId).length
    } else if (over.kind === "task") {
        if (over.id === activeId || subtree.has(over.id)) return null
        const target = tasks.get(over.id)
        if (!target) return null
        sectionId = target.sectionId
        if (zone === "inside" || zone === "inside-start") {
            parentTaskId = target.task.id
            const without = siblingsOf(sectionId, parentTaskId).filter(task => task.id !== activeId)
            index = zone === "inside" ? without.length : 0
        } else {
            parentTaskId = target.parentId
            const without = siblingsOf(sectionId, parentTaskId).filter(task => task.id !== activeId)
            const overIndex = without.findIndex(task => task.id === over.id)
            if (overIndex < 0) return null
            index = zone === "after" ? overIndex + 1 : overIndex
        }
    } else {
        return null
    }

    if (parentTaskId != null && subtree.has(parentTaskId)) return null

    if (sectionId === active.sectionId && parentTaskId === active.parentId) {
        const currentIndex = siblingsOf(sectionId, parentTaskId).findIndex(task => task.id === activeId)
        if (currentIndex === index) return null
    }
    return { sectionId, parentTaskId, index }
}

const sortGroups = (groups: Group[]) => [...groups].sort((a, b) => a.position - b.position)

/** Finds a group in the tree and its index in the list sorted by position. */
export function findGroup(tree: NoteDataTree, id: number): { group: Group, index: number } | undefined {
    const sorted = sortGroups(tree.groups)
    const index = sorted.findIndex(group => group.id === id)
    return index < 0 ? undefined : { group: sorted[index], index }
}

/**
 * Computes the destination of a dragged group over another group: the final index among the groups (sorted by
 * position) once it has been moved. Returns null when the drop is invalid or would not change anything.
 * @category Note DnD
 */
export function computeGroupTarget(tree: NoteDataTree, activeId: number, over: NoteOverRef, zone: DropZone, from: NoteDataTree = tree): { index: number } | null {
    if (over.kind !== "group" || over.id === activeId) return null
    const sorted = sortGroups(tree.groups)
    if (from !== tree) {
        // Another note: the group is not in this list, so there is nothing to take out and every drop is a move
        const overAt = sorted.findIndex(group => group.id === over.id)
        return overAt < 0 || !findGroup(from, activeId) ? null : { index: zone === "after" ? overAt + 1 : overAt }
    }
    const activeIndex = sorted.findIndex(group => group.id === activeId)
    if (activeIndex < 0) return null
    const without = sorted.filter(group => group.id !== activeId)
    const overIndex = without.findIndex(group => group.id === over.id)
    if (overIndex < 0) return null
    const index = zone === "after" ? overIndex + 1 : overIndex
    return index === activeIndex ? null : { index }
}

type SectionMoveDestinations = {
    /** Other groups of the note, with a readable label and the titles of their sections. */
    groups: { id: number, label: string, hint: string }[]
    /** Whether "Nuovo gruppo" is offered (not for the only section of a group, that would only reorder groups). */
    canCreateGroup: boolean
    /** Index at which "Nuovo gruppo" creates the group: at the end. */
    newGroupIndex: number
}

/**
 * Destinations offered by the "Sposta in…" menu of a section: every other group (its name or "Gruppo N") plus a new group.
 * @category Note DnD
 */
export function getSectionMoveDestinations(tree: NoteDataTree, sectionId: number): SectionMoveDestinations {
    const currentGroup = tree.groups.find(group => group.sections.some(section => section.id === sectionId))
    return {
        groups: tree.groups
            .map((group, index) => ({
                id: group.id,
                label: getGroupLabel(group, index),
                hint: group.sections.map(getSectionLabel).join(", "),
            }))
            .filter(group => group.id !== currentGroup?.id),
        canCreateGroup: !!currentGroup && currentGroup.sections.length > 1,
        newGroupIndex: tree.groups.length,
    }
}

type TaskMoveDestination = {
    key: string
    /** "section": as top level task of the section; "task": as a subtask of the task. */
    type: "section" | "task"
    sectionId: number
    parentTaskId: number | null
    /** The section title, or the group label when `direct` is set. */
    label: string
    /** Group label (name or "Gruppo N") shown next to a section entry ("Task del gruppo" for a direct entry). */
    hint?: string
    /** True for the entry of the direct area of a group (its default section): `label` is then the group label. */
    direct?: true
    depth: number
}

/**
 * Destinations offered by the "Sposta in…" menu of a task: for every group its direct area (one entry, labelled with
 * the group), then every section (top level), each followed by its tasks and subtasks in depth-first order (as a subtask). Excludes the task itself and its descendants, the section where it
 * is already a top level task and its current parent.
 * @category Note DnD
 */
export function getTaskMoveDestinations(tree: NoteDataTree, taskId: number): TaskMoveDestination[] {
    const { tasks } = indexTree(tree)
    const active = tasks.get(taskId)
    if (!active) return []
    const subtree = getTaskSubtreeIds(active.task)
    const result: TaskMoveDestination[] = []

    const visit = (list: Task[], sectionId: number, depth: number) => {
        for (const task of list) {
            if (subtree.has(task.id)) continue
            if (task.id !== active.parentId)
                result.push({ key: `task-${task.id}`, type: "task", sectionId, parentTaskId: task.id, label: task.text, depth })
            visit(task.subtasks ?? [], sectionId, depth + 1)
        }
    }

    tree.groups.forEach((group, groupIndex) => {
        for (const section of taskSections(group)) {
            const direct = isDefaultSection(section)
            if (!(active.parentId == null && active.sectionId === section.id))
                result.push(direct
                    ? {
                        key: `section-${section.id}`, type: "section", sectionId: section.id, parentTaskId: null,
                        label: getGroupLabel(group, groupIndex), hint: i18n.t("groups.directTasks"), direct: true, depth: 0,
                    }
                    : {
                        key: `section-${section.id}`, type: "section", sectionId: section.id, parentTaskId: null,
                        label: getSectionLabel(section), hint: getGroupLabel(group, groupIndex), depth: 0,
                    })
            visit(section.tasks ?? [], section.id, 1)
        }
    })
    return result
}
