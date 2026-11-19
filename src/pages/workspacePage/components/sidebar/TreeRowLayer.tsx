import { useCallback, type CSSProperties, type ReactNode } from "react"
import { registerTreeRow, SHIFT_LAYER_ATTR } from "./tree-live-shift"
import { TREE_ROW_GAP, useItemSize } from "./item-size"

/**
 * The layer of a row that the live drag moves (see tree-live-shift): it holds the indent guides and the item together, so both follow
 * the row when it steps aside. Registers itself by row key; a stable ref, so a re-render never unregisters it (and forgets its shift).
 * Both renderers of the tree use it: the virtualized one (VirtualTree) and the recursive one (the rows of FileTreeItem), or the live
 * drag would only work above the threshold of the virtualization.
 */
export function TreeRowLayer({ rowKey, className, style, children }: { rowKey: string, className: string, style?: CSSProperties, children: ReactNode }) {
    const ref = useCallback((node: HTMLDivElement | null) => registerTreeRow(rowKey, node), [rowKey])
    return <div ref={ref} {...{ [SHIFT_LAYER_ATTR]: "" }} className={className} style={style}>{children}</div>
}

/**
 * One guide per ancestor level, under the chevron of its folder; it also crosses the gap above the row so the lines are continuous.
 * `origin` is the depth of the box the guides are positioned in: 0 when it starts at the left edge of the tree (the flat rows are
 * indented by padding), the depth of the row when the box is already inside the indent of its folders (the recursive rows).
 */
export function TreeRowGuides({ depth, origin = 0 }: { depth: number, origin?: number }) {
    const size = useItemSize()
    return Array.from({ length: depth }, (_, level) => (
        <span
            key={level}
            aria-hidden="true"
            data-testid="tree-guide"
            className="pointer-events-none absolute w-px bg-foreground/20"
            style={{ left: (level - origin) * size.indentPx + size.guidePx, top: -TREE_ROW_GAP, height: size.rowPx + TREE_ROW_GAP }}
        />
    ))
}
