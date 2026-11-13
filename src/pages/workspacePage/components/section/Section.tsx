import { SectionHeader } from "./SectionHeader"
import { SectionBody } from "./SectionBody"
import { memo, useCallback } from "react"
import type { Section as SectionType } from "@/types/types"
import { cn, hexToRgba } from "@/lib/utils"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { useNoteDndSelector, useNoteDrag, useNoteDrop } from "../note-dnd-state"
import { useSectionOpen } from "@/contexts/use-tabs"
import { DropLine } from "../sidebar/DropLine"
import { registerShiftNode, sectionNodeKey } from "../note-dnd-shift"
import { usePreference } from "@/contexts/use-preference"

type SectionProps = {
    section: SectionType
}

export const Section = memo(({ section }: SectionProps) => {
    // Kept per note, so it survives tab switches
    const [isOpen, toggleOpen] = useSectionOpen(section.id)
    const { setNodeRef: setDropRef, zone, active } = useNoteDrop("section", section.id)
    const { setNodeRef: setDragRef, dragProps, isDragging } = useNoteDrag("section", section.id)

    // The card is both a drop target (sections and tasks) and the dimmed source while it is dragged
    // It is also moved by the live drag of the sections (a transform of the whole card, tasks included)
    const sectionId = section.id
    const setRef = useCallback((node: HTMLElement | null) => {
        setDropRef(node)
        setDragRef(node)
        registerShiftNode(sectionNodeKey(sectionId), node)
    }, [setDropRef, setDragRef, sectionId])
    const liveDrag = usePreference(preferences => preferences.liveDrag) ?? true
    const colorAlpha = useColorAlpha()

    const draggingSection = active?.kind === "section"
    // A dragged task: the whole card is outlined when it is the destination, wherever the pointer is inside it
    const taskDestination = useNoteDndSelector(state => state.active?.kind === "task" && state.hover.targetSectionId === section.id)

    return (
        <div
            ref={setRef}
            data-section-card
            data-section-wrap={section.id}
            data-section-group={section.groupID}
            className={cn(
                // As wide as its group (the group caps the column width)
                // A card on the panel of its group; its color is the band at the top
                "group/section relative w-full min-w-[232px] border bg-background rounded-xs flex flex-col px-1 py-1",
                isDragging && "opacity-40",
                !draggingSection && (zone || taskDestination) && "border-primary ring-2 ring-primary",
            )}
            // Colored like a group: a light tint over the card (it stays opaque on the panel of its group) and the band at the top
            style={section.color ? {
                borderTopWidth: 3,
                borderTopColor: section.color,
                backgroundImage: `linear-gradient(${hexToRgba(colorAlpha.panel(), section.color)}, ${hexToRgba(colorAlpha.panel(), section.color)})`,
            } : undefined}
        >
            {draggingSection && !liveDrag && <DropLine zone={zone} className={zone === "before" ? "-top-[3px]" : "-bottom-[3px]"} />}
            <SectionHeader
                isOpen={isOpen}
                onOpenChange={toggleOpen}
                section={section}
                dragProps={dragProps}
            />
            <SectionBody isOpen={isOpen} section={section} />
        </div>
    )
})
