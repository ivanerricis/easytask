import { useMemo, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useActiveNote } from "@/contexts/use-active-note"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { hexToRgba } from "@/lib/utils"
import { getGroupLabel } from "./groups/group-label"
import { resolveGroupColor } from "./groups/group-progress"
import { getSectionLabel } from "./section/section-label"
import { findGroup, findSection, findTask } from "./note-dnd"
import { useNoteDndSelector } from "./note-dnd-state"
import type { OverlayFollower } from "./note-dnd-overlay"

/** The color of an item over the background of its preview, like its header (none: the preview keeps its own background). */
const tintOf = (color: string | null | undefined, alpha: number): CSSProperties | undefined => {
    const tint = color ? hexToRgba(alpha, color) : undefined
    return tint ? { backgroundImage: `linear-gradient(${tint}, ${tint})` } : undefined
}

/**
 * The preview that follows the pointer while a group, a section or a task is dragged: a fixed box in a portal over the whole window,
 * moved by the follower (a transform per frame, no React render while the pointer moves). It is its own component so that the start
 * and the end of a drag re-render only this, not the provider (which would walk the whole note).
 */
export const NoteDragOverlay = ({ follower }: { follower: OverlayFollower }) => {
    const { setNode, rect: startRect } = follower
    const active = useNoteDndSelector(state => state.active)
    const { noteDataTree } = useActiveNote()
    const colorAlpha = useColorAlpha()

    const preview = useMemo(() => {
        if (!active || !noteDataTree) return null
        if (active.kind === "group") {
            const found = findGroup(noteDataTree, active.id)
            return found ? (
                <div
                    className="min-w-[200px] max-w-[320px] truncate rounded-xs border bg-background p-2 text-sm font-semibold shadow-lg"
                    style={tintOf(resolveGroupColor(found.group), colorAlpha.header())}
                >
                    {getGroupLabel(found.group, found.index)}
                </div>
            ) : null
        }
        if (active.kind === "section") {
            const section = findSection(noteDataTree, active.id)
            return section ? (
                <div
                    className="min-w-[250px] max-w-[320px] truncate rounded-xs border bg-accent p-2 text-sm shadow-lg"
                    style={tintOf(section.color, colorAlpha.header())}
                >
                    {getSectionLabel(section)}
                </div>
            ) : null
        }
        const task = findTask(noteDataTree, active.id)
        return task ? (
            <div
                className="max-w-[320px] truncate rounded-xs border bg-background p-2 text-sm shadow-lg border-l-4"
                style={task.color ? { borderLeftColor: task.color } : undefined}
            >
                {task.text}
            </div>
        ) : null
    }, [active, noteDataTree, colorAlpha])

    if (!preview) return null
    const rect = startRect()
    return createPortal(
        <div
            ref={setNode}
            aria-hidden="true"
            data-note-drag-overlay=""
            style={{ position: "fixed", left: rect?.left ?? 0, top: rect?.top ?? 0, width: rect?.width, height: rect?.height, zIndex: 2147483001, pointerEvents: "none", willChange: "transform" }}
        >
            <div className="rotate-2">{preview}</div>
        </div>,
        document.body,
    )
}
