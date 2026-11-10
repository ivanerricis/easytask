import { useContext } from "react"
import { createRequiredContextHook } from "@/lib/required-context"
import { NOOP_RECORDER, type UndoRecorder } from "./commands"
import { UndoContext, UndoRecorderContext } from "./context"

/**
 * The undo/redo history of the open workspace: state (can undo/redo and their labels) and the undo/redo actions.
 * @category Undo
 */
export const useUndo = createRequiredContextHook(UndoContext, "useUndo", "UndoProvider")

/** Like useUndo, but null outside an UndoProvider (menus then simply do not offer undo/redo). */
export const useOptionalUndo = () => useContext(UndoContext)

/**
 * Records user actions in the undo history. Outside an UndoProvider it does nothing, so the components that
 * record actions also work in isolation. It reads a context of its own (see UndoRecorderContext): the history changing does not re-render the caller.
 * @category Undo
 */
export const useUndoRecorder = (): UndoRecorder => useContext(UndoRecorderContext) ?? NOOP_RECORDER
