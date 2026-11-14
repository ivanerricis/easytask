import type { Group as GroupType } from "@/types/types"
import { Fragment, memo, useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { Section } from "../section/Section"
import { AddSection } from "../section/AddSection"
import { GroupHeader } from "./GroupHeader"
import { cn, getErrorMessage, hexToRgba } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { withRollback } from "@/contexts/with-rollback"
import { reportError } from "@/lib/report-error"
import { getOpenGroupWidth, setOpenGroupWidth } from "@/lib/group-widths"
import { GROUP_MIN_WIDTH, GROUP_PROGRESS_MIN_WIDTH } from "@/lib/group-width"
import { GroupResizeHandle } from "./GroupResizeHandle"
import { useNoteDrag, useNoteDrop } from "../note-dnd-state"
import { GroupAudioFiles } from "./GroupAudioFiles"
import { GroupMediaFiles } from "./GroupMediaFiles"
import { GroupTasks } from "./GroupTasks"
import { useGroupOpen } from "@/contexts/use-tabs"
import { useIsActiveDraft } from "@/contexts/use-template-drafts"
import { DropLine } from "../sidebar/DropLine"
import { directIndexOf } from "@/lib/group-sections"
import { usePreference } from "@/contexts/use-preference"

type GroupProps = {
    group: GroupType
    /** Position of the group in the note (0-based), used for the default label "Gruppo N". */
    index?: number
    /** Number of audio files of the group, shown in the header. */
    audioCount?: number
    /** Number of images and videos of the group, shown in the header. */
    mediaCount?: number
}

export const Group = memo(({ group, index = 0, audioCount = 0, mediaCount = 0 }: GroupProps) => {
    // The empty area of a group (and its header) accepts a dragged section: it is appended to the group
    const { setNodeRef: setDropRef, zone, active } = useNoteDrop("group", group.id)
    // The group is also draggable (by its header) to reorder the groups
    const { setNodeRef: setDragRef, dragProps, isDragging } = useNoteDrag("group", group.id)
    const nodeRef = useRef<HTMLElement | null>(null)
    const setRef = useCallback((node: HTMLElement | null) => {
        nodeRef.current = node
        setDropRef(node)
        setDragRef(node)
    }, [setDropRef, setDragRef])
    const draggingGroup = active?.kind === "group"
    // With the live drag the other groups step aside instead of the line
    const liveDrag = usePreference(preferences => preferences.liveDrag) ?? true
    const [isOpen, toggleOpen] = useGroupOpen(group.id)
    // Closed: a narrow vertical strip, or (horizontal layout) the same group with only its header row
    const collapsedLayout = usePreference(preferences => preferences.collapsedGroupLayout) ?? "vertical"
    const strip = !isOpen && collapsedLayout === "vertical"
    const isDraft = useIsActiveDraft()
    const directIndex = directIndexOf(group)
    const { t } = useTranslation()
    const { setGroupWidth } = useWorkspaceActions()
    const { patchGroup } = useActiveNoteActions()
    // Width while the user is resizing; kept until the saved one lands, so the group never flickers back
    const [liveWidth, setLiveWidth] = useState<number | null>(null)
    const width = liveWidth ?? group.width ?? null
    // Only a width chosen by the user hides the completion bar: a group of automatic width (about the minimum one)
    // keeps it, like before the width could be set
    const compact = width !== null && width < GROUP_PROGRESS_MIN_WIDTH
    const getWidth = useCallback(() => nodeRef.current?.offsetWidth ?? GROUP_MIN_WIDTH, [])
    const commitWidth = useCallback(async (next: number | null) => {
        try {
            await withRollback(patchGroup(group.id, { width: next }), () => setGroupWidth(group.id, next))
        } catch (error) {
            reportError(error, t("errors.group.updateWidth", { message: getErrorMessage(error) }))
        } finally {
            setLiveWidth(null)
        }
    }, [group.id, patchGroup, setGroupWidth, t])
    // The form of a new section: asked from the menu of the group (there is no section button in the group anymore)
    const [addingSection, setAddingSection] = useState(false)
    const closeSectionForm = useCallback(() => setAddingSection(false), [])
    const addSection = useCallback(() => {
        if (!isOpen) toggleOpen()
        setAddingSection(true)
    }, [isOpen, toggleOpen])

    // While open, follow the width of the group (its content can grow or shrink); the cleanup runs before the
    // sections are removed from the DOM, so the width of the collapsed group is never recorded
    useLayoutEffect(() => {
        const node = nodeRef.current
        if (!node || !isOpen) return
        const record = () => {
            const measured = node.getBoundingClientRect().width
            // An element that is not laid out (width 0) says nothing
            if (measured <= 0) return
            setOpenGroupWidth(group.id, measured)
        }
        record()
        const observer = new ResizeObserver(record)
        observer.observe(node)
        return () => observer.disconnect()
    }, [isOpen, group.id])

    const colorAlpha = useColorAlpha()

    // The group is a panel: a light tint of its color (gray without one) with the color as a band at the top
    const panel: CSSProperties = group.color
        ? { backgroundColor: hexToRgba(colorAlpha.panel(), group.color), borderTopColor: group.color }
        : {}

    return (
        <div
            ref={setRef}
            data-group-card
            data-collapsed={isOpen ? undefined : ""}
            data-collapsed-layout={isOpen ? undefined : strip ? "vertical" : "horizontal"}
            // An explicit width replaces the content-driven one; as a strip the group is narrow (its width comes back on opening),
            // as a horizontal bar it keeps the width it had while open
            style={{ ...panel, ...(strip ? {} : width !== null ? { width } : isOpen ? {} : { minWidth: getOpenGroupWidth(group.id) }) }}
            className={cn(
                // As tall as its content, at most the height of the note (then its list scrolls)
                "relative flex flex-col max-h-full rounded-xs border border-t-4",
                !group.color && "bg-secondary",
                // Open: same minimum width as a section, at most 32rem so long task texts and audio names wrap or truncate.
                // Closed as a strip: the arrow, the ring and the name written vertically
                strip ? "w-11 items-center py-2" : "gap-2 p-2 min-w-[250px]",
                !strip && width === null && "max-w-[32rem]",
                isDragging && "opacity-40",
                !draggingGroup && zone && "ring-2 ring-primary",
            )}
        >
            {draggingGroup && !liveDrag && <DropLine zone={zone} vertical className={zone === "before" ? "-left-[5px] z-30" : "-right-[5px] z-30"} />}
            <GroupHeader
                group={group}
                index={index}
                audioCount={audioCount}
                mediaCount={mediaCount}
                dragProps={dragProps}
                compact={compact}
                onAddSection={addSection}
            />
            {isOpen && <>
                {/* The audio files and, under them, the images and videos stay put above the scrolling area: the lists neither scroll by themselves nor with the sections */}
                {!isDraft && <GroupAudioFiles groupId={group.id} />}
                {!isDraft && <GroupMediaFiles groupId={group.id} />}
                {/* The list of the direct tasks (with its "New task" button) sits among the sections where the user put it;
                    it, the sections and the form of a new section scroll together */}
                {/* The scrolling area is wider on the left (6px) and taller (4px) than the group, with the same padding inside: the drop
                    rings (2px) and lines (3px) drawn outside the first/last item and at the left side are not cut. On the right it ends
                    at the edge of the group, so its scrollbar sits entirely under the header (the resize handle is outside the group,
                    in the gap, and does not cover it); the 2px of padding keep the drop ring of an item from being cut. The tasks get
                    narrower only while the scrollbar is there. */}
                <div data-group-list className="flex flex-col gap-1 min-h-0 overflow-y-auto -ml-1.5 pl-1.5 pr-0.5 -my-1 py-1">
                    {group.sections.map((section, position) => (
                        <Fragment key={section.id}>
                            {position === directIndex && <GroupTasks group={group} />}
                            <Section section={section} />
                        </Fragment>
                    ))}
                    {directIndex >= group.sections.length && <GroupTasks group={group} />}
                    <AddSection inGroup groupId={group.id} open={addingSection} onClose={closeSectionForm} />
                </div>
            </>}
            {!strip && <GroupResizeHandle getWidth={getWidth} width={width} onResize={setLiveWidth} onCommit={commitWidth} />}
        </div>
    )
})
