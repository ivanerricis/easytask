import { AddSection } from "../section/AddSection"
import { useLayoutEffect, useMemo, useRef } from "react"
import { Group } from "./Group"
import { useActiveNote } from "@/contexts/use-active-note"
import { useActiveNoteId, useTabUiStore } from "@/contexts/use-tabs"
import { NewGroupEnd, NewGroupSlot } from "./NewGroupSlot"
import { usePreferences } from "@/contexts/use-preferences"
import { useNoteAudioCounts } from "@/contexts/use-audio"
import { EmptyNoteHints } from "../EmptyNoteHints"
import { NoteSkeleton } from "./NoteSkeleton"
import { NoteProviders } from "./NoteProviders"
import { SelectionBarInset, TaskSelectionBar } from "../tasks/TaskSelectionBar"
import { NoteAnnouncer } from "../tasks/NoteAnnouncer"
import { cn } from "@/lib/utils"
import { groupsByPosition } from "@/lib/group-sections"
import { useNoteBackgroundStyle } from "@/hooks/use-note-background"

export const GroupContainer = () => {
    const { noteDataTree } = useActiveNote()
    const activeId = useActiveNoteId()
    const uiStore = useTabUiStore()
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const { showAudioFileCount, showGroupSeparators } = usePreferences()
    const groups = noteDataTree?.groups
    const audioCounts = useNoteAudioCounts(activeId, showAudioFileCount)
    const hasData = groups !== undefined
    const orderedGroups = useMemo(() => Array.isArray(groups) ? groupsByPosition(groups) : [], [groups])
    // A note opened for the first time has no data yet: its skeleton instead of an empty note with only "Nuovo gruppo"
    const isLoadingNote = activeId !== null && !hasData
    const background = useNoteBackgroundStyle(activeId)

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
        <div className="relative flex-1 min-h-0 w-full" style={{ background }}>
            <NoteSkeleton />
        </div>
    )

    return (
        <NoteProviders>
            {/* flex-1 + min-h-0: a tall note must scroll here instead of squeezing the tab bar above */}
            <div className="relative flex-1 min-h-0 w-full" data-testid="note-background" style={{ background }}>
            {hasData && groups.length === 0 && <EmptyNoteHints />}
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
                            <div key={group.id} className={cn("relative h-full w-fit", group.width ? "shrink-0" : "max-w-full")}>
                                {/* Vertical guide line centered in the gap (space-x-2) before every group but the first */}
                                {showGroupSeparators && index > 0 &&
                                    <div data-testid="group-separator" aria-hidden className="pointer-events-none absolute -left-1 top-0 h-full w-px -translate-x-1/2 bg-border" />}
                                <NewGroupSlot index={index} />
                                <Group group={group} index={index} audioCount={audioCounts[group.id] ?? 0} />
                            </div>
                        ))}
                <NewGroupEnd index={groups?.length ?? 0}>
                    <AddSection />
                </NewGroupEnd>
            </SelectionBarInset>
            <TaskSelectionBar />
            <NoteAnnouncer />
            </div>
        </NoteProviders>
    )
}
