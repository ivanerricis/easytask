// @vitest-environment node
/// <reference types="node" />
import { afterAll, describe, expect, it } from "vitest"
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { seedDemo } from "./seed-demo"
import { parseTemplateContent } from "@/db/queries/template"
import { isAutomationAction, isAutomationTrigger, isValidRule, type AutomationAction, type AutomationTrigger } from "@/lib/automations/types"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "easytask-seed-"))
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

describe("seed-demo", () => {
    it("builds a valid database with the demo data and the files", async () => {
        const target = path.join(root, "demo")
        const { dbFile, counts, backup } = await seedDemo({ target, force: false })
        expect(backup).toBeNull()
        expect(counts).toMatchObject({ workspaces: 2, pages: 3, archivedNotes: 1, trashedNotes: 1, trashedTasks: 2, audioFiles: 2, mediaFiles: 2 })
        expect(counts.templates).toBeGreaterThanOrEqual(2)
        expect(counts.automations).toBeGreaterThanOrEqual(2)

        const db = new DatabaseSync(dbFile)
        const rows = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[]
        expect(rows("PRAGMA user_version")[0].user_version).toBe(24)
        expect(rows("PRAGMA foreign_key_check")).toEqual([])
        expect(rows("PRAGMA integrity_check")[0].integrity_check).toBe("ok")

        // due dates: overdue, today with and without time, later
        const due = rows("SELECT due_date, due_time FROM task WHERE due_date IS NOT NULL AND completed = 0 AND deleted_at IS NULL")
        const today = new Date()
        const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
        expect(due.some(row => (row.due_date as string) < todayText)).toBe(true)
        expect(due.some(row => row.due_date === todayText && row.due_time === null)).toBe(true)
        expect(due.some(row => row.due_date === todayText && row.due_time !== null)).toBe(true)
        expect(rows("SELECT COUNT(DISTINCT SUBSTR(completed_at, 1, 10)) AS n FROM task WHERE completed = 1")[0].n).toBeGreaterThan(30)
        expect(rows("SELECT 1 FROM section_group WHERE color = 'due'").length).toBeGreaterThan(0)
        expect(rows("SELECT 1 FROM note WHERE kind = 'note' AND edit_date < date('now', '-30 days') AND deleted_at IS NULL").length).toBeGreaterThan(0)

        // JSON columns are the shapes the app reads
        for (const row of rows("SELECT content FROM note_template")) expect(() => parseTemplateContent(row.content as string)).not.toThrow()
        for (const row of rows("SELECT trigger, actions FROM automation")) {
            const trigger = JSON.parse(row.trigger as string) as AutomationTrigger
            const actions = JSON.parse(row.actions as string) as AutomationAction[]
            expect(isAutomationTrigger(trigger)).toBe(true)
            expect(actions.every(isAutomationAction)).toBe(true)
            expect(isValidRule(trigger, actions)).toBe(true)
        }
        expect(rows("SELECT 1 FROM automation WHERE trigger LIKE '%task.overdue%'").length).toBeGreaterThan(0)

        // files exist, except the attachment that tests the relink
        const attached = rows("SELECT path FROM task_file").map(row => fs.existsSync(row.path as string))
        expect(attached.filter(Boolean).length).toBeGreaterThan(2)
        expect(attached.filter(exists => !exists)).toHaveLength(1)
        for (const row of rows("SELECT path FROM audio_file UNION SELECT path FROM media_file")) expect(fs.existsSync(row.path as string)).toBe(true)
        db.close()
    }, 60000)

    it("refuses an existing database without --force, then moves it to a backup folder", async () => {
        const target = path.join(root, "demo")
        await expect(seedDemo({ target, force: false })).rejects.toThrow(/--force/)
        const { backup, dbFile } = await seedDemo({ target, force: true })
        expect(backup).not.toBeNull()
        expect(fs.existsSync(path.join(backup!, "easytask.db"))).toBe(true)
        expect(fs.existsSync(dbFile)).toBe(true)
    }, 60000)
})
