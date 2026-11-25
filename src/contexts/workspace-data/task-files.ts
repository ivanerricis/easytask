import { useCallback, useMemo } from "react"
import { createDBTaskFiles, setDBTaskFiles } from "@/db/queries/task-file"
import type { Runtime, WorkspaceActionsType } from "./types"

type TaskFileActions = Pick<WorkspaceActionsType, "attachTaskFiles" | "setTaskFiles">

/**
 * The files attached to the tasks of the open note. The writes go to the database and give back the list of the task as it
 * is stored; the caller patches the open note (the file list is part of the task).
 * @category WorkspaceData Context
 */
export function useTaskFileActions({ withLoading }: Runtime): TaskFileActions {
    /** Attaches files (by path) after the ones the task has. */
    const attachTaskFiles = useCallback((taskID: number, paths: readonly string[]) =>
        withLoading(() => createDBTaskFiles(taskID, paths)), [withLoading])

    /** Writes the whole list of files of a task (a removal, a relink, an undo or a redo). */
    const setTaskFiles = useCallback((taskID: number, files: readonly { name: string, path: string }[]) =>
        withLoading(() => setDBTaskFiles(taskID, files)), [withLoading])

    return useMemo(() => ({ attachTaskFiles, setTaskFiles }), [attachTaskFiles, setTaskFiles])
}
