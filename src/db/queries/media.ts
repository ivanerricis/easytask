import i18n from "@/i18n"
import type { MediaFile } from "@/types/types";
import { createError, handleDBError, toAppError } from "@/types/error";
import { getErrorMessage } from "@/lib/utils";
import { getDB } from "../dbManager";
import { nextPositionSql } from "./sql";
import { getFileName, makeUniqueName } from "./audio";

/**
 * Extensions (lowercase, without dot) of the images that can be attached to a group.
 * Kept in sync with MEDIA_EXTENSIONS of the Rust commands allow_media_file / files_exist.
 * @category Database Queries
 */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"] as const

/**
 * Extensions (lowercase, without dot) of the videos that can be attached to a group.
 * @category Database Queries
 */
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v"] as const

/**
 * All the extensions of the media files (images, then videos).
 * @category Database Queries
 */
export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS] as const

/**
 * What a media file is, from the extension of its name or path ("video" for the video extensions, "image" for anything else).
 * @param nameOrPath File name or path.
 * @category Database Queries
 */
export function getMediaKind(nameOrPath: string): "image" | "video" {
    const extension = nameOrPath.slice(nameOrPath.lastIndexOf(".") + 1).toLowerCase()
    return (VIDEO_EXTENSIONS as readonly string[]).includes(extension) ? "video" : "image"
}

const COLUMNS = "id, section_groupID, name, path, position, creation_date, creation_time"
// The same columns for a query on `media_file m` joined with other tables
const MEDIA_COLUMNS = COLUMNS.split(", ").map(column => `m.${column}`).join(", ")

/**
 * Retrieves the media files of a group (not deleted), in position order. Nothing for an archived group.
 * @param groupId The ID of the group.
 * @category Database Queries
 */
export async function getDBGroupMediaFiles(groupId: number): Promise<MediaFile[]> {
    try {
        const db = await getDB()
        return await db.select<MediaFile[]>(
            `SELECT ${MEDIA_COLUMNS} FROM media_file m INNER JOIN section_group g ON g.id = m.section_groupID
             WHERE m.section_groupID = ? AND m.deleted_at IS NULL AND g.archived_at IS NULL
             ORDER BY m.position, m.id`,
            [groupId])
    } catch (error: unknown) {
        throw createError("MEDIA_LOAD_FAILED", i18n.t("errors.media.loadFiles", { message: getErrorMessage(error) }))
    }
}

/**
 * Retrieves the number of media files of every visible group of a note (neither deleted nor archived), by group ID.
 * Groups without media files have no entry.
 * @param noteId The ID of the note.
 * @category Database Queries
 */
export async function getDBNoteMediaCounts(noteId: number): Promise<Record<number, number>> {
    try {
        const db = await getDB()
        const rows = await db.select<{ section_groupID: number, total: number }[]>(
            `SELECT m.section_groupID, COUNT(*) AS total FROM media_file m INNER JOIN section_group g ON g.id = m.section_groupID
             WHERE g.noteID = ? AND g.deleted_at IS NULL AND g.archived_at IS NULL AND m.deleted_at IS NULL
             GROUP BY m.section_groupID`, [noteId])
        return Object.fromEntries(rows.map(row => [row.section_groupID, row.total]))
    } catch (error: unknown) {
        throw createError("MEDIA_LOAD_FAILED", i18n.t("errors.media.loadFiles", { message: getErrorMessage(error) }))
    }
}

/**
 * Retrieves one media file (null when it does not exist or is in the trash).
 * @param mediaId The ID of the media file.
 * @category Database Queries
 */
export async function getDBMediaFile(mediaId: number): Promise<MediaFile | null> {
    try {
        const db = await getDB()
        const rows = await db.select<MediaFile[]>(
            `SELECT ${COLUMNS} FROM media_file WHERE id = ? AND deleted_at IS NULL`, [mediaId])
        return rows[0] ?? null
    } catch (error: unknown) {
        throw createError("MEDIA_LOAD_FAILED", i18n.t("errors.media.loadFile", { message: getErrorMessage(error) }))
    }
}

/**
 * Attaches an image or a video to a group, appended after the others. Only the path is stored.
 * The name is the file name; when the group already has (or has trashed) a file with that name a counter is
 * added ("photo (2).jpg"), because of the UNIQUE(name, section_groupID) constraint.
 * @param groupId The ID of the group.
 * @param path Absolute path of the file.
 * @returns The created media file.
 * @category Database Queries
 */
export async function createDBMediaFile(groupId: number, path: string): Promise<MediaFile> {
    try {
        const db = await getDB()
        const taken = await db.select<{ name: string }[]>(
            'SELECT name FROM media_file WHERE section_groupID = ?', [groupId])
        const name = makeUniqueName(getFileName(path), taken.map(row => row.name))

        const result = await db.execute(
            `INSERT INTO media_file (section_groupID, name, path, position)
             SELECT ?, ?, ?, ${nextPositionSql("media_file", "section_groupID = ? AND deleted_at IS NULL")}`,
            [groupId, name, path, groupId])

        const created = result.lastInsertId !== undefined ? await getDBMediaFile(result.lastInsertId) : null
        if (!created) throw createError("MEDIA_UNKNOWN_ERROR", i18n.t("errors.media.notCreated"))
        return created
    } catch (error: unknown) {
        throw toAppError(error, e => handleDBError(e, "MEDIA", {
            UNIQUE: i18n.t("errors.media.unique"),
            CHECK: i18n.t("errors.media.checkCreate"),
        }))
    }
}

/**
 * Points a media file to a new location (relink after the file was moved). The display name is kept.
 * @param mediaId The ID of the media file.
 * @param path New absolute path.
 * @category Database Queries
 */
export async function updateDBMediaFilePath(mediaId: number, path: string) {
    try {
        const db = await getDB()
        await db.execute('UPDATE media_file SET path = ? WHERE id = ?', [path, mediaId])
    } catch (error: unknown) {
        handleDBError(error, "MEDIA", { CHECK: i18n.t("errors.media.checkPath") })
    }
}
