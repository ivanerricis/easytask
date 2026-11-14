import { $, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, openContextMenu, openWorkspace, sectionCard, sql, topDialog, tr, treeRow, typeInto,
    waitForApp,
    groupCard, newSectionInGroup,
} from "../helpers"

/**
 * Tags of the tasks: created from the menu of a task (the tag is given to the task in the same step), shown as a pill on the row,
 * saved in the database, taken back by one undo and brought back by redo.
 */
const WORKSPACE = "Tags Workspace"
const NOTE = "Tags Note"
const GROUP = "Tags Group"
const SECTION = "Tags S1"
const TASK = "Tags T1"
const TAG = "Urgent e2e"

const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

/** The row of the task with this text (its aria-label is the text). */
const rowOf = (text: string) => $(`//*[@role='treeitem'][@aria-label=${xpathString(text)}]`)

/** The names of the tags shown on the row of the task. */
const badgesOf = async (text: string): Promise<string[]> => {
    const names: string[] = []
    for (const badge of await rowOf(text).$$('[data-testid="tag-badge"]')) names.push(await badge.getText())
    return names
}

/** The tags saved for the task in the database: [name of the tag] ordered by the tag list. */
const savedTags = async (text: string): Promise<string[]> => {
    const rows = await sql<{ name: string }[]>(
        "select",
        `SELECT tg.name FROM task t INNER JOIN task_tag tt ON tt.taskID = t.id INNER JOIN tag tg ON tg.id = tt.tagID
         WHERE t.text = ? ORDER BY tg.position, tg.id`,
        [text],
    )
    return rows.map(row => row.name)
}

const savedTagNames = async (): Promise<string[]> =>
    (await sql<{ name: string }[]>("select", "SELECT name FROM tag WHERE name = ?", [TAG])).map(row => row.name)

/** Ctrl+<key> with the focus out of any text field (the app ignores undo/redo shortcuts inside them). */
const pressCtrl = async (key: string) => {
    await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
    await browser.keys(["Control", key])
}

describe("Tags of the tasks", () => {
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

    it("creates a tag from the menu of the task and shows its pill on the row", async () => {
        const menu = await openContextMenu(rowOf(TASK))
        await byText(await tr("tags.menu"), menu).click()
        const dialog = await topDialog()
        await dialog.waitForDisplayed({ timeoutMsg: "the tags dialog did not open" })
        await typeInto(byLabel(await tr("tags.newLabel")), TAG)
        await browser.keys("Enter")

        await browser.waitUntil(async () => (await badgesOf(TASK)).join() === TAG, { timeoutMsg: "the pill of the tag is not on the row" })
        await browser.waitUntil(async () => (await savedTags(TASK)).join() === TAG, { timeoutMsg: "the tag was not saved for the task" })
        // The new tag is in the list of the dialog, checked
        await expect($(`[role="checkbox"][aria-label="${TAG}"]`)).toHaveAttribute("aria-checked", "true")

        await byText(await tr("tags.done"), dialog).click()
        await dialog.waitForDisplayed({ reverse: true, timeoutMsg: "the tags dialog did not close" })
    })

    it("one Ctrl+Z removes the pill and the tag, Ctrl+Y brings both back", async () => {
        await pressCtrl("z")
        await browser.waitUntil(async () => (await badgesOf(TASK)).length === 0, { timeoutMsg: "the pill is still on the row after the undo" })
        await browser.waitUntil(async () => (await savedTagNames()).length === 0, { timeoutMsg: "the tag was not removed by the undo" })

        await pressCtrl("y")
        await browser.waitUntil(async () => (await badgesOf(TASK)).join() === TAG, { timeoutMsg: "the pill did not come back with the redo" })
        await browser.waitUntil(async () => (await savedTags(TASK)).join() === TAG, { timeoutMsg: "the tag was not saved again by the redo" })
    })
})
