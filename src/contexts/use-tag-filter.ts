import { useCallback, useContext, useSyncExternalStore } from "react"
import type { TagFilter } from "@/pages/workspacePage/components/section/tag-filter"
import { ActiveIdContext, TabUiContext } from "./tabs-context-object"

const NO_TAGS: readonly number[] = []
const NEVER = () => () => {}

/**
 * The tags the open note is filtered by, as the user chose them (empty: no filter). Per note, kept in the per-note UI store while the
 * tab is open and not saved: a restart shows every task again. Outside a TabsProvider there is no filter.
 */
export function useChosenTags(): readonly number[] {
    const store = useContext(TabUiContext)
    const noteId = useContext(ActiveIdContext)
    return useSyncExternalStore(
        store?.subscribe ?? NEVER,
        useCallback(() => store && noteId !== null ? store.getTagFilter(noteId) : NO_TAGS, [store, noteId]),
    )
}

/**
 * The filter to apply to the open note: the chosen tags, or null when there is none, so every task is shown. The same array until
 * the choice changes (rows can compare it by reference).
 * @category Note
 */
export function useTagFilter(): TagFilter {
    const chosen = useChosenTags()
    return chosen.length > 0 ? chosen : null
}

/** Changes the tags the open note is filtered by (an empty list removes the filter). */
export function useSetTagFilter(): (tagIds: readonly number[]) => void {
    const store = useContext(TabUiContext)
    const noteId = useContext(ActiveIdContext)
    return useCallback((tagIds: readonly number[]) => { if (store && noteId !== null) store.setTagFilter(noteId, tagIds) }, [store, noteId])
}
