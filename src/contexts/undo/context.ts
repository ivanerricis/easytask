import { createContext } from "react"
import type { UndoRecorder } from "./commands"
import type { UndoCommand, UndoEntries, UndoSnapshot } from "./stack"

export type UndoContextType = UndoSnapshot & {
    /** Labels of the undoable (most recent first) and redoable (next to redo first) actions. Stable identity until they change. */
    entries: UndoEntries
    /** Undoes the actions from the most recent down to entry `index` included (0 = the last one), one toast. Never rejects. */
    undoTo: (index: number) => Promise<void>
    /** Redoes the actions from the next one up to entry `index` included (0 = the next one), one toast. Never rejects. */
    redoTo: (index: number) => Promise<void>
    /** Undoes the last action (a toast tells the outcome); resolves once it is done. Never rejects. */
    undo: () => Promise<void>
    /** Redoes the last undone action. Never rejects. */
    redo: () => Promise<void>
    /** True when the command is still the last recorded action (nothing was done or undone after it). Stable identity. */
    isLatest: (command: UndoCommand) => boolean
    /** Empties the history (undo and redo). Used after a purge: the ids of purged rows can be reused by new ones. Stable identity. */
    clear: () => void
    /** Records the actions as they are done by the user. Stable: it never changes identity. */
    recorder: UndoRecorder
}

export const UndoContext = createContext<UndoContextType | null>(null)

/**
 * The recorder alone, in its own context: it never changes identity, while the value of UndoContext changes at every recorded
 * action. A component that only records (every task row does) must not re-render because of the history.
 */
export const UndoRecorderContext = createContext<UndoRecorder | null>(null)
