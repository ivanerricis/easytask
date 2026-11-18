import { withDBErrors, SECTION_MESSAGES } from "./errors";
import { getDB } from "../dbManager";
import { Transaction } from "../transaction";
import { DEFAULT_SECTION_SQL, nextPositionSql } from "./sql";
import { createError } from "@/types/error";
import { getErrorMessage } from "@/lib/utils";
import i18n from "@/i18n";
import { isTaskOrder, type TaskOrder } from "@/lib/task-order";

/**
 * Saves how the tasks of a section are ordered on screen. A state of the view: it does not change the edit dates (the
 * triggers ignore the column) and it is not an undo step.
 * @param sectionId The ID of the section.
 * @param order `manual`, `open-first` or `done-first`; null = follow the preference "completed tasks last".
 * @throws "SECTION_UPDATE_ERROR" when the order is not valid or cannot be saved.
 * @category Database Queries
 */
export async function setDBSectionTaskOrder(sectionId: number, order: TaskOrder | null) {
    try {
        if (order !== null && !isTaskOrder(order)) throw new Error(`Unsupported order: ${String(order)}`)
        const db = await getDB()
        await db.execute('UPDATE section SET task_order = ? WHERE id = ?', [order, sectionId])
    } catch (error: unknown) {
        throw createError("SECTION_UPDATE_ERROR", i18n.t("errors.section.taskOrder", { message: getErrorMessage(error) }))
    }
}

/**
 * Creates a new section in a specific group, appended after every other row of the group (the default section included: it shares their order).
 * @param groupId The ID of the group where the section will be created.
 * @param title The title of the section (blank = no title, stored as NULL).
 * @category Database Queries
 */
export async function createDBSectionInGroup(groupId: number, title: string) {
    return withDBErrors("SECTION", SECTION_MESSAGES, async () => {
        const db = await getDB()
        const result = await db.execute(
            `INSERT INTO section (groupID, title, position)
             SELECT ?, ?, ${nextPositionSql("section", "groupID = ? AND deleted_at IS NULL")}`,
            [groupId, title.trim() || null, groupId]);
        return result.lastInsertId as number
    })
}

/**
 * Creates a new section in a new group of a note.
 * @param noteId The ID of the note to which the group belongs.
 * @param title The title of the section (blank = no title, stored as NULL).
 * @param position The position of the new group in the note.
 * @returns The ids of the new group, of its hidden default section and of the new section.
 * @category Database Queries
 */
export async function createDBSection(noteId: number, title: string, position: number) {
    return withDBErrors("SECTION", SECTION_MESSAGES, async () => {
        // One transaction: a failing section leaves no orphan group behind
        const tx = new Transaction()
        const group = tx.add('INSERT INTO section_group (noteID, position) VALUES (?, ?)', [noteId, position])
        const defaultSection = tx.add(DEFAULT_SECTION_SQL, [tx.idOf(group)])
        const section = tx.add('INSERT INTO section (groupID, title, position) VALUES (?, ?, 1)', [tx.idOf(group), title.trim() || null])
        const results = await tx.run()
        return {
            groupId: results[group].lastInsertId,
            defaultSectionId: results[defaultSection].lastInsertId,
            sectionId: results[section].lastInsertId,
        }
    })
}