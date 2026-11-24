import { useTranslation } from "react-i18next"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useNoteDrop } from "../note-dnd-state"
import { ACCEPTS_IN_EMPTY_NOTE } from "../note-dnd"

type NewGroupSlotProps = {
    /** Index of the new group among the current groups (groups.length = at the end). */
    index: number
}

/**
 * Thin drop slot on the left edge of a group: a section dropped here becomes a new group placed before it.
 * It is always mounted (so dnd-kit keeps its rect measured) but it is invisible and does not catch pointer events
 * unless a section is being dragged.
 * @category Note DnD
 */
export const NewGroupSlot = ({ index }: NewGroupSlotProps) => {
    const { setNodeRef, zone, active } = useNoteDrop("new-group", index)
    const dragging = active?.kind === "section"

    return (
        <div
            ref={setNodeRef}
            aria-hidden
            className={cn(
                "pointer-events-none absolute -left-2 top-0 z-20 h-full w-4 rounded-full transition-colors",
                dragging && "bg-primary/15",
                dragging && zone && "bg-primary",
            )}
        />
    )
}

/**
 * The whole empty area of a note without groups as a drop zone: the place of the first group. It takes a group, a section or a task
 * (see {@link ACCEPTS_IN_EMPTY_NOTE}), also from the other note of the split view, and shows the same highlight as the end column.
 * Without pointer events (the hit test is geometric): it only needs to exist and to cover the area.
 * @category Note DnD
 */
export const EmptyNoteDropZone = () => {
    const { setNodeRef, zone, active } = useNoteDrop("new-group", 0, ACCEPTS_IN_EMPTY_NOTE)
    return (
        <div
            ref={setNodeRef}
            aria-hidden
            data-testid="empty-note-drop"
            className={cn(
                "pointer-events-none absolute inset-0 z-[5] rounded-xs transition-colors",
                active && "bg-primary/5",
                active && zone && "bg-primary/10 ring-2 ring-inset ring-primary",
            )}
        />
    )
}

type NewGroupEndProps = {
    /** Index of the new group: the number of groups (it is created after the last one). */
    index: number
    /** The note has no group: the drop zone is the whole area (see {@link EmptyNoteDropZone}), this column only shows the hint. */
    empty?: boolean
    children: ReactNode
}

/**
 * Column at the end of the groups (holding the form of the new group): a section dropped on it
 * becomes a new last group. While a section is dragged the button is hidden and the column itself is the dashed drop area.
 * @category Note DnD
 */
export const NewGroupEnd = ({ index, empty = false, children }: NewGroupEndProps) => {
    const { t } = useTranslation()
    const { setNodeRef, zone, active } = useNoteDrop("new-group", index)
    const dragging = active?.kind === "section"

    return (
        <div
            ref={empty ? undefined : setNodeRef}
            className={cn(
                "relative flex h-full min-w-44 flex-col rounded-xs",
                // The form inside is hidden while dragging: the dashed rectangle is the column, as big as the drop area
                dragging && "border border-dashed border-primary/50",
                dragging && zone && !empty && "border-solid bg-primary/10 ring-2 ring-primary",
            )}
        >
            <div className={cn(dragging && "invisible")}>{children}</div>
            {dragging &&
                <span className={cn(
                    "pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs",
                    // Full contrast on the highlighted drop area (the muted colour on the primary tint is too faint)
                    zone ? "text-foreground" : "text-muted-foreground",
                )}>
                    {t("menu.newGroup")}
                </span>}
        </div>
    )
}
