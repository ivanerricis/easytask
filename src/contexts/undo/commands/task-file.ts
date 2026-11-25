import i18n from "@/i18n"
import type { TaskFile } from "@/types/types"
import { withRollback } from "../../with-rollback"
import type { UndoCommand } from "../stack"
import { shorten, type UndoHelpers } from "./helpers"

/** The commands on the files attached to a task: attach, remove and relink are all "the list was this, now it is that". */
export function taskFileCommands(h: UndoHelpers) {
    const { workspace, note } = h

    /** Shows the list in the cached note, writes it, then shows it again with the ids the rows got. */
    const writeFiles = async (taskId: number, files: readonly TaskFile[]) => {
        const rollback = note.patchTask(taskId, { files: [...files] })
        const stored = await withRollback(rollback, () => workspace.setTaskFiles(taskId, files))
        note.patchTask(taskId, { files: stored })
    }

    return {
        /**
         * A change to the files of a task: the list before and after (an attach, a removal or a relink). Undone and redone by writing
         * the list back; the rows get new ids, nothing else refers to them.
         */
        taskFiles: (taskId: number, name: string, kind: "attach" | "remove" | "relink", before: readonly TaskFile[], after: readonly TaskFile[]): UndoCommand => ({
            label: i18n.t("undo.named", { label: i18n.t(`undo.labels.${kind === "attach" ? "attachFiles" : kind === "remove" ? "removeFile" : "relinkFile"}`), name: shorten(name) }),
            undo: () => writeFiles(taskId, before),
            redo: () => writeFiles(taskId, after),
        }),
    }
}
