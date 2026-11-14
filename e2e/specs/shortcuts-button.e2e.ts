import { $, browser, expect } from "@wdio/globals"
import { byLabel, tr, waitForApp } from "../helpers"

describe("Shortcuts button of the title bar", () => {
    it("is always visible and opens the keyboard shortcuts dialog", async () => {
        await waitForApp()
        const button = byLabel(await tr("window.shortcuts"))
        await button.waitForDisplayed({ timeoutMsg: "the shortcuts button is not in the title bar" })
        await button.click()
        const dialog = $('[role="dialog"]')
        await dialog.waitForDisplayed({ timeoutMsg: "the shortcuts dialog did not open" })
        await expect(dialog.$(`h2=${await tr("dialogs.shortcuts.title")}`)).toBeDisplayed()
        await browser.keys("Escape")
        await dialog.waitForExist({ reverse: true })
    })
})
