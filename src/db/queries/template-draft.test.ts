// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"

// These tests run the real query SQL against a real SQLite database (schema migrated to v11)
let sqlite: DatabaseSync

vi.mock("../dbManager", async () => {
    const { createSqliteDb } = await import("@/test/db-mock")
    return { getDB: vi.fn(async () => createSqliteDb(() => sqlite)) }
})

vi.mock("@tauri-apps/api/core", async () => {
    const { createSqliteInvoke } = await import("@/test/db-mock")
    return { invoke: createSqliteInvoke(() => sqlite) }
})

import { createDBNoteFromTemplate, createDBTemplateFromNote, getDBTemplates, updateDBTemplateFromNote } from "./template"
import {
    createDBTemplateDraft, deleteDBTemplateDraft, getDBTemplateDraft, getDBTemplateDrafts, saveDBTemplateDraft, setDBTemplateDraftColor,
} from "./template-draft"
import { duplicateDBNote, duplicateDBTemplate } from "./duplicate"
import { deleteDBItem } from "./shared_queries"
import type { NoteTemplateContent } from "@/types/template"

const rows = sqliteRows(() => sqlite)

async function thrown(p: Promise<unknown>): Promise<unknown> {
    try {
        await p
    } catch (e) {
        return e
    }
    throw new Error("expected rejection")
}

const contentOf = (templateId: number) =>
    JSON.parse(rows(`SELECT content FROM note_template WHERE id = ${templateId}`)[0].content as string) as NoteTemplateContent

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS'), (2, 'Other');
        INSERT INTO note (id, workspaceID, name, color) VALUES (1, 1, 'Sorgente', '#ff0000'), (2, 1, 'Altra', NULL), (3, 2, 'Altro workspace', NULL);

        INSERT INTO section_group (id, noteID, position, name, color) VALUES (1, 1, 0, 'Sprint', '#abcdef'), (2, 2, 0, 'Altro', NULL), (3, 3, 0, 'Estraneo', NULL);
        -- In the note 1 the list of the direct tasks (position 1) comes after the section "Da fare" (position 0)
        INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'Da fare', 0), (2, 2, 'Idee', 1), (3, 3, 'Fuori', 1);
        INSERT INTO section (id, groupID, title, position, is_default) VALUES (20, 1, NULL, 1, 1), (21, 2, NULL, 0, 1), (22, 3, NULL, 0, 1);
        INSERT INTO task (id, sectionID, taskID, text, description, completed, priority, color, position) VALUES
            (1, 1, NULL, 'Radice', 'descrizione', 1, 1, '#0000ff', 0),
            (2, 1, 1, 'Figlio', NULL, 0, 0, NULL, 0),
            (3, 20, NULL, 'Diretto', NULL, 0, 0, NULL, 0),
            (4, 2, NULL, 'Idea', NULL, 0, 0, NULL, 0),
            (5, 3, NULL, 'Fuori', NULL, 0, 0, NULL, 0);
    `)
})

describe("createDBTemplateDraft", () => {
    it("creates a note with no workspace that is an exact copy of the template", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)

        expect(rows(`SELECT workspaceID, folderID, templateID, name, color FROM note WHERE id = ${noteId}`)).toEqual([
            { workspaceID: null, folderID: null, templateID: templateId, name: "T", color: "#ff0000" },
        ])
        // The position of the list among the sections (1) comes back unchanged: saving it again finds nothing to write
        expect(contentOf(templateId).groups[0].directIndex).toBe(1)
        await expect(saveDBTemplateDraft(noteId)).resolves.toBe("unchanged")
    })

    it("returns the draft that already exists instead of creating another", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const first = await createDBTemplateDraft(templateId)

        await expect(createDBTemplateDraft(templateId)).resolves.toBe(first)
        expect(rows("SELECT id FROM note WHERE templateID IS NOT NULL")).toHaveLength(1)
        expect(rows(`SELECT id FROM section_group WHERE noteID = ${first}`)).toHaveLength(1)
    })

    it("refuses a template that does not exist or is in the trash", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        sqlite.exec(`UPDATE note_template SET deleted_at = datetime('now') WHERE id = ${templateId}`)

        expect(await thrown(createDBTemplateDraft(templateId))).toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
        expect(await thrown(createDBTemplateDraft(999))).toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
    })

    it("does not change the edit date of the workspace, neither creating the draft nor editing it", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        sqlite.exec("UPDATE workspace SET edit_date = '2000-01-01' WHERE id = 1")

        const noteId = await createDBTemplateDraft(templateId)
        const sectionId = rows(`SELECT s.id FROM section s JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ${noteId} AND s.is_default = 0`)[0].id
        sqlite.exec(`INSERT INTO task (sectionID, text, position) VALUES (${sectionId}, 'Nuovo', 5)`)
        sqlite.exec(`UPDATE note SET name = 'Rinominata', color = '#00ff00' WHERE id = ${noteId}`)

        expect(rows("SELECT edit_date FROM workspace WHERE id = 1")[0].edit_date).toBe("2000-01-01")
    })
})

describe("saveDBTemplateDraft", () => {
    it("writes the edits into the template and then finds nothing more to write", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)
        const sectionId = rows(`SELECT s.id FROM section s JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ${noteId} AND s.is_default = 0`)[0].id
        sqlite.exec(`INSERT INTO task (sectionID, text, position) VALUES (${sectionId}, 'Nuovo', 5)`)

        await expect(saveDBTemplateDraft(noteId)).resolves.toBe("written")
        expect(contentOf(templateId).groups[0].sections[0].tasks.map(task => task.text)).toEqual(["Radice", "Nuovo"])
        await expect(saveDBTemplateDraft(noteId)).resolves.toBe("unchanged")
    })

    it("leaves the tasks that were deleted in the draft out of the template", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)
        sqlite.exec(`UPDATE task SET deleted_at = datetime('now') WHERE text = 'Diretto' AND sectionID IN (
            SELECT s.id FROM section s JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ${noteId})`)

        await saveDBTemplateDraft(noteId)
        expect(contentOf(templateId).groups[0].tasks).toBeUndefined()
    })

    it("saves also when the template is in the trash, so restoring it finds the last version", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)
        sqlite.exec(`UPDATE note_template SET deleted_at = datetime('now') WHERE id = ${templateId}`)
        sqlite.exec(`UPDATE section_group SET name = 'Cambiato' WHERE noteID = ${noteId}`)

        await expect(saveDBTemplateDraft(noteId)).resolves.toBe("written")
        expect(contentOf(templateId).groups[0].name).toBe("Cambiato")
    })

    it("reports a draft whose template was purged (the draft goes with it)", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)

        sqlite.exec(`DELETE FROM note_template WHERE id = ${templateId}`)
        expect(rows(`SELECT id FROM note WHERE id = ${noteId}`)).toEqual([])
        expect(rows(`SELECT id FROM section_group WHERE noteID = ${noteId}`)).toEqual([])
        await expect(saveDBTemplateDraft(noteId)).resolves.toBe("missing")
    })

    it("ignores a note that is not a draft", async () => {
        await createDBTemplateFromNote(1, "T")
        await expect(saveDBTemplateDraft(1)).resolves.toBe("missing")
    })
})

describe("setDBTemplateDraftColor", () => {
    it("colors the draft and its template together", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)

        await setDBTemplateDraftColor(noteId, "#123456")
        expect(rows(`SELECT color FROM note WHERE id = ${noteId}`)[0].color).toBe("#123456")
        expect((await getDBTemplates(1))[0].color).toBe("#123456")
        await expect(saveDBTemplateDraft(noteId)).resolves.toBe("unchanged")

        await setDBTemplateDraftColor(noteId, null)
        expect((await getDBTemplates(1))[0].color).toBeNull()
    })
})

describe("deleteDBTemplateDraft", () => {
    it("deletes the draft with its content and nothing else", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)

        await deleteDBTemplateDraft(noteId)
        expect(rows(`SELECT id FROM note WHERE id = ${noteId}`)).toEqual([])
        expect(rows(`SELECT id FROM section_group WHERE noteID = ${noteId}`)).toEqual([])
        expect(rows(`SELECT id FROM note_template WHERE id = ${templateId}`)).toHaveLength(1)
    })

    it("never deletes a note that is not a draft", async () => {
        await deleteDBTemplateDraft(1)
        expect(rows("SELECT id FROM note WHERE id = 1")).toHaveLength(1)
    })
})

describe("getDBTemplateDrafts", () => {
    it("lists the drafts of the workspace, those of a trashed template only when asked", async () => {
        const live = await createDBTemplateFromNote(1, "Viva")
        const trashed = await createDBTemplateFromNote(2, "Nel cestino")
        const other = await createDBTemplateFromNote(3, "Altro")
        const liveNote = await createDBTemplateDraft(live)
        const trashedNote = await createDBTemplateDraft(trashed)
        await createDBTemplateDraft(other)
        sqlite.exec(`UPDATE note_template SET deleted_at = datetime('now') WHERE id = ${trashed}`)

        expect(await getDBTemplateDrafts(1)).toEqual([
            { noteId: liveNote, templateId: live, templateName: "Viva", color: "#ff0000", trashed: false },
        ])
        expect((await getDBTemplateDrafts(1, true)).map(draft => [draft.noteId, draft.trashed])).toEqual([[liveNote, false], [trashedNote, true]])
    })
})

describe("the drafts and the other queries", () => {
    it("a draft is not a source for a new template, a copy or a note", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)

        expect(await thrown(createDBTemplateFromNote(noteId, "Da bozza"))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
        expect(await thrown(duplicateDBNote(noteId))).toMatchObject({ code: "DUPLICATE_SOURCE_MISSING" })
        expect(await thrown(updateDBTemplateFromNote(templateId, noteId))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
    })

    it("a draft cannot be sent to the trash like a note", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const noteId = await createDBTemplateDraft(templateId)

        await deleteDBItem("note", noteId)
        expect(rows(`SELECT deleted_at FROM note WHERE id = ${noteId}`)).toEqual([{ deleted_at: null }])
        await deleteDBItem("note", 2)
        expect(rows("SELECT deleted_at FROM note WHERE id = 2")[0].deleted_at).not.toBeNull()
    })

    it("a note created from the template does not contain the draft", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        await createDBTemplateDraft(templateId)

        const created = await createDBNoteFromTemplate(templateId, 1, null, "Nuova")
        expect(rows(`SELECT templateID FROM note WHERE id = ${created}`)[0].templateID).toBeNull()
    })
})

describe("updateDBTemplateFromNote from another note", () => {
    it("copies the other note and makes it the source of the template", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")

        await updateDBTemplateFromNote(templateId, 2)
        const [template] = await getDBTemplates(1)
        expect(template).toMatchObject({ sourceNoteID: 2, sourceNoteName: "Altra", color: null })
        expect(template.content.groups.map(group => group.name)).toEqual(["Altro"])
    })

    it("refuses a note of another workspace or one in the trash", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const before = rows("SELECT content FROM note_template")[0].content

        expect(await thrown(updateDBTemplateFromNote(templateId, 3))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
        sqlite.exec("UPDATE note SET deleted_at = datetime('now') WHERE id = 2")
        expect(await thrown(updateDBTemplateFromNote(templateId, 2))).toMatchObject({ code: "TEMPLATE_SOURCE_MISSING" })
        expect(rows("SELECT content FROM note_template")[0].content).toBe(before)
    })

    it("without a note it still refreshes from the source note", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        sqlite.exec("UPDATE section_group SET name = 'Cambiato' WHERE id = 1")

        await updateDBTemplateFromNote(templateId)
        expect(contentOf(templateId).groups[0].name).toBe("Cambiato")
        expect((await getDBTemplates(1))[0].sourceNoteID).toBe(1)
    })
})

describe("duplicateDBTemplate", () => {
    it("copies the content, color and source with a new name", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        const copyId = await duplicateDBTemplate(templateId)

        const [original, copy] = (await getDBTemplates(1)).sort((a, b) => a.id - b.id)
        expect(copy.id).toBe(copyId)
        expect(copy.name).toMatch(/^T \(.+\)$/)
        expect(copy).toMatchObject({ color: original.color, sourceNoteID: original.sourceNoteID, content: original.content })
    })

    it("gives each further copy another name", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        await duplicateDBTemplate(templateId)
        await duplicateDBTemplate(templateId)

        const names = (await getDBTemplates(1)).map(template => template.name)
        expect(new Set(names).size).toBe(3)
    })

    it("refuses a template that does not exist or is in the trash", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        sqlite.exec(`UPDATE note_template SET deleted_at = datetime('now') WHERE id = ${templateId}`)

        expect(await thrown(duplicateDBTemplate(templateId))).toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
        expect(await thrown(duplicateDBTemplate(999))).toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
    })
})

describe("getDBTemplateDraft", () => {
    it("reads one draft by its note, null for a note that is no draft", async () => {
        const template = await createDBTemplateFromNote(1, "Viva")
        const noteId = await createDBTemplateDraft(template)
        expect(await getDBTemplateDraft(noteId)).toEqual({ noteId, templateId: template, templateName: "Viva", color: "#ff0000", trashed: false })
        expect(await getDBTemplateDraft(1)).toBeNull()
        sqlite.exec(`UPDATE note_template SET deleted_at = datetime('now') WHERE id = ${template}`)
        expect((await getDBTemplateDraft(noteId))?.trashed).toBe(true)
    })
})

describe("background of the note", () => {
    const BG = "#e6194b"
    const bgOf = (table: "note" | "note_template", id: number) => rows(`SELECT bg_color FROM ${table} WHERE id = ${id}`)[0].bg_color

    it("goes from the note to the template, to the draft, back to the template and to the notes created from it", async () => {
        sqlite.exec(`UPDATE note SET bg_color = '${BG}' WHERE id = 1`)
        const templateId = await createDBTemplateFromNote(1, "T")
        expect(bgOf("note_template", templateId)).toBe(BG)

        const draftId = await createDBTemplateDraft(templateId)
        expect(bgOf("note", draftId)).toBe(BG)
        await expect(saveDBTemplateDraft(draftId)).resolves.toBe("unchanged")

        // A change of the draft alone is a change to save
        sqlite.exec(`UPDATE note SET bg_color = '#3cb44b' WHERE id = ${draftId}`)
        await expect(saveDBTemplateDraft(draftId)).resolves.toBe("written")
        expect(bgOf("note_template", templateId)).toBe("#3cb44b")

        const created = await createDBNoteFromTemplate(templateId, 1, null, "Da template")
        expect(bgOf("note", created)).toBe("#3cb44b")
        const inFolder = await createDBNoteFromTemplate(templateId, 1, null, "Altra copia")
        expect(bgOf("note", inFolder)).toBe("#3cb44b")
    })

    it("is refreshed from the source note and copied by the duplicates of a note and of a template", async () => {
        const templateId = await createDBTemplateFromNote(1, "T")
        expect(bgOf("note_template", templateId)).toBeNull()
        sqlite.exec(`UPDATE note SET bg_color = '${BG}' WHERE id = 1`)
        await updateDBTemplateFromNote(templateId)
        expect(bgOf("note_template", templateId)).toBe(BG)
        expect((await getDBTemplates(1))[0].bg_color).toBe(BG)

        expect(bgOf("note", await duplicateDBNote(1))).toBe(BG)
        expect(bgOf("note_template", await duplicateDBTemplate(templateId))).toBe(BG)
    })
})
