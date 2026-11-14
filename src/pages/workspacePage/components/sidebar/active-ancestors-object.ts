import { createContext, useContext } from "react"
import { createExternalStore, useStoreSelector, type ExternalStore } from "@/lib/external-store"

type AncestorsStore = ExternalStore<ReadonlySet<number>>

export const NO_ANCESTORS: ReadonlySet<number> = new Set()
export const AncestorsContext = createContext<AncestorsStore | null>(null)
const noAncestorsStore: AncestorsStore = createExternalStore(NO_ANCESTORS)

/**
 * Whether a collapsed folder hides the note open in the active tab (somewhere inside it); always false for an open folder
 * and without an ActiveAncestorsProvider.
 */
export const useFolderHoldsActiveNote = (folderId: number, isOpen: boolean): boolean =>
    useStoreSelector(useContext(AncestorsContext) ?? noAncestorsStore, ancestors => !isOpen && ancestors.has(folderId))
