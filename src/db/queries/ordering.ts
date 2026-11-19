import type Database from "@tauri-apps/plugin-sql"
import type { Transaction, TxRef } from "../transaction"

/**
 * Clamps a caller supplied index to the valid range [0, length].
 * @category Database Queries
 */
export const clampIndex = (index: number, length: number) => Math.max(0, Math.min(Math.trunc(index) || 0, length))

/** A column assigned to the same value on every row of a position update (the new parent of the rows). */
type PositionParent = { column: "groupID" | "folderID" | "noteID", value: number | TxRef | null }

/**
 * Builds the single UPDATE that assigns sequential positions to an ordered list of rows,
 * optionally setting a parent column (groupID/folderID) on all of them.
 * @param table Table to update (fixed by the callers, never user input).
 * @param ids Row ids in their final order.
 * @param parent Parent column to set on every row, omitted when the rows keep their parent.
 * @returns The SQL and its parameters.
 * @category Database Queries
 */
export function buildPositionUpdate(
    table: "section" | "task" | "section_group" | "folder" | "note",
    ids: (number | TxRef)[],
    parent?: PositionParent,
) {
    const cases = ids.map(() => "WHEN ? THEN ?").join(" ")
    const placeholders = ids.map(() => "?").join(",")
    const params: unknown[] = parent ? [parent.value] : []
    ids.forEach((id, index) => params.push(id, index))
    params.push(...ids)
    return {
        sql: `UPDATE ${table} SET ${parent ? `${parent.column} = ?, ` : ""}position = CASE id ${cases} END WHERE id IN (${placeholders})`,
        params,
    }
}

/**
 * Adds to a transaction the UPDATE built by buildPositionUpdate; nothing is added for an empty list.
 * @param tx The transaction collecting the statements.
 * @param table Table to update (see buildPositionUpdate).
 * @param ids Row ids in their final order.
 * @param parent Parent column to set on every row, omitted when the rows keep their parent.
 * @category Database Queries
 */
export function addPositions(
    tx: Transaction,
    table: Parameters<typeof buildPositionUpdate>[0],
    ids: (number | TxRef)[],
    parent?: Parameters<typeof buildPositionUpdate>[2],
) {
    if (ids.length === 0) return
    const update = buildPositionUpdate(table, ids, parent)
    tx.add(update.sql, update.params)
}

/**
 * The ids of the living siblings of a row (the row itself excluded), in position order.
 * @param db The database.
 * @param table Table to read (fixed by the callers, never user input).
 * @param where Condition that selects the siblings (the parent), with `?` placeholders for `params`.
 * @param params Parameters of `where`.
 * @param excludeId The row that is being moved.
 * @param orderBy Order of the siblings (default: position, then id).
 * @category Database Queries
 */
export async function siblingIds(
    db: Database, table: string, where: string, params: unknown[], excludeId: number, orderBy = "position, id",
): Promise<number[]> {
    const rows = await db.select<{ id: number }[]>(
        `SELECT id FROM ${table} WHERE ${where} AND deleted_at IS NULL AND id <> ? ORDER BY ${orderBy}`, [...params, excludeId])
    return rows.map(row => row.id)
}

/** A live row of the shared order of a group: a section with a header or the default section (the list of the direct tasks). */
type OrderRow = { id: number, isDefault: boolean, archived?: boolean }

/**
 * The live rows of a group (the default section included), in their shared order, without `excludeId`.
 * Archived sections are part of the order (they keep their place) but are flagged: the note does not show them, so the indexes
 * of the app do not count them.
 * @category Database Queries
 */
export async function groupOrderRows(db: Database, groupId: number, excludeId: number): Promise<OrderRow[]> {
    const rows = await db.select<{ id: number, is_default: number | boolean, archived_at: string | null }[]>(
        'SELECT id, is_default, archived_at FROM section WHERE groupID = ? AND deleted_at IS NULL AND id <> ? ORDER BY position, id', [groupId, excludeId])
    return rows.map(row => ({ id: row.id, isDefault: row.is_default === true || row.is_default === 1, archived: row.archived_at !== null }))
}

/**
 * Inserts `id` in the rows of a group before the `index`-th section with a header (the default section is not counted), or
 * at the very end when `index` is not less than the number of those sections. The index is clamped. Returns the new order.
 * When the default section sits exactly at the insertion point (right before that section, or last) the id normally goes after it;
 * with `beforeList` it goes right before it instead (the place between the section above the list and the list).
 * @category Database Queries
 */
export function insertAmongSections<T extends number | TxRef = number>(rows: readonly OrderRow[], index: number, id: T, beforeList = false): (number | T)[] {
    const ids: (number | T)[] = rows.map(row => row.id)
    // Only the sections the note shows: an archived one is not counted by the index
    const headed = rows.filter(row => !row.isDefault && !row.archived)
    const at = clampIndex(index, headed.length)
    let before = at < headed.length ? ids.indexOf(headed[at].id) : ids.length
    if (beforeList && before > 0 && rows[before - 1].isDefault) before -= 1
    ids.splice(before, 0, id)
    return ids
}

/**
 * Tells whether `ancestorId` is `startId` itself or one of its ancestors: walks up from `startId` through the primary key.
 * Used to refuse moving a folder/task into its own subtree.
 * @param db The database.
 * @param table "folder" or "task".
 * @param startId The row where the walk starts (the destination).
 * @param ancestorId The row that is being moved.
 * @category Database Queries
 */
export async function isSelfOrAncestor(db: Database, table: "folder" | "task", startId: number, ancestorId: number): Promise<boolean> {
    const parent = table === "folder" ? "folderID" : "taskID"
    const rows = await db.select<{ found: number }[]>(
        `WITH RECURSIVE anc(id, parent) AS (
            SELECT id, ${parent} FROM ${table} WHERE id = ?
            UNION
            SELECT t.id, t.${parent} FROM ${table} t INNER JOIN anc ON t.id = anc.parent
        )
        SELECT EXISTS (SELECT 1 FROM anc WHERE id = ?) AS found`, [startId, ancestorId])
    return !!rows[0]?.found
}
