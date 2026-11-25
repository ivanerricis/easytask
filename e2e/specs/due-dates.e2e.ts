import { $, browser } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, domClick, menuButton, openMenuWithButton, openWorkspace, sectionCard, sql, topDialog, tr, treeRow, typeInto,
    waitForApp,
    groupCard, newSectionInGroup,
} from "../helpers"

/**
 * Due date of a task: set from its menu (a date and an optional time), shown as a badge on the row, saved in the database,
 * undone and redone, removed from the menu.
 */
const WORKSPACE = "Due Workspace"
const NOTE = "Due Note"
const GROUP = "Due Group"
const SECTION = "Due S1"
const TASK = "Due T1"

const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

const rowOf = (text: string) => $(`//*[@role='treeitem'][@aria-label=${xpathString(text)}]`)

/** Today as YYYY-MM-DD in the local calendar (the app and the test run on the same machine). */
const today = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

const savedDue = async (text: string) =>
    (await sql<{ due_date: string | null, due_time: string | null }[]>("select", "SELECT due_date, due_time FROM task WHERE text = ?", [text]))[0]

const badgeStatus = (text: string) => browser.execute((label: string) => {
    const row = Array.from(document.querySelectorAll("[role='treeitem']")).find(item => item.getAttribute("aria-label") === label)
    return row?.querySelector('[data-testid="due-badge"]')?.getAttribute("data-due-status") ?? null
}, text)

/** Ctrl+<key> with the focus out of any text field (the app ignores undo/redo shortcuts inside them). */
const pressCtrl = async (key: string) => {
    await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
    await browser.keys(["Control", key])
}

describe("Due date of a task", () => {
    before(async () => {
        await waitForApp()
    })

    it("creates a note with a group, a section and a task", async () => {
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

        await addTaskToSection(sectionCard(SECTION), TASK)
        await rowOf(TASK).waitForDisplayed({ timeoutMsg: `task "${TASK}" not created` })
    })

    it("sets today with a time from the menu of the task: the badge shows it and the database keeps it", async () => {
        await rowOf(TASK).moveTo()
        const menu = await openMenuWithButton(await menuButton(rowOf(TASK)))
        await domClick(byText(await tr("tasks.menu.setDue"), menu))
        const dialog = await topDialog()
        await dialog.waitForDisplayed({ timeoutMsg: "the due date dialog did not open" })
        await domClick(byText(await tr("tasks.due.today"), dialog))
        // The time is a native field: set it the way React reads it
        await browser.execute(() => {
            const input = document.getElementById("due-time") as HTMLInputElement
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
            setter.call(input, "23:59")
            input.dispatchEvent(new Event("input", { bubbles: true }))
        })
        await domClick(byText(await tr("tasks.due.save"), dialog))
        await dialog.waitForDisplayed({ reverse: true, timeoutMsg: "the due date dialog did not close" })

        await browser.waitUntil(async () => (await badgeStatus(TASK)) !== null, { timeoutMsg: "the due badge is not on the row" })
        await browser.waitUntil(
            async () => { const due = await savedDue(TASK); return due?.due_date === today() && due.due_time === "23:59" },
            { timeoutMsg: "the due date was not saved" },
        )
    })

    it("one Ctrl+Z removes the date, Ctrl+Y brings it back", async () => {
        await pressCtrl("z")
        await browser.waitUntil(async () => (await badgeStatus(TASK)) === null, { timeoutMsg: "the badge is still on the row after the undo" })
        await browser.waitUntil(async () => (await savedDue(TASK))?.due_date === null, { timeoutMsg: "the date was not removed by the undo" })

        await pressCtrl("y")
        await browser.waitUntil(async () => (await badgeStatus(TASK)) !== null, { timeoutMsg: "the badge did not come back with the redo" })
        await browser.waitUntil(async () => (await savedDue(TASK))?.due_date === today(), { timeoutMsg: "the date was not saved again by the redo" })
    })

    it("removes the due date from the menu", async () => {
        await rowOf(TASK).moveTo()
        const menu = await openMenuWithButton(await menuButton(rowOf(TASK)))
        await domClick(byText(await tr("tasks.menu.removeDue"), menu))
        await browser.waitUntil(async () => (await badgeStatus(TASK)) === null, { timeoutMsg: "the badge is still on the row" })
        await browser.waitUntil(async () => (await savedDue(TASK))?.due_date === null, { timeoutMsg: "the date was not removed" })
    })
})
