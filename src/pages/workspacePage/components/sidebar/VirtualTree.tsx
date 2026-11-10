import { useCallback, useImperativeHandle, useMemo, type Ref } from "react"
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual"
import { ItemNote } from "../note/Note"
import { ItemFolder } from "../folder/Folder"
import type { FlatRow } from "./flat-tree"
import { TREE_ROW_GAP, useItemSize } from "./item-size"

const ROW_GAP = TREE_ROW_GAP
const OVERSCAN = 10
/** Most rows added to the overscan while an open folder is dragged (live drag: the rows of the room it leaves come from farther away). */
const MAX_DRAG_OVERSCAN = 60

/** What the tree can be asked to do from outside. */
export type VirtualTreeHandle = {
    /** Scrolls the row with this key into view (false when there is no such row). */
    scrollToKey: (key: string) => boolean
}

type VirtualTreeProps = {
    rows: FlatRow[]
    collapsedIds: Set<number>
    onToggleFolder: (folderId: number) => void
    /** Key of the row being dragged: it stays mounted even when scrolled out of the range. */
    activeKey: string | null
    /** Key of the row in the tab order: it stays mounted too, so the keyboard can always get into the tree. */
    tabStopKey?: string | null
    getScrollElement: () => HTMLElement | null
    handleRef?: Ref<VirtualTreeHandle>
}

/** Flat, virtualized rendering of the tree; only the rows near the viewport are in the DOM. */
export const VirtualTree = ({ rows, collapsedIds, onToggleFolder, activeKey, tabStopKey = null, getScrollElement, handleRef }: VirtualTreeProps) => {
    const size = useItemSize()
    const rowSize = size.rowPx + ROW_GAP

    const activeIndex = useMemo(
        () => activeKey ? rows.findIndex(row => row.key === activeKey) : -1,
        [rows, activeKey],
    )

    // The room of a dragged open folder is as tall as its rows: rows from that far away are shifted into view, so they are mounted
    const dragOverscan = useMemo(() => {
        if (activeIndex < 0) return 0
        let end = activeIndex
        while (end + 1 < rows.length && end - activeIndex < MAX_DRAG_OVERSCAN && rows[end + 1].depth > rows[activeIndex].depth) end++
        return end - activeIndex
    }, [rows, activeIndex])

    const tabStopIndex = useMemo(
        () => tabStopKey ? rows.findIndex(row => row.key === tabStopKey) : -1,
        [rows, tabStopKey],
    )

    const rangeExtractor = useCallback((range: Range) => {
        const indexes = defaultRangeExtractor(range)
        const missing = [activeIndex, tabStopIndex].filter(index => index >= 0 && index < range.count && !indexes.includes(index))
        if (missing.length === 0) return indexes
        return [...new Set([...indexes, ...missing])].sort((a, b) => a - b)
    }, [activeIndex, tabStopIndex])

    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement,
        estimateSize: () => rowSize,
        overscan: OVERSCAN + dragOverscan,
        rangeExtractor,
        getItemKey: (index) => rows[index]?.key ?? index,
    })

    useImperativeHandle(handleRef, () => ({
        scrollToKey: (key) => {
            const index = rows.findIndex(row => row.key === key)
            if (index < 0) return false
            virtualizer.scrollToIndex(index, { align: "auto" })
            return true
        },
    }), [rows, virtualizer])

    return (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]
                if (!row) return null
                return (
                    <div
                        key={row.key}
                        data-testid="tree-row"
                        className="absolute left-0 top-0 w-full"
                        style={{
                            height: size.rowPx,
                            transform: `translateY(${virtualRow.start}px)`,
                            paddingLeft: row.depth * size.indentPx,
                        }}
                    >
                        {/* One guide per ancestor level, under the chevron of its folder; it also crosses the gap above the row so the lines are continuous */}
                        {Array.from({ length: row.depth }, (_, level) => (
                            <span
                                key={level}
                                aria-hidden="true"
                                data-testid="tree-guide"
                                className="pointer-events-none absolute w-px bg-foreground/20"
                                style={{ left: level * size.indentPx + size.guidePx, top: -ROW_GAP, height: size.rowPx + ROW_GAP }}
                            />
                        ))}
                        {row.kind === "folder" ? (
                            <ItemFolder
                                folder={row.item}
                                isOpen={!collapsedIds.has(row.item.id)}
                                onToggle={onToggleFolder}
                                level={row.depth + 1}
                            />
                        ) : (
                            <ItemNote note={row.item} level={row.depth + 1} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
