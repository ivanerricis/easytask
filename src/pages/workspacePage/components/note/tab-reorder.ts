import { halfZone } from "@/lib/drop-zone"
import type { PaneIndex } from "@/contexts/layout-reducer"
import { tabListKey, type LivePending } from "../note-dnd-live"
import { tabNodeKey } from "../note-dnd-shift"

export type TabZone = "before" | "after"

/** Left half of a tab = before, right half = after. */
export const computeTabZone = (rect: { left: number, width: number }, pointerX: number): TabZone =>
    halfZone(rect, pointerX)

/**
 * Computes the `reorderTabs(from, to)` arguments for a tab dropped before/after another one
 * (`to` is the final index of the moved tab). Null when nothing changes.
 */
export function computeTabMove(ids: readonly number[], activeId: number, overId: number, zone: TabZone): { from: number, to: number } | null {
    const from = ids.indexOf(activeId)
    if (from < 0 || activeId === overId) return null
    const overIndex = ids.filter(id => id !== activeId).indexOf(overId)
    if (overIndex < 0) return null
    const to = zone === "after" ? overIndex + 1 : overIndex
    return to === from ? null : { from, to }
}

/**
 * The tab a drag at horizontal position `x` is over: the one under it, else the first (pointer before the bar) or
 * the last (pointer past it, in the empty part of the bar or outside) so that a tab can be dropped at either end.
 */
export function pickTabByX<T extends string | number>(tabs: { id: T, left: number, right: number }[], x: number): T | null {
    if (tabs.length === 0) return null
    const under = tabs.find(tab => x >= tab.left && x <= tab.right)
    if (under) return under.id
    const first = tabs.reduce((a, b) => b.left < a.left ? b : a)
    if (x < first.left) return first.id
    return tabs.reduce((a, b) => b.right > a.right ? b : a).id
}

/** The id of a tab (draggable and droppable) in the dnd context shared by the two bars: `tab:<pane>:<noteId>`. */
export const tabDndId = (pane: PaneIndex, noteId: number): string => `tab:${pane}:${noteId}`

/** The id of the droppable covering the whole tab bar of a pane: `bar:<pane>`. */
export const barDndId = (pane: PaneIndex): string => `bar:${pane}`

/** Parses a `tab:<pane>:<noteId>` id; null for any other id. */
export function parseTabDndId(id: string | number): { pane: PaneIndex, noteId: number } | null {
    const match = /^tab:([01]):(\d+)$/.exec(String(id))
    return match ? { pane: Number(match[1]) as PaneIndex, noteId: Number(match[2]) } : null
}

/** Parses a `bar:<pane>` id; returns the pane, or null for any other id. */
export function parseBarDndId(id: string | number): PaneIndex | null {
    const match = /^bar:([01])$/.exec(String(id))
    return match ? Number(match[1]) as PaneIndex : null
}

/** The bar whose rectangle contains the point (edges included), null when the point is over no bar. */
export function pickBarByPoint<T extends string | number>(
    bars: { id: T, left: number, right: number, top: number, bottom: number }[],
    x: number,
    y: number,
): T | null {
    return bars.find(bar => x >= bar.left && x <= bar.right && y >= bar.top && y <= bar.bottom)?.id ?? null
}

/**
 * The index at which a tab dropped on another bar is inserted: before / after the tab it is over, or at the end
 * when it is over the bar itself (`overId` null, e.g. an empty bar) or over a tab that is not in the bar.
 */
export function computeCrossPaneIndex(targetIds: readonly number[], overId: number | null, zone: TabZone): number {
    if (overId === null) return targetIds.length
    const index = targetIds.indexOf(overId)
    if (index < 0) return targetIds.length
    return zone === "after" ? index + 1 : index
}

/** Where a dragged tab hovers: a tab of a bar (`overId`) or the bar itself (`overId` null). */
export type TabHover = { pane: PaneIndex, overId: number | null, zone: TabZone }

/** What a drop does: reorder the tabs of one pane, or move the note to the other pane. */
export type TabDrop =
    | { kind: "reorder", pane: PaneIndex, from: number, to: number }
    | { kind: "move", noteId: number, fromPane: PaneIndex, toPane: PaneIndex, index: number }

/**
 * Resolves a drop of the tab `noteId` (dragged from `fromPane`) on `hover` into the action to run.
 * Null when there is nothing to do (no target, or the tab ends up where it was).
 * @param idsByPane The ids of the tabs of each pane, in order.
 */
export function resolveTabDrop(
    idsByPane: readonly [readonly number[], readonly number[]],
    fromPane: PaneIndex,
    noteId: number,
    hover: TabHover | null,
): TabDrop | null {
    if (!hover) return null
    if (hover.pane === fromPane) {
        const ids = idsByPane[fromPane]
        const last = ids[ids.length - 1]
        const move = hover.overId === null
            ? (last === undefined ? null : computeTabMove(ids, noteId, last, "after"))
            : computeTabMove(ids, noteId, hover.overId, hover.zone)
        return move ? { kind: "reorder", pane: fromPane, ...move } : null
    }
    const index = computeCrossPaneIndex(idsByPane[hover.pane], hover.overId, hover.zone)
    return { kind: "move", noteId, fromPane, toPane: hover.pane, index }
}

/**
 * What the tabs of the live drag show for a hover: the room opens before / after the tab the dragged one is over, in the bar it belongs
 * to (the registry key of the tab, the list of the bar). Null (nothing moves) over nothing and over a bar itself, which is the empty bar:
 * it has no tab to step aside and keeps its drop line.
 */
export function tabLivePending(hover: TabHover | null): LivePending | null {
    if (!hover || hover.overId === null) return null
    return { over: tabNodeKey(hover.pane, hover.overId), zone: hover.zone, list: tabListKey(hover.pane) }
}

/** The move of a dragged tab, held between the left and right edges of its bar (`rect`: the tab at rest, measured without the move). */
export const keepInBar = (transform: { x: number, y: number, scaleX: number, scaleY: number } | null, rect: { left: number, right: number } | null, bar: HTMLElement | null | undefined) => {
    if (!transform || !rect || !bar) return transform
    const box = bar.getBoundingClientRect()
    const min = box.left - rect.left
    const max = Math.max(box.right - rect.right, min)
    return { ...transform, x: Math.min(Math.max(transform.x, min), max) }
}
