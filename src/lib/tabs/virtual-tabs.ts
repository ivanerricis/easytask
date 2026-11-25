import type { Note } from "@/types/types"

/**
 * Id of the "What's new" tab. A tab is identified by a note id; the ids of the database are positive, so a negative one
 * is a tab that is not a note: nothing is written to the database for it, it has no note data to load and the workspace
 * does not reopen it (a saved tab with this id is dropped when the tabs are restored).
 * @category Tabs
 */
export const WHATS_NEW_TAB_ID = -1

/** Whether the tab is the "What's new" one (and not a note). */
export const isWhatsNewTab = (id: number | null): boolean => id === WHATS_NEW_TAB_ID

/**
 * The stand-in for the "What's new" tab in the list of the open tabs (which is a list of notes): only the id and the name
 * are meaningful.
 * @param name The title of the tab.
 */
export const whatsNewTabNote = (name: string): Note => ({
    id: WHATS_NEW_TAB_ID,
    workspaceID: null,
    folderID: null,
    name,
    position: 0,
    creation_date: "",
    creation_time: "",
    edit_date: "",
    edit_time: "",
    groups: [],
})

/** Id of the "Statistics" tab (a second tab that is not a note, like the "What's new" one). */
export const STATS_TAB_ID = -2

/** Whether the tab is the "Statistics" one. */
export const isStatsTab = (id: number | null): boolean => id === STATS_TAB_ID

/** Whether the tab is not a note (a negative id): there is no note data to load for it. */
export const isVirtualTab = (id: number | null): boolean => id !== null && id < 0

/**
 * The stand-in for the "Statistics" tab in the list of the open tabs: only the id and the name are meaningful.
 * @param name The title of the tab.
 */
export const statsTabNote = (name: string): Note => ({ ...whatsNewTabNote(name), id: STATS_TAB_ID })
