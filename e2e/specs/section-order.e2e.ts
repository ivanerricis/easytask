import { $, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, domClick, groupCard, newSectionInGroup, openContextMenu,
    openSubmenu, openWorkspace, sectionCard, sql, taskTexts, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * The order of the tasks of a section: its menu lets the user draw them as stored (manual), the open ones first or the completed
 * ones first, over the global preference. It is only a view (the stored order does not change), it is saved in the section, a
 * sorted section has no draggable tasks, and a new task is open so it never lands among the completed ones.
 */
const WORKSPACE = "Section Order Workspace"
const NOTE = "Section Order Note"
const GROUP = "Section Order Group"
const SECTION = "Order Section"
const OTHER = "Order Other Section"
const [A, B, C, D] = ["Order A", "Order B", "Order C", "Order D"]
const NEW_TASK = "Order New"

const texts = () => taskTexts(sectionCard(SECTION))

const waitForTexts = (expected: string[]) =>
    browser.waitUntil(async () => JSON.stringify(await texts()) === JSON.stringify(expected), {
        timeoutMsg: `the section does not show ${expected.join(" > ")}`,
    })

/** The order saved in the database for the section (null = it follows the preference). */
const savedOrder = async (title = SECTION) =>
    (await sql<{ task_order: string | null }[]>("select", "SELECT task_order FROM section WHERE title = ? AND deleted_at IS NULL", [title]))[0]?.task_order ?? null

/** Stored top to bottom order of the tasks of the section: the view never changes it. */
const storedOrder = async () =>
    (await sql<{ text: string }[]>("select", `SELECT t.text AS text FROM task t JOIN section s ON s.id = t.sectionID
        WHERE s.title = ? AND t.taskID IS NULL AND t.deleted_at IS NULL ORDER BY t.position, t.id`, [SECTION])).map(row => row.text)

/** Ticks the checkbox of a task of the section. */
const complete = async (text: string) => {
    const label = await tr("tasks.editText")
    const id = await browser.execute((aria: string, value: string) => {
        const area = Array.from(document.querySelectorAll<HTMLTextAreaElement>(`textarea[aria-label="${aria}"]`)).find(el => el.value === value)
        return area?.closest<HTMLElement>("[data-task-id]")?.dataset.taskId ?? ""
    }, label, text)
    await domClick($(`[data-task-id="${id}"] [role="checkbox"]`))
    await browser.waitUntil(async () => (await $(`[data-task-id="${id}"] [role="checkbox"]`).getAttribute("aria-checked")) === "true", { timeoutMsg: `"${text}" was not completed` })
}

/** Picks an order in the "Task order" submenu of the menu of a section. */
const chooseOrder = async (title: string, key: "menu.taskOrderDefault" | "menu.taskOrderManual" | "menu.taskOrderOpenFirst" | "menu.taskOrderDoneFirst") => {
    const menu = await openContextMenu(sectionCard(title).$("button[title]"))
    const item = byText(await tr(key))
    await openSubmenu(menu, await tr("menu.taskOrder"), item)
    await item.click()
    await browser.waitUntil(async () => !(await $('[role="menu"]').isExisting()), { timeoutMsg: "the menu did not close" })
}

describe("Order of the tasks of a section", () => {
    before(async () => {
        await waitForApp()
    })

    it("creates a section with four tasks, two of them completed", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()

        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })
        await newSectionInGroup(groupCard(GROUP), SECTION)
        await newSectionInGroup(groupCard(GROUP), OTHER)

        for (const text of [A, B, C, D]) {
            await addTaskToSection(sectionCard(SECTION), text)
            await browser.waitUntil(async () => (await texts()).includes(text), { timeoutMsg: `task ${text} not created` })
        }
        await complete(B)
        await complete(D)
        await waitForTexts([A, B, C, D])
        expect(await savedOrder()).toBeNull()
    })

    it("draws the open tasks first, keeping the stored order, and saves the choice", async () => {
        await chooseOrder(SECTION, "menu.taskOrderOpenFirst")
        await waitForTexts([A, C, B, D])
        await browser.waitUntil(async () => (await savedOrder()) === "open-first", { timeoutMsg: "the order was not saved" })
        expect(await storedOrder()).toEqual([A, B, C, D])
    })

    it("draws the completed tasks first", async () => {
        await chooseOrder(SECTION, "menu.taskOrderDoneFirst")
        await waitForTexts([B, D, A, C])
        await browser.waitUntil(async () => (await savedOrder()) === "done-first", { timeoutMsg: "the order was not saved" })
        expect(await storedOrder()).toEqual([A, B, C, D])
    })

    it("keeps the other sections as they were", async () => {
        expect(await savedOrder(OTHER)).toBeNull()
    })

    it("puts a new task among the open ones", async () => {
        await addTaskToSection(sectionCard(SECTION), NEW_TASK)
        await browser.waitUntil(async () => (await texts()).includes(NEW_TASK), { timeoutMsg: "the new task was not created" })
        const shown = await texts()
        expect(shown.indexOf(NEW_TASK)).toBeGreaterThan(shown.indexOf(D))
        expect(shown.slice(0, 2)).toEqual([B, D])
    })

    it("draws the tasks as stored with the manual order", async () => {
        await chooseOrder(SECTION, "menu.taskOrderManual")
        await waitForTexts([A, B, C, D, NEW_TASK])
        await browser.waitUntil(async () => (await savedOrder()) === "manual", { timeoutMsg: "the order was not saved" })
    })

    it("gives the choice back to the preference", async () => {
        await chooseOrder(SECTION, "menu.taskOrderDefault")
        await browser.waitUntil(async () => (await savedOrder()) === null, { timeoutMsg: "the choice was not removed" })
        await waitForTexts([A, B, C, D, NEW_TASK])
    })

    it("keeps the choice after the note is closed and opened again", async () => {
        await chooseOrder(SECTION, "menu.taskOrderOpenFirst")
        await waitForTexts([A, C, NEW_TASK, B, D])
        await byLabel(await tr("notes.closeCurrent")).click()
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
        await waitForTexts([A, C, NEW_TASK, B, D])
    })
})
