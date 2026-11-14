import i18n from "@/i18n"
import { createError } from "@/types/error"
import { getErrorMessage } from "@/lib/utils"
import { isAutomationAction, isAutomationTrigger, isValidRule, type Automation, type AutomationDraft } from "@/lib/automations/types"
import { buildGroupIndex, buildSectionIndex, sectionOffsets, toPortable, type PortableAutomation, type PortableSectionRef, type PortableTag } from "@/lib/automations/portable"
import type { NoteTemplateContent } from "@/types/template"
import { getDB } from "../dbManager"
import { chunked, nextPositionSql, placeholders } from "./sql"
import { runTransaction, type Transaction, type TxRef, type TxStatement } from "../transaction"
import { addEnsureTag, getDBTagIndex, WORKSPACE_OF_NOTE } from "./tag"

type AutomationRow = {
    id: number
    noteID: number
    name: string | null
    enabled: number | boolean
    trigger: string
    actions: string
    position: number
}

const parse = (text: string): unknown => {
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

/** A row as a rule, or null when its JSON is not valid (such a row is ignored, never run). */
function toAutomation(row: AutomationRow): Automation | null {
    const trigger = parse(row.trigger)
    const actions = parse(row.actions)
    if (!isAutomationTrigger(trigger) || !Array.isArray(actions) || !actions.every(isAutomationAction) || !isValidRule(trigger, actions)) return null
    return {
        id: row.id, noteId: row.noteID, name: row.name?.trim() || null, enabled: !!row.enabled,
        trigger, actions, position: row.position,
    }
}

const fail = (key: "load" | "save" | "delete", error: unknown): never => {
    throw createError(`AUTOMATION_${key.toUpperCase()}_FAILED`, i18n.t(`automations.errors.${key}`, { message: getErrorMessage(error) }))
}

/**
 * The rules of a note, in their order. Rows with an invalid content are left out.
 * @param noteId The note.
 * @category Database Queries
 */
export async function getDBAutomations(noteId: number): Promise<Automation[]> {
    try {
        const db = await getDB()
        const rows = await db.select<AutomationRow[]>(
            "SELECT id, noteID, name, enabled, trigger, actions, position FROM automation WHERE noteID = ? ORDER BY position, id", [noteId])
        return rows.map(toAutomation).filter(rule => rule !== null)
    } catch (error: unknown) {
        return fail("load", error)
    }
}

/**
 * The rules of a note in their portable form (sections and groups by position in `content`), for a copy or an export. A
 * rule that refers to a section or a group that is not in the content is left out.
 * @param noteId The note.
 * @param content The content that will be copied or exported.
 * @param sectionIds The ids of the sections of `content`, in content order (see buildContentWithSectionIds).
 * @param groupIds The ids of the groups of `content`, in content order (see buildContentWithSectionIds).
 * @param defaultSectionIds The ids of the default sections (the direct area) of the groups, in group order.
 * @category Database Queries
 */
export async function getDBPortableAutomations(
    noteId: number, content: NoteTemplateContent, sectionIds: readonly number[], groupIds: readonly number[],
    defaultSectionIds: readonly (number | null)[],
): Promise<PortableAutomation[]> {
    const [rules, tags] = await Promise.all([getDBAutomations(noteId), getDBTagIndex([noteId])])
    return toPortableAutomations(rules, content, sectionIds, groupIds, defaultSectionIds, tags)
}

/**
 * The rules of many notes at once (a few selects for the whole list instead of one per note), like getDBAutomations.
 * @param noteIds The notes.
 * @returns The rules of every note, by note id (an empty list for a note without rules).
 * @category Database Queries
 */
export async function getDBAutomationsByNote(noteIds: readonly number[]): Promise<Map<number, Automation[]>> {
    try {
        const db = await getDB()
        const result = new Map<number, Automation[]>(noteIds.map(id => [id, []]))
        for (const ids of chunked(noteIds)) {
            const rows = await db.select<AutomationRow[]>(
                `SELECT id, noteID, name, enabled, trigger, actions, position FROM automation
                 WHERE noteID IN (${placeholders(ids.length)}) ORDER BY position, id`, ids)
            for (const row of rows) {
                const rule = toAutomation(row)
                if (rule) result.get(row.noteID)?.push(rule)
            }
        }
        return result
    } catch (error: unknown) {
        return fail("load", error)
    }
}

/**
 * The rules in their portable form (see getDBPortableAutomations), out of rules already loaded.
 * @category Database Queries
 */
export function toPortableAutomations(
    rules: readonly Automation[], content: NoteTemplateContent, sectionIds: readonly number[], groupIds: readonly number[],
    defaultSectionIds: readonly (number | null)[], tags?: ReadonlyMap<number, PortableTag>,
): PortableAutomation[] {
    const index = buildSectionIndex(content, sectionIds, defaultSectionIds)
    const groupIndex = buildGroupIndex(content, groupIds)
    return rules
        .map(rule => toPortable(rule, index, groupIndex, tags))
        .filter(rule => rule !== null)
}

/**
 * Adds to a transaction the statements that insert portable rules into a note, with their sections and groups remapped
 * to the ones created in the same transaction (the ids are written by SQLite with json_set, so they are known only
 * when the transaction runs). The rules keep their order.
 * @param tx The transaction collecting the statements.
 * @param noteRef The note: its id or a reference to the statement that creates it.
 * @param rules The rules, valid for `content` (see isPortableAutomation).
 * @param content The content inserted in the note.
 * @param sectionRefs References to the created sections in content order (see addNoteContent).
 * @param groupRefs References to the created groups in content order (see addNoteContent).
 * @param defaultSectionRefs References to the default sections (the direct area) of the created groups, in group order.
 * A tag action finds (or creates) the tag of the note's workspace by name, so its id is written by SQLite as well.
 * @category Database Queries
 */
export function addNoteAutomations(
    tx: Transaction, noteRef: number | TxRef, rules: readonly PortableAutomation[],
    content: NoteTemplateContent, sectionRefs: readonly TxRef[], groupRefs: readonly TxRef[], defaultSectionRefs: readonly TxRef[],
) {
    const offsets = sectionOffsets(content)
    const refOf = (ref: PortableSectionRef) => "direct" in ref ? defaultSectionRefs[ref.group] : sectionRefs[offsets[ref.group] + ref.section]
    // Placeholder written in the JSON until json_set replaces it with the id of the new section
    const PLACEHOLDER = 0

    rules.forEach((rule, position) => {
        const params: unknown[] = [noteRef, rule.name?.trim() || null, rule.enabled ? 1 : 0]

        let triggerSql = "?"
        const { trigger } = rule
        if ("groupId" in trigger) {
            if (trigger.groupId === null) {
                params.push(JSON.stringify(trigger))
            } else {
                params.push(JSON.stringify({ ...trigger, groupId: PLACEHOLDER }), groupRefs[trigger.groupId])
                triggerSql = "json_set(?, '$.groupId', CAST(? AS INTEGER))"
            }
        } else if (trigger.sectionId === null) {
            params.push(JSON.stringify(trigger))
        } else {
            params.push(JSON.stringify({ ...trigger, sectionId: PLACEHOLDER }), refOf(trigger.sectionId))
            triggerSql = "json_set(?, '$.sectionId', CAST(? AS INTEGER))"
        }

        const moves: [number, TxRef][] = []
        const tagged: [number, string][] = []
        const actions = rule.actions.map((action, i) => {
            if (action.type === "addTag" || action.type === "removeTag") {
                addEnsureTag(tx, WORKSPACE_OF_NOTE, noteRef, action.tag)
                tagged.push([i, action.tag.name.trim()])
                return { type: action.type, tagId: PLACEHOLDER }
            }
            if (action.type !== "moveTo") return action
            moves.push([i, refOf(action.sectionId)])
            return { ...action, sectionId: PLACEHOLDER }
        })
        params.push(JSON.stringify(actions))
        let actionsSql = "?"
        if (moves.length > 0 || tagged.length > 0) {
            const sets = [
                ...moves.map(([i]) => `'$[${i}].sectionId', CAST(? AS INTEGER)`),
                ...tagged.map(([i]) => `'$[${i}].tagId', (SELECT id FROM tag WHERE workspaceID = ${WORKSPACE_OF_NOTE} AND name = ?)`),
            ]
            actionsSql = `json_set(?, ${sets.join(", ")})`
            params.push(...moves.map(([, ref]) => ref), ...tagged.flatMap(([, name]) => [noteRef, name]))
        }

        params.push(position)
        tx.add(`INSERT INTO automation (noteID, name, enabled, trigger, actions, position) VALUES (?, ?, ?, ${triggerSql}, ${actionsSql}, ?)`, params)
    })
}

/**
 * Creates a rule, after the other rules of the note.
 * @returns The id of the new rule.
 * @category Database Queries
 */
export async function createDBAutomation(noteId: number, draft: AutomationDraft): Promise<number> {
    try {
        const db = await getDB()
        const result = await db.execute(
            `INSERT INTO automation (noteID, name, enabled, trigger, actions, position)
             SELECT ?, ?, ?, ?, ?, ${nextPositionSql("automation", "noteID = ?")}`,
            [noteId, draft.name?.trim() || null, draft.enabled ? 1 : 0, JSON.stringify(draft.trigger), JSON.stringify(draft.actions), noteId])
        return result.lastInsertId as number
    } catch (error: unknown) {
        return fail("save", error)
    }
}

/**
 * Replaces the content of a rule (its note and position do not change).
 * @category Database Queries
 */
export async function updateDBAutomation(id: number, draft: AutomationDraft): Promise<void> {
    try {
        const db = await getDB()
        await db.execute("UPDATE automation SET name = ?, enabled = ?, trigger = ?, actions = ? WHERE id = ?",
            [draft.name?.trim() || null, draft.enabled ? 1 : 0, JSON.stringify(draft.trigger), JSON.stringify(draft.actions), id])
    } catch (error: unknown) {
        fail("save", error)
    }
}

/**
 * Turns a rule on or off.
 * @category Database Queries
 */
export async function setDBAutomationEnabled(id: number, enabled: boolean): Promise<void> {
    try {
        const db = await getDB()
        await db.execute("UPDATE automation SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, id])
    } catch (error: unknown) {
        fail("save", error)
    }
}

/**
 * Deletes a rule for good (rules have no trash).
 * @category Database Queries
 */
export async function deleteDBAutomation(id: number): Promise<void> {
    try {
        const db = await getDB()
        await db.execute("DELETE FROM automation WHERE id = ?", [id])
    } catch (error: unknown) {
        fail("delete", error)
    }
}

/**
 * Writes the task and group changes computed for an automation (see diffGroupStatements and diffTaskStatements) in one
 * transaction, in the given order.
 * @category Database Queries
 */
export async function applyDBAutomationChanges(statements: TxStatement[]): Promise<void> {
    try {
        await runTransaction(statements)
    } catch (error: unknown) {
        fail("save", error)
    }
}
