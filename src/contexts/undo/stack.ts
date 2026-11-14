import { createEmitter } from "@/lib/emitter"
import { reportError } from "@/lib/report-error"

/**
 * One undoable user action. `undo` and `redo` are the inverse of each other: they only use stable ids
 * (a soft delete keeps the ids) and reject when the operation could not be applied.
 * @category Undo
 */
export type UndoCommand = {
    /** Translated description of the action, shown in the toasts and in the menus. */
    label: string
    /**
     * The template draft (note id) the action was done in: it can only be undone/redone while that draft is the active note.
     * Undefined for the actions on the normal notes and on the workspace.
     */
    scopeNoteId?: number
    /** The note open when the action was recorded. */
    noteId?: number
    undo: () => Promise<void>
    redo: () => Promise<void>
}

export type UndoOutcome =
    | { status: "empty" }
    /** The next command belongs to a template draft that is not the active note: nothing was applied. */
    | { status: "blocked", label: string }
    | { status: "done", label: string }
    | { status: "failed", label: string, error: unknown }

/** Outcome of undoing/redoing several actions in a row: `executed` is how many were applied (also on failure). */
export type UndoManyOutcome =
    | { status: "empty", executed: 0 }
    | { status: "blocked", executed: number, label: string }
    | { status: "done", executed: number, label: string }
    | { status: "failed", executed: number, label: string, error: unknown }

/** Labels of the actions, each list ordered starting from the one the next undo/redo would apply. */
export type UndoEntries = {
    undo: string[]
    redo: string[]
}

export type UndoSnapshot = {
    canUndo: boolean
    canRedo: boolean
    undoLabel: string | null
    redoLabel: string | null
}

export const UNDO_LIMIT = 50

/**
 * The history of the undoable actions: an undo stack and a redo stack (framework independent).
 * - at most `limit` actions are kept (the oldest is dropped);
 * - a new action empties the redo stack;
 * - while an undo/redo runs, `record` is ignored (the inverse operations must not create history);
 * - undo/redo requests are serialized, so quick repeated shortcuts apply in order;
 * - a command that fails is dropped (its state can no longer be trusted) and the error is returned, never thrown;
 * - `onApplied` is awaited after each applied command (its errors are ignored);
 * - a command for which `isBlocked` is true (an action done in a template draft, while another note is active) is not run;
 * - `dropScope` removes the commands of a closed template draft;
 * - `clear` also discards the effect of a command that was running meanwhile.
 * @category Undo
 */
export function createUndoHistory(limit = UNDO_LIMIT, initialIsBlocked: (command: UndoCommand) => boolean = () => false) {
    let isBlocked = initialIsBlocked
    let onApplied: (command: UndoCommand, direction: "undo" | "redo") => void | Promise<void> = () => {}
    let undoStack: UndoCommand[] = []
    let redoStack: UndoCommand[] = []
    let running = false
    let generation = 0
    let queue: Promise<unknown> = Promise.resolve()
    const changes = createEmitter()

    const buildSnapshot = (): UndoSnapshot => ({
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undoLabel: undoStack.at(-1)?.label ?? null,
        redoLabel: redoStack.at(-1)?.label ?? null,
    })
    let snapshot = buildSnapshot()
    const emit = () => {
        const entriesChanged = refreshEntries()
        const next = buildSnapshot()
        const same = next.canUndo === snapshot.canUndo && next.canRedo === snapshot.canRedo &&
            next.undoLabel === snapshot.undoLabel && next.redoLabel === snapshot.redoLabel
        if (same && !entriesChanged) return
        if (!same) snapshot = next
        changes.emit()
    }

    const buildEntries = (): UndoEntries => ({
        undo: undoStack.map(c => c.label).reverse(),
        redo: redoStack.map(c => c.label).reverse(),
    })
    let entries = buildEntries()
    const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((label, i) => label === b[i])
    const refreshEntries = () => {
        const next = buildEntries()
        if (sameList(next.undo, entries.undo) && sameList(next.redo, entries.redo)) return false
        entries = next
        return true
    }

    const trim = () => {
        if (undoStack.length > limit) undoStack = undoStack.slice(undoStack.length - limit)
        // The redo stack is bounded too
        if (redoStack.length > limit) redoStack = redoStack.slice(redoStack.length - limit)
    }

    const record = (command: UndoCommand) => {
        if (running) return
        undoStack.push(command)
        trim()
        redoStack = []
        emit()
    }

    const runOne = async (direction: "undo" | "redo"): Promise<UndoOutcome> => {
        {
            const from = direction === "undo" ? undoStack : redoStack
            const command = from.at(-1)
            if (!command) return { status: "empty" }
            if (isBlocked(command)) return { status: "blocked", label: command.label }
            const startedAt = generation
            running = true
            try {
                await command[direction]()
                // A failure of the follow-up (e.g. a reload) is its own business: the command was applied
                try { await onApplied(command, direction) } catch (error) { reportError(error) }
            } catch (error) {
                // A failed command is dropped: its state can no longer be trusted
                if (startedAt === generation) {
                    from.pop()
                    emit()
                }
                return { status: "failed", label: command.label, error }
            } finally {
                running = false
            }
            // When the history was cleared meanwhile (workspace change) the command does not belong to it any more
            if (startedAt === generation) {
                from.pop()
                if (direction === "undo") redoStack.push(command)
                else {
                    undoStack.push(command)
                    trim()
                }
                emit()
            }
            return { status: "done", label: command.label }
        }
    }

    const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
        const result = queue.then(task, task)
        queue = result
        return result
    }

    /** Writes that will record a command when they finish: an undo/redo asked meanwhile waits for them. */
    const pending = new Set<Promise<unknown>>()
    const track = <T,>(write: Promise<T>): Promise<T> => {
        pending.add(write)
        const done = () => { pending.delete(write) }
        write.then(done, done)
        return write
    }
    const settled = () => Promise.allSettled([...pending])

    const execute = (direction: "undo" | "redo"): Promise<UndoOutcome> => enqueue(() => (pending.size > 0 ? settled().then(() => runOne(direction)) : runOne(direction)))

    /** Applies `index + 1` actions in sequence as one queued task (nothing can interleave); stops at the first failure. */
    const executeTo = (direction: "undo" | "redo", index: number): Promise<UndoManyOutcome> => enqueue(async (): Promise<UndoManyOutcome> => {
        if (pending.size > 0) await settled()
        const available = () => (direction === "undo" ? undoStack : redoStack).length
        if (!Number.isInteger(index) || index < 0 || available() === 0) return { status: "empty", executed: 0 }
        const target = Math.min(index + 1, available())
        const startedAt = generation
        let executed = 0
        let label = ""
        while (executed < target && startedAt === generation) {
            const outcome = await runOne(direction)
            if (outcome.status === "empty") break
            if (outcome.status === "blocked") return executed === 0 ? { status: "blocked", executed: 0, label: outcome.label } : { status: "done", executed, label }
            if (outcome.status === "failed") return { status: "failed", executed, label: outcome.label, error: outcome.error }
            executed += 1
            label = outcome.label
        }
        return executed === 0 ? { status: "empty", executed: 0 } : { status: "done", executed, label }
    })

    return {
        record,
        track,
        /** Replaces the check that tells a command cannot run now (see `createUndoHistory`). */
        setIsBlocked: (next: (command: UndoCommand) => boolean) => { isBlocked = next },
        /** Sets a callback awaited after every successful undo/redo, with the command that was applied (the provider reloads the note it belongs to). */
        setOnApplied: (next: (command: UndoCommand, direction: "undo" | "redo") => void | Promise<void>) => { onApplied = next },
        /** Changes the limit: the oldest actions beyond it are dropped at once. Invalid values are ignored. */
        setLimit: (next: number) => {
            if (!Number.isInteger(next) || next < 1) return
            limit = next
            trim()
            emit()
        },
        undo: () => execute("undo"),
        redo: () => execute("redo"),
        undoTo: (index: number) => executeTo("undo", index),
        redoTo: (index: number) => executeTo("redo", index),
        clear: () => {
            generation += 1
            undoStack = []
            redoStack = []
            emit()
        },
        /** Removes (undo and redo) the commands done in the template draft `noteId`: its note is deleted when the draft closes. */
        dropScope: (noteId: number) => {
            const keep = (command: UndoCommand) => command.scopeNoteId !== noteId
            if (undoStack.every(keep) && redoStack.every(keep)) return
            undoStack = undoStack.filter(keep)
            redoStack = redoStack.filter(keep)
            emit()
        },
        /** True when `command` is the next one an undo would apply (identity check on the top of the undo stack). */
        isLatest: (command: UndoCommand) => undoStack.at(-1) === command,
        getSnapshot: () => snapshot,
        getEntries: () => entries,
        subscribe: changes.subscribe,
    }
}

export type UndoHistory = ReturnType<typeof createUndoHistory>
