import fs from "node:fs"
import path from "node:path"
import { $, $$, browser, expect } from "@wdio/globals"
import {
    addTaskToGroup, byLabel, byText, createFromSidebar, createWorkspace, dataDir, domClick, groupCard, openMenuWithButton, openTemplatesDialog, openWorkspace,
    sql, templateEditorTab, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * Template editor: a template is edited as a normal note in its own tab, saved by itself; duplicate; no refresh from the
 * source note while the editor is open; the editor is reopened at startup (option "reopen notes") or, with the option
 * off, the draft is saved into the template.
 */
const WORKSPACE = "Tpl Editor Workspace"
const NOTE = "Tpl Editor Note"
const TEMPLATE = "Tpl Editor Template"
const GROUP = "Tpl Group"
const TASK_A = "Tpl task saved by itself"
const TASK_B = "Tpl task saved at restart"
const NOTE_FROM_TEMPLATE = "Tpl Note From Template"
const EMPTY_TEMPLATE = "Tpl Empty Template"
const RENAMED_TEMPLATE = "Tpl Empty Renamed"

const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

/** True when the content of the saved template contains the text. */
const templateHas = async (text: string) => {
    const rows = await sql<{ id: number }[]>(
        "select",
        "SELECT id FROM note_template WHERE name = ? AND deleted_at IS NULL AND content LIKE ?",
        [TEMPLATE, `%${text}%`],
    )
    return rows.length > 0
}

const draftCount = async () =>
    (await sql<{ n: number }[]>("select", "SELECT COUNT(*) AS n FROM note WHERE templateID IS NOT NULL"))[0].n

const closeAllDialogs = async () => {
    await browser.waitUntil(
        async () => {
            if (Array.from(await $$('[role="dialog"]')).length === 0) return true
            await browser.keys("Escape")
            return false
        },
        { timeoutMsg: "a dialog did not close", interval: 500 },
    )
}

const taskTexts = async () => {
    const label = await tr("tasks.editText")
    return browser.execute((aria: string) => Array.from(document.querySelectorAll<HTMLTextAreaElement>(`[aria-label="${aria}"]`)).map(area => area.value), label)
}

const savedStatus = async () => $(`//*[@role='status'][normalize-space()=${xpathString(await tr("templateEditor.saved"))}]`)

/** Turns the option "reopen notes at startup" on or off in the settings and waits for the preferences file. */
const setReopenNotes = async (on: boolean) => {
    await domClick(byLabel(await tr("settings.title")))
    const dialog = $('[role="dialog"]')
    await dialog.waitForDisplayed()
    await byText(await tr("settings.notes.title"), dialog).click()
    const label = xpathString(await tr("settings.notes.reopenNotes.label"))
    const toggle = $(`//*[@role="dialog"]//*[@role="switch"][@id=//label[normalize-space()=${label}]/@for]`)
    await domClick(toggle)
    await expect(toggle).toHaveAttribute("aria-checked", String(on))
    const file = path.join(await dataDir(), "settings.dat")
    const expected = new RegExp(`reopenNotes"\\s*:\\s*${on}`)
    await browser.waitUntil(
        () => { try { return expected.test(fs.readFileSync(file, "utf8")) } catch { return false } },
        { timeout: 15_000, timeoutMsg: `settings.dat does not contain reopenNotes ${on}` },
    )
    await closeAllDialogs()
}

const restart = async () => {
    await browser.reloadSession()
    await waitForApp()
    await byLabel(await tr("home.workspace.open", { name: WORKSPACE })).waitForDisplayed({ timeout: 30_000 })
}

describe("Template editor", () => {
    before(async () => {
        await waitForApp()
    })

    after(async () => {
        // The next specs expect the plain workspace: no dialog left open and the Settings button reachable
        await closeAllDialogs()
        await byLabel(await tr("settings.title")).waitForExist({ timeoutMsg: "the app is not in the workspace after the template editor spec" })
    })

    it("creates a workspace, a note and a template from it", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)

        const templates = await openTemplatesDialog()
        await openMenuWithButton(byText(await tr("dialogs.templates.new"), templates))
        await byText(await tr("dialogs.templates.newFromNote")).click()
        const search = $('[role="dialog"] [cmdk-input]')
        await search.waitForDisplayed()
        await typeInto(search, NOTE)
        await $(`//*[@cmdk-item][.//span[normalize-space()=${xpathString(NOTE)}]]`).click()
        const nameInput = $('[role="dialog"] input[name="name"]')
        await nameInput.waitForDisplayed()
        await typeInto(nameInput, TEMPLATE)
        const createDialog = $('//*[@role="dialog"][.//input[@name="name"]]')
        await byText(await tr("dialogs.createTemplate.title"), createDialog).click()
        await createDialog.waitForExist({ reverse: true })
        await expect(templates.$(`button=${TEMPLATE}`)).toBeDisplayed()
    })

    it("opens the template in a tab with Edit", async () => {
        const templates = $('[role="dialog"]')
        await templates.$(`[aria-label=${JSON.stringify(await tr("templateEditor.editAria", { name: TEMPLATE }))}]`).click()
        await templates.waitForExist({ reverse: true })
        await (await templateEditorTab(TEMPLATE)).waitForDisplayed({ timeoutMsg: "the tab of the template did not open" })
        await expect(byLabel(await tr("notes.closeCurrent"))).toBeDisplayed()
    })

    it("saves by itself what is written in the template", async () => {
        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })
        await addTaskToGroup(groupCard(GROUP), TASK_A)
        await (await savedStatus()).waitForDisplayed({ timeout: 15_000, timeoutMsg: "the draft was not marked as saved" })
    })

    it("does not allow refreshing from the source note while the editor is open", async () => {
        const templates = await openTemplatesDialog()
        await openMenuWithButton(templates.$(`[aria-label=${JSON.stringify(await tr("templateEditor.moreAria", { name: TEMPLATE }))}]`))
        const refresh = $(`//*[@role="menuitem"][contains(normalize-space(), ${xpathString(await tr("dialogs.templates.refreshFromSource"))})]`)
        await refresh.waitForDisplayed()
        await expect(refresh).toHaveAttribute("aria-disabled", "true")
        await browser.keys("Escape")
    })

    it("duplicates the template", async () => {
        const templates = $('[role="dialog"]')
        await openMenuWithButton(templates.$(`[aria-label=${JSON.stringify(await tr("templateEditor.moreAria", { name: TEMPLATE }))}]`))
        await byText(await tr("templateEditor.duplicate")).click()
        await browser.waitUntil(
            async () => (await sql<{ n: number }[]>("select", "SELECT COUNT(*) AS n FROM note_template WHERE deleted_at IS NULL AND name LIKE ?", [`${TEMPLATE}%`]))[0].n === 2,
            { timeoutMsg: "the template was not duplicated" },
        )
        await closeAllDialogs()
    })

    it("creates a note from the template with the edited content", async () => {
        const templates = await openTemplatesDialog()
        await templates.$(`[aria-label=${JSON.stringify(await tr("dialogs.templates.createNoteFrom", { name: TEMPLATE }))}]`).click()
        const noteInput = $('[role="dialog"] input[name="name"]')
        await noteInput.waitForDisplayed()
        await typeInto(noteInput, NOTE_FROM_TEMPLATE)
        const noteDialog = $('//*[@role="dialog"][.//input[@name="name"]]')
        await byText(await tr("dialogs.noteFromTemplate.submit"), noteDialog).click()
        await noteDialog.waitForExist({ reverse: true })
        await templates.waitForExist({ reverse: true })
        await treeRow(NOTE_FROM_TEMPLATE).click()
        await browser.waitUntil(async () => (await taskTexts()).includes(TASK_A), { timeoutMsg: "the note does not contain the edited task" })
    })

    it("reopens the template tab after a restart (reopen notes on)", async () => {
        // Back to the tab of the template and one more edit
        // A toast of the previous step can still cover the tab on WebKitGTK; the tab reacts to onClick, so click it through the DOM
        const tab = await templateEditorTab(TEMPLATE)
        await domClick(tab)
        await browser.waitUntil(async () => (await tab.getAttribute("aria-selected")) === "true", { timeoutMsg: "the template tab was not activated" })
        await addTaskToGroup(groupCard(GROUP), TASK_B)
        await (await savedStatus()).waitForDisplayed({ timeout: 15_000, timeoutMsg: "the second edit was not saved" })
        expect(await draftCount()).toBe(1)
        // The open tabs are written to the preferences with a debounce: wait until settings.dat lists the draft among the open tabs
        const draftId = (await sql<{ id: number }[]>("select", "SELECT id FROM note WHERE templateID IS NOT NULL"))[0].id
        const settingsFile = path.join(await dataDir(), "settings.dat")
        const openTabsHaveDraft = new RegExp(`"openIds"\\s*:\\s*\\[[^\\]]*\\b${draftId}\\b`)
        await browser.waitUntil(
            () => { try { return openTabsHaveDraft.test(fs.readFileSync(settingsFile, "utf8")) } catch { return false } },
            { timeout: 15_000, timeoutMsg: "settings.dat does not list the template tab among the open tabs" },
        )

        await restart()
        await openWorkspace(WORKSPACE)
        await (await templateEditorTab(TEMPLATE)).waitForDisplayed({ timeout: 20_000, timeoutMsg: "the template tab was not reopened" })
        await browser.waitUntil(async () => (await taskTexts()).includes(TASK_B), { timeoutMsg: "the draft lost its last edit" })
    })

    it("saves the draft into the template at restart when reopen notes is off", async () => {
        await setReopenNotes(false)
        try {
            await restart()
            await openWorkspace(WORKSPACE)
            await browser.waitUntil(templateHas.bind(null, TASK_B), { timeoutMsg: "the draft was not saved into the template" })
            await browser.waitUntil(async () => (await draftCount()) === 0, { timeoutMsg: "the draft was not deleted" })
            await expect(await templateEditorTab(TEMPLATE)).not.toBeDisplayed()
        } finally {
            // The data folder is shared by the other specs: the option goes back to its default
            await setReopenNotes(true).catch(() => undefined)
        }
    })

    it("creates an empty template by name and opens it in the editor", async () => {
        const templates = await openTemplatesDialog()
        await openMenuWithButton(byText(await tr("dialogs.templates.new"), templates))
        await byText(await tr("dialogs.templates.newEmpty")).click()
        const nameInput = $('[role="dialog"] input[name="name"]')
        await nameInput.waitForDisplayed()
        await typeInto(nameInput, EMPTY_TEMPLATE)
        const createDialog = $('//*[@role="dialog"][.//input[@name="name"]]')
        await byText(await tr("dialogs.createTemplate.title"), createDialog).click()
        await (await templateEditorTab(EMPTY_TEMPLATE)).waitForDisplayed({ timeout: 15_000, timeoutMsg: "the empty template did not open in the editor" })
        const rows = await sql<{ content: string, sourceNoteID: number | null }[]>(
            "select", "SELECT content, sourceNoteID FROM note_template WHERE name = ? AND deleted_at IS NULL", [EMPTY_TEMPLATE])
        expect(rows).toHaveLength(1)
        expect(rows[0].sourceNoteID).toBeNull()
        expect(JSON.parse(rows[0].content).groups).toEqual([])
    })

    it("renames a template by clicking its name in the list", async () => {
        const templates = await openTemplatesDialog()
        // The click goes through the DOM (no pointer events needed); the field opens focused with the name selected: type without clicking it
        await domClick(templates.$(`[aria-label=${JSON.stringify(await tr("dialogs.templates.renameAria", { name: EMPTY_TEMPLATE }))}]`))
        const input = templates.$(`input[aria-label=${JSON.stringify(await tr("common.name"))}]`)
        await input.waitForDisplayed({ timeoutMsg: "the name did not become editable" })
        await browser.waitUntil(async () => await input.isFocused(), { timeoutMsg: "the name field is not focused" })
        await browser.keys([...RENAMED_TEMPLATE])
        // WebKitWebDriver (Linux) sometimes drops the Shift of the first key ("Tpl" arrives as "tpl"): set the value through
        // the native setter plus an input event, which React picks up like typing (same fallback as typeInto)
        if (await input.getValue() !== RENAMED_TEMPLATE) {
            const element = await input
            await browser.execute((el: HTMLInputElement, text: string) => {
                Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, text)
                el.dispatchEvent(new Event("input", { bubbles: true }))
            }, element as unknown as HTMLInputElement, RENAMED_TEMPLATE)
        }
        await browser.keys("Enter")
        await browser.waitUntil(
            async () => (await sql<{ n: number }[]>("select", "SELECT COUNT(*) AS n FROM note_template WHERE name = ? AND deleted_at IS NULL", [RENAMED_TEMPLATE]))[0].n === 1,
            { timeoutMsg: "the template was not renamed" },
        )
        await closeAllDialogs()
    })
})
