import { createContext } from "react"
import type { TabHover } from "./tab-reorder"

/** The state of the drag shared by the tab bars (provided by `TabsDndProvider`). */
export type TabsDndContextType = {
    /** Where the dragged tab hovers now, null when it is over nothing it can be dropped on. */
    hover: TabHover | null
    /** Whether the workspace is split: two bars with the shared ids (`tab:<pane>:<id>`), else one bar with the plain note ids. */
    split: boolean
    /** Whether the live drag is on: the tabs step aside (no drop line) and the dragged tab is shown in the overlay, even with one bar. */
    live: boolean
}

/** Null outside `TabsDndProvider`: a `NoteList` then wraps itself in one. */
export const TabsDndContext = createContext<TabsDndContextType | null>(null)
