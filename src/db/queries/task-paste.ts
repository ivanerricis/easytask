import i18n from "@/i18n"
import type { TemplateTask } from "@/types/template"
import { createError, handleDBError, toAppError } from "@/types/error"
import { getDB } from "../dbManager"
import { Transaction, type TxRef } from "../transaction"
import { addPositions, siblingIds } from "./ordering"
import { addTaskTree } from "./template"

/**
 * Inserts copies of tasks (with their subtasks and tags) right after a task, as its siblings (same section or same parent
 * task). The siblings are renumbered with the new rows in place and everything is written in ONE transaction: on a failure
 * nothing is created. A tag is the one of the workspace with the same name (the case is ignored) or a new one.
 * @param afterTaskId The task the copies follow; it must be alive.
 * @param tasks The snapshots to insert, in order.
 * @returns The ids of the new top level tasks, in order.
 * @throws TASK_PARENT_MISSING when the task is missing or in the trash.
 * @category Database Queries
 */
export async function insertDBTasksAfter(afterTaskId: number, tasks: readonly TemplateTask[]): Promise<number[]> {
    if (tasks.length === 0) return []
    try {
        const db = await getDB()
        const anchor = await db.select<{ sectionID: number, taskID: number | null }[]>(
            'SELECT sectionID, taskID FROM task WHERE id = ? AND deleted_at IS NULL', [afterTaskId])
        if (!anchor[0])
            throw createError("TASK_PARENT_MISSING", i18n.t("errors.task.parentMissing"))
        const { sectionID: sectionId, taskID: parentTaskId } = anchor[0]
        const ids: (number | TxRef)[] = parentTaskId === null
            ? await siblingIds(db, "task", "sectionID = ? AND taskID IS NULL", [sectionId], -1)
            : await siblingIds(db, "task", "taskID = ?", [parentTaskId], -1)
        // The copies go right behind the anchor (at the end when it is not among the living siblings any more)
        const anchorIndex = ids.indexOf(afterTaskId)
        const at = anchorIndex < 0 ? ids.length : anchorIndex + 1

        const tx = new Transaction()
        const refs = addTaskTree(tx, sectionId, tasks.map(task => ({ sectionRef: sectionId, parentRef: parentTaskId, task })))
        ids.splice(at, 0, ...refs)
        addPositions(tx, "task", ids)
        const results = await tx.run()
        return refs.map(ref => results[ref.$ref].lastInsertId - ref.offset)
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "TASK", {
            UNIQUE: i18n.t("errors.task.unique"),
            CHECK: i18n.t("errors.task.check"),
        }))
    }
}
