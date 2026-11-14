import { useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { useActiveNoteSelector } from "@/contexts/use-tabs"
import { createExternalStore } from "@/lib/external-store"
import { AncestorsContext, NO_ANCESTORS } from "./active-ancestors-object"
import { getAncestorFolderIds } from "./note-path"
import type { TreeData } from "./tree-dnd"

const ancestorsOf = (tree: TreeData, noteId: number | null): ReadonlySet<number> =>
    noteId === null ? NO_ANCESTORS : new Set(getAncestorFolderIds(tree, { type: "note", id: noteId }))

/**
 * Keeps in a store the ids of the folders above the note open in the active tab, computed once per tab switch or tree change.
 * Each folder reads only whether it is in the set, so a tab switch re-renders just the folders whose answer changes.
 */
export const ActiveAncestorsProvider = ({ tree, children }: { tree: TreeData, children: ReactNode }) => {
    const activeId = useActiveNoteSelector(id => id)
    const ancestors = useMemo(() => ancestorsOf(tree, activeId), [tree, activeId])
    const [store] = useState(() => createExternalStore(ancestors))
    useLayoutEffect(() => { store.set(ancestors) }, [store, ancestors])
    return <AncestorsContext.Provider value={store}>{children}</AncestorsContext.Provider>
}

