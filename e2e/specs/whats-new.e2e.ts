import { $, $$, browser, expect } from "@wdio/globals"
import { byLabel, createWorkspace, openWorkspace, setLastSeenVersion, sql, tr, waitForApp } from "../helpers"

/**
 * "What's new" tab: after an update (the version saved in the preferences is not the running one) the first start opens a
 * tab with the release notes, once. The tab is not a note: nothing is written to the database. A first installation (no
 * saved version) opens nothing; the specs before this one already opened workspaces, so the saved version is the current one.
 */
const WORKSPACE = "Whats New Workspace"
const OLD_VERSION = "0.0.1"

/** The "What's new" tab of the bar of the open tabs. */
const whatsNewTab = async () => $(`[role="tab"][data-note-id="-1"]`)

/** The tab bars are not shown without an open note: this says whether the tab exists, without waiting long. */
const tabIsShown = async (timeout: number) => (await whatsNewTab()).waitForDisplayed({ timeout }).then(() => true, () => false)

const noteCount = async () => (await sql<{ n: number }[]>("select", "SELECT COUNT(*) AS n FROM note"))[0].n

const restart = async () => {
    await browser.reloadSession()
    await waitForApp()
    await byLabel(await tr("home.workspace.open", { name: WORKSPACE })).waitForDisplayed({ timeout: 30_000 })
}

describe("What's new tab", () => {
    let notes = 0

    before(async () => {
        await waitForApp()
    })

    it("does not open when the version is the one already seen", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        expect(await tabIsShown(2_000)).toBe(false)
        notes = await noteCount()
    })

    it("opens after an update, with the notes of the running version, and writes nothing to the database", async () => {
        await setLastSeenVersion(OLD_VERSION)
        await restart()
        await openWorkspace(WORKSPACE)

        const tab = await whatsNewTab()
        await tab.waitForDisplayed({ timeout: 20_000, timeoutMsg: "the What's new tab did not open after the update" })
        await expect(tab).toHaveAttribute("aria-selected", "true")
        // The title attribute: getText of a truncated label is not reliable on WebKitGTK
        expect(await tab.getAttribute("title")).toBe(await tr("settings.about.update.notes"))

        const panel = $('[role="tabpanel"]')
        await panel.waitForDisplayed()
        // The notes are the bundled changelog: at least one list item, in the language of the app
        await browser.waitUntil(async () => Array.from(await panel.$$("li")).length > 0, { timeoutMsg: "the release notes are empty" })
        expect(await noteCount()).toBe(notes)
    })

    it("closes with its button and is not opened again at the next start", async () => {
        await byLabel(await tr("notes.closeCurrent")).click()
        await (await whatsNewTab()).waitForExist({ reverse: true, timeoutMsg: "the tab did not close" })
        expect(Array.from(await $$('[role="tab"][data-note-id="-1"]')).length).toBe(0)

        await restart()
        await openWorkspace(WORKSPACE)
        expect(await tabIsShown(3_000)).toBe(false)
    })
})
