import { AddSection } from "../section/AddSection"
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Group } from "./Group"
import { GroupColumnContext } from "./group-column-context"
import { useActiveNote } from "@/contexts/use-active-note"
import { useActiveNoteId, useTabUiStore } from "@/contexts/use-tabs"
import { EmptyNoteDropZone, NewGroupEnd, NewGroupSlot } from "./NewGroupSlot"
import { usePreferences } from "@/contexts/use-preferences"
import { useNoteAudioCounts } from "@/contexts/use-audio"
import { useNoteMediaCounts } from "@/contexts/use-media"
import { EmptyNoteHints } from "../EmptyNoteHints"
import { NoteSkeleton } from "./NoteSkeleton"
import { NoteProviders } from "./NoteProviders"
import { SelectionBarInset, TaskSelectionBar } from "../tasks/TaskSelectionBar"
import { NoteAnnouncer } from "../tasks/NoteAnnouncer"
import { cn } from "@/lib/utils"
import { groupsByPosition } from "@/lib/group-sections"
import { useNoteBackgroundCss } from "@/hooks/use-note-background"
import { groupNodeKey, registerShiftNode, SHIFT_ATTR } from "../note-dnd-shift"
import { useNoteDndOwner } from "../note-dnd-owner"

type GroupColumnProps = {
    groupId: number
    /** The group has an explicit width: it does not shrink. */
    fixedWidth: boolean
    children: ReactNode
}

/**
 * The column of a group: the group itself, its separator and its "new group" slot. It is the wrapper the live drag of the groups
 * moves sideways (its sections ride on it), so it is registered with the shift registry.
 */
const GroupColumn = ({ groupId, fixedWidth, children }: GroupColumnProps) => {
    // The node is state (not only a ref) so the handle drawn in the column renders once it exists
    const [column, setColumn] = useState<HTMLElement | null>(null)
    const owner = useNoteDndOwner()
    const setRef = useCallback((node: HTMLElement | null) => {
        setColumn(node)
        registerShiftNode(groupNodeKey(groupId), node, owner)
    }, [groupId, owner])
    return (
        <div ref={setRef} {...{ [SHIFT_ATTR.groupWrap]: groupId }} className={cn("relative h-full w-fit", fixedWidth ? "shrink-0" : "max-w-full")}>
            <GroupColumnContext.Provider value={column}>
                {children}
            </GroupColumnContext.Provider>
        </div>
    )
}

export const GroupContainer = () => {
    const { noteDataTree } = useActiveNote()
    const activeId = useActiveNoteId()
    const uiStore = useTabUiStore()
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const { showAudioFileCount, showGroupSeparators } = usePreferences()
    const groups = noteDataTree?.groups
    const audioCounts = useNoteAudioCounts(activeId, showAudioFileCount)
    const mediaCounts = useNoteMediaCounts(activeId, showAudioFileCount)
    const hasData = groups !== undefined
    const orderedGroups = useMemo(() => Array.isArray(groups) ? groupsByPosition(groups) : [], [groups])
    // A note opened for the first time has no data yet: its skeleton instead of an empty note with only "Nuovo gruppo"
    const isLoadingNote = activeId !== null && !hasData
    const background = useNoteBackgroundCss(activeId)

    // The data is loaded by the active note provider. Here the scroll position of each note is restored
    // (once its data is rendered) and saved while scrolling, so it survives tab switches.
    useLayoutEffect(() => {
        const element = scrollRef.current
        if (!element || activeId === null || !hasData) return

        const saved = uiStore.getScroll(activeId)
        element.scrollLeft = saved?.left ?? 0
        element.scrollTop = saved?.top ?? 0

        const handleScroll = () => uiStore.setScroll(activeId, { left: element.scrollLeft, top: element.scrollTop })
        element.addEventListener("scroll", handleScroll, { passive: true })
        return () => element.removeEventListener("scroll", handleScroll)
    }, [activeId, hasData, uiStore])

    if (isLoadingNote) return (
        <div className="relative flex-1 min-h-0 w-full" style={background}>
            <NoteSkeleton />
        </div>
    )

    return (
        <NoteProviders>
            {/* flex-1 + min-h-0: a tall note must scroll here instead of squeezing the tab bar above */}
            <div className="relative flex-1 min-h-0 w-full" data-testid="note-background" style={background}>
            {hasData && groups.length === 0 && <EmptyNoteHints />}
            {hasData && groups.length === 0 && <EmptyNoteDropZone />}
            <SelectionBarInset
                ref={scrollRef}
                data-testid="group-scroll"
                className={cn(
                    "flex w-full h-full items-start p-2 space-x-2 overflow-x-auto",
                )}
            >
                {orderedGroups.length > 0 &&
                    orderedGroups
                        .map((group, index) => (
                            <GroupColumn key={group.id} groupId={group.id} fixedWidth={!!group.width}>
                                {/* Vertical guide line centered in the gap (space-x-2) before every group but the first */}
                                {showGroupSeparators && index > 0 &&
                                    <div data-testid="group-separator" aria-hidden className="pointer-events-none absolute -left-1 top-0 h-full w-px -translate-x-1/2 bg-border" />}
                                <NewGroupSlot index={index} />
                                <Group group={group} index={index} audioCount={audioCounts[group.id] ?? 0} mediaCount={mediaCounts[group.id] ?? 0} />
                            </GroupColumn>
                        ))}
                <NewGroupEnd index={groups?.length ?? 0} empty={hasData && groups.length === 0}>
                    <AddSection />
                </NewGroupEnd>
            </SelectionBarInset>
            <TaskSelectionBar />
            <NoteAnnouncer />
            </div>
        </NoteProviders>
    )
}
