/**
 * Who a registered row belongs to. Every open note (a pane of the split view) has its own drag provider, with an `owner` id, and the
 * registries of the drag (the drop zones of note-dnd-hit, the wrappers of note-dnd-shift) are module level, so the rows of the two
 * panes share them: their keys carry the owner (`<owner>~task-5`), otherwise the "new group" slots of the two notes (same index) or
 * the same note open in both panes would overwrite each other, and closing one pane would forget the rows of the other.
 * @category Note DnD
 */

import { createContext, useContext } from "react"
import type { NoteDndStore } from "./note-dnd-state"

let sequence = 0

/** A new owner id (one per drag provider). */
export const newOwnerId = (): string => `n${++sequence}`

/** The key of a row of an owner. Without an owner (tabs, tests) the key stays as it is. */
export const ownerKey = (owner: string, key: string): string => owner ? `${owner}~${key}` : key

/** The key without the owner it was prefixed with. */
export const stripOwner = (key: string): string => key.slice(key.indexOf("~") + 1)

export type OwnerInfo = { noteId: number | null, store: NoteDndStore }

const notes = new Map<string, OwnerInfo>()

/**
 * Tells which note an owner shows and where its drag state lives (kept up to date by its provider); returns the function that
 * forgets it. The drag of one pane reads it to find the note under the pointer when that is the other pane, and to show the
 * drop target in that pane.
 */
export function registerNoteOwner(owner: string, noteId: number | null, store: NoteDndStore): () => void {
    const info = { noteId, store }
    notes.set(owner, info)
    return () => { if (notes.get(owner) === info) notes.delete(owner) }
}

/** The note an owner shows and its drag store (undefined when it is not registered). */
export const getNoteOwner = (owner: string): OwnerInfo | undefined => notes.get(owner)

/** Every registered owner except `owner`: the other panes. */
export const otherOwners = (owner: string): OwnerInfo[] => [...notes].filter(([id]) => id !== owner).map(([, info]) => info)

/** The owner a prefixed key belongs to ("" when it carries none). */
export const ownerOfKey = (key: string): string => key.includes("~") ? key.slice(0, key.indexOf("~")) : ""

/** The owner of the note the component is drawn in (given by its drag provider; empty without one). */
export const NoteOwnerContext = createContext("")

/** The id of the drag provider of the note the component is in: the rows register their wrappers under it. */
export const useNoteDndOwner = (): string => useContext(NoteOwnerContext)

/** Whether another note is open to receive a drag from `owner` (the other pane of a split view, showing a note). */
export const hasOtherNote = (owner: string): boolean => otherOwners(owner).some(info => info.noteId !== null)
