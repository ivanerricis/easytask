import { useMemo, type CSSProperties } from "react"
import { useMediaSources } from "@/contexts/use-media"
import { IMAGE_EXTENSIONS } from "@/db/queries/media"
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

/**
 * The path of the background image chosen for a note, null when it has none or is not in the sidebar tree (a template draft).
 * @param noteId The ID of the note (null = none).
 * @category Hooks
 */
export function useNoteBackgroundImagePath(noteId: number | null): string | null {
    const { workspaceDataTree } = useWorkspaceState()
    return useMemo(() => {
        if (noteId === null || !workspaceDataTree) return null
        const note = findTreeItem(workspaceDataTree, "note", noteId)?.item as Note | undefined
        return note?.bg_image || null
    }, [workspaceDataTree, noteId])
}

const NO_FILES: readonly { path: string }[] = []

// A theme-token veil over the image, so the text reads on any picture in light and dark
const IMAGE_VEIL = "color-mix(in srgb, var(--background) 60%, transparent)"
const veil = (color: string) => `linear-gradient(${color}, ${color})`

const hasImageExtension = (path: string) => (IMAGE_EXTENSIONS as readonly string[]).includes(path.slice(path.lastIndexOf(".") + 1).toLowerCase())

/**
 * The CSS of the note area: its color (see {@link useNoteBackgroundStyle}) and, when the note has an image, the picture
 * (cover, centered, no repeat) under a neutral theme veil and under the color veil. The image is allowed one file at a time in
 * the asset protocol; a missing or not allowed file gives no image (the color alone), never an error.
 * The area is not the scrolling element of the note (the groups scroll inside it), so the picture stays still while scrolling.
 * @param noteId The ID of the note (null = none).
 * @category Hooks
 */
export function useNoteBackgroundCss(noteId: number | null): CSSProperties | undefined {
    const color = useNoteBackgroundStyle(noteId)
    const path = useNoteBackgroundImagePath(noteId)
    const usable = path !== null && hasImageExtension(path) ? path : null
    const files = useMemo(() => usable === null ? NO_FILES : [{ path: usable }], [usable])
    const sources = useMediaSources(files)
    const source = usable === null ? undefined : sources[usable]
    return useMemo(() => {
        if (!source) return color ? { background: color } : undefined
        // The shorthand, like the color alone: the veils (gradients) fill the area, the picture is the last layer
        const layers = [...(color ? [veil(color)] : []), veil(IMAGE_VEIL), `url(${JSON.stringify(source)}) center / cover no-repeat`]
        return { background: layers.join(", ") }
    }, [color, source])
}
