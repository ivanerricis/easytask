import type { DropZone, TaskTarget } from "./note-dnd"

/**
 * Pure logic of the "live drag" of the tasks: while a task is dragged the other ones step aside (a visual `translateY`
 * of their outer wrapper) to open the room where the dragged one would land, and the room it leaves is closed.
 * Nothing here touches React or the note data: it works on a snapshot of the sizes taken when the drag starts.
 * The order is the one drawn in the DOM (with "hide completed" and "completed last" it is not the order of the data).
 * @category Note DnD
 */

/** A task wrapper (the task with its open subtasks) as measured in the DOM. */
export type LiveNodeInfo = {
    key: string
    /** The list it belongs to: "s-<sectionId>" for the top level tasks of a section, "t-<taskId>" for the subtasks of a task. */
    list: string
    /** Key of the wrapper of the parent task (null for a top level task). */
    parent: string | null
    top: number
    height: number
}

export type LiveItem = LiveNodeInfo & {
    /** Position in the document order of all the wrappers. */
    ord: number
    /** `ord` of its last descendant (its own `ord` when it has none). */
    end: number
}

export type LiveSnapshot = {
    items: Map<string, LiveItem>
    /** Keys of every list, in the order they are drawn. */
    lists: Map<string, string[]>
}

/** What the drag is over: a task row, the side of it and the list the target belongs to (see {@link taskListKey}). */
export type LivePending = { over: string, zone: DropZone | null, list: string }

/** Key of the list a target (section + parent task) belongs to. */
export const taskListKey = (target: Pick<TaskTarget, "sectionId" | "parentTaskId">): string =>
    target.parentTaskId != null ? `t-${target.parentTaskId}` : `s-${target.sectionId}`

/**
 * Builds the snapshot from the wrappers, given in document order (a parent always comes before its subtasks).
 * @category Note DnD
 */
export function buildLiveSnapshot(nodes: LiveNodeInfo[]): LiveSnapshot {
    const items = new Map<string, LiveItem>()
    const lists = new Map<string, string[]>()
    nodes.forEach((node, ord) => {
        items.set(node.key, { ...node, ord, end: ord })
        const list = lists.get(node.list)
        if (list) list.push(node.key)
        else lists.set(node.list, [node.key])
    })
    for (const item of items.values()) {
        for (let parent = item.parent ? items.get(item.parent) : undefined; parent; parent = parent.parent ? items.get(parent.parent) : undefined)
            parent.end = Math.max(parent.end, item.ord)
    }
    return { items, lists }
}

/** The item and its ancestors, from the inside out. */
function chainOf(items: Map<string, LiveItem>, item: LiveItem): LiveItem[] {
    const chain: LiveItem[] = []
    for (let current: LiveItem | undefined = item; current; current = current.parent ? items.get(current.parent) : undefined) chain.push(current)
    return chain
}

const NONE: ReadonlyMap<string, number> = new Map()

/**
 * The vertical shift of every wrapper to show where `dragged` would land.
 * - same list: the rows between the dragged one and the place move by its height (up when it goes down, down when it goes up);
 * - another list: the rows after the dragged one close the room it leaves, the rows after the place open the room it takes;
 * - the dragged task itself is not moved (the caller hides it); the rows of a parent that gets longer or shorter push the ones
 *   after it, so the shifts are relative to the parent wrapper, which already carries its own.
 * Dropping "inside" a task (a subtask) or over nothing moves nothing, and so does a target that is not in the snapshot.
 * @returns key -> dy, only the rows that move.
 * @category Note DnD
 */
export function computeLiveShifts(snapshot: LiveSnapshot, dragged: string, pending: LivePending): ReadonlyMap<string, number> {
    const { items, lists } = snapshot
    if (pending.zone !== "before" && pending.zone !== "after") return NONE
    const find = (key: string | undefined) => key === undefined ? undefined : items.get(key)
    const source = items.get(dragged)
    const over = items.get(pending.over)
    if (!source || !over || over.key === dragged || over.list !== pending.list) return NONE
    // Under itself (or one of its subtasks) nothing can be dropped
    if (over.ord >= source.ord && over.ord <= source.end) return NONE

    // The room of the dragged task: from its top to the top of the next row of its list (the space between rows included)
    const sourceList = lists.get(source.list) ?? []
    const next = find(sourceList[sourceList.indexOf(dragged) + 1])
    const size = next ? next.top - source.top : source.height
    if (!(size > 0)) return NONE

    // The place: before the row that follows it in its list, or at the end of the list
    const rest = (lists.get(over.list) ?? []).filter(key => key !== dragged)
    const place = rest.indexOf(over.key) + (pending.zone === "after" ? 1 : 0)
    const firstAfter = find(rest[place])
    const last = find(rest[rest.length - 1])
    const threshold = firstAfter ? firstAfter.ord : (last ? last.end + 1 : Infinity)

    const sourceChain = chainOf(items, source)
    const overAncestors = chainOf(items, over).slice(1)
    const scope = new Set<string>([...sourceChain, ...overAncestors, over].map(item => item.list))

    /** A row follows the place it is compared to when it, or one of the parents, is a later sibling. */
    const followsSource = (item: LiveItem) =>
        chainOf(items, item).some(y => sourceChain.some(a => y.list === a.list && y.ord > a.end))
    const followsPlace = (item: LiveItem) =>
        chainOf(items, item).some(y =>
            (y.list === over.list && y.ord >= threshold) || overAncestors.some(a => y.list === a.list && y.ord > a.end))

    const displacement = new Map<string, number>()
    const displacementOf = (item: LiveItem): number => {
        const known = displacement.get(item.key)
        if (known !== undefined) return known
        const value = size * ((followsPlace(item) ? 1 : 0) - (followsSource(item) ? 1 : 0))
        displacement.set(item.key, value)
        return value
    }

    const shifts = new Map<string, number>()
    for (const list of scope) {
        for (const key of lists.get(list) ?? []) {
            const item = items.get(key)
            // The dragged task and its subtasks are not moved
            if (!item || (item.ord >= source.ord && item.ord <= source.end)) continue
            const parent = item.parent ? items.get(item.parent) : undefined
            const dy = displacementOf(item) - (parent ? displacementOf(parent) : 0)
            if (dy !== 0) shifts.set(key, dy)
        }
    }
    return shifts
}

type RectLike = { top: number, bottom: number, left: number, right: number, width: number, height: number }

/**
 * A measure function for the droppables of dnd-kit that takes away the shift already applied to the element or to one of its
 * ancestors (the wrapper of a task and its subtasks move together). Without it the places the pointer is tested against would
 * move with the shift and the target would flicker between two places.
 * @param base Measure of the rect as it is on screen.
 * @param shiftOf The vertical shift currently applied to the element and its ancestors.
 * @category Note DnD
 */
export const makeShiftFreeMeasure = <R extends RectLike>(base: (element: HTMLElement) => R, shiftOf: (element: HTMLElement) => number) =>
    (element: HTMLElement): R => {
        const rect = base(element)
        const dy = shiftOf(element)
        return dy ? { ...rect, top: rect.top - dy, bottom: rect.bottom - dy } : rect
    }
