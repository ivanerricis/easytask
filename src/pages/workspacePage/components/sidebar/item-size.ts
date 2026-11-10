import { usePreference } from "@/contexts/use-preference"
import type { SidebarItemSize } from "@/lib/store/preferences"

/**
 * Class names for the folder and note rows of the sidebar, one entry per size.
 * Full class names (no interpolation) so Tailwind can see them.
 * "normal" is the original look: h-7, text-sm, size-4 icons.
 */
export type ItemSizeClasses = {
    /** Row height. */
    row: string
    /** Row height in px (matches `row`), for virtualization. */
    rowPx: number
    /** Indent per depth level in px (matches `indent`): the width of the chevron plus the gap, so a child starts under the name of its parent folder. */
    indentPx: number
    /** Row label. */
    text: string
    /** The chevron of a folder row. */
    icon: string
    /** Resizes the icon of the hover menu button. */
    menu: string
    /** Vertical indent guide of an open folder (aligned with the chevron). */
    guide: string
    /** Horizontal position in px of the guide inside the indent of a level (matches `guide`: the center of the chevron). */
    guidePx: number
    /** Indent of the children of an open folder. */
    indent: string
}

export const ITEM_SIZES: Record<SidebarItemSize, ItemSizeClasses> = {
    compact: {
        row: "h-6",
        rowPx: 24,
        indentPx: 18,
        text: "text-xs",
        icon: "size-3.5",
        menu: "[&_svg]:size-3.5",
        guide: "left-[11px]",
        guidePx: 11,
        indent: "ml-[18px]",
    },
    normal: {
        row: "h-7",
        rowPx: 28,
        indentPx: 20,
        text: "text-sm",
        icon: "size-4",
        menu: "",
        guide: "left-[12px]",
        guidePx: 12,
        indent: "ml-[20px]",
    },
    large: {
        row: "h-9",
        rowPx: 36,
        indentPx: 24,
        text: "text-base",
        icon: "size-5",
        menu: "[&_svg]:size-5",
        guide: "left-[14px]",
        guidePx: 14,
        indent: "ml-[24px]",
    },
}

/** Vertical gap between the rows of the tree (gap-1 in the recursive layout). */
export const TREE_ROW_GAP = 4

/** Size classes for the size chosen in the settings. */
export const useItemSize = (): ItemSizeClasses => ITEM_SIZES[usePreference(p => p.sidebarItemSize) ?? "normal"]
