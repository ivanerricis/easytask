import { $, browser, expect } from "@wdio/globals"
import {
    byLabel, byText, createFromSidebar, createWorkspace, openContextMenu, openWorkspace, sql, topDialog, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * Pages: a Markdown text in the sidebar tree. Created from the sidebar, typed as plain text, shown formatted with the button of
 * the path bar, saved as typed (also after the tab is closed and opened again), trashed and restored with its text.
 */
const WORKSPACE = "Pages Workspace"
const PAGE = "Pages Notes"
const TEXT = "# Big title\n\nSome **bold** words\n\n- [ ] first item\n\n<b>not html</b>"

const savedBody = async (): Promise<string | null | undefined> =>
    (await sql<{ body: string | null }[]>("select", "SELECT body FROM note WHERE name = ? AND kind = 'page'", [PAGE]))[0]?.body

describe("Pages", () => {
    before(async () => {
        await waitForApp()
    })

    it("creates a page from the sidebar and opens the text editor", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addPage", "dialogs.addNote.submit", PAGE)
        await treeRow(PAGE).waitForDisplayed()
        await treeRow(PAGE).click()
        await byLabel(await tr("notes.page.text")).waitForDisplayed({ timeoutMsg: "the page text field did not open" })
        const kinds = await sql<{ kind: string }[]>("select", "SELECT kind FROM note WHERE name = ?", [PAGE])
        expect(kinds).toEqual([{ kind: "page" }])
    })

    it("hides the buttons that only a note uses and keeps the split button", async () => {
        await expect(byLabel(await tr("menu.newGroup"))).not.toBeExisting()
        await expect(byLabel(await tr("notes.hideCompleted"))).not.toBeExisting()
        await expect(byLabel(await tr("notes.page.showPreview"))).toBeDisplayed()
        await expect(byLabel(await tr("notes.split.split"))).toBeDisplayed()
    })

    it("saves what is typed, as typed", async () => {
        await typeInto(byLabel(await tr("notes.page.text")), TEXT)
        await browser.waitUntil(async () => (await savedBody()) === TEXT, { timeoutMsg: "the text was not saved as typed" })
    })

    it("shows the formatted preview with the button of the path bar, and the text again", async () => {
        await byLabel(await tr("notes.page.showPreview")).click()
        const preview = $('[data-testid="page-preview"]')
        await preview.waitForDisplayed()
        await expect(preview.$("h1")).toHaveText("Big title")
        await expect(preview.$("strong")).toHaveText("bold")
        // html is text, never markup
        await expect(preview).toHaveText(expect.stringContaining("<b>not html</b>"))
        await expect(preview.$("b")).not.toBeExisting()
        await byLabel(await tr("notes.page.showText")).click()
        await expect(byLabel(await tr("notes.page.text"))).toHaveValue(TEXT)
    })

    it("keeps the text after closing the tab and opening the page again", async () => {
        await byLabel(await tr("notes.closeCurrent")).click()
        await byLabel(await tr("notes.page.text")).waitForExist({ reverse: true })
        await treeRow(PAGE).click()
        await expect(byLabel(await tr("notes.page.text"))).toHaveValue(TEXT)
    })

    it("moves the page to the trash and restores it with its text", async () => {
        const menu = await openContextMenu(treeRow(PAGE))
        await byText(await tr("common.delete"), menu).click()
        const confirmLabel = await tr("dialogs.delete.confirm")
        await browser.waitUntil(async () => {
            const dialog = await topDialog()
            return dialog !== undefined && (await byText(confirmLabel, dialog).isExisting())
        }, { timeoutMsg: "the delete confirmation did not open" })
        await byText(confirmLabel, await topDialog()).click()
        await treeRow(PAGE).waitForExist({ reverse: true })

        await $(`//button[.//span[normalize-space()='${await tr("trash.title")}']]`).click()
        const trash = $('[role="dialog"]')
        await trash.waitForDisplayed()
        await trash.$(`[aria-label=${JSON.stringify(await tr("trash.restoreAria", { name: PAGE }))}]`).click()
        await expect(trash.$(`p=${await tr("trash.isEmpty")}`)).toBeDisplayed()
        await browser.keys("Escape")
        await trash.waitForExist({ reverse: true })

        await treeRow(PAGE).waitForDisplayed()
        expect(await savedBody()).toBe(TEXT)
        await treeRow(PAGE).click()
        await expect(byLabel(await tr("notes.page.text"))).toHaveValue(TEXT)
    })
})
