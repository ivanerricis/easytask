import { $, $$, browser, expect } from "@wdio/globals"
import { byLabel, chooseLanguage, currentLang, selectedLanguage, tr, trIn, waitForApp } from "../helpers"

describe("Language setting and shortcuts dialog", () => {
    before(async () => {
        await waitForApp()
        await byLabel(await tr("settings.title")).waitForDisplayed({ timeout: 30_000 })
    })

    it("switches the language between Italian and English from the settings", async () => {
        await byLabel(await tr("settings.title")).click()
        const dialog = $('[role="dialog"]')
        await dialog.waitForDisplayed()

        await chooseLanguage("Italiano")
        await browser.waitUntil(async () => (await currentLang()) === "it", { timeoutMsg: "UI did not switch to Italian" })
        await expect(dialog.$(`h2=${trIn("it", "settings.title")}`)).toBeDisplayed()
        expect(await selectedLanguage()).toBe("Italiano")

        await chooseLanguage("English")
        await browser.waitUntil(async () => (await currentLang()) === "en", { timeoutMsg: "UI did not switch to English" })
        await expect(dialog.$(`h2=${trIn("en", "settings.title")}`)).toBeDisplayed()

        // Back to the default so the other specs start from the system language
        await chooseLanguage(trIn("en", "common.system"))
        await browser.keys("Escape")
        await dialog.waitForExist({ reverse: true })
    })

    it("opens the settings with Ctrl+, and closes them with Escape", async () => {
        await browser.keys(["Control", ","])
        const dialog = $('[role="dialog"]')
        await dialog.waitForDisplayed({ timeoutMsg: "Ctrl+, did not open the settings" })
        await expect(dialog.$(`h2=${await tr("settings.title")}`)).toBeDisplayed()

        await browser.keys("Escape")
        await dialog.waitForExist({ reverse: true })
    })

    it("opens the keyboard shortcuts dialog with ? and closes it with Escape", async () => {
        await browser.keys("?")
        const dialog = $('[role="dialog"]')
        await dialog.waitForDisplayed()
        await expect(dialog.$(`h2=${await tr("dialogs.shortcuts.title")}`)).toBeDisplayed()
        await expect(dialog.$(`[aria-label="${await tr("shortcuts.categories.general")}"]`)).toBeDisplayed()
        await expect(dialog.$(`span=${await tr("shortcuts.items.go-home")}`)).toBeExisting()
        expect((await $$('[role="dialog"] section')).length).toBeGreaterThan(1)

        await browser.keys("Escape")
        await dialog.waitForExist({ reverse: true })
    })
})
