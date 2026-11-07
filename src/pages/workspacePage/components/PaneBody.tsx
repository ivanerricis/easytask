import { memo, type ReactNode } from "react"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { GroupContainer } from "./groups/GroupContainer"
import { NoteList } from "./note/NoteList"
import { PathBar } from "./PathBar"
import { WhatsNewPage } from "./whats-new/WhatsNewPage"
import { isWhatsNewTab } from "@/lib/tabs/virtual-tabs"
import { NoteSearchProvider } from "./note-search-context"

type PaneBodyProps = {
    /** What takes the place of the note when the pane has no active note. */
    empty: ReactNode
    /** Whether the tab bar is shown even without an active note (the panes of the split workspace); else only with one. */
    alwaysTabs: boolean
}

/**
 * The content of a pane: its tab bar and its note (path bar + groups), or the `empty` placeholder. Memoized: it re-renders only
 * for the data it reads (tabs, active note) and not when the layout around it changes (divider drag, window resize, focus).
 */
export const PaneBody = memo(function PaneBody({ empty, alwaysTabs }: PaneBodyProps) {
    const activeId = useActiveNoteId()
    return (
        <>
            {(alwaysTabs || activeId !== null) && <NoteList />}
            {isWhatsNewTab(activeId)
                ? <WhatsNewPage />
                : activeId !== null
                    ? <NoteSearchProvider><PathBar /><GroupContainer /></NoteSearchProvider>
                    : empty}
        </>
    )
})
