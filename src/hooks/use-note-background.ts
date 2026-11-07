import { useMemo } from "react"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { useWorkspaceState } from "@/contexts/workspace-data"
import { findTreeItem } from "@/contexts/workspace-tree-ops"
import type { Note } from "@/types/types"
import { hexToRgba } from "@/lib/utils"

/**
 * The background color (hex) chosen for a note, null when it has none or is not in the sidebar tree (a template draft).
 * It follows the tree, so the change of the menu and its undo show at once.
 * @param noteId The ID of the note (null = none).
 * @category Hooks
 */
export function useNoteBackgroundColor(noteId: number | null): string | null {
    const { workspaceDataTree } = useWorkspaceState()
    return useMemo(() => {
        if (noteId === null || !workspaceDataTree) return null
        const note = findTreeItem(workspaceDataTree, "note", noteId)?.item as Note | undefined
        return note?.bg_color || null
    }, [workspaceDataTree, noteId])
}

/**
 * The CSS background of the note area: its color as a light translucent layer over the theme background (so it reads in
 * light and dark), undefined when the note has none.
 * @param noteId The ID of the note (null = none).
 * @category Hooks
 */
export function useNoteBackgroundStyle(noteId: number | null): string | undefined {
    const color = useNoteBackgroundColor(noteId)
    const alpha = useColorAlpha().noteBackground()
    return color ? hexToRgba(alpha, color) : undefined
}
