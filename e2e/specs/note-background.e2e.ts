import { browser, $, expect } from "@wdio/globals"
import {
    byLabel, byText, createFromSidebar, createWorkspace, cssColor, openContextMenu, openSubmenu, openWorkspace, sql, tr, treeRow, waitForApp,
} from "../helpers"

/**
 * Background color of a note: chosen from the right click menu on the empty space of the note, saved in the database,
 * drawn as a light layer on the note area and brought back by undo.
 */
const WORKSPACE = "Background Workspace"
const NOTE = "Background Note"
const RED_HEX = "#e6194b"

const area = () => $('[data-testid="note-background"]')

/** The background saved for the note (null = none). */
const savedBackground = async (): Promise<string | null> => {
    const rows = await sql<{ bg_color: string | null }[]>("select", "SELECT bg_color FROM note WHERE name = ?", [NOTE])
    return rows[0]?.bg_color ?? null
}

/** Right click on the empty space of the note and the swatch of the palette (red) of the "Note background" entry. */
const openBackgroundPalette = async () => {
    const menu = await openContextMenu(area())
    const red = $(`[role="radio"][aria-label="${await tr("dialogs.color.swatch", { color: await tr("common.colors.c1") })}"]`)
    await openSubmenu(menu, await tr("menu.noteBackground"), red)
    return red
}

describe("Note background", () => {
    before(async () => {
        await waitForApp()
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
    })

    it("starts without a background", async () => {
        await area().waitForDisplayed({ timeoutMsg: "the note area is not shown" })
        expect(await savedBackground()).toBeNull()
        expect((await cssColor(area(), "background-color")).a).toBe(0)
    })

    it("paints the note area with the chosen color as a light layer and saves it", async () => {
        const red = await openBackgroundPalette()
        await red.click()
        await browser.waitUntil(async () => (await savedBackground()) === RED_HEX, { timeoutMsg: "the background was not saved" })
        const painted = await cssColor(area(), "background-color")
        expect(painted.r).toBeGreaterThan(200)
        expect(painted.g).toBeLessThan(60)
        expect(painted.a).toBeGreaterThan(0.05)
        expect(painted.a).toBeLessThan(0.3)
    })

    it("marks the current color in the palette and one Ctrl+Z takes the background away", async () => {
        const red = await openBackgroundPalette()
        expect(await red.getAttribute("aria-checked")).toBe("true")
        await browser.keys("Escape")
        await $('[role="menu"]').waitForDisplayed({ reverse: true, timeoutMsg: "the menu did not close" })

        // The focus must be out of any field for the shortcut
        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "z"])
        await browser.waitUntil(async () => (await savedBackground()) === null, { timeoutMsg: "the undo did not remove the background" })
        await browser.waitUntil(async () => (await cssColor(area(), "background-color")).a === 0, { timeoutMsg: "the background is still painted" })
    })

    it("removes the background with the no color button", async () => {
        const red = await openBackgroundPalette()
        await red.click()
        await browser.waitUntil(async () => (await savedBackground()) === RED_HEX, { timeoutMsg: "the background was not saved again" })

        const menu = await openContextMenu(area())
        await openSubmenu(menu, await tr("menu.noteBackground"), byText(await tr("details.noColor")))
        await byText(await tr("details.noColor")).click()
        await browser.waitUntil(async () => (await savedBackground()) === null, { timeoutMsg: "the background was not removed" })
    })
})
