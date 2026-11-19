import type { Group, NoteDataTree, Section, Task } from "@/types/types"
import { findGroup, findSection, findTask } from "@/contexts/note-tree-ops"

/** What the helpers need from the open note (the optimistic actions of the active note context). */
type NoteAccess = {
    getNoteTree: () => NoteDataTree | null
    patchTask: (taskId: number, patch: Partial<Task>) => () => void
    patchGroup: (groupId: number, patch: Partial<Pick<Group, "tagIDs">>) => () => void
    patchSection: (sectionId: number, patch: Partial<Pick<Section, "tagIDs">>) => () => void
}

/** What a tag menu acts on: tasks, groups or sections of the open note. */
export type TagTarget = { kind: "tasks" | "groups" | "sections", ids: readonly number[] }

/**
 * Gives a tag to some tasks of the cached note, or takes it away, at once: the tasks that already are in that state are left alone.
 * @param note Access to the cached note.
 * @param tagId The tag.
 * @param taskIds The tasks.
 * @param assigned True to give the tag, false to take it away.
 * @returns The ids of the tasks that really changed and what puts the cache back (for a write that fails).
 * @category Utils
 */
export function patchTagOnTasks(note: NoteAccess, tagId: number, taskIds: readonly number[], assigned: boolean): { changed: number[], rollback: () => void } {
    const changed: number[] = []
    const rollbacks: (() => void)[] = []
    for (const id of taskIds) {
        const tree = note.getNoteTree()
        const found = tree ? findTask(tree, id) : undefined
        if (!found) continue
        const ids = found.task.tagIDs ?? []
        if (ids.includes(tagId) === assigned) continue
        changed.push(id)
        rollbacks.push(note.patchTask(id, { tagIDs: assigned ? [...ids, tagId] : ids.filter(other => other !== tagId) }))
    }
    return { changed, rollback: () => { for (const rollback of rollbacks.reverse()) rollback() } }
}

/**
 * Like patchTagOnTasks for groups: gives a tag to some groups of the cached note, or takes it away, at once.
 * @returns The ids of the groups that really changed and what puts the cache back (for a write that fails).
 */
export function patchTagOnGroups(note: NoteAccess, tagId: number, groupIds: readonly number[], assigned: boolean): { changed: number[], rollback: () => void } {
    const changed: number[] = []
    const rollbacks: (() => void)[] = []
    for (const id of groupIds) {
        const tree = note.getNoteTree()
        const found = tree ? findGroup(tree, id) : undefined
        if (!found) continue
        const ids = found.group.tagIDs ?? []
        if (ids.includes(tagId) === assigned) continue
        changed.push(id)
        rollbacks.push(note.patchGroup(id, { tagIDs: assigned ? [...ids, tagId] : ids.filter(other => other !== tagId) }))
    }
    return { changed, rollback: () => { for (const rollback of rollbacks.reverse()) rollback() } }
}

/**
 * Like patchTagOnGroups for sections: gives a tag to some sections of the cached note, or takes it away, at once.
 * @returns The ids of the sections that really changed and what puts the cache back (for a write that fails).
 */
export function patchTagOnSections(note: NoteAccess, tagId: number, sectionIds: readonly number[], assigned: boolean): { changed: number[], rollback: () => void } {
    const changed: number[] = []
    const rollbacks: (() => void)[] = []
    for (const id of sectionIds) {
        const tree = note.getNoteTree()
        const found = tree ? findSection(tree, id) : undefined
        if (!found) continue
        const ids = found.section.tagIDs ?? []
        if (ids.includes(tagId) === assigned) continue
        changed.push(id)
        rollbacks.push(note.patchSection(id, { tagIDs: assigned ? [...ids, tagId] : ids.filter(other => other !== tagId) }))
    }
    return { changed, rollback: () => { for (const rollback of rollbacks.reverse()) rollback() } }
}

/** How many of the sections (found in the note) have a tag: all of them, some, or none. */
export function sectionTagCoverage(tree: NoteDataTree | null, sectionIds: readonly number[], tagId: number): { with: number, total: number } {
    let total = 0
    let withTag = 0
    for (const id of sectionIds) {
        const found = tree ? findSection(tree, id) : undefined
        if (!found) continue
        total += 1
        if (found.section.tagIDs?.includes(tagId)) withTag += 1
    }
    return { with: withTag, total }
}

/** How many of the groups (found in the note) have a tag: all of them, some, or none. */
export function groupTagCoverage(tree: NoteDataTree | null, groupIds: readonly number[], tagId: number): { with: number, total: number } {
    let total = 0
    let withTag = 0
    for (const id of groupIds) {
        const found = tree ? findGroup(tree, id) : undefined
        if (!found) continue
        total += 1
        if (found.group.tagIDs?.includes(tagId)) withTag += 1
    }
    return { with: withTag, total }
}

/** How many of the tasks (found in the note) have a tag: all of them, some, or none. */
export function tagCoverage(tree: NoteDataTree | null, taskIds: readonly number[], tagId: number): { with: number, total: number } {
    let total = 0
    let withTag = 0
    for (const id of taskIds) {
        const found = tree ? findTask(tree, id) : undefined
        if (!found) continue
        total += 1
        if (found.task.tagIDs?.includes(tagId)) withTag += 1
    }
    return { with: withTag, total }
}
