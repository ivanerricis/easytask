import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { getClientRect } from "@dnd-kit/core"
import { usePreference } from "@/contexts/use-preference"
import { makeShiftFreeMeasure } from "../note-dnd-live"
import type { DropTarget, DropZone, TreeRef } from "./tree-dnd"
import type { FlatRow } from "./flat-tree"
import { useItemSize, TREE_ROW_GAP } from "./item-size"
import {
    computeTreeShifts, indexRows, insertionIndex, isShiftingZone, rowsWithoutSource, sourceRange, toLiveRows, type LiveTreeRow,
} from "./tree-dnd-live"
import { applyTreeShifts, clearTreeShifts, hasTreeShifts, treeShiftOf } from "./tree-live-shift"
import { treeRowKey } from "./tree-row"

/** Longest wait for the optimistic update of a drop before the rows are put back anyway. */
const SETTLE_TIMEOUT = 500

/**
 * With the live drag the rows are moved by a transform while the drag goes on: the places to hit are measured without it, or the target
 * would flip between the place and its shifted copy. The row that is shifted is the droppable itself, so its own transform is not
 * ignored by the measure (the shift is taken away instead).
 */
const LIVE_MEASURING = { droppable: { measure: makeShiftFreeMeasure(element => getClientRect(element), treeShiftOf) } }

type LiveDrag = { source: TreeRef, sourceKey: string, rows: LiveTreeRow[], index: Map<string, number> }

/**
 * The live drag of the sidebar (see tree-dnd-live): the rows step aside while a note or a folder is dragged. It reads the visible rows
 * (flat list) and the row size, never the DOM, and writes through the registry of the rows (transforms in rAF): no React state.
 * - `start` at the beginning of a drag (false: the drag is not a live one: preference off, keyboard, or a whole selection);
 * - `show` for every new target: opens the room where it would land (false: nothing is shown, the row keeps its indicator);
 * - `finish` when the drag ends: the rows glide back, or stay until the tree has the new order (`settle`).
 * `rows` can change during the drag (an open folder auto expands): the room is computed again for the last target.
 */
export const useTreeLive = (rows: FlatRow[], tree: object) => {
    const enabled = usePreference(preferences => preferences.liveDrag) ?? true
    const size = useItemSize()
    const rowSize = size.rowPx + TREE_ROW_GAP
    const liveRef = useRef<LiveDrag | null>(null)
    const lastRef = useRef<DropTarget | null>(null)
    const rowsRef = useRef(rows)
    const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const build = useCallback((source: TreeRef, current: FlatRow[]): LiveDrag => {
        const live = toLiveRows(current)
        return { source, sourceKey: treeRowKey(source.type, source.id), rows: live, index: indexRows(live) }
    }, [])

    const place = useCallback((target: DropTarget | null): boolean => {
        const live = liveRef.current
        lastRef.current = target
        if (!live) return false
        const range = target ? sourceRange(live.rows, live.sourceKey) : null
        const at = target && range ? insertionIndex(rowsWithoutSource(live.rows, range), live.source.type, target) : null
        const shifts = at === null ? null : computeTreeShifts(live.rows, live.index, live.sourceKey, at, rowSize)
        applyTreeShifts(shifts)
        return shifts !== null
    }, [rowSize])

    // The rows changed during the drag: the room is where the last target puts it in the new list
    useLayoutEffect(() => {
        rowsRef.current = rows
        const live = liveRef.current
        if (!live) return
        liveRef.current = build(live.source, rows)
        place(lastRef.current)
    }, [rows, build, place])

    const start = (source: TreeRef, { keyboard, selection }: { keyboard: boolean, selection: boolean }): boolean => {
        lastRef.current = null
        // A keyboard drag has its own announcements and a drag of the selection moves rows from many places: both keep the indicator
        liveRef.current = enabled && !keyboard && !selection ? build(source, rowsRef.current) : null
        return liveRef.current !== null
    }

    /** Shows the place of `target` (null: nothing) for a drop on `zone` of the row under the pointer. */
    const show = (target: DropTarget | null, zone: DropZone, onRow: boolean): boolean => {
        // "inside" a row is the ring of the folder, the rows stay
        if (!target || (onRow && !isShiftingZone(zone))) return place(null)
        return place(target)
    }

    // After a drop the rows are put back in the very commit that moves the item in the tree, so the old order is never painted
    const settle = useCallback(() => {
        if (settleRef.current === null) return
        clearTimeout(settleRef.current)
        settleRef.current = null
        clearTreeShifts(false)
    }, [])
    useLayoutEffect(settle, [tree, settle])
    useEffect(() => () => {
        if (settleRef.current !== null) clearTimeout(settleRef.current)
        clearTreeShifts(false)
    }, [])

    const finish = (dropped: boolean) => {
        const shifted = hasTreeShifts()
        liveRef.current = null
        lastRef.current = null
        if (shifted && dropped) {
            settleRef.current = setTimeout(() => { settleRef.current = null; clearTreeShifts(false) }, SETTLE_TIMEOUT)
        } else clearTreeShifts(!dropped)
    }

    return { active: () => liveRef.current !== null, start, show, finish, measuring: enabled ? LIVE_MEASURING : undefined }
}
