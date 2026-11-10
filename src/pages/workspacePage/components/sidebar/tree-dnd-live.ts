import type { Folder, Note } from "@/types/types"
import type { DropTarget, DropZone, TreeItemType } from "./tree-dnd"
import { holdHalfZone, holdLiveZone } from "../note-dnd-live"

/**
 * Pure logic of the "live drag" of the sidebar: while a note or a folder is dragged, the other rows step aside (a vertical
 * translation of the row) to open the room where it would land and close the room it leaves. The rows have a fixed height and the
 * tree is a flat list of the visible rows (the same one the virtualized renderer draws), so the shifts come from the position in that
 * list, never from the DOM: a row that is not mounted (virtualization) has its shift too, and takes it when it mounts.
 * @category Tree DnD
 */

/** A visible row of the tree, in the order it is drawn. */
export type LiveTreeRow = {
    key: string
    kind: TreeItemType
    id: number
    /** The folder it is in (null at the root). */
    parentId: number | null
    depth: number
}

/** What the live drag needs of a row of the flat tree (see flattenTree). */
export const toLiveRows = (rows: readonly { key: string, kind: TreeItemType, item: Folder | Note, depth: number }[]): LiveTreeRow[] =>
    rows.map(row => ({ key: row.key, kind: row.kind, id: row.item.id, parentId: row.item.folderID ?? null, depth: row.depth }))

/** Zones that open a room (before / after / the first place inside an open folder). "inside" keeps the ring and moves nothing. */
export const isShiftingZone = (zone: DropZone | null): boolean => zone === "before" || zone === "after" || zone === "inside-start"

/** The rows of the dragged item: itself and, for an open folder, the rows of its subtree that follow it. */
export function sourceRange(rows: readonly LiveTreeRow[], sourceKey: string): { start: number, end: number } | null {
    const start = rows.findIndex(row => row.key === sourceKey)
    if (start < 0) return null
    let end = start
    while (end + 1 < rows.length && rows[end + 1].depth > rows[start].depth) end++
    return { start, end }
}

/** The rows without the dragged subtree. */
export const rowsWithoutSource = (rows: readonly LiveTreeRow[], range: { start: number, end: number }): LiveTreeRow[] =>
    [...rows.slice(0, range.start), ...rows.slice(range.end + 1)]

/** Key -> position in the list of rows. */
export const indexRows = (rows: readonly LiveTreeRow[]): Map<string, number> => new Map(rows.map((row, i) => [row.key, i]))

/**
 * Where, among the rows that stay (the visible rows without the dragged subtree), the dragged item would be inserted for `target`:
 * the number of rows before the room. `target.index` is the index among the siblings of the same type once the item is gone
 * (see computeDropTarget); the folders come before the notes inside a folder.
 * Null when the place cannot be told (the folder is not among the visible rows).
 */
export function insertionIndex(rest: readonly LiveTreeRow[], kind: TreeItemType, target: DropTarget): number | null {
    const children = rest.filter(row => row.parentId === target.folderId)
    const folders = children.filter(row => row.kind === "folder").length
    const clamped = Math.max(0, Math.min(target.index, kind === "folder" ? folders : children.length - folders))
    const child = children[kind === "folder" ? clamped : folders + clamped]
    if (child) return rest.indexOf(child)
    // After the last child: the end of the block of the parent folder (or of the whole list for the root)
    if (target.folderId === null) return rest.length
    const parent = rest.findIndex(row => row.kind === "folder" && row.id === target.folderId)
    if (parent < 0) return null
    let end = parent + 1
    while (end < rest.length && rest[end].depth > rest[parent].depth) end++
    return end
}

/** The shifts of a drag: asked row by row (O(1)), so a tree of thousands of rows costs nothing more than a short one. */
export type TreeShifts = {
    /** The vertical shift of a row in px (0: it stays). */
    dyOf: (key: string) => number
    /** Whether the row is part of the dragged subtree (it collapses: the registry hides it). */
    isHidden: (key: string) => boolean
}

/**
 * The shifts that show the room of the dragged subtree at `place` (see {@link insertionIndex}).
 * The rows after the dragged subtree close the room it leaves (up), the rows from the place on open the room it takes (down); the
 * rows in between cancel out when the item goes down, and add up when it goes up.
 * @param rowSize Distance between two rows (their height plus the gap).
 * @returns Null when there is nothing to show (no such row, or the place is where the item already is).
 */
export function computeTreeShifts(
    rows: readonly LiveTreeRow[],
    index: ReadonlyMap<string, number>,
    sourceKey: string,
    place: number,
    rowSize: number,
): TreeShifts | null {
    const range = sourceRange(rows, sourceKey)
    if (!range || !(rowSize > 0)) return null
    const { start, end } = range
    const count = end - start + 1
    const room = count * rowSize
    // `place` counts the rows that stay: the place of the source itself is `start`
    if (place === start) return null
    return {
        dyOf: (key) => {
            const i = index.get(key)
            if (i === undefined || (i >= start && i <= end)) return 0
            const after = i > end
            const stays = after ? i - count : i
            return room * ((stays >= place ? 1 : 0) - (after ? 1 : 0))
        },
        isHidden: (key) => {
            const i = index.get(key)
            return i !== undefined && i >= start && i <= end
        },
    }
}

/**
 * The zone used to MOVE THE ROWS and to drop, with a hysteresis: while the pointer stays over the same row, the previous zone is kept
 * as long as the pointer is within a few px of it, so the rows do not flicker on the border between two zones. A note has two zones
 * (the halves), a folder four (see computeDropZone).
 * @param previous The zone shown now for this same row (null when the row is a new one: no hysteresis).
 */
export const holdTreeZone = (overType: TreeItemType, previous: DropZone | null, next: DropZone, rect: { top: number, height: number }, pointerY: number): DropZone =>
    overType === "note" ? holdHalfZone(previous, next, rect, pointerY) : holdLiveZone(previous, next, rect, pointerY)
