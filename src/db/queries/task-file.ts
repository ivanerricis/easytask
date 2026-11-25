import i18n from "@/i18n"
import type Database from "@tauri-apps/plugin-sql"
import type { Task, TaskFile } from "@/types/types"
import type { TemplateFile } from "@/types/template"
import { createError, handleDBError, toAppError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { getDB } from "../dbManager"
import { Transaction, type TxRef } from "../transaction"
import { getFileName } from "./audio"
import { chunked, nextPositionSql, placeholders } from "./sql"

const COLUMNS = "id, taskID, name, path, position"

/**
 * Retrieves the files attached to a task, in position order (whatever the state of the task: a trashed task keeps them).
 * @param taskId The ID of the task.
 * @category Database Queries
 */
export async function getDBTaskFiles(taskId: number): Promise<TaskFile[]> {
    try {
        const db = await getDB()
        return await db.select<TaskFile[]>(`SELECT ${COLUMNS} FROM task_file WHERE taskID = ? ORDER BY position, id`, [taskId])
    } catch (error: unknown) {
        throw createError("TASK_FILE_LOAD_FAILED", i18n.t("errors.taskFile.load", { message: getErrorMessage(error) }))
    }
}

/**
 * Attaches files to a task, appended after the others. Only the path is stored (the file stays where it is) and the name
 * is the file name; the same file can be attached twice.
 * @param taskId The ID of the task.
 * @param paths Absolute paths of the files.
 * @returns The whole list of the task after the insert.
 * @category Database Queries
 */
export async function createDBTaskFiles(taskId: number, paths: readonly string[]): Promise<TaskFile[]> {
    if (paths.length === 0) return getDBTaskFiles(taskId)
    try {
        const tx = new Transaction()
        // One statement per file: the position of each one is computed after the previous insert
        for (const path of paths)
            tx.add(`INSERT INTO task_file (taskID, name, path, position) SELECT ?, ?, ?, ${nextPositionSql("task_file", "taskID = ?")}`,
                [taskId, getFileName(path), path, taskId])
        await tx.run()
        return await getDBTaskFiles(taskId)
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "TASK_FILE", { CHECK: i18n.t("errors.taskFile.checkCreate") }))
    }
}

/**
 * Writes the list of files of a task as it is given (the undo or redo of an attach, a removal or a relink): the old rows go
 * away and the list is inserted again, in order, in one transaction. The ids change, so the caller reads the list back.
 * @param taskId The ID of the task.
 * @param files The wanted list, in order.
 * @returns The list as it was written.
 * @category Database Queries
 */
export async function setDBTaskFiles(taskId: number, files: readonly Pick<TaskFile, "name" | "path">[]): Promise<TaskFile[]> {
    try {
        const tx = new Transaction()
        tx.add("DELETE FROM task_file WHERE taskID = ?", [taskId])
        files.forEach((file, position) => tx.add("INSERT INTO task_file (taskID, name, path, position) VALUES (?, ?, ?, ?)", [taskId, file.name, file.path, position]))
        await tx.run()
        return await getDBTaskFiles(taskId)
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "TASK_FILE", { CHECK: i18n.t("errors.taskFile.checkCreate") }))
    }
}

/**
 * The `files` of the tasks of some notes, read in ONE query per chunk of notes and put on the tasks that were already loaded
 * (a task without files gets none, so the objects stay as they were). Files of a task that is not in the list are ignored.
 * @param db The database.
 * @param noteIds The notes the tasks belong to.
 * @param tasks The loaded tasks of those notes (flat, subtasks included).
 * @category Database Queries
 */
export async function attachTaskFilesOfNotes(db: Database, noteIds: readonly number[], tasks: readonly Task[]): Promise<void> {
    if (tasks.length === 0) return
    const byId = new Map(tasks.map(task => [task.id, task]))
    const chunks = await Promise.all(chunked(noteIds).map(ids => db.select<TaskFile[]>(
        `SELECT f.id, f.taskID, f.name, f.path, f.position FROM task_file f
         INNER JOIN task t ON t.id = f.taskID
         INNER JOIN section s ON s.id = t.sectionID
         INNER JOIN section_group g ON g.id = s.groupID
         WHERE g.noteID IN (${placeholders(ids.length)})
         ORDER BY f.position, f.id`, ids)))
    for (const row of chunks.flat()) {
        const task = byId.get(row.taskID)
        if (task) (task.files ??= []).push(row)
    }
}

/**
 * Puts the `files` on tasks that were read straight from the table (the copy of a section): one query per chunk of tasks.
 * @param tasks The tasks (modified in place).
 * @category Database Queries
 */
export async function loadTaskFiles(tasks: Task[]): Promise<void> {
    if (tasks.length === 0) return
    const db = await getDB()
    const byId = new Map(tasks.map(task => [task.id, task]))
    for (const ids of chunked([...byId.keys()])) {
        const rows = await db.select<TaskFile[]>(
            `SELECT ${COLUMNS} FROM task_file WHERE taskID IN (${placeholders(ids.length)}) ORDER BY position, id`, ids)
        for (const row of rows) (byId.get(row.taskID)!.files ??= []).push(row)
    }
}

/**
 * Adds to a transaction the statements that attach files to tasks created in the same transaction (one multi-row INSERT).
 * A file without a path is left out, one without a name takes the file name of its path.
 * @param tx The transaction collecting the statements.
 * @param tasks The tasks (by reference) and their files, in order.
 * @category Database Queries
 */
export function addTaskFiles(tx: Transaction, tasks: readonly { taskRef: TxRef | number, files: readonly TemplateFile[] }[]): void {
    const rows = tasks.flatMap(({ taskRef, files }) => files
        .filter(file => file.path)
        .map((file, position) => [taskRef, file.name || getFileName(file.path), file.path, position]))
    if (rows.length > 0) tx.insertRows("task_file", ["taskID", "name", "path", "position"], rows)
}
