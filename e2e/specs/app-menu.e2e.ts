import { $, browser, expect } from "@wdio/globals"
import { byLabel, createFromSidebar, createWorkspace, openWorkspace, tr, treeRow, waitForApp } from "../helpers"

const WORKSPACE = "Menu Workspace"
const NOTE = "Menu Note"

const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

/** Opens a menu of the title bar (File, Edit...) and returns the open menu. */
const openAppMenu = async (triggerText: string) => {
    const bar = byLabel(await tr("appMenu.label"))
    await bar.waitForDisplayed()
    await bar.$(`.//*[@role='menuitem'][normalize-space()=${xpathString(triggerText)}]`).click()
    const menu = $('[role="menu"][data-state="open"]')
    await menu.waitForDisplayed({ timeoutMsg: `the "${triggerText}" menu did not open` })
    return menu
}

const menuItems = async (menu: ChainableMenu) =>
    browser.execute(
        (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => (item.textContent ?? "").trim()),
        (await menu.getElement()) as unknown as HTMLElement,
    )
type ChainableMenu = ReturnType<typeof $>

const menuItem = (menu: ChainableMenu, text: string) =>
    menu.$(`.//*[@role='menuitem'][normalize-space()=${xpathString(text)}]`)

const dialogTitled = (title: string) => $(`//*[@role='dialog' or @role='alertdialog'][.//*[normalize-space()=${xpathString(title)}]]`)

const closeAllDialogs = async () => {
    const open = () => browser.execute(() => document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length)
    for (let i = 0; i < 3 && (await open()) > 0; i++) {
        await browser.keys("Escape")
        await browser.waitUntil(async () => (await open()) === 0, { timeout: 1_500 }).catch(() => undefined)
    }
}

describe("App menu with the left sidebar closed", () => {
    afterEach(async () => {
        await closeAllDialogs()
    })

    before(async () => {
        await waitForApp()
    })

    // The sidebar state is persisted and shared by the specs: never leave it closed, even after a failure
    after(async () => {
        await closeAllDialogs()
        if (!(await byLabel(await tr("sidebar.addNote")).isDisplayed({ withinViewport: true }))) {
            await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
            await browser.keys(["Control", "b"])
            await byLabel(await tr("sidebar.addNote")).waitForDisplayed({ timeoutMsg: "the left sidebar did not reopen" })
        }
    })

    it("creates a workspace and a note, then closes the left sidebar", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()

        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "b"])
        await browser.waitUntil(async () => !(await byLabel(await tr("sidebar.addNote")).isDisplayed({ withinViewport: true })), {
            timeoutMsg: "the left sidebar did not close",
        })
    })

    it("creates a note with Ctrl+N while the sidebar is closed", async () => {
        const name = await tr("notes.defaultName")
        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "n"])
        // The new tab goes straight into the inline rename (its name field replaces the tab button) with the provisional name
        const field = $(`input[aria-label=${JSON.stringify(await tr("common.name"))}]`)
        await field.waitForDisplayed({ timeoutMsg: "Ctrl+N did not create a note with the sidebar closed" })
        await expect(field).toHaveValue(name)
        // Escape cancels the creation: the field and the tab are gone (the note is deleted for good, not trashed)
        await browser.keys("Escape")
        await field.waitForExist({ reverse: true, timeoutMsg: "the name field did not close after Escape" })
        await $(`[role="tab"][title=${JSON.stringify(name)}]`).waitForExist({ reverse: true, timeoutMsg: "the tab of the cancelled note is still there after Escape" })
    })

    it("keeps Trash, Archive, Templates and Note from template in File (not in Edit)", async () => {
        const trash = await tr("appMenu.trash")
        const archive = await tr("appMenu.archive")

        const file = await openAppMenu(await tr("appMenu.file"))
        const fileItems = await menuItems(file)
        expect(fileItems).toContain(trash)
        expect(fileItems).toContain(archive)
        expect(fileItems).toContain(await tr("appMenu.templates"))
        expect(fileItems).toContain(await tr("appMenu.noteFromTemplate"))
        await browser.keys("Escape")
        await file.waitForExist({ reverse: true })

        const undo = await tr("appMenu.undo")
        const edit = await openAppMenu(await tr("appMenu.edit"))
        const editItems = await menuItems(edit)
        expect(editItems).not.toContain(trash)
        expect(editItems).not.toContain(archive)
        // The entries with a shortcut show it after the label
        expect(editItems.some((text) => text.startsWith(undo))).toBe(true)
        await browser.keys("Escape")
        await edit.waitForExist({ reverse: true })
    })

    for (const [entry, title] of [
        ["appMenu.trash", "trash.title"],
        ["appMenu.archive", "archive.title"],
        ["appMenu.templates", "dialogs.templates.title"],
        ["appMenu.noteFromTemplate", "dialogs.pickTemplate.title"],
    ] as const) {
        it(`opens the dialog of File > ${entry} while the sidebar is closed`, async () => {
            // The sidebar must still be closed: this is the whole point of the check
            await expect(byLabel(await tr("sidebar.addNote"))).not.toBeDisplayedInViewport()
            const file = await openAppMenu(await tr("appMenu.file"))
            const item = menuItem(file, await tr(entry))
            await expect(item).not.toHaveAttribute("data-disabled")
            await item.click()
            // The picker of the templates is a command palette: its title is only for screen readers
            const dialog = entry === "appMenu.noteFromTemplate" ? $('[role="dialog"]') : dialogTitled(await tr(title))
            await dialog.waitForDisplayed({ timeoutMsg: `the dialog "${await tr(title)}" did not open from the menu` })
            if (entry === "appMenu.noteFromTemplate") await expect(dialog.$("[cmdk-input]")).toBeDisplayed()
            await browser.keys("Escape")
            await dialog.waitForExist({ reverse: true })
        })
    }

    it("opens the left sidebar again (its state is saved and the next specs need it)", async () => {
        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "b"])
        await byLabel(await tr("sidebar.addNote")).waitForDisplayed({ timeoutMsg: "the left sidebar did not reopen" })
    })

    it("uses the ellipsis character, never three dots, in the labels of every menu", async () => {
        for (const key of ["appMenu.file", "appMenu.edit", "appMenu.view", "appMenu.help"]) {
            const menu = await openAppMenu(await tr(key))
            const items = await menuItems(menu)
            expect(items.length).toBeGreaterThan(0)
            for (const text of items) expect(text).not.toContain("...")
            await browser.keys("Escape")
            await menu.waitForExist({ reverse: true })
        }
        const file = await openAppMenu(await tr("appMenu.file"))
        const items = await menuItems(file)
        expect(items).toContain(await tr("appMenu.trash"))
        expect(await tr("appMenu.trash")).toContain("…")
        expect(items.some((text) => text.endsWith("…"))).toBe(true)
        await browser.keys("Escape")
        await file.waitForExist({ reverse: true })
    })
})
