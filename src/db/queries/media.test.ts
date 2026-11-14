// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"

let sqlite: DatabaseSync

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    return { invoke: createSqliteInvoke(() => sqlite) }
})

import {
    createDBMediaFile, getDBGroupMediaFiles, getDBMediaFile, getDBNoteMediaCounts, getMediaKind, MEDIA_EXTENSIONS,
    updateDBMediaFilePath,
} from "./media"
import { emptyDBTrash, getDBTrash, getDBTrashCount, purgeDBItem, purgeDBTrashOlderThan, restoreDBItem } from "./trash"
import { deleteDBItem, renameDBItem } from "./shared_queries"

const rows = sqliteRows(() => sqlite)

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS');
        INSERT INTO folder (id, workspaceID, folderID, name) VALUES (1, 1, NULL, 'F');
        INSERT INTO note (id, workspaceID, folderID, name) VALUES (1, 1, 1, 'N');
        INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0), (2, 1, 1);
        INSERT INTO section (id, groupID, title) VALUES (1, 1, 'S1'), (2, 2, 'S2');
    `)
})

describe("media helpers", () => {
    it("tells images from videos by the extension, case insensitive", () => {
        expect(getMediaKind("a.JPG")).toBe("image")
        expect(getMediaKind("C:\\x\\clip.MP4")).toBe("video")
        expect(getMediaKind("/x/clip.webm")).toBe("video")
        expect(getMediaKind("noext")).toBe("image")
        expect(MEDIA_EXTENSIONS).toContain("mov")
    })
})

describe("media queries", () => {
    it("adds files with the basename as name, appended by position, only the path is stored", async () => {
        const a = await createDBMediaFile(1, "C:\\Pics\\a.jpg")
        const b = await createDBMediaFile(1, "C:\\Pics\\b.mp4")
        await createDBMediaFile(2, "C:\\Pics\\c.png")
        expect(a).toMatchObject({ name: "a.jpg", path: "C:\\Pics\\a.jpg", position: 0, section_groupID: 1 })
        expect(b.position).toBe(1)
        expect((await getDBGroupMediaFiles(1)).map(f => f.name)).toEqual(["a.jpg", "b.mp4"])
        expect((await getDBGroupMediaFiles(2))[0].position).toBe(0)
    })

    it("generates a unique name for the same file name in a group, also against trashed files", async () => {
        const first = await createDBMediaFile(1, "C:\\x\\p.jpg")
        expect((await createDBMediaFile(1, "C:\\y\\p.jpg")).name).toBe("p (2).jpg")
        await deleteDBItem("media_file", first.id)
        expect((await createDBMediaFile(1, "C:\\z\\p.jpg")).name).toBe("p (3).jpg")
        expect((await createDBMediaFile(2, "C:\\z\\p.jpg")).name).toBe("p.jpg")
    })

    it("counts the files of a note per group, without deleted files, deleted or archived groups", async () => {
        await createDBMediaFile(1, "/m/a.jpg")
        const b = await createDBMediaFile(1, "/m/b.jpg")
        await createDBMediaFile(2, "/m/c.jpg")
        await createDBMediaFile(2, "/m/d.jpg")
        await deleteDBItem("media_file", b.id)
        expect(await getDBNoteMediaCounts(1)).toEqual({ 1: 1, 2: 2 })
        await deleteDBItem("section_group", 2)
        expect(await getDBNoteMediaCounts(1)).toEqual({ 1: 1 })
        sqlite.exec("UPDATE section_group SET archived_at = '2024-01-01' WHERE id = 1")
        expect(await getDBNoteMediaCounts(1)).toEqual({})
        expect(await getDBGroupMediaFiles(1)).toEqual([])
    })

    it("renames and relinks, keeping the name on relink; rejects duplicate and empty names", async () => {
        const a = await createDBMediaFile(1, "/m/a.jpg")
        await createDBMediaFile(1, "/m/b.jpg")
        await updateDBMediaFilePath(a.id, "/new/a.jpg")
        expect(await getDBMediaFile(a.id)).toMatchObject({ name: "a.jpg", path: "/new/a.jpg" })
        await renameDBItem("media_file", a.id, "Cover")
        expect((await getDBMediaFile(a.id))?.name).toBe("Cover")
        await expect(renameDBItem("media_file", a.id, "b.jpg")).rejects.toMatchObject({ code: "MEDIA_FILE_EXISTS" })
        await expect(renameDBItem("media_file", a.id, "")).rejects.toMatchObject({ code: "MEDIA_FILE_CHECK_FAILED" })
        await expect(updateDBMediaFilePath(a.id, "")).rejects.toMatchObject({ code: "MEDIA_CHECK_FAILED" })
    })

    it("rejects a media file for a missing group (foreign key)", async () => {
        await expect(createDBMediaFile(99, "/m/a.jpg")).rejects.toBeTruthy()
    })
})

describe("media files in the trash", () => {
    it("soft delete hides the file and lists it with note and group context", async () => {
        const a = await createDBMediaFile(2, "/m/a.jpg")
        await deleteDBItem("media_file", a.id)
        expect(await getDBMediaFile(a.id)).toBeNull()
        expect(rows("SELECT id FROM media_file")).toHaveLength(1)
        const trash = await getDBTrash(1)
        expect(trash).toHaveLength(1)
        expect(trash[0]).toMatchObject({ type: "media_file", id: a.id, name: "a.jpg", context: "Nota N › Gruppo 2" })
        expect(await getDBTrashCount(1)).toBe(1)
    })

    it("restore brings back the file with its deleted ancestors (group, note, folders)", async () => {
        const a = await createDBMediaFile(1, "/m/a.jpg")
        await deleteDBItem("media_file", a.id)
        await deleteDBItem("section_group", 1)
        await deleteDBItem("note", 1)
        await deleteDBItem("folder", 1)
        await restoreDBItem("media_file", a.id)
        expect(rows("SELECT deleted_at FROM media_file")[0].deleted_at).toBeNull()
        expect(rows("SELECT deleted_at FROM section_group WHERE id = 1")[0].deleted_at).toBeNull()
        expect(rows("SELECT deleted_at FROM note")[0].deleted_at).toBeNull()
        expect(rows("SELECT deleted_at FROM folder")[0].deleted_at).toBeNull()
        expect(await getDBGroupMediaFiles(1)).toHaveLength(1)
    })

    it("a trashed group lists its media in the summary", async () => {
        await createDBMediaFile(1, "/m/a.jpg")
        await createDBMediaFile(1, "/m/b.jpg")
        await deleteDBItem("section_group", 1)
        expect((await getDBTrash(1))[0].summary).toBe("1 sezione · 2 immagini e video")
    })

    it("purge removes only trashed files and empty trash removes the trashed ones of the workspace", async () => {
        const a = await createDBMediaFile(1, "/m/a.jpg")
        const b = await createDBMediaFile(1, "/m/b.jpg")
        const c = await createDBMediaFile(2, "/m/c.jpg")
        await purgeDBItem("media_file", a.id)
        expect(rows("SELECT id FROM media_file")).toHaveLength(3)

        await deleteDBItem("media_file", a.id)
        await deleteDBItem("media_file", c.id)
        await purgeDBItem("media_file", a.id)
        expect(rows("SELECT id FROM media_file").map(r => r.id)).toEqual([b.id, c.id])

        await emptyDBTrash(1)
        expect(rows("SELECT id FROM media_file").map(r => r.id)).toEqual([b.id])
        expect(await getDBTrash(1)).toEqual([])
    })

    it("a purged group takes its trashed media files with it (cascade) and the old trash purge covers them", async () => {
        const a = await createDBMediaFile(1, "/m/a.jpg")
        await deleteDBItem("media_file", a.id)
        sqlite.exec("UPDATE media_file SET deleted_at = '2000-01-01 00:00:00'")
        expect(await purgeDBTrashOlderThan(30)).toBe(1)
        expect(rows("SELECT id FROM media_file")).toEqual([])

        const b = await createDBMediaFile(1, "/m/b.jpg")
        await deleteDBItem("media_file", b.id)
        await deleteDBItem("section_group", 1)
        await emptyDBTrash(1)
        expect(rows("SELECT id FROM media_file")).toEqual([])
    })

    it("changing a media file refreshes the edit date of the workspace", async () => {
        sqlite.exec("UPDATE workspace SET edit_date = '2000-01-01'")
        await createDBMediaFile(1, "/m/a.jpg")
        expect(rows("SELECT edit_date FROM workspace")[0].edit_date).not.toBe("2000-01-01")
    })
})
