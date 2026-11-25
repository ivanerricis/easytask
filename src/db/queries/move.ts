import i18n from "@/i18n"
import { createError, handleDBError, toAppError } from "@/types/error"
import type Database from "@tauri-apps/plugin-sql"
import { getDB } from "../dbManager"
import { Transaction, type TxRef } from "../transaction"
import { addPositions, clampIndex, groupOrderRows, insertAmongSections, isSelfOrAncestor, siblingIds } from "./ordering"
import { DEFAULT_SECTION_SQL } from "./sql"

const SECTION_UNIQUE_MESSAGE = () => i18n.t("errors.move.sectionUnique")

/**
 * Options of the moves that can cross to another note of the split view. `acrossNotes` lifts the rule "same note" (the two notes
 * must still belong to the same workspace: the tags are the ones of the workspace and the move does not touch them).
 * @category Database Queries
 */
export type AcrossNotes = { acrossNotes?: boolean }

/**
 * Checks that two notes belong to the same workspace (a template draft counts as part of the workspace of its template).
 * @throws The given code when they do not, or when one of them does not exist.
 */
export async function assertSameWorkspace(db: Database, noteA: number, noteB: number, code: string): Promise<void> {
    if (noteA === noteB) return
    const rows = await db.select<{ id: number, workspaceID: number | null, kind: string }[]>(
        `SELECT n.id, n.kind, COALESCE(n.workspaceID, (SELECT t.workspaceID FROM note_template t WHERE t.id = n.templateID)) AS workspaceID
         FROM note n WHERE n.id IN (?, ?) AND n.deleted_at IS NULL`, [noteA, noteB])
    const workspaces = new Set(rows.map(row => row.workspaceID))
    // A page has no groups, sections or tasks to receive or give
    if (rows.length !== 2 || workspaces.size !== 1 || workspaces.has(null) || rows.some(row => row.kind === "page"))
        throw createError(code, i18n.t("errors.move.noteInvalid"))
}

/**
 * The section to move (neither deleted nor the hidden default section of a group) with its group and note.
 * @throws SECTION_MOVE_INVALID when it does not exist.
 */
async function loadMovableSection(db: Database, sectionId: number): Promise<{ id: number, groupID: number, noteID: number }> {
    const sections = await db.select<{ id: number, groupID: number, noteID: number }[]>(
        `SELECT s.id, s.groupID, g.noteID FROM section s
         INNER JOIN section_group g ON g.id = s.groupID
         WHERE s.id = ? AND s.deleted_at IS NULL AND s.is_default = 0`, [sectionId])
    if (!sections[0])
        throw createError("SECTION_MOVE_INVALID", i18n.t("errors.move.sectionMissing"))
    return sections[0]
}


/**
 * Moves a section to a group of the same note, at a given index among the sections of that group (the sections with a header:
 * the default section, the list of the direct tasks, is not counted and keeps its place among them). The section goes before the
 * `targetIndex`-th other section, or after every row of the group when the index is not less than their number.
 * The section keeps everything it owns (tasks, subtasks and trashed tasks reference it by id, so they follow it).
 * Destination siblings are renumbered with one UPDATE, and so are the source siblings when the group changes
 * (all the writes run in one transaction).
 * A source group left without sections stays in the note (groups are removed only explicitly).
 * The caller is responsible for reloading the note data.
 * @param sectionId ID of the section to move.
 * @param targetGroupId ID of the destination group (same note, neither deleted nor archived).
 * @param targetIndex Position among the destination sections (0 based, clamped).
 * @param options beforeList: when the list of the direct tasks sits exactly at that position (the index counts only the sections
 * with a header, so the section would go after the list) the section goes right before the list instead.
 * @throws SECTION_MOVE_INVALID when the section or the destination group is not valid (a group of another note is valid only with
 * `options.acrossNotes`, and only in the same workspace).
 * @throws SECTION_EXISTS when the destination group already has a section with the same title.
 * @category Database Queries
 */
export async function moveDBSection(sectionId: number, targetGroupId: number, targetIndex: number, options: { beforeList?: boolean } & AcrossNotes = {}) {
    try {
        const db = await getDB()
        const section = await loadMovableSection(db, sectionId)

        const targets = await db.select<{ id: number, noteID: number }[]>(
            'SELECT id, noteID FROM section_group WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL', [targetGroupId])
        if (!targets[0] || (!options.acrossNotes && targets[0].noteID !== section.noteID))
            throw createError("SECTION_MOVE_INVALID", i18n.t("errors.move.groupInvalid"))
        if (options.acrossNotes) await assertSameWorkspace(db, section.noteID, targets[0].noteID, "SECTION_MOVE_INVALID")

        const order = insertAmongSections(await groupOrderRows(db, targetGroupId, sectionId), targetIndex, sectionId, options.beforeList)

        const tx = new Transaction()
        addPositions(tx, "section", order, { column: "groupID", value: targetGroupId })

        if (section.groupID !== targetGroupId) {
            // The moved section is excluded: it is already in the destination (the default section stays in the order)
            addPositions(tx, "section", (await groupOrderRows(db, section.groupID, sectionId)).map(row => row.id))
        }
        await tx.run()
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "SECTION", { UNIQUE: SECTION_UNIQUE_MESSAGE() }))
    }
}

/**
 * Moves a section into a brand new group created at the given index among the groups of the note
 * (the section is pulled out into its own column; all the writes run in one transaction). The index refers to the groups as they are before the move
 * (the source group included); the other groups shift and the source group stays even when it ends up empty.
 * The caller is responsible for updating the note data (the new group id is returned for that).
 * @param sectionId ID of the section to move.
 * @param groupPosition Index of the new group among the groups of the note (0 based, clamped).
 * @param options noteId: the note that gets the new group (default: the note of the section; another one of the same workspace crosses notes).
 * @returns The IDs of the new group and of its hidden default section.
 * @throws SECTION_MOVE_INVALID when the section does not exist.
 * @category Database Queries
 */
export async function moveDBSectionToNewGroup(sectionId: number, groupPosition: number, options: { noteId?: number } = {}): Promise<{ groupId: number, defaultSectionId: number }> {
    try {
        const db = await getDB()
        const section = await loadMovableSection(db, sectionId)
        // The new group is created in the note of the section, or in `options.noteId` (the other note of the split view)
        const noteID = options.noteId ?? section.noteID
        await assertSameWorkspace(db, section.noteID, noteID, "SECTION_MOVE_INVALID")

        const groups = await db.select<{ id: number }[]>(
            'SELECT id FROM section_group WHERE noteID = ? AND deleted_at IS NULL ORDER BY position, id', [noteID])
        const order = groups.map(row => row.id)
        const index = clampIndex(groupPosition, order.length)

        // The source group is renumbered without the moved section (it is about to leave); its default section stays in the order
        const remaining = (await groupOrderRows(db, section.groupID, sectionId)).map(row => row.id)

        const tx = new Transaction()
        const created = tx.add('INSERT INTO section_group (noteID, position) VALUES (?, ?)', [noteID, index])
        const newGroup = tx.idOf(created)
        const createdDefault = tx.add(DEFAULT_SECTION_SQL, [newGroup])
        const groupOrder: (number | TxRef)[] = [...order]
        groupOrder.splice(index, 0, newGroup)

        // The new group has its default section at position 0, the moved section follows
        tx.add('UPDATE section SET groupID = ?, position = 1 WHERE id = ?', [newGroup, sectionId])
        addPositions(tx, "section", remaining)
        addPositions(tx, "section_group", groupOrder)
        const results = await tx.run()
        return { groupId: results[created].lastInsertId, defaultSectionId: results[createdDefault].lastInsertId }
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "SECTION", { UNIQUE: SECTION_UNIQUE_MESSAGE() }))
    }
}

/**
 * Moves the default section of a group (the list of its direct tasks) among the sections with a header: it goes before the
 * `index`-th section, or after all of them when `index` is not less than their number (0 = on top, the default).
 * The rows of the group are renumbered with one UPDATE in one transaction. The caller is responsible for reloading the note data.
 * @param groupId ID of the group (neither deleted nor archived).
 * @param index Number of sections that stay before the list (0 based, clamped).
 * @throws SECTION_MOVE_INVALID when the group or its default section does not exist.
 * @category Database Queries
 */
export async function moveDBDirectSection(groupId: number, index: number) {
    try {
        const db = await getDB()
        const rows = await db.select<{ id: number }[]>(
            `SELECT s.id FROM section s INNER JOIN section_group g ON g.id = s.groupID
             WHERE s.groupID = ? AND s.is_default = 1 AND s.deleted_at IS NULL AND g.deleted_at IS NULL AND g.archived_at IS NULL`, [groupId])
        if (!rows[0])
            throw createError("SECTION_MOVE_INVALID", i18n.t("errors.move.groupInvalid"))

        const order = insertAmongSections(await groupOrderRows(db, groupId, rows[0].id), index, rows[0].id)
        const tx = new Transaction()
        addPositions(tx, "section", order)
        await tx.run()
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "SECTION", { UNIQUE: SECTION_UNIQUE_MESSAGE() }))
    }
}

/**
 * Destination of a task: a section (top level) or a parent task inside that section.
 * @category Database Queries
 */
export type TaskMoveTarget = {
    sectionId: number
    /** null = top level task of the section, otherwise the new parent task (must belong to `sectionId`). */
    parentTaskId: number | null
}

/**
 * Moves a task (with its whole subtree, trashed descendants included) to a section of the same note,
 * either at the top level or under another task, at a given index among its new siblings.
 * One UPDATE sets the new section/parent of the task and the sectionID of every descendant
 * (invariant: every task carries the section of its root task); the destination and the old siblings are then renumbered
 * (all the writes run in one transaction).
 * The caller is responsible for reloading the note data.
 * @param taskId ID of the task to move.
 * @param target Destination section and optional parent task.
 * @param targetIndex Position among the destination siblings (0 based, clamped).
 * @param options acrossNotes: the destination may be in another note of the same workspace (the tags and the trashed descendants follow the task).
 * @throws TASK_MOVE_INVALID when the task/target does not exist, belongs to another note (unless `acrossNotes`), the parent is not in
 * the target section, or the parent is the task itself or one of its descendants.
 * @category Database Queries
 */
export async function moveDBTask(taskId: number, target: TaskMoveTarget, targetIndex: number, options: AcrossNotes = {}) {
    try {
        const db = await getDB()
        const parentId = target.parentTaskId ?? null
        // The three lookups are independent: run them together, then check them in the same order as before
        const [tasks, sectionsFound, parents] = await Promise.all([
            db.select<{ id: number, sectionID: number, taskID: number | null, noteID: number }[]>(
                `SELECT t.id, t.sectionID, t.taskID, g.noteID FROM task t
                 INNER JOIN section s ON s.id = t.sectionID
                 INNER JOIN section_group g ON g.id = s.groupID
                 WHERE t.id = ? AND t.deleted_at IS NULL`, [taskId]),
            db.select<{ id: number, noteID: number }[]>(
                `SELECT s.id, g.noteID FROM section s
                 INNER JOIN section_group g ON g.id = s.groupID
                 WHERE s.id = ? AND s.deleted_at IS NULL AND g.deleted_at IS NULL
                   AND s.archived_at IS NULL AND g.archived_at IS NULL`, [target.sectionId]),
            parentId != null
                ? db.select<{ id: number, sectionID: number }[]>('SELECT id, sectionID FROM task WHERE id = ? AND deleted_at IS NULL', [parentId])
                : Promise.resolve(null),
        ])
        const task = tasks[0]
        if (!task)
            throw createError("TASK_MOVE_INVALID", i18n.t("errors.move.taskMissing"))

        if (!sectionsFound[0] || (!options.acrossNotes && sectionsFound[0].noteID !== task.noteID))
            throw createError("TASK_MOVE_INVALID", i18n.t("errors.move.sectionTargetInvalid"))
        if (options.acrossNotes) await assertSameWorkspace(db, task.noteID, sectionsFound[0].noteID, "TASK_MOVE_INVALID")

        if (parentId != null && parents) {
            if (!parents[0] || parents[0].sectionID !== target.sectionId)
                throw createError("TASK_MOVE_INVALID", i18n.t("errors.move.taskTargetInvalid"))

            // Walk up from the new parent: the moved task is among its ancestors (or is the parent itself)
            // exactly when the parent lies in the moved subtree
            if (await isSelfOrAncestor(db, "task", parentId, taskId))
                throw createError("TASK_MOVE_INVALID", i18n.t("errors.move.taskIntoItself"))
        }

        // The siblings of a task: the top level tasks of a section or the subtasks of a parent task
        const taskSiblings = (sectionID: number, parentID: number | null) => parentID == null
            ? siblingIds(db, "task", "sectionID = ? AND taskID IS NULL", [sectionID], taskId)
            : siblingIds(db, "task", "taskID = ?", [parentID], taskId)

        const order = await taskSiblings(target.sectionId, parentId)
        order.splice(clampIndex(targetIndex, order.length), 0, taskId)

        // The moved task changes parent and every row of its subtree gets the new sectionID (the siblings
        // are only renumbered afterwards, with the shared position update)
        const tx = new Transaction()
        tx.add(
            `WITH RECURSIVE subtree AS (
                SELECT id FROM task WHERE taskID = ?
                UNION
                SELECT t.id FROM task t INNER JOIN subtree s ON t.taskID = s.id
            )
            UPDATE task SET
                sectionID = ?,
                taskID = CASE WHEN id = ? THEN ? ELSE taskID END
            WHERE id IN (SELECT id FROM subtree) OR id = ?`,
            [taskId, target.sectionId, taskId, parentId, taskId])
        addPositions(tx, "task", order)

        const sameParent = task.sectionID === target.sectionId && (task.taskID ?? null) === parentId
        if (!sameParent) {
            // The moved task is excluded: it already belongs to the destination
            addPositions(tx, "task", await taskSiblings(task.sectionID, task.taskID))
        }
        await tx.run()
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "TASK"))
    }
}
