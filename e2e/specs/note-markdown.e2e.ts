import { browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, groupCard, newSectionInGroup, openContextMenu, openWorkspace, tr,
    treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * "Copy as Markdown" of the note menu: the groups, sections and tasks of the note end up in the system clipboard.
 * The clipboard is read through the clipboard plugin of the app (the same one that wrote it).
 */
const WORKSPACE = "Markdown Workspace"
const NOTE = "Markdown Note"
const GROUP = "Markdown Group"
const SECTION = "Markdown Section"
const TASK = "Write the report"

/** The text of the system clipboard, read from the page with the clipboard plugin. */
const clipboardText = (): Promise<string> =>
    browser.executeAsync((done: (value: string) => void) => {
        const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (name: string) => Promise<unknown> } }).__TAURI_INTERNALS__
        internals.invoke("plugin:clipboard-manager|read_text").then(value => done(String(value)), (error: unknown) => done(`ERROR ${String(error)}`))
    })

describe("Copy a note as Markdown", () => {
    before(async () => {
        await waitForApp()
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
        await addTaskToSection(groupCard(GROUP), TASK)
    })

    it("copies the group, the section and the task as Markdown from the menu of the note", async () => {
        const menu = await openContextMenu(treeRow(NOTE))
        await byText(await tr("menu.copyMarkdown"), menu).click()
        await browser.waitUntil(async () => (await clipboardText()).includes(TASK), { timeoutMsg: "the Markdown was not copied" })

        const text = await clipboardText()
        expect(text).toContain(`# ${NOTE}`)
        expect(text).toContain(`## ${GROUP}`)
        expect(text).toContain(`### ${SECTION}`)
        expect(text).toContain(`- [ ] ${TASK}`)
    })
})
