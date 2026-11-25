import { $, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, domClick, menuButton, openMenuWithButton, openWorkspace, sectionCard, sql, topDialog, tr, treeRow, typeInto,
    waitForApp,
    groupCard, newSectionInGroup,
} from "../helpers"

/**
 * Light Markdown in a task description: a description with a checklist is drawn with boxes, a click on a box ticks it and the
 * saved text changes on that one line (stored as plain Markdown text).
 */
const WORKSPACE = "Md Desc Workspace"
const NOTE = "Md Desc Note"
const GROUP = "Md Desc Group"
const SECTION = "Md Desc S1"
const TASK = "Md Desc T1"
const DESCRIPTION = "Plan **today**\n- [ ] first\n- [ ] second"

const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

const rowOf = (text: string) => $(`//*[@role='treeitem'][@aria-label=${xpathString(text)}]`)

const savedDescription = async (): Promise<string | null> => {
    const rows = await sql<{ description: string | null }[]>("select", "SELECT description FROM task WHERE text = ?", [TASK])
    return rows[0]?.description ?? null
}

describe("Markdown in the description of a task", () => {
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

    it("saves a description with a checklist as plain text", async () => {
        await rowOf(TASK).moveTo()
        const menu = await openMenuWithButton(await menuButton(rowOf(TASK)))
        await domClick(byText(await tr("tasks.menu.addDescription"), menu))
        const dialog = await topDialog()
        await dialog.waitForDisplayed({ timeoutMsg: "the description dialog did not open" })
        // typeInto falls back to the native setter when WebKitWebDriver drops Shift ("*") or newlines
        await typeInto(dialog.$("textarea"), DESCRIPTION)
        await domClick(byText(await tr("common.save"), dialog))
        await browser.waitUntil(async () => (await savedDescription()) === DESCRIPTION, {
            timeoutMsg: `the description was not saved as typed (got ${JSON.stringify(await savedDescription())})`,
        })
    })

    it("draws the checklist and a click on a box rewrites only that line", async () => {
        await rowOf(TASK).moveTo()
        await byLabel(await tr("tasks.showDescription")).click()
        const dialog = await topDialog()
        const boxes = dialog.$$('[role="checkbox"]')
        await browser.waitUntil(async () => (await boxes.length) === 2, { timeoutMsg: "the checklist was not drawn with two boxes" })
        await expect(dialog.$("strong")).toHaveText("today")
        // The dialog zooms in: a WebDriver click during the animation fails with "element not interactable"
        await dialog.waitForStable().catch(() => undefined)
        await domClick(boxes[1])
        await browser.waitUntil(async () => (await savedDescription()) === "Plan **today**\n- [ ] first\n- [x] second", {
            timeoutMsg: `the tick was not saved on the second line (got ${JSON.stringify(await savedDescription())})`,
        })
        await expect(boxes[1]).toHaveAttribute("aria-checked", "true")
    })
})
