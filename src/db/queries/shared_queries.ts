import i18n from "@/i18n"
import { createError, handleDBError } from "@/types/error";
import { getDB } from "../dbManager";
import { getErrorMessage } from "@/lib/utils";
import { renameDBTemplate } from "./template";

const ITEM_TYPES = ["workspace", "folder", "note", "section", "section_group", "task", "audio_file", "media_file", "note_template"] as const

/**
 * Tables that the shared queries are allowed to operate on.
 * @category Database Queries
 */
export type DBItemType = typeof ITEM_TYPES[number]

// Guards the table name interpolated into the SQL strings
export function assertItemType(itemType: string): asserts itemType is DBItemType {
    if (!(ITEM_TYPES as readonly string[]).includes(itemType))
        throw createError("INVALID_ITEM_TYPE", i18n.t("errors.unsupportedItemType", { type: itemType }))
}

/**
 * Renames an item in the database.
 * @param itemType Type of item to rename (e.g., 'task', 'section').
 * @param itemID ID of the item to rename.
 * @param name New name value
 * @category Database Queries
 */
export async function renameDBItem(itemType: DBItemType, itemID: number, name: string) {
    assertItemType(itemType)
    if (itemType === "note_template")
        return renameDBTemplate(itemID, name)
    try {
        const db = await getDB()
        if (itemType === "section")
            // A section may have no title: a blank one clears it
            await db.execute('UPDATE ' + itemType + ' SET title=? WHERE id=?', [name.trim() || null, itemID])
        else if (itemType === "section_group")
            // A group may be unnamed: a blank name clears it
            await db.execute('UPDATE ' + itemType + ' SET name=? WHERE id=?', [name.trim() || null, itemID])
        else if (itemType === "task")
            await db.execute('UPDATE ' + itemType + ' SET text=? WHERE id=?', [name, itemID])
        else
            await db.execute('UPDATE ' + itemType + ' SET name=? WHERE id=?', [name, itemID])
    } catch (error: unknown) {
        handleDBError(error, itemType.toUpperCase(), {
            UNIQUE: i18n.t("errors.item.unique"),
            CHECK: i18n.t("errors.nameEmpty"),
        })
    }
}

/**
 * Updates the color of an item in the database.
 * @param itemType Type of item to update color for (e.g., 'task', 'section').
 * @param itemID ID of the item to update.
 * @param color New color value (or null to remove color)
 * @category Database Queries
 */
export async function updateDBColor(itemType: DBItemType, itemID: number, color?: string | null) {
    assertItemType(itemType)
    try {
        const db = await getDB()
        await db.execute('UPDATE ' + itemType + ' SET color=? WHERE id=?', [color ?? null, itemID])
    } catch (error: unknown) {
        handleDBError(error, itemType.toUpperCase(), {
            UNIQUE: i18n.t("errors.item.colorUnique"),
            CHECK: i18n.t("errors.item.colorCheck"),
        })
    }
}

const SOFT_DELETE = "SET deleted_at = datetime('now','localtime')"

/**
 * Moves an item to the trash (soft delete: sets deleted_at, children are hidden by their parent).
 * Deleting the last section of a group leaves the (empty) group in the note.
 * @param itemType Type of item to delete (e.g., 'task', 'section').
 * @param itemID ID of the item to delete.
 * @category Database Queries
 */
export async function deleteDBItem(itemType: DBItemType, itemID: number) {
    assertItemType(itemType)
    try {
        const db = await getDB()
        // The default section of a group is hidden and goes away only with its group
        // The working copy of a template (a note with a templateID) is deleted with the editor, never sent to the trash
        const guard = itemType === "section" ? " AND is_default = 0" : itemType === "note" ? " AND templateID IS NULL" : ""
        await db.execute(`UPDATE ${itemType} ${SOFT_DELETE} WHERE id=? AND deleted_at IS NULL${guard}`, [itemID])
    } catch (error: unknown) {
        throw createError(`${itemType.toUpperCase()}_DELETE_FAILED`, i18n.t("errors.item.delete", { message: getErrorMessage(error) }))
    }
}
