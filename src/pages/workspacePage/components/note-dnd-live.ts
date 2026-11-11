import type { DropZone, TaskTarget } from "./note-dnd"

/**
 * Pure logic of the "live drag" of the tasks, the sections and the groups: while one is dragged the other ones step aside (a visual
 * translation of their outer wrapper) to open the room where the dragged one would land, and the room it leaves is closed.
 * A section is a row of the list of its group ("g-<groupId>", see {@link groupListKey}) and carries its tasks with it: only its own
 * wrapper moves. The groups are the columns of the one list {@link GROUPS_LIST}: they step aside along the horizontal axis. The maths is
 * the same on both axes: `top` and `height` of a node are its start and its size along the axis it is moved on (`left` and `width` for a group).
 * Nothing here touches React or the note data: it works on a snapshot of the sizes taken when the drag starts.
 * The order is the one drawn in the DOM (with "hide completed" and "completed last" it is not the order of the data).
 * @category Note DnD
 */

/** A task wrapper (the task with its open subtasks) as measured in the DOM. */
export type LiveNodeInfo = {
    key: string
    /** The list it belongs to: "s-<sectionId>" for the top level tasks of a section, "t-<taskId>" for the subtasks of a task, "g-<groupId>" for the sections of a group. */
    list: string
    /** Key of the wrapper of the parent task (null for a top level task). */
    parent: string | null
    /** Start along the axis of the move (the top of a row, the left side of a group). */
    top: number
    /** Size along the axis of the move (the height of a row, the width of a group). */
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

/**
 * What the drag is over: a row, the side of it and the list the target belongs to (see {@link taskListKey}, {@link groupListKey}).
 * `over` null = at the end of the list (a section dropped on the empty area of a group).
 */
export type LivePending = { over: string | null, zone: DropZone | null, list: string }

/** Key of the list of the groups of a note (the columns, moved along the horizontal axis). */
export const GROUPS_LIST = "groups"

/** Key of the list of the sections of a group. */
export const groupListKey = (groupId: number): string => `g-${groupId}`

/** Key of the list of the open tabs of a bar (`pane`: 0 for the only bar of a workspace that is not split). They step aside along the horizontal axis. */
export const tabListKey = (pane: number): string => `b-${pane}`

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
    const atEnd = pending.over === null
    if (!atEnd && pending.zone !== "before" && pending.zone !== "after") return NONE
    const find = (key: string | undefined) => key === undefined ? undefined : items.get(key)
    const source = items.get(dragged)
    const over = atEnd ? undefined : items.get(pending.over!)
    if (!source || (!atEnd && (!over || over.key === dragged || over.list !== pending.list))) return NONE
    // Under itself (or one of its subtasks) nothing can be dropped
    if (over && over.ord >= source.ord && over.ord <= source.end) return NONE

    // The room of the dragged task: from its top to the top of the next row of its list (the space between rows included)
    const sourceList = lists.get(source.list) ?? []
    const next = find(sourceList[sourceList.indexOf(dragged) + 1])
    // (the last row has no next one: the gap before it is the one it leaves, when there is a previous row)
    const previous = find(sourceList[sourceList.indexOf(dragged) - 1])
    const size = next ? next.top - source.top : source.height + (previous ? Math.max(0, source.top - (previous.top + previous.height)) : 0)
    if (!(size > 0)) return NONE

    // The place: before the row that follows it in its list, or at the end of the list
    const rest = (lists.get(pending.list) ?? []).filter(key => key !== dragged)
    const place = over ? rest.indexOf(over.key) + (pending.zone === "after" ? 1 : 0) : rest.length
    const firstAfter = find(rest[place])
    const last = find(rest[rest.length - 1])
    const threshold = firstAfter ? firstAfter.ord : (last ? last.end + 1 : Infinity)

    const sourceChain = chainOf(items, source)
    const overAncestors = over ? chainOf(items, over).slice(1) : []
    const scope = new Set<string>([...sourceChain, ...overAncestors, ...(over ? [over] : [])].map(item => item.list).concat(pending.list))

    /** A row follows the place it is compared to when it, or one of the parents, is a later sibling. */
    const followsSource = (item: LiveItem) =>
        chainOf(items, item).some(y => sourceChain.some(a => y.list === a.list && y.ord > a.end))
    const followsPlace = (item: LiveItem) =>
        chainOf(items, item).some(y =>
            (y.list === pending.list && y.ord >= threshold) || overAncestors.some(a => y.list === a.list && y.ord > a.end))

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

/** Largest hysteresis (px) and its share of the row height: on a 34 px row the margin stays at ~1.4 px, so the preview follows the real zone. */
export const ZONE_HYSTERESIS_MAX = 3
export const ZONE_HYSTERESIS_RATIO = 0.04

/** How far (px) the pointer must cross the border of a zone before the rows react to the change (proportional to the row, capped). */
export const zoneHysteresis = (rowHeight: number) => Math.min(ZONE_HYSTERESIS_MAX, rowHeight * ZONE_HYSTERESIS_RATIO)

/**
 * Hysteresis of the zone used to MOVE THE ROWS (presentation only: the drop still uses the real zone). While the pointer stays
 * over the same task, the previous zone is kept as long as the pointer is within `margin` px of it, so the rows do not flicker
 * on the border between "inside" and "before" / "after". Same borders as `computeDropZone` (25% / 75% of the row).
 * @param previous The zone shown now for this same task (null when the task is a new one: no hysteresis).
 * @param next The real zone at the pointer.
 * @param rect Top and height of the task row.
 * @param pointerY Vertical pointer position (same space as rect).
 * @category Note DnD
 */
export function holdLiveZone(previous: DropZone | null, next: DropZone, rect: { top: number, height: number }, pointerY: number, margin = zoneHysteresis(rect.height)): DropZone {
    if (previous === null || previous === next) return next
    const y = pointerY - rect.top
    const upper = rect.height * 0.25
    const lower = rect.height * 0.75
    if (previous === "before") return y < upper + margin ? previous : next
    if (previous === "inside") return y > upper - margin && y < lower + margin ? previous : next
    if (previous === "after" || previous === "inside-start") return y > lower - margin ? previous : next
    return next
}

/**
 * Same as {@link holdLiveZone} for the rows that have only two zones (a section card: top half = before, bottom half = after):
 * the previous side is kept while the pointer is within `margin` px of the middle.
 * @category Note DnD
 */
export function holdHalfZone(previous: DropZone | null, next: DropZone, rect: { top: number, height: number }, pointerY: number, margin = zoneHysteresis(rect.height)): DropZone {
    if (previous === null || previous === next || (previous !== "before" && previous !== "after")) return next
    const y = pointerY - rect.top
    const middle = rect.height / 2
    if (previous === "before") return y < middle + margin ? previous : next
    return y > middle - margin ? previous : next
}

/**
 * Same as {@link holdLiveZone} for the groups: two zones (left half = before, right half = after), the previous side is kept while
 * the pointer is within `margin` px of the middle of the column.
 * @category Note DnD
 */
export const holdHalfZoneX = (previous: DropZone | null, next: DropZone, rect: { left: number, width: number }, pointerX: number, margin = zoneHysteresis(rect.width)): DropZone =>
    holdHalfZone(previous, next, { top: rect.left, height: rect.width }, pointerX, margin)

/**
 * Whether the pointer is in the gap just outside a row (the few px between two sections belong to the group, not to a section):
 * the rows keep their place there instead of jumping to the "end of the group" and back.
 * @category Note DnD
 */
export const isInRowGap = (rect: { top: number, bottom: number }, pointerY: number, tolerance = ROW_GAP_TOLERANCE): boolean =>
    pointerY >= rect.top - tolerance && pointerY <= rect.bottom + tolerance

/** Largest gap (px) between two sections that does not change the place shown (the rows of a group are 4px apart). */
export const ROW_GAP_TOLERANCE = 8

/**
 * Whether the pointer is in the few px around a group column (the 8px between two groups and the padding above and below belong to
 * no droppable): the columns keep their place there instead of jumping back and forth.
 * @category Note DnD
 */
export const isInColumnGap = (rect: { left: number, right: number, top: number, bottom: number }, pointer: { x: number, y: number }, tolerance = ROW_GAP_TOLERANCE): boolean =>
    isInRowGap({ top: rect.left, bottom: rect.right }, pointer.x, tolerance) && isInRowGap(rect, pointer.y, tolerance)

type RectLike ={ top: number, bottom: number, left: number, right: number, width: number, height: number }

/**
 * A measure function for the droppables of dnd-kit that takes away the shift already applied to the element or to one of its
 * ancestors (the wrapper of a task and its subtasks move together). Without it the places the pointer is tested against would
 * move with the shift and the target would flicker between two places.
 * @param base Measure of the rect as it is on screen.
 * @param shiftOf The shift currently applied to the element and its ancestors, along the given axis.
 * @category Note DnD
 */
export const makeShiftFreeMeasure = <R extends RectLike>(base: (element: HTMLElement) => R, shiftOf: (element: HTMLElement, axis: "x" | "y") => number) =>
    (element: HTMLElement): R => {
        let rect = base(element)
        const dy = shiftOf(element, "y")
        if (dy) rect = { ...rect, top: rect.top - dy, bottom: rect.bottom - dy }
        const dx = shiftOf(element, "x")
        if (dx) rect = { ...rect, left: rect.left - dx, right: rect.right - dx }
        return rect
    }
