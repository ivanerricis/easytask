import { $, $$, browser, expect } from "@wdio/globals"
import { createWorkspace, openWorkspace, sql, tr, waitForApp, toolButton } from "../helpers"

/**
 * Statistics tab: opened from the sidebar footer (once: a second click brings the same tab to the front), it shows its sections
 * and an overdue task opens its note with the task on screen. The data is written straight to the database.
 */
const WORKSPACE = "Stats Workspace"
const NOTE = "Stats Note"
const OVERDUE = "Stats overdue task"
const DONE = "Stats done task"

const today = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

const statsTab = async () => $(`[role="tabpanel"][aria-label=${JSON.stringify(await tr("tasks.stats.title"))}]`)

describe("statistics tab", () => {
    it("shows the statistics of a workspace in a tab opened from the sidebar footer", async () => {
        await waitForApp()
        await createWorkspace(WORKSPACE)

        const [{ id: wsId }] = await sql<{ id: number }[]>("select", "SELECT id FROM workspace WHERE name = ?", [WORKSPACE])
        const stamp = `${today()} 10:00`
        for (const query of [
            `INSERT INTO note (id, workspaceID, name, position) VALUES (7101, ${wsId}, '${NOTE}', 0)`,
            "INSERT INTO section_group (id, noteID, position) VALUES (7102, 7101, 0)",
            "INSERT INTO section (id, groupID, title, position) VALUES (7103, 7102, 'Stats S1', 0)",
            `INSERT INTO task (id, sectionID, text, completed, due_date, position) VALUES (7104, 7103, '${OVERDUE}', 0, '2020-01-02', 0)`,
            `INSERT INTO task (id, sectionID, text, completed, completed_at, position) VALUES (7105, 7103, '${DONE}', 1, '${stamp}', 1)`,
        ]) await sql("execute", query)
        await browser.refresh()
        await waitForApp()
        await openWorkspace(WORKSPACE)

        const open = await toolButton("tasks.stats.title")
        await open.click()
        const panel = await statsTab()
        await panel.waitForDisplayed({ timeoutMsg: "the statistics tab did not open" })
        for (const key of ["completedPerWeek", "progress", "stale", "overdue", "dueThisWeek"] as const)
            await expect(panel.$(`h3*=${await tr(`tasks.stats.${key}`)}`)).toBeDisplayed()
        // The completed task counts in this week, the note shows 1 of 2
        await browser.waitUntil(async () => /1\/2/.test(await panel.getText()), { timeoutMsg: `the note should show 1/2 tasks: ${await panel.getText()}` })

        // A second click does not open a second tab
        await open.click()
        await browser.waitUntil(async () => (await $$('[role="tab"][data-note-id="-2"]').length) === 1, { timeoutMsg: "the statistics tab was opened twice" })
    })

    it("opens the note of an overdue task on the task", async () => {
        const task = (await statsTab()).$('[data-testid="stats-task"]')
        await task.waitForDisplayed()
        await browser.waitUntil(
            async () => browser.execute(label => (document.querySelector('[data-testid="stats-task"]')?.textContent ?? "").includes(label), OVERDUE),
            { timeoutMsg: "the overdue task is not in the list" },
        )
        await task.click()
        const edit = await tr("tasks.editText")
        await browser.waitUntil(
            async () => browser.execute(
                (value: string, aria: string) => Array.from(document.querySelectorAll<HTMLTextAreaElement>(`textarea[aria-label="${aria}"]`)).some(area => area.value === value),
                OVERDUE, edit,
            ),
            { timeoutMsg: "the note of the overdue task was not opened on the task" },
        )
    })
})
