import { useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import i18n from "@/i18n"
import type { Task, TaskFile } from "@/types/types"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { getFileName } from "@/db/queries/audio"
import { getErrorMessage } from "@/lib/utils"

const BLOCKED = "blocked"

/**
 * Opens a file attached to a task with the default app of the system (a program or a script is refused by the Rust command).
 * A failure is told with a toast.
 * @param path Absolute path of the file.
 * @category Hooks
 */
export async function openTaskFile(path: string) {
    try {
        await invoke("open_task_file", { path })
    } catch (error) {
        toast.error(String(error) === BLOCKED ? i18n.t("taskFiles.blocked") : i18n.t("taskFiles.openError", { message: getErrorMessage(error) }))
    }
}

/**
 * What the file menus of a task do: attach files (a dialog), remove one, point one to a new path. Each change is shown in the
 * cached note at once (the stored list replaces it) and is ONE undo step.
 * @param task The task (its id, text and current list of files).
 * @category Hooks
 */
export function useTaskFileMutations(task: Pick<Task, "id" | "text" | "files">) {
    const { attachTaskFiles, setTaskFiles } = useWorkspaceActions()
    const { patchTask } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    const files = task.files
    const before = useMemo(() => files ?? [], [files])

    /** Writes a new list and records the step; the cache is put back when the write fails. */
    const change = useCallback(async (kind: "attach" | "remove" | "relink", write: () => Promise<TaskFile[]>, optimistic?: TaskFile[]) => {
        const rollback = optimistic ? patchTask(task.id, { files: optimistic }) : undefined
        try {
            const stored = await write()
            patchTask(task.id, { files: stored })
            recorder.taskFiles(task.id, task.text, kind, before, stored)
        } catch (error) {
            rollback?.()
            throw error
        }
    }, [patchTask, recorder, task.id, task.text, before])

    /** Attaches files by path (the dialog and a drop both end here). */
    const attachPaths = useCallback(async (paths: readonly string[]) => {
        if (paths.length === 0) return
        try {
            await change("attach", () => attachTaskFiles(task.id, paths))
            toast.success(i18n.t("taskFiles.attached", { count: paths.length }))
        } catch (error) {
            toast.error(i18n.t("taskFiles.attachError", { message: getErrorMessage(error) }))
        }
    }, [change, attachTaskFiles, task.id])

    /** Asks for the files and attaches them. */
    const attach = useCallback(async () => {
        try {
            const selected = await open({ multiple: true, directory: false })
            if (!selected) return
            await attachPaths(Array.isArray(selected) ? selected : [selected])
        } catch (error) {
            toast.error(i18n.t("taskFiles.attachError", { message: getErrorMessage(error) }))
        }
    }, [attachPaths])

    const remove = useCallback(async (file: TaskFile) => {
        const rest = before.filter(other => other.id !== file.id)
        try {
            await change("remove", () => setTaskFiles(task.id, rest), rest)
        } catch (error) {
            toast.error(i18n.t("taskFiles.attachError", { message: getErrorMessage(error) }))
        }
    }, [change, setTaskFiles, task.id, before])

    /** Points a file (missing, usually) to another path, asked with a dialog; the name stays. */
    const relink = useCallback(async (file: TaskFile) => {
        try {
            const selected = await open({ multiple: false, directory: false })
            const path = Array.isArray(selected) ? selected[0] : selected
            if (!path) return
            const next = before.map(other => other.id === file.id ? { ...other, path, name: other.name || getFileName(path) } : other)
            await change("relink", () => setTaskFiles(task.id, next), next)
            toast.success(i18n.t("audio.pathUpdated"))
        } catch (error) {
            toast.error(i18n.t("audio.pathError", { message: getErrorMessage(error) }))
        }
    }, [change, setTaskFiles, task.id, before])

    return useMemo(() => ({ attach, attachPaths, remove, relink }), [attach, attachPaths, remove, relink])
}
