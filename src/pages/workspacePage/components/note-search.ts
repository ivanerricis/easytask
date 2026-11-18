import { taskSections } from "@/lib/group-sections"
import type { NoteDataTree, Task } from "@/types/types"
import { orderedVisibleTasks } from "./section/hide-completed"
import { effectiveTaskOrder, type TaskOrder } from "@/lib/task-order"

/** A range [start, end) of the original text. */
export type MatchRange = readonly [start: number, end: number]

/** The key under which a part of the note (a group name, a section title, a task text) is searched and highlighted. */
export const searchKey = (kind: SearchMatchKind, id: number) => `${kind}-${id}`

/** Lowercase, without accents: what two texts are compared by. */
export function normalizeForSearch(text: string): string {
    return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/** The text normalized one code point at a time, with the range of the original text each normalized unit comes from. */
function normalizeWithMap(text: string) {
    let normalized = ""
    const starts: number[] = []
    const ends: number[] = []
    let index = 0
    for (const char of text) {
        const next = index + char.length
        const piece = normalizeForSearch(char)
        for (let i = 0; i < piece.length; i++) {
            starts.push(index)
            ends.push(next)
        }
        normalized += piece
        index = next
    }
    return { normalized, starts, ends }
}

/**
 * Every non-overlapping occurrence of `query` in `text` as [start, end) of the original text, ignoring case and accents.
 * An empty query has no matches.
 * @category Note
 */
export function findMatchRanges(text: string, query: string): MatchRange[] {
    const needle = normalizeForSearch(query)
    if (!needle || !text) return []
    const { normalized, starts, ends } = normalizeWithMap(text)
    const ranges: MatchRange[] = []
    let from = 0
    for (;;) {
        const at = normalized.indexOf(needle, from)
        if (at < 0) break
        ranges.push([starts[at], ends[at + needle.length - 1]])
        from = at + needle.length
    }
    return ranges
}

export type SearchMatchKind = "group" | "section" | "task"

/** One occurrence of the query in the note, with what is needed to bring it into view. */
export type SearchMatch = {
    /** Unique: the key of the item plus the occurrence ("task-4#1"). */
    id: string
    /** Key of the item that holds it (see searchKey): the same for all its occurrences. */
    key: string
    kind: SearchMatchKind
    /** Id of the group, section or task. */
    itemId: number
    groupId: number
    /** The section that holds it (a section title is its own section). Absent for a group name. */
    sectionId?: number
    /** The ancestors of a subtask, from the top level task down to its parent (they may be closed). */
    taskPath: number[]
    /** Which occurrence inside the text it is (0-based). */
    occurrence: number
}

export type CollectOptions = {
    /** Matches inside tasks hidden by "hide completed tasks" are not counted (they are not on the screen). */
    hideCompleted: boolean
    /** The preference "completed tasks last": the order of the sections that have no choice of their own (see effectiveTaskOrder). */
    completedLast?: boolean
}

/**
 * The matches of the note in the order they are drawn: groups by position; for each, its name, then the tasks put directly
 * in it and their subtasks (depth first), then its sections by position (title, then tasks and subtasks).
 * @category Note
 */
export function collectMatches(tree: NoteDataTree, query: string, { hideCompleted, completedLast = false }: CollectOptions): SearchMatch[] {
    if (!normalizeForSearch(query)) return []
    const matches: SearchMatch[] = []
    const add = (kind: SearchMatchKind, itemId: number, text: string | null | undefined, groupId: number, sectionId: number | undefined, taskPath: number[]) => {
        const count = findMatchRanges(text ?? "", query).length
        const key = searchKey(kind, itemId)
        for (let occurrence = 0; occurrence < count; occurrence++)
            matches.push({ id: `${key}#${occurrence}`, key, kind, itemId, groupId, sectionId, taskPath, occurrence })
    }
    const visit = (list: Task[], groupId: number, sectionId: number, path: number[], order: TaskOrder) => {
        for (const task of orderedVisibleTasks(list ?? [], { hideCompleted, order })) {
            add("task", task.id, task.text, groupId, sectionId, path)
            visit(task.subtasks ?? [], groupId, sectionId, [...path, task.id], order)
        }
    }
    for (const group of [...tree.groups].sort((a, b) => a.position - b.position)) {
        add("group", group.id, group.name?.trim(), group.id, undefined, [])
        for (const section of taskSections(group)) {
            // The default section has no title: its tasks sit directly in the group
            if (group.defaultSection?.id !== section.id) add("section", section.id, section.title, group.id, section.id, [])
            visit(section.tasks ?? [], group.id, section.id, [], effectiveTaskOrder(section.task_order, completedLast))
        }
    }
    return matches
}
