// @vitest-environment node
/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { sqliteRows } from "@/test/db-mock"
import { latestSchema } from "../schema/initial"

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

import { createDBNoteFromTemplate, createDBTemplateFromNote, getDBTemplate, updateDBTemplateFromNote } from "./template"
import { createDBTemplateDraft, saveDBTemplateDraft } from "./template-draft"
import { duplicateDBTemplate } from "./duplicate"
import { getDBAutomations } from "./automation"
import { getDBNoteData } from "./note"
import { buildDBWorkspaceExport, importDBWorkspace, validateWorkspaceExport } from "./transfer"
import type { NoteTemplateContent } from "@/types/template"

const rows = sqliteRows(() => sqlite)

const contentOf = (templateId: number) =>
    JSON.parse(rows(`SELECT content FROM note_template WHERE id = ${templateId}`)[0].content as string) as NoteTemplateContent

const rule = (id: number, name: string | null, position: number, trigger: object, actions: object[], enabled = 1) =>
    sqlite.prepare("INSERT INTO automation (id, noteID, name, enabled, trigger, actions, position) VALUES (?, 1, ?, ?, ?, ?, ?)")
        .run(id, name, enabled, JSON.stringify(trigger), JSON.stringify(actions), position)

/** The sections of a note in content order, by title (the default sections are left out). */
const sectionIdsOf = async (noteId: number) => {
    const data = await getDBNoteData(noteId)
    return Object.fromEntries(data.groups.flatMap(g => data.sections.filter(s => s.groupID === g.id && !s.is_default)).map(s => [s.title, s.id]))
}

beforeEach(() => {
    sqlite = new DatabaseSync(":memory:")
    sqlite.exec("PRAGMA foreign_keys=ON")
    for (const sql of latestSchema) sqlite.exec(sql)
    sqlite.exec(`
        INSERT INTO workspace (id, name) VALUES (1, 'WS');
        INSERT INTO note (id, workspaceID, name) VALUES (1, 1, 'Sorgente');
        INSERT INTO section_group (id, noteID, position, name) VALUES (1, 1, 0, 'Sprint'), (2, 1, 1, 'Altro');
        INSERT INTO section (id, groupID, title, position) VALUES (1, 1, 'Da fare', 0), (2, 1, 'Fatto', 1), (3, 2, 'Idee', 0), (4, 2, 'Vecchia', 1);
        INSERT INTO section (id, groupID, title, position, is_default) VALUES (20, 1, NULL, 2, 1), (21, 2, NULL, 2, 1);
        INSERT INTO tag (id, workspaceID, name, color, position) VALUES (1, 1, 'Urgente', '#ff0000', 0);
        UPDATE section SET archived_at = datetime('now') WHERE id = 4;
    `)
    rule(1, "Sposta", 0, { type: "task.movedInto", sectionId: 1 }, [{ type: "moveTo", sectionId: 2, at: "top" }, { type: "addTag", tagId: 1 }])
    rule(2, null, 1, { type: "task.completed", sectionId: null }, [{ type: "moveTo", sectionId: 3, at: "bottom" }], 0)
    rule(3, "Gruppo", 2, { type: "group.completed", groupId: 2 }, [{ type: "setColor", color: "#112233" }])
    rule(4, "Archiviata", 3, { type: "task.completed", sectionId: 4 }, [{ type: "setCompleted", value: false }])
    rule(5, "Diretta", 4, { type: "task.completed", sectionId: 20 }, [{ type: "moveTo", sectionId: 21, at: "top" }])
})

describe("template automations", () => {
    it("snapshots the rules by position and drops the ones on archived sections", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const automations = contentOf(id).automations!
        expect(automations.map(r => r.name)).toEqual(["Sposta", null, "Gruppo", "Diretta"])
        expect(automations[0]).toEqual({
            name: "Sposta", enabled: true, trigger: { type: "task.movedInto", sectionId: { group: 0, section: 0 } },
            actions: [{ type: "moveTo", sectionId: { group: 0, section: 1 }, at: "top" }, { type: "addTag", tag: { name: "Urgente", color: "#ff0000" } }],
        })
        expect(automations[1].trigger).toEqual({ type: "task.completed", sectionId: null })
        expect(automations[2].trigger).toEqual({ type: "group.completed", groupId: 1 })
    })

    it("leaves the field out of a template whose note has no rules", async () => {
        sqlite.exec("DELETE FROM automation")
        expect(contentOf(await createDBTemplateFromNote(1, "T"))).not.toHaveProperty("automations")
    })

    it("applies the rules to a new note with the ids of the new sections, groups and tags", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        // The workspace has no 'Urgente' tag when the note is created: it is created by name
        sqlite.exec("DELETE FROM tag")
        const noteId = await createDBNoteFromTemplate(id, 1, null, "Nuova")
        const sections = await sectionIdsOf(noteId)
        const data = await getDBNoteData(noteId)
        const tag = rows("SELECT id FROM tag WHERE workspaceID = 1 AND name = 'Urgente'")[0].id as number
        const defaults = data.groups.map(g => data.sections.find(s => s.groupID === g.id && s.is_default)!.id)

        const copied = await getDBAutomations(noteId)
        expect(copied.map(r => ({ name: r.name, enabled: r.enabled, position: r.position, trigger: r.trigger, actions: r.actions }))).toEqual([
            { name: "Sposta", enabled: true, position: 0, trigger: { type: "task.movedInto", sectionId: sections["Da fare"] }, actions: [{ type: "moveTo", sectionId: sections["Fatto"], at: "top" }, { type: "addTag", tagId: tag }] },
            { name: null, enabled: false, position: 1, trigger: { type: "task.completed", sectionId: null }, actions: [{ type: "moveTo", sectionId: sections["Idee"], at: "bottom" }] },
            { name: "Gruppo", enabled: true, position: 2, trigger: { type: "group.completed", groupId: data.groups[1].id }, actions: [{ type: "setColor", color: "#112233" }] },
            { name: "Diretta", enabled: true, position: 3, trigger: { type: "task.completed", sectionId: defaults[0] }, actions: [{ type: "moveTo", sectionId: defaults[1], at: "top" }] },
        ])
        // The source note keeps its own rules
        expect(await getDBAutomations(1)).toHaveLength(5)
    })

    it("ignores stored rules that are malformed or point to nothing, and a template without rules still works", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const content = contentOf(id)
        const good = content.automations![0]
        content.automations = [
            good,
            { name: null, enabled: true, trigger: { type: "task.completed", sectionId: { group: 9, section: 0 } }, actions: [{ type: "setCompleted", value: true }] },
            { nonsense: true },
            "x",
            { ...good, actions: [{ type: "moveTo", sectionId: { group: 0, section: 7 }, at: "top" }] },
        ] as never
        sqlite.prepare("UPDATE note_template SET content = ? WHERE id = ?").run(JSON.stringify(content), id)
        expect(await getDBAutomations(await createDBNoteFromTemplate(id, 1, null, "A"))).toHaveLength(1)

        sqlite.prepare("UPDATE note_template SET content = ? WHERE id = ?").run(JSON.stringify({ ...content, automations: "boh" }), id)
        const noteId = await createDBNoteFromTemplate(id, 1, null, "B")
        expect(await getDBAutomations(noteId)).toEqual([])
        expect((await getDBNoteData(noteId)).groups).toHaveLength(2)
    })

    it("refreshes the rules with updateDBTemplateFromNote", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        sqlite.exec("DELETE FROM automation WHERE id > 1")
        await updateDBTemplateFromNote(id)
        expect(contentOf(id).automations).toHaveLength(1)
    })

    it("is kept by a duplicated template", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const copy = await duplicateDBTemplate(id)
        expect(contentOf(copy).automations).toEqual(contentOf(id).automations)
    })
})

describe("template draft with automations", () => {
    it("loads the rules into the draft and saving it again finds nothing to write", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const draft = await createDBTemplateDraft(id)

        const loaded = await getDBAutomations(draft)
        expect(loaded.map(r => r.name)).toEqual(["Sposta", null, "Gruppo", "Diretta"])
        const sections = await sectionIdsOf(draft)
        expect(loaded[0].trigger).toEqual({ type: "task.movedInto", sectionId: sections["Da fare"] })
        // The tag of the template workspace is found from a note with no workspace
        expect(loaded[0].actions[1]).toEqual({ type: "addTag", tagId: 1 })
        await expect(saveDBTemplateDraft(draft)).resolves.toBe("unchanged")
    })

    it("saves the rules edited in the draft into the template", async () => {
        const id = await createDBTemplateFromNote(1, "T")
        const draft = await createDBTemplateDraft(id)
        const [first] = await getDBAutomations(draft)
        sqlite.prepare("UPDATE automation SET enabled = 0, name = 'Nuovo nome' WHERE id = ?").run(first.id)
        sqlite.prepare("DELETE FROM automation WHERE noteID = ? AND position = 1").run(draft)

        await expect(saveDBTemplateDraft(draft)).resolves.toBe("written")
        const automations = contentOf(id).automations!
        expect(automations.map(r => [r.name, r.enabled])).toEqual([["Nuovo nome", false], ["Gruppo", true], ["Diretta", true]])
        expect(automations[0].actions[1]).toEqual({ type: "addTag", tag: { name: "Urgente", color: "#ff0000" } })
        expect((await getDBTemplate(id))!.content.automations).toHaveLength(3)
    })
})

describe("template automations in export and import", () => {
    it("exports the rules inside the template and imports them back", async () => {
        await createDBTemplateFromNote(1, "T")
        const data = JSON.parse(JSON.stringify(await buildDBWorkspaceExport(1)))
        expect(data.templates[0].content.automations).toHaveLength(4)

        const { workspaceId } = await importDBWorkspace(validateWorkspaceExport(data))
        const imported = rows(`SELECT content FROM note_template WHERE workspaceID = ${workspaceId}`)
        expect(JSON.parse(imported[0].content as string).automations).toEqual(data.templates[0].content.automations)
        const templateId = rows(`SELECT id FROM note_template WHERE workspaceID = ${workspaceId}`)[0].id as number
        const noteId = await createDBNoteFromTemplate(templateId, workspaceId, null, "Da import")
        expect(await getDBAutomations(noteId)).toHaveLength(4)
    })

    it("still imports a template without rules, and rejects rules that do not fit its content", async () => {
        sqlite.exec("DELETE FROM automation")
        await createDBTemplateFromNote(1, "T")
        const data = JSON.parse(JSON.stringify(await buildDBWorkspaceExport(1)))
        expect(data.templates[0].content).not.toHaveProperty("automations")
        expect(() => validateWorkspaceExport(JSON.parse(JSON.stringify(data)))).not.toThrow()

        const bad = JSON.parse(JSON.stringify(data))
        bad.templates[0].content.automations = [{ name: null, enabled: true, trigger: { type: "task.completed", sectionId: { group: 5, section: 0 } }, actions: [{ type: "setCompleted", value: true }] }]
        expect(() => validateWorkspaceExport(bad)).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
        const notArray = JSON.parse(JSON.stringify(data))
        notArray.templates[0].content.automations = "x"
        expect(() => validateWorkspaceExport(notArray)).toThrow(expect.objectContaining({ code: "TRANSFER_INVALID_FILE" }))
    })
})
