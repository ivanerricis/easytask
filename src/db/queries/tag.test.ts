// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"
import { buildNoteTreeFromData } from "@/contexts/tree-builders"
import type { Tag } from "@/types/types"

// These tests run the real query SQL against a real SQLite database
let sqlite: DatabaseSync

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    return { invoke: createSqliteInvoke(() => sqlite) }
})

import { createDBTag, deleteDBTag, getDBNoteTags, getDBTags, renameDBTag, restoreDBTag, setDBTaskTag, updateDBTagColor } from "./tag"
import { getDBNoteData, getDBNotesData } from "./note"
import { buildContentWithSectionIds, createDBNoteFromTemplate, createDBTemplateFromNote, getDBTemplate } from "./template"
import { createDBTemplateDraft } from "./template-draft"
import { duplicateDBNote, duplicateDBSection } from "./duplicate"
import { createDBAutomation, getDBAutomations } from "./automation"
import { buildDBItemsExport, buildDBWorkspaceExport, importDBItems, importDBWorkspace, validateWorkspaceExport } from "./transfer"

const rows = sqliteRows(() => sqlite)

async function thrown(p: Promise<unknown>): Promise<{ code?: string }> {
    try {
        await p
    } catch (e) {
        return e as { code?: string }
    }
    throw new Error("expected rejection")
}

/** The tag names of every task of a note, by task text (in the order of the tag list). */
async function tagsByTask(noteId: number) {
    const { tasks, tags } = await getDBNoteData(noteId)
    const names = new Map(tags.map(tag => [tag.id, tag.name]))
    return Object.fromEntries(tasks.map(task => [task.text, (task.tagIDs ?? []).map(id => names.get(id))]))
}

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS'), (2, 'Other');
        INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'N'), (2, 2, 'Other note');
        INSERT INTO section_group (id, noteID, position) VALUES (1, 1, 0), (2, 2, 0);
        INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'S', 1), (2, 2, 'S2', 1);
        INSERT INTO section (id, groupID, title, position, is_default) VALUES (10, 1, NULL, 0, 1), (11, 2, NULL, 0, 1);
        INSERT INTO task (id, sectionID, taskID, text, position) VALUES
            (1, 1, NULL, 'A', 0), (2, 1, NULL, 'B', 1), (3, 1, 1, 'A child', 0), (4, 1, NULL, 'Trashed', 2), (5, 1, NULL, 'Archived', 3), (6, 2, NULL, 'Other task', 0);
        UPDATE task SET deleted_at = '2024-01-01' WHERE id = 4;
        UPDATE task SET archived_at = '2024-01-01' WHERE id = 5;
        INSERT INTO tag (id, workspaceID, name, color, position) VALUES
            (1, 1, 'Bug', '#e6194b', 0), (2, 1, 'È urgente', '#4363d8', 1), (3, 1, 'Unused', NULL, 2), (4, 2, 'Bug', '#00ff00', 0);
        INSERT INTO task_tag (taskID, tagID) VALUES (1, 1), (1, 2), (3, 1), (4, 1), (5, 1), (6, 4);
    `)
})

describe("tag queries", () => {
    it("reads the tags of a workspace in the order of the list, and those of the workspace of a note", async () => {
        expect((await getDBTags(1)).map(tag => tag.name)).toEqual(["Bug", "È urgente", "Unused"])
        expect(await getDBTags(1)).toContainEqual({ id: 3, workspaceID: 1, name: "Unused", color: null, position: 2 })
        expect((await getDBNoteTags(2)).map(tag => tag.id)).toEqual([4])
    })

    it("creates a tag at the end of the list; the name is unique in the workspace ignoring the case", async () => {
        const tag = await createDBTag(1, "  New  ", "#123456")
        expect(tag).toMatchObject({ workspaceID: 1, name: "New", color: "#123456", position: 3 })
        expect((await thrown(createDBTag(1, "bug"))).code).toBe("TAG_EXISTS")
        expect((await thrown(createDBTag(1, "   "))).code).toBe("TAG_CHECK_FAILED")
        // The same name in another workspace is another tag
        await expect(createDBTag(2, "New")).resolves.toMatchObject({ workspaceID: 2, position: 1 })
    })

    it("renames and recolors a tag, a clash is reported", async () => {
        await renameDBTag(3, "  Later ")
        await updateDBTagColor(3, "#abcdef")
        expect(rows("SELECT name, color FROM tag WHERE id = 3")).toEqual([{ name: "Later", color: "#abcdef" }])
        await updateDBTagColor(3, null)
        expect(rows("SELECT color FROM tag WHERE id = 3")).toEqual([{ color: null }])
        expect((await thrown(renameDBTag(3, "BUG"))).code).toBe("TAG_EXISTS")
    })

    it("deletes a tag with its links (also those of the trashed and archived tasks) and returns the tasks", async () => {
        expect(await deleteDBTag(1)).toEqual([1, 3, 4, 5])
        expect(rows("SELECT tagID, taskID FROM task_tag ORDER BY taskID, tagID")).toEqual([{ tagID: 2, taskID: 1 }, { tagID: 4, taskID: 6 }])
        expect(rows("SELECT id FROM tag WHERE workspaceID = 1 ORDER BY id")).toEqual([{ id: 2 }, { id: 3 }])
    })

    it("puts a deleted tag back with the same id, place and links, skipping a task that no longer exists", async () => {
        const [tag] = (await getDBTags(1)).filter(item => item.id === 1)
        const links = await deleteDBTag(1)
        sqlite.exec("DELETE FROM task WHERE id = 5")
        await restoreDBTag(tag, links)
        expect(rows("SELECT id, name, color, position FROM tag WHERE id = 1")).toEqual([{ id: 1, name: "Bug", color: "#e6194b", position: 0 }])
        expect(rows("SELECT taskID FROM task_tag WHERE tagID = 1 ORDER BY taskID")).toEqual([{ taskID: 1 }, { taskID: 3 }, { taskID: 4 }])
        // The name was taken meanwhile: nothing is restored
        await deleteDBTag(1)
        await createDBTag(1, "Bug")
        expect((await thrown(restoreDBTag(tag, links))).code).toBe("TAG_EXISTS")
    })

    it("gives and takes a tag idempotently", async () => {
        await setDBTaskTag(3, [1, 2, 1], true)
        await setDBTaskTag(3, [1, 2], true)
        expect(rows("SELECT taskID FROM task_tag WHERE tagID = 3 ORDER BY taskID")).toEqual([{ taskID: 1 }, { taskID: 2 }])
        await setDBTaskTag(3, [2, 3], false)
        await setDBTaskTag(3, [], false)
        expect(rows("SELECT taskID FROM task_tag WHERE tagID = 3 ORDER BY taskID")).toEqual([{ taskID: 1 }])
    })
})

describe("tags with the data of a note", () => {
    it("gives each task its tagIDs in the order of the tag list, leaves the others without the property, and skips trashed and archived tasks", async () => {
        const data = await getDBNoteData(1)
        expect(data.tasks.map(task => [task.text, task.tagIDs])).toEqual([
            ["A", [1, 2]], ["A child", [1]], ["B", undefined],
        ])
        expect(data.tags).toEqual([{ id: 1, name: "Bug", color: "#e6194b" }, { id: 2, name: "È urgente", color: "#4363d8" }])
        // The archive is kept when it is asked for (the export)
        const all = await getDBNoteData(1, true)
        expect(all.tasks.find(task => task.text === "Archived")?.tagIDs).toEqual([1])
    })

    it("loads many notes at once like one by one", async () => {
        const bulk = await getDBNotesData([1, 2])
        expect(bulk.get(1)).toEqual(await getDBNoteData(1))
        expect(bulk.get(2)?.tasks[0].tagIDs).toEqual([4])
        expect(bulk.get(2)?.tags).toEqual([{ id: 4, name: "Bug", color: "#00ff00" }])
    })

    it("reaches the rows of the tree the note view renders", async () => {
        const tree = buildNoteTreeFromData(await getDBNoteData(1))
        const section = tree.groups[0].sections[0]
        expect(section.tasks[0].tagIDs).toEqual([1, 2])
        expect(section.tasks[0].subtasks[0].tagIDs).toEqual([1])
        expect(section.tasks[1].tagIDs).toBeUndefined()
    })
})

describe("tags in templates", () => {
    it("stores the name and color of the tags in the snapshot, in tag list order", async () => {
        const { content } = await buildContentWithSectionIds(1)
        const [task] = content.groups[0].sections[0].tasks
        expect(task.tags).toEqual([{ name: "Bug", color: "#e6194b" }, { name: "È urgente", color: "#4363d8" }])
        expect(task.subtasks[0].tags).toEqual([{ name: "Bug", color: "#e6194b" }])
        expect(content.groups[0].sections[0].tasks[1].tags).toBeUndefined()
    })

    it("reuses the tag of the workspace with that name (any case) and creates the missing ones with the color of the template", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        // Another workspace: it has "bug" (lower case) but no "È urgente"
        sqlite.exec("DELETE FROM tag WHERE id = 4")
        sqlite.exec("INSERT INTO tag (id, workspaceID, name, color, position) VALUES (9, 2, 'bug', '#999999', 5)")
        sqlite.exec(`UPDATE note_template SET workspaceID = 2 WHERE id = ${templateId}`)
        const noteId = await createDBNoteFromTemplate(templateId, 2, null, "From template")
        expect(await tagsByTask(noteId)).toEqual({ A: ["bug", "È urgente"], B: [], "A child": ["bug"] })
        expect(rows("SELECT name, color, position FROM tag WHERE workspaceID = 2 ORDER BY position")).toEqual([
            { name: "bug", color: "#999999", position: 5 }, { name: "È urgente", color: "#4363d8", position: 6 },
        ])
    })

    it("a template with no tags (an old snapshot) applies as before", async () => {
        sqlite.exec("DELETE FROM task_tag")
        const templateId = await createDBTemplateFromNote(1, "Plain")
        expect((await getDBTemplate(templateId))?.content.groups[0].sections[0].tasks[0].tags).toBeUndefined()
        const noteId = await createDBNoteFromTemplate(templateId, 1, null, "Copy")
        expect(await tagsByTask(noteId)).toEqual({ A: [], B: [], "A child": [] })
    })

    it("the working copy of a template (a note with no workspace) gets the tags of the workspace of the template", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        sqlite.exec("DELETE FROM tag WHERE id = 2")
        const draftId = await createDBTemplateDraft(templateId)
        expect(await tagsByTask(draftId)).toEqual({ A: ["Bug", "È urgente"], B: [], "A child": ["Bug"] })
        expect(rows("SELECT name, workspaceID FROM tag WHERE workspaceID = 1 ORDER BY position")).toEqual([
            { name: "Bug", workspaceID: 1 }, { name: "Unused", workspaceID: 1 }, { name: "È urgente", workspaceID: 1 },
        ])
    })
})

describe("tags in copies", () => {
    it("a copy of a note keeps the tags of its tasks, including a name with an accent or spaces", async () => {
        sqlite.exec("INSERT INTO tag (id, workspaceID, name, position) VALUES (7, 1, 'Città', 8)")
        sqlite.exec("INSERT INTO task_tag (taskID, tagID) VALUES (2, 7)")
        const copyId = await duplicateDBNote(1)
        expect(await tagsByTask(copyId)).toEqual({ A: ["Bug", "È urgente"], B: ["Città"], "A child": ["Bug"] })
        // No new tags: the copy shares the ones of the workspace
        expect(rows("SELECT COUNT(*) AS n FROM tag WHERE workspaceID = 1")).toEqual([{ n: 4 }])
    })

    it("a copy of a section keeps the tags of its tasks", async () => {
        const copyId = await duplicateDBSection(1)
        const { tasks } = await getDBNoteData(1)
        const inCopy = tasks.filter(task => task.sectionID === copyId)
        expect(inCopy.map(task => [task.text, task.tagIDs])).toEqual([["A", [1, 2]], ["A child", [1]], ["B", undefined]])
    })
})

describe("tags in the export", () => {
    it("a workspace roundtrips: the list (order, colors, unused tags) and the links", async () => {
        const exported = await buildDBWorkspaceExport(1)
        expect(exported.tags).toEqual([{ name: "Bug", color: "#e6194b" }, { name: "È urgente", color: "#4363d8" }, { name: "Unused", color: null }])
        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(JSON.parse(JSON.stringify(exported))), { name: "Copy", audioExists: async () => true })
        expect(rows(`SELECT name, color, position FROM tag WHERE workspaceID = ${workspaceId} ORDER BY position`)).toEqual([
            { name: "Bug", color: "#e6194b", position: 0 }, { name: "È urgente", color: "#4363d8", position: 1 }, { name: "Unused", color: null, position: 2 },
        ])
        const [note] = rows(`SELECT id FROM note WHERE workspaceID = ${workspaceId}`)
        expect(await tagsByTask(note.id as number)).toEqual({ A: ["Bug", "È urgente"], B: [], "A child": ["Bug"] })
        // The archived task is exported too (archived), with its tag
        expect(rows(`SELECT tg.name FROM task t JOIN task_tag tt ON tt.taskID = t.id JOIN tag tg ON tg.id = tt.tagID WHERE t.text = 'Archived' AND tg.workspaceID = ${workspaceId}`)).toEqual([{ name: "Bug" }])
    })

    it("an export without the tag list (a file with no tags at all) imports without any", async () => {
        sqlite.exec("DELETE FROM task_tag; DELETE FROM tag")
        const exported = await buildDBWorkspaceExport(1)
        expect(exported.tags).toBeUndefined()
        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(JSON.parse(JSON.stringify(exported))), { name: "Plain" })
        expect(rows(`SELECT COUNT(*) AS n FROM tag WHERE workspaceID = ${workspaceId}`)).toEqual([{ n: 0 }])
        expect(rows("SELECT COUNT(*) AS n FROM task WHERE sectionID IN (SELECT s.id FROM section s JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID WHERE n.workspaceID = " + workspaceId + ")")[0].n).toBeGreaterThan(0)
    })

    it("an items export carries the tags of its tasks by name and an import into another workspace creates them", async () => {
        const exported = await buildDBItemsExport([{ type: "note", id: 1 }])
        expect(exported.tags).toBeUndefined()
        const items = await importDBItems(validateWorkspaceExport(JSON.parse(JSON.stringify(exported))), 2, null)
        expect(await tagsByTask(items.items[0].id)).toEqual({ A: ["Bug", "È urgente"], B: [], "A child": ["Bug"] })
        // "Bug" existed in the other workspace (kept as it is), "È urgente" was created at the end of its list
        expect(rows("SELECT name, color, position FROM tag WHERE workspaceID = 2 ORDER BY position")).toEqual([
            { name: "Bug", color: "#00ff00", position: 0 }, { name: "È urgente", color: "#4363d8", position: 1 },
        ])
    })

    it("rejects a file whose tags are malformed and drops the duplicated names of the list", () => {
        const base = { format: "easytask-workspace", version: 3, exportedAt: "x", workspace: { name: "W", color: null }, folders: [], notes: [], templates: [] }
        expect(() => validateWorkspaceExport({ ...base, tags: [{ name: "", color: null }] })).toThrow()
        expect(() => validateWorkspaceExport({ ...base, tags: "bug" })).toThrow()
        const parsed = validateWorkspaceExport({ ...base, tags: [{ name: "Bug", color: "" }, { name: " bug ", color: "#fff" }] })
        expect(parsed.tags).toEqual([{ name: "Bug", color: null }])
    })
})

describe("tags in the rules of a note", () => {
    const rule = (actions: unknown[]) => ({ name: null, enabled: true, trigger: { type: "task.completed" as const, sectionId: null }, actions } as never)

    it("a copy of a note keeps the tag actions of its rules, pointing to the tags of the workspace by name", async () => {
        await createDBAutomation(1, rule([{ type: "addTag", tagId: 2 }, { type: "removeTag", tagId: 1 }]))
        const copyId = await duplicateDBNote(1)
        expect((await getDBAutomations(copyId)).map(item => item.actions)).toEqual([[{ type: "addTag", tagId: 2 }, { type: "removeTag", tagId: 1 }]])
    })

    it("a rule whose tag was deleted is not carried to the copy", async () => {
        await createDBAutomation(1, rule([{ type: "addTag", tagId: 3 }]))
        await createDBAutomation(1, rule([{ type: "setPriority", value: true }]))
        sqlite.exec("DELETE FROM tag WHERE id = 3")
        const copyId = await duplicateDBNote(1)
        expect((await getDBAutomations(copyId)).map(item => item.actions)).toEqual([[{ type: "setPriority", value: true }]])
    })

    it("an import maps the tag of a rule to the tag of the new workspace, creating it when needed", async () => {
        await createDBAutomation(1, rule([{ type: "addTag", tagId: 3 }]))
        const exported = await buildDBItemsExport([{ type: "note", id: 1 }])
        const items = await importDBItems(validateWorkspaceExport(JSON.parse(JSON.stringify(exported))), 2, null)
        const [automation] = await getDBAutomations(items.items[0].id)
        const [created] = rows("SELECT id FROM tag WHERE workspaceID = 2 AND name = 'Unused'")
        expect(automation.actions).toEqual([{ type: "addTag", tagId: created.id }])
    })
})

describe("the tags of the content a user cannot reach", () => {
    it("deleting a workspace removes its tags and links", () => {
        sqlite.exec("DELETE FROM workspace WHERE id = 1")
        expect(rows("SELECT id FROM tag")).toEqual([{ id: 4 }])
        expect(rows("SELECT taskID FROM task_tag")).toEqual([{ taskID: 6 }])
    })

    it("a purged task loses its links, a trashed one keeps them", () => {
        sqlite.exec("DELETE FROM task WHERE id = 3")
        expect(rows("SELECT taskID FROM task_tag WHERE tagID = 1 ORDER BY taskID")).toEqual([{ taskID: 1 }, { taskID: 4 }, { taskID: 5 }])
    })
})

export type { Tag }
