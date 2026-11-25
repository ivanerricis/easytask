import type { Group, NoteDataTree, Section, Task } from "@/types/types"
import { defaultIndexAfterInsert, directIndexOf, isDefaultSection, taskSections } from "@/lib/group-sections"

/**
 * Pure immutable operations on a note tree, used for the optimistic updates of the active note.
 * Every operation returns a new tree (only the touched path is copied) or the SAME tree when there is nothing to do
 * (item not found), so callers can detect a no-op with `===`.
 * @category ActiveNote Context
 */

export type GroupPatch = Partial<Omit<Group, "sections">>
export type SectionPatch = Partial<Omit<Section, "tasks">>

/** Where a task lives: at the top level of a section or under another task. */
export type TaskParent = { sectionId: number } | { parentTaskId: number }

/** Location of a task in the tree. */
type TaskLocation = { task: Task, parent: TaskParent, index: number }

const clamp = (index: number | undefined, length: number) =>
    index === undefined ? length : Math.max(0, Math.min(Math.trunc(index) || 0, length))

export const insertAt = <T,>(list: T[], item: T, index?: number): T[] => {
    const next = list.slice()
    next.splice(clamp(index, list.length), 0, item)
    return next
}

/** Position of a new item appended after `siblings`. */
export const nextPosition = (siblings: readonly { position: number }[]) =>
    siblings.reduce((max, sibling) => Math.max(max, sibling.position), -1) + 1

/**
 * Current local date and time in the format of the database defaults (`YYYY-MM-DD` and `HH:MM`, local time).
 * @category ActiveNote Context
 */
export function localTimestamp(now = new Date()) {
    const pad = (value: number) => String(value).padStart(2, "0")
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    return { date, time }
}

/* ------------------------------------------------------------------------------------ */
// Builders (defaults of the database columns)

/** A new empty group appended after `siblings`, with its hidden default section when the database just created it. */
export function buildGroup(id: number, noteId: number, name: string | null, siblings: readonly Group[], defaultSectionId?: number): Group {
    const group: Group = { id, noteID: noteId, position: nextPosition(siblings), name: name?.trim() || null, sections: [] }
    if (defaultSectionId !== undefined) {
        group.defaultSection = buildDefaultSection(defaultSectionId, id)
        group.defaultIndex = 0
    }
    return group
}

/** A new empty section appended after `siblings`. */
export function buildSection(id: number, groupId: number, title: string, siblings: readonly Section[], position?: number): Section {
    const { date, time } = localTimestamp()
    return {
        id, groupID: groupId, title, position: position ?? nextPosition(siblings),
        creation_date: date, creation_time: time, edit_date: date, edit_time: time,
        deleted_at: null, color: null, tasks: [],
    }
}

/** The hidden default section of a new group (no title, position 0: the sections that follow take the next numbers): it holds the tasks created directly in the group. */
export function buildDefaultSection(id: number, groupId: number): Section {
    // Untitled, like a section loaded with a NULL title
    return { ...buildSection(id, groupId, "", [], 0), is_default: true }
}

/** A new task appended after `siblings` (`sectionId` is the section of the task, also for subtasks). */
export function buildTask(id: number, sectionId: number | null, parentTaskId: number | null, text: string, siblings: readonly Task[]): Task {
    const { date, time } = localTimestamp()
    return {
        id, sectionID: sectionId, taskID: parentTaskId, position: nextPosition(siblings),
        creation_date: date, creation_time: time, edit_date: date, edit_time: time,
        deleted_at: null, color: null, due_date: null, due_time: null, text, completed: false, priority: false,
        description: "", subtasks: [],
    }
}

/* ------------------------------------------------------------------------------------ */
// Lookups

/** Finds a group with its index among the groups. */
export function findGroup(tree: NoteDataTree, groupId: number): { group: Group, index: number } | undefined {
    const index = tree.groups.findIndex(group => group.id === groupId)
    return index < 0 ? undefined : { group: tree.groups[index], index }
}

/**
 * Finds a section with its group and index among the sections of the group.
 * The default section of a group is found too, with index -1 (it is not in `group.sections`).
 */
export function findSection(tree: NoteDataTree, sectionId: number): { section: Section, groupId: number, index: number } | undefined {
    for (const group of tree.groups) {
        if (group.defaultSection?.id === sectionId) return { section: group.defaultSection, groupId: group.id, index: -1 }
        const index = group.sections.findIndex(section => section.id === sectionId)
        if (index >= 0) return { section: group.sections[index], groupId: group.id, index }
    }
    return undefined
}

/** Finds a task (at any depth) with its parent and index among its siblings. */
export function findTask(tree: NoteDataTree, taskId: number): TaskLocation | undefined {
    const visit = (tasks: Task[], parent: TaskParent): TaskLocation | undefined => {
        for (let index = 0; index < tasks.length; index++) {
            const task = tasks[index]
            if (task.id === taskId) return { task, parent, index }
            const inner = visit(task.subtasks, { parentTaskId: task.id })
            if (inner) return inner
        }
        return undefined
    }
    for (const group of tree.groups)
        for (const section of taskSections(group)) {
            const found = visit(section.tasks, { sectionId: section.id })
            if (found) return found
        }
    return undefined
}

/* ------------------------------------------------------------------------------------ */
// Internal maps

/**
 * Applies a change to the task list of a parent (a section or a task).
 * The change returns the same array when nothing changed.
 */
function mapTaskList(tree: NoteDataTree, parent: TaskParent, change: (tasks: Task[]) => Task[]): NoteDataTree {
    const visit = (tasks: Task[]): Task[] => {
        let changed = false
        const next = tasks.map(task => {
            if ("parentTaskId" in parent && task.id === parent.parentTaskId) {
                const subtasks = change(task.subtasks)
                if (subtasks === task.subtasks) return task
                changed = true
                return { ...task, subtasks }
            }
            const subtasks = visit(task.subtasks)
            if (subtasks === task.subtasks) return task
            changed = true
            return { ...task, subtasks }
        })
        return changed ? next : tasks
    }

    const groups = tree.groups.map(group => {
        let groupChanged = false
        const mapTasks = (section: Section): Section => {
            const tasks = "sectionId" in parent && section.id === parent.sectionId
                ? change(section.tasks)
                : visit(section.tasks)
            if (tasks === section.tasks) return section
            groupChanged = true
            return { ...section, tasks }
        }
        const defaultSection = group.defaultSection ? mapTasks(group.defaultSection) : group.defaultSection
        const sections = group.sections.map(mapTasks)
        if (!groupChanged) return group
        return defaultSection === undefined || defaultSection === null ? { ...group, sections } : { ...group, defaultSection, sections }
    })
    return groups.some((group, i) => group !== tree.groups[i]) ? { groups } : tree
}

/** Applies a change to a section, wherever it is. */
function mapSection(tree: NoteDataTree, sectionId: number, change: (section: Section) => Section): NoteDataTree {
    let found = false
    const groups = tree.groups.map(group => {
        if (group.defaultSection?.id === sectionId) {
            found = true
            return { ...group, defaultSection: change(group.defaultSection) }
        }
        const index = group.sections.findIndex(section => section.id === sectionId)
        if (index < 0) return group
        found = true
        const sections = group.sections.slice()
        sections[index] = change(group.sections[index])
        return { ...group, sections }
    })
    return found ? { groups } : tree
}

/* ------------------------------------------------------------------------------------ */
// Patch

/** Merges a patch into a group. */
export function patchGroup(tree: NoteDataTree, groupId: number, patch: GroupPatch): NoteDataTree {
    if (!tree.groups.some(group => group.id === groupId)) return tree
    return { groups: tree.groups.map(group => group.id === groupId ? { ...group, ...patch } : group) }
}

/** Merges a patch into a section. */
export function patchSection(tree: NoteDataTree, sectionId: number, patch: SectionPatch): NoteDataTree {
    return mapSection(tree, sectionId, section => ({ ...section, ...patch }))
}

/** Applies a change to a task (at any depth). */
export function mapTask(tree: NoteDataTree, taskId: number, change: (task: Task) => Task): NoteDataTree {
    const location = findTask(tree, taskId)
    if (!location) return tree
    return mapTaskList(tree, location.parent, tasks => tasks.map(task => task.id === taskId ? change(task) : task))
}

/** Merges a patch into a task (at any depth). */
export function patchTask(tree: NoteDataTree, taskId: number, patch: Partial<Task>): NoteDataTree {
    return mapTask(tree, taskId, task => ({ ...task, ...patch }))
}

/* ------------------------------------------------------------------------------------ */
// Insert

/** Inserts a group at `index` (default: the end). */
export function insertGroup(tree: NoteDataTree, group: Group, index?: number): NoteDataTree {
    if (tree.groups.some(existing => existing.id === group.id)) return tree
    return { groups: insertAt(tree.groups, group, index) }
}

/**
 * Inserts a section in a group at `index` among the sections (default: the end). Same tree when the group does not exist.
 * Like the database, a section inserted exactly where the list of the direct tasks is goes after the list; one inserted
 * before it pushes the list down by one place. With `beforeList` a section inserted exactly where the list is goes right
 * before it instead (the list is pushed down too).
 */
export function insertSection(tree: NoteDataTree, groupId: number, section: Section, index?: number, beforeList = false): NoteDataTree {
    if (findSection(tree, section.id) || !tree.groups.some(group => group.id === groupId)) return tree
    return { groups: tree.groups.map(group => group.id === groupId
        ? {
            ...group,
            sections: insertAt(group.sections, section, index),
            ...(group.defaultSection ? { defaultIndex: defaultIndexAfterInsert(directIndexOf(group), Math.min(index ?? group.sections.length, group.sections.length), beforeList) } : {}),
        }
        : group) }
}

/** Inserts a task at the top level of a section or under a parent task, at `index` (default: the end). */
export function insertTask(tree: NoteDataTree, parent: TaskParent, task: Task, index?: number): NoteDataTree {
    if (findTask(tree, task.id)) return tree
    return mapTaskList(tree, parent, tasks => insertAt(tasks, task, index))
}

/* ------------------------------------------------------------------------------------ */
// Remove

/** Removes a group (with its content). */
export function removeGroup(tree: NoteDataTree, groupId: number): NoteDataTree {
    if (!tree.groups.some(group => group.id === groupId)) return tree
    return { groups: tree.groups.filter(group => group.id !== groupId) }
}

/** Removes a section (with its tasks). The default section of a group cannot be removed on its own. */
export function removeSection(tree: NoteDataTree, sectionId: number): NoteDataTree {
    if (isDefaultSection(findSection(tree, sectionId)?.section) ) return tree
    return mapSectionGroup(tree, sectionId, sections => sections.filter(section => section.id !== sectionId))
}

/** Removes a task (with its subtasks). */
export function removeTask(tree: NoteDataTree, taskId: number): NoteDataTree {
    const location = findTask(tree, taskId)
    if (!location) return tree
    return mapTaskList(tree, location.parent, tasks => tasks.filter(task => task.id !== taskId))
}

function mapSectionGroup(tree: NoteDataTree, sectionId: number, change: (sections: Section[]) => Section[]): NoteDataTree {
    const found = findSection(tree, sectionId)
    if (!found) return tree
    return { groups: tree.groups.map(group => {
        if (group.id !== found.groupId) return group
        const sections = change(group.sections)
        // The list keeps its place among the rest: the sections that were before it and are gone no longer count
        const removedBefore = group.sections.slice(0, directIndexOf(group)).filter(section => !sections.includes(section)).length
        return { ...group, sections, ...(group.defaultSection ? { defaultIndex: directIndexOf(group) - removedBefore } : {}) }
    }) }
}

/* ------------------------------------------------------------------------------------ */
// Move

/** Groups with the given one moved to `index`, positions renumbered from 0. Null when the group is unknown. */
export function moveGroupInList(groups: Group[], groupId: number, index: number): Group[] | null {
    const items = [...groups].sort((a, b) => a.position - b.position)
    const from = items.findIndex(group => group.id === groupId)
    if (from < 0) return null
    const [moved] = items.splice(from, 1)
    items.splice(index, 0, moved)
    return items.map((group, position) => ({ ...group, position }))
}

/**
 * Moves a section to a group at `index` among the destination sections (counted without the section itself,
 * like the database move). `beforeList`: see {@link insertSection}. Same tree when the section or the group does not exist.
 */
export function moveSection(tree: NoteDataTree, sectionId: number, targetGroupId: number, index: number, beforeList = false): NoteDataTree {
    const found = findSection(tree, sectionId)
    if (!found || found.index < 0 || !tree.groups.some(group => group.id === targetGroupId)) return tree
    const moved: Section = { ...found.section, groupID: targetGroupId }
    return insertSection(removeSection(tree, sectionId), targetGroupId, moved, index, beforeList)
}

/**
 * Moves the list of the direct tasks of a group (its default section) before the `index`-th section with a header, or after
 * all of them (`index` is clamped to 0..sections.length). Same tree when the group has no list or it is already there.
 */
export function moveDirectSection(tree: NoteDataTree, groupId: number, index: number): NoteDataTree {
    const found = findGroup(tree, groupId)
    if (!found || !found.group.defaultSection) return tree
    const defaultIndex = Math.max(0, Math.min(Math.trunc(index) || 0, found.group.sections.length))
    return defaultIndex === directIndexOf(found.group) && found.group.defaultIndex === defaultIndex ? tree : patchGroup(tree, groupId, { defaultIndex })
}

/**
 * Moves a task (with its subtree) to a section (top level) or under another task, at `index` among the new siblings
 * (counted without the task itself). The section of the whole subtree follows. Same tree when the move is not
 * possible (unknown task or destination, destination inside the moved subtree).
 */
export function moveTask(tree: NoteDataTree, taskId: number, target: { sectionId: number, parentTaskId: number | null }, index: number): NoteDataTree {
    const found = findTask(tree, taskId)
    if (!found) return tree
    const parent: TaskParent = target.parentTaskId !== null ? { parentTaskId: target.parentTaskId } : { sectionId: target.sectionId }

    const retarget = (task: Task, parentTaskId: number | null): Task => ({
        ...task,
        sectionID: target.sectionId,
        taskID: parentTaskId,
        subtasks: task.subtasks.map(sub => retarget(sub, task.id)),
    })
    const withoutTask = removeTask(tree, taskId)
    const next = insertTask(withoutTask, parent, retarget(found.task, target.parentTaskId), index)
    return next === withoutTask ? tree : next
}
