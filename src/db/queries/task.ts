import i18n from "@/i18n"
import { createError, handleDBError, toAppError } from "@/types/error"
import { getDB } from "../dbManager"
import { withDBErrors, SECTION_MESSAGES, TASK_MESSAGES } from "./errors"
import { getErrorMessage } from "@/lib/utils"
import { DEFAULT_SECTION_SQL, newPositionSql } from "./sql"
import type { NewTaskPosition } from "@/lib/store/preferences"
import { Transaction, type TxRef } from "../transaction"
import { addPositions, siblingIds } from "./ordering"
import { normalizeDue } from "@/lib/due-date"

/**
 * Creates a new top level task in a section, after its siblings or before them.
 * @param sectionId The ID of the section to which the task belongs.
 * @param text The text of the task.
 * @param position Where the task goes among its siblings (default: at the end).
 * @category Database
 */
export async function createDBTask(sectionId: number, text: string, position: NewTaskPosition = "bottom") {
    return withDBErrors("TASK", TASK_MESSAGES, async () => {
        const db = await getDB()
        const result = await db.execute(
            `INSERT INTO task (sectionID, text, position)
             SELECT ?, ?, ${newPositionSql(position, "task", "sectionID = ? AND taskID IS NULL AND deleted_at IS NULL")}`,
            [sectionId, text, sectionId])
        return result.lastInsertId as number
    })
}

/**
 * Returns the id of the hidden default section of a group (the one that holds its direct tasks), creating it when the
 * group has none (every group gets one when it is created, so this is only a safety net).
 * @param groupId The ID of the group.
 * @category Database
 */
export async function ensureDBDefaultSection(groupId: number): Promise<number> {
    return withDBErrors("SECTION", SECTION_MESSAGES, async () => {
        const db = await getDB()
        const existing = await db.select<{ id: number }[]>('SELECT id FROM section WHERE groupID = ? AND is_default = 1', [groupId])
        if (existing[0]) return existing[0].id
        const result = await db.execute(DEFAULT_SECTION_SQL, [groupId])
        return result.lastInsertId as number
    })
}

/**
 * Creates a new subtask, after its siblings or before them, in the same section as the parent.
 * @param taskId The ID of the task to create a subtask for.
 * @param text The text of the subtask.
 * @param position Where the subtask goes among its siblings (default: at the end).
 * @category Database
 */
export async function createDBSubTask(taskId: number, text: string, position: NewTaskPosition = "bottom") {
    let result: { rowsAffected: number, lastInsertId?: number }
    try {
        const db = await getDB()
        result = await db.execute(
            `INSERT INTO task (sectionID, taskID, text, position)
             SELECT sectionID, id, ?, ${newPositionSql(position, "task", "taskID = ? AND deleted_at IS NULL")}
             FROM task WHERE id = ? AND deleted_at IS NULL`,
            [text, taskId, taskId])
    } catch (error: unknown) {
        handleDBError(error, "TASK", {
            UNIQUE: i18n.t("errors.task.unique"),
            CHECK: i18n.t("errors.task.check"),
        })
    }
    // The parent is missing or in the trash: nothing was inserted
    if (result.rowsAffected !== 1)
        throw createError("TASK_PARENT_MISSING", i18n.t("errors.task.parentMissing"))
    return result.lastInsertId as number
}

/**
 * Creates a new task (top level or subtask) right after a sibling, or first when no sibling is given. The siblings are
 * renumbered with the new row in place (one transaction), so the position does not depend on gaps in the old ones.
 * An anchor that is not among the living siblings any more (e.g. trashed in the meantime) puts the task at the end.
 * @param parent The section (top level task) or the parent task (subtask) that holds the new task.
 * @param afterTaskId The sibling the new task follows, null for the first place.
 * @param text The text of the task.
 * @returns The id of the new task and its index among the living siblings.
 * @throws TASK_PARENT_MISSING when the parent task is missing or in the trash.
 * @category Database
 */
export async function insertDBTaskAfter(
    parent: { sectionId: number } | { parentTaskId: number }, afterTaskId: number | null, text: string,
): Promise<{ id: number, index: number }> {
    try {
        const db = await getDB()
        let sectionId: number
        let parentTaskId: number | null = null
        let ids: (number | TxRef)[]
        if ("sectionId" in parent) {
            sectionId = parent.sectionId
            ids = await siblingIds(db, "task", "sectionID = ? AND taskID IS NULL", [sectionId], -1)
        } else {
            const rows = await db.select<{ sectionID: number }[]>(
                'SELECT sectionID FROM task WHERE id = ? AND deleted_at IS NULL', [parent.parentTaskId])
            if (!rows[0])
                throw createError("TASK_PARENT_MISSING", i18n.t("errors.task.parentMissing"))
            sectionId = rows[0].sectionID
            parentTaskId = parent.parentTaskId
            ids = await siblingIds(db, "task", "taskID = ?", [parentTaskId], -1)
        }
        const anchor = afterTaskId === null ? -1 : ids.indexOf(afterTaskId)
        const at = afterTaskId === null ? 0 : anchor < 0 ? ids.length : anchor + 1

        const tx = new Transaction()
        const ins = tx.add("INSERT INTO task (sectionID, taskID, text, position) VALUES (?, ?, ?, 0)", [sectionId, parentTaskId, text])
        ids.splice(at, 0, tx.idOf(ins))
        addPositions(tx, "task", ids)
        const results = await tx.run()
        return { id: results[ins].lastInsertId, index: at }
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "TASK", {
            UNIQUE: i18n.t("errors.task.unique"),
            CHECK: i18n.t("errors.task.check"),
        }))
    }
}

/**
 * Edits the priority of an existing task in the database.
 * @param id The ID of the task to edit.
 * @param priority The new priority of the task.
 * @category Database
 */
export async function updateDBTaskPriority(taskId: number, priority: boolean) {
    return withDBErrors("TASK", TASK_MESSAGES, async () => {
        const db = await getDB()
        await db.execute('UPDATE task SET priority=? WHERE id=?', [priority ? 1 : 0, taskId])
    })
}

/**
 * Sets or clears the due date of a task. A time needs a date: without a valid date both are cleared.
 * @param taskId The ID of the task to edit.
 * @param date The due date (YYYY-MM-DD), null to clear it.
 * @param time The due time (HH:MM), null for the whole day.
 * @category Database
 */
export async function updateDBTaskDue(taskId: number, date: string | null, time: string | null) {
    const due = normalizeDue(date, time)
    return withDBErrors("TASK", TASK_MESSAGES, async () => {
        const db = await getDB()
        await db.execute('UPDATE task SET due_date=?, due_time=? WHERE id=?', [due.date, due.time, taskId])
    })
}

/**
 * Edits the completion status of an existing task in the database.
 * @param id The ID of the task to edit.
 * @param isComplited The new completion status of the task.
 * @category Database
 */
export async function updateDBTaskCompletion(taskId: number, isCompleted: boolean) {
    return withDBErrors("TASK", TASK_MESSAGES, async () => {
        const db = await getDB()
        await db.execute('UPDATE task SET completed=? WHERE id=?', [isCompleted ? 1 : 0, taskId])
    })
}

/**
 * Updates the description of a task in the database.
 * @param taskID ID of the task to update
 * @param description New description for the task
 * @category Database
 */
export async function updateDBTaskDescription(taskID: number, description?: string) {
    try {
        const db = await getDB()
        await db.execute('UPDATE task SET description=? WHERE id=?', [description ?? null, taskID])
    } catch (error: unknown) {
        throw createError(`TASK_DESCRIPTION_UPDATE_FAILED`, i18n.t("errors.task.descriptionUpdate", { message: getErrorMessage(error) }))
    }
}