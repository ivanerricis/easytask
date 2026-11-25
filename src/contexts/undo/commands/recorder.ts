import type { UndoCommand } from "../stack"
import type { createUndoCommands } from "./create"

export type UndoCommands = ReturnType<typeof createUndoCommands>

type RecorderOf<T> = { [K in keyof T]: T[K] extends (...args: infer A) => UndoCommand ? (...args: A) => void : never }

/** The same builders, but each call also records the command in the history. */
export type UndoRecorder = RecorderOf<UndoCommands> & {
    /** Records a command built by the caller (for the actions that need the state of their own component). */
    record: (command: UndoCommand) => void
    /** Marks a write that records its command when it ends, so that an undo asked meanwhile waits for it. */
    track: <T>(write: Promise<T>) => Promise<T>
}

/** Wraps the builders so that every call records the command. */
export function createUndoRecorder(commands: UndoCommands, record: (command: UndoCommand) => void, track: UndoRecorder["track"] = write => write, getScope?: () => number | undefined, getNoteId?: () => number | null | undefined): UndoRecorder {
    // Every command is stamped with the template draft it is done in (if any), so it is only undone from that draft
    const scoped = (command: UndoCommand) => {
        const scope = getScope?.()
        if (scope !== undefined && command.scopeNoteId === undefined) command.scopeNoteId = scope
        // ...and with the note that was active (in the focused pane) when it was done, so undo/redo can refresh that note
        const noteId = getNoteId?.()
        if (noteId != null && command.noteId === undefined) command.noteId = noteId
        record(command)
    }
    const entries = Object.entries(commands).map(([name, build]) =>
        [name, (...args: never[]) => scoped((build as (...a: never[]) => UndoCommand)(...args))] as const)
    return { ...Object.fromEntries(entries), record: scoped, track } as UndoRecorder
}

/** A recorder that does nothing (outside an UndoProvider, e.g. in isolated component tests). */
const noop = () => {}
export const NOOP_RECORDER: UndoRecorder = {
    rename: noop, color: noop, background: noop, backgroundImage: noop, taskCompletion: noop, taskPriority: noop, taskDue: noop, taskDescription: noop, pageText: noop, remove: noop, create: noop,
    archive: noop, createMany: noop, unarchive: noop, archiveMany: noop, treeMove: noop, removeMany: noop, colorMany: noop, colorContent: noop, treeMoveMany: noop, sectionMove: noop, directMove: noop, sectionMoveToNewGroup: noop, taskMove: noop, taskMoveMany: noop, tagCreate: noop, tagDelete: noop, tagRename: noop, tagColor: noop, tagShape: noop, tagAssign: noop, tagAssignGroups: noop, tagAssignSections: noop, record: noop, track: write => write,
}
