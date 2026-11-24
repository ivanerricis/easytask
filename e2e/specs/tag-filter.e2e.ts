import { $, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, domClick, menuButton, openMenuWithButton, openWorkspace, sectionCard, topDialog, tr, treeRow, typeInto,
    waitForApp,
    groupCard, newSectionInGroup,
} from "../helpers"

/**
 * The tag filter of the note bar: only the tasks with a chosen tag stay in view, the badge says a filter is on, one click removes it,
 * and the filter is only a view (both tasks are still in the note afterwards).
 */
const WORKSPACE = "Tag Filter Workspace"
const NOTE = "Tag Filter Note"
const GROUP = "Tag Filter Group"
const SECTION = "Tag Filter S1"
const TAGGED = "Filter tagged task"
const PLAIN = "Filter plain task"
const TAG = "Filter e2e"

const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`
const rowOf = (text: string) => $(`//*[@role='treeitem'][@aria-label=${xpathString(text)}]`)
const rowExists = (text: string) => browser.execute((label: string) =>
    Array.from(document.querySelectorAll("[role='treeitem']")).some(item => item.getAttribute("aria-label") === label), text)
const filterRoot = () => $('[data-testid="tag-filter"]')

describe("Tag filter of the note", () => {
    before(async () => {
        await waitForApp()
    })

    it("creates a note with two tasks, one of them tagged", async () => {
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
        await addTaskToSection(sectionCard(SECTION), TAGGED)
        await addTaskToSection(sectionCard(SECTION), PLAIN)
        await rowOf(PLAIN).waitForDisplayed({ timeoutMsg: "the tasks were not created" })

        await rowOf(TAGGED).moveTo()
        const menu = await openMenuWithButton(await menuButton(rowOf(TAGGED)))
        await domClick(byText(await tr("tags.menu"), menu))
        const dialog = await topDialog()
        await typeInto(byLabel(await tr("tags.newLabel")), TAG)
        await domClick(byText(await tr("tags.create"), dialog))
        await browser.waitUntil(
            () => browser.execute((name: string) => document.querySelector(`[role="checkbox"][aria-label="${name}"]`)?.getAttribute("aria-checked") === "true", TAG),
            { timeoutMsg: "the new tag is not checked" },
        )
        await domClick(byText(await tr("tags.done"), dialog))
        await dialog.waitForDisplayed({ reverse: true })
    })

    it("shows only the tagged task while the tag is checked, with a badge", async () => {
        await domClick(byLabel(await tr("notes.tagFilter.label")))
        await domClick($(`[role="checkbox"][aria-label=${xpathString(TAG)}]`))
        await browser.waitUntil(async () => !(await rowExists(PLAIN)), { timeoutMsg: "the plain task is still in view under the filter" })
        expect(await rowExists(TAGGED)).toBe(true)
        expect(await filterRoot().getAttribute("data-active")).not.toBeNull()
        expect(await $('[data-testid="tag-filter-count"]').getText()).toBe("1")
    })

    it("removes the filter with one click and nothing was changed in the note", async () => {
        await browser.keys("Escape")
        await domClick($('[data-testid="tag-filter-clear"]'))
        await browser.waitUntil(() => rowExists(PLAIN), { timeoutMsg: "the plain task did not come back" })
        expect(await rowExists(TAGGED)).toBe(true)
        expect(await filterRoot().getAttribute("data-active")).toBeNull()
    })
})
