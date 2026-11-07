import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { $, $$, browser } from "@wdio/globals"
import {
    byLabel, byText, domClick, hoverInsertZone, insertFields, insertZoneAbove, openContextMenu, openSubmenu, sectionCard, setLastSeenVersion, templateEditorTab, topDialog, tr,
    treeRow, typeInto, waitForApp,
} from "../helpers"
import {
    addGroup, addSection, addSubtask, addTask, applyAppearance, closeDialog, dialogEl, fillDialogName, goCategory, goHome,
    openNote, openSettings, openTaskMenu, openWs, pickColor, recover, setPanel, setSidebar, setTab, settle, submitDialog,
    showTaskDetails, taskRowAction, waitDialogGone, waitHome, type Lang, type Theme,
} from "../ui-tour/tour-kit"

/**
 * Screenshots of the documentation site (`npm run docs:screenshots`). For each language it seeds a small, realistic
 * workspace through the UI (names in that language) and saves docs/screenshots/<lang>/<name>-<theme>.png.
 * The main screens are captured in light and dark theme, menus and dialogs in light theme only.
 * A failed capture does not stop the run: it is listed at the end.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const OUT = path.join(root, "docs", "screenshots")
const FAILED = path.join(root, "e2e", "output", "docs-shots-failed")

const skipped: string[] = []
let theme: Theme = "light"
let lang: Lang = "en"

const NAMES = {
    en: {
        wsMain: "Website redesign", wsPersonal: "Personal", wsHome: "Home renovation",
        folderPlan: "Planning", folderMeet: "Meetings",
        noteMain: "Roadmap", noteLaunch: "Launch checklist", noteSync: "Weekly sync",
        groupLaunch: "Launch", groupBacklog: "Backlog",
        secDesign: "Design", secDev: "Development", secDone: "Done", secIdeas: "Ideas",
        tPalette: "Define the brand palette", tMockups: "Create the mockups", tIcons: "Review the icons",
        tLogin: "Implement the login", tOauth: "Add OAuth providers", tReset: "Add password reset", tCi: "Set up CI",
        tBlog: "Publish the launch post", tIdea: "Dark mode for the website", tOld: "Old banner", tTemp: "Draft notes",
        description: "Sign in with email and password, or with an OAuth provider.\nKeep the session across restarts.",
        template: "Project template",
    },
    it: {
        wsMain: "Restyling del sito", wsPersonal: "Personale", wsHome: "Ristrutturazione casa",
        folderPlan: "Pianificazione", folderMeet: "Riunioni",
        noteMain: "Roadmap", noteLaunch: "Checklist del lancio", noteSync: "Riunione settimanale",
        groupLaunch: "Lancio", groupBacklog: "Backlog",
        secDesign: "Design", secDev: "Sviluppo", secDone: "Fatto", secIdeas: "Idee",
        tPalette: "Definire la palette del brand", tMockups: "Creare i mockup", tIcons: "Rivedere le icone",
        tLogin: "Implementare il login", tOauth: "Aggiungere i provider OAuth", tReset: "Aggiungere il reset della password", tCi: "Configurare la CI",
        tBlog: "Pubblicare l'articolo del lancio", tIdea: "Tema scuro per il sito", tOld: "Vecchio banner", tTemp: "Appunti in bozza",
        description: "Accesso con email e password, o con un provider OAuth.\nLa sessione resta attiva dopo il riavvio.",
        template: "Modello di progetto",
    },
} as const

const noToasts = () => browser.waitUntil(
    () => browser.execute(() => document.querySelectorAll("[data-sonner-toast]").length === 0),
    { timeout: 10_000 },
).catch(() => undefined)

const shot = async (name: string, wait = 400) => {
    await noToasts()
    await settle(wait)
    const file = path.join(OUT, lang, `${name}-${theme}.png`)
    await browser.saveScreenshot(file)
    console.log(`[docs-shots] ${lang}/${name}-${theme}.png`)
}

/** Screenshot of one element only (a bar), saved as <name>-<theme>.png. */
const shotOf = async (name: string, element: ReturnType<typeof $>, wait = 400) => {
    await noToasts()
    await settle(wait)
    await element.saveScreenshot(path.join(OUT, lang, `${name}-${theme}.png`))
    console.log(`[docs-shots] ${lang}/${name}-${theme}.png`)
}

const attempt = async (label: string, fn: () => Promise<void>) => {
    try {
        await fn()
    } catch (error) {
        const message = (error as Error).message.split("\n")[0]
        skipped.push(`${lang}/${theme} ${label}: ${message}`)
        console.log(`[docs-shots] SKIPPED ${label}: ${message}`)
        // What the app showed when the capture failed, to debug it
        fs.mkdirSync(FAILED, { recursive: true })
        await browser.saveScreenshot(path.join(FAILED, `${lang}-${theme}-${label.replace(/\W+/g, "-")}.png`)).catch(() => undefined)
        await recover()
    }
}

const setAppearance = async (nextTheme: Theme, nextLang: Lang) => {
    await applyAppearance(nextTheme, nextLang)
    theme = nextTheme
    lang = nextLang
}

const taskArea = async (text: string) => {
    const label = await tr("tasks.editText")
    for (const candidate of await $$(`[aria-label="${label}"]`)) if ((await candidate.getValue()) === text) return candidate.getElement()
    throw new Error(`task "${text}" not found`)
}
const footerButton = async (key: string) => $(`//button[.//span[normalize-space()='${await tr(key)}']]`)
/** Parks the pointer on an empty part of the window, so that no hover state or tooltip is captured. */
const parkMouse = () => browser.action("pointer").move({ x: 900, y: 820, origin: "viewport" }).perform()
const blur = () => browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

const createWorkspace = async (name: string) => {
    await byText(await tr("home.createWorkspace.open")).click()
    await typeInto($('[role="dialog"] input[name="name"]'), name)
    await $('[role="dialog"] button[type="submit"]').click()
    await waitDialogGone()
    await byLabel(await tr("home.workspace.open", { name })).waitForDisplayed()
}

const colorWorkspace = async (name: string, colour: string, afterOpen?: () => Promise<void>) => {
    const menu = await openContextMenu(byLabel(await tr("home.workspace.open", { name })))
    await pickColor(menu, colour, afterOpen)
    await recover()
}

/** Picks an option of a Radix select inside the automations dialog (as in the automations spec). */
const choose = async (dialog: ReturnType<typeof $>, label: string, option: string, index = 0) => {
    const trigger = (await dialog.$$(`[aria-label=${JSON.stringify(label)}]`))[index]
    await domClick(trigger as unknown as ReturnType<typeof $>)
    const item = $(`//*[@role='option'][normalize-space()=${xpathString(option)}]`)
    await item.waitForDisplayed()
    await domClick(item)
    await item.waitForExist({ reverse: true })
}

/** Light and dark screens of the open workspace: note with both panels and a selected task. */
const captureWorkspace = async (n: (typeof NAMES)[Lang]) => {
    await attempt("workspace", async () => {
        await openWs(n.wsMain)
        await openNote(n.noteMain)
        await setSidebar(true)
        await setPanel(true)
        await setTab("details")
        await blur()
        await shot("workspace")
        await showTaskDetails(n.tLogin)
        await settle(600)
        await shot("task-details")
        await goHome()
    })
}

const tourFor = async (nextLang: Lang) => {
    const n = NAMES[nextLang]
    fs.mkdirSync(path.join(OUT, nextLang), { recursive: true })
    await setAppearance("light", nextLang)
    await waitHome()

    /* ---------------------------------------------------------------- home */
    await attempt("home-empty", async () => { await shot("home-empty") })
    await attempt("create-workspace-dialog", async () => {
        await byText(await tr("home.createWorkspace.open")).click()
        const dialog = $('[role="dialog"]')
        await dialog.waitForDisplayed()
        await typeInto(dialog.$('input[name="name"]'), n.wsMain)
        await shot("create-workspace-dialog")
        await dialog.$('button[type="submit"]').click()
        await waitDialogGone()
    })
    if (!(await byLabel(await tr("home.workspace.open", { name: n.wsMain })).isExisting())) await createWorkspace(n.wsMain)
    await createWorkspace(n.wsPersonal)
    await createWorkspace(n.wsHome)
    await attempt("workspace colors", async () => {
        await colorWorkspace(n.wsPersonal, "#3cb44b")
        await colorWorkspace(n.wsHome, "#f58231")
        await colorWorkspace(n.wsMain, "#4363d8", async () => { await shot("home-workspace-menu") })
    })

    /* ---------------------------------------------------------------- sidebar: folders and notes */
    await openWs(n.wsMain)
    await setSidebar(true)
    for (const folder of [n.folderPlan, n.folderMeet]) {
        await byLabel(await tr("sidebar.addFolder")).click()
        await fillDialogName(folder)
        await submitDialog()
        await treeRow(folder).waitForDisplayed()
    }
    await byLabel(await tr("sidebar.addNote")).click()
    await fillDialogName(n.noteMain)
    await attempt("new-note-dialog", async () => { await shot("new-note-dialog") })
    await submitDialog()
    for (const [folder, note] of [[n.folderPlan, n.noteLaunch], [n.folderMeet, n.noteSync]] as const) {
        const menu = await openContextMenu(treeRow(folder))
        await byText(await tr("menu.newNote"), menu).click()
        await fillDialogName(note)
        await submitDialog()
        await treeRow(note).waitForDisplayed()
    }
    await attempt("folder-menu", async () => {
        const menu = await openContextMenu(treeRow(n.folderPlan))
        await pickColor(menu, "#911eb4", async () => { await shot("folder-menu") })
    })
    await recover()

    await attempt("note-empty", async () => {
        await openNote(n.noteSync)
        await shot("note-empty")
    })

    /* ---------------------------------------------------------------- the main note */
    await openNote(n.noteMain)
    await addGroup(n.groupLaunch)
    await addSection(n.secDesign)
    await addSection(n.secDev)
    await addSection(n.secDone)
    await addGroup(n.groupBacklog)
    await addSection(n.secIdeas)

    await addTask(n.secDesign, n.tPalette)
    await addTask(n.secDesign, n.tMockups)
    await addTask(n.secDesign, n.tIcons)
    await addTask(n.secDev, n.tLogin)
    await addTask(n.secDev, n.tCi)
    await addTask(n.secDone, n.tBlog)
    await addSubtask(n.tLogin, n.tOauth)
    await addSubtask(n.tLogin, n.tReset)
    // The note list is virtualized: the tasks at the bottom are handled while they are on screen
    await addTask(n.secIdeas, n.tIdea)
    await addTask(n.secIdeas, n.tOld)
    await addTask(n.secIdeas, n.tTemp)
    await attempt("archive-task", async () => {
        const menu = await openTaskMenu(n.tOld)
        await byText(await tr("menu.archive"), menu).click()
        await settle(500)
    })
    await recover()
    await attempt("delete-task", async () => {
        const menu = await openTaskMenu(n.tTemp)
        await byText(await tr("common.delete"), menu).click()
        const confirm = await topDialog()
        await byText(await tr("dialogs.delete.confirm"), confirm).click()
        await waitDialogGone()
    })
    await recover()

    await taskRowAction(n.tPalette, '[role="checkbox"]')
    await taskRowAction(n.tReset, '[role="checkbox"]')
    await taskRowAction(n.tBlog, '[role="checkbox"]')
    await settle(300)

    await attempt("task-menu", async () => {
        const menu = await openTaskMenu(n.tMockups)
        await shot("task-menu")
        await byText(await tr("tasks.menu.addPriority"), menu).click()
        await settle(400)
    })
    await recover()
    await attempt("task-color", async () => {
        const menu = await openTaskMenu(n.tIcons)
        await pickColor(menu, "#f032e6", async () => { await shot("task-color") })
    })
    await recover()
    await attempt("task-description", async () => {
        const menu = await openTaskMenu(n.tLogin)
        await byText(await tr("tasks.menu.addDescription"), menu).click()
        const dialog = $('[role="dialog"]')
        await dialog.waitForDisplayed()
        await dialog.$("textarea").setValue(n.description)
        await shot("task-description")
        await byText(await tr("common.save"), dialog).click()
        await waitDialogGone()
    })
    await recover()
    await attempt("group-menu", async () => {
        const menu = await openContextMenu(byText(n.groupLaunch))
        await shot("group-menu")
        await pickColor(menu, "#3cb44b")
    })
    await recover()
    await attempt("section-menu", async () => {
        const header = sectionCard(n.secDone).$(`button[title=${JSON.stringify(n.secDone)}]`)
        const menu = await openContextMenu(header)
        await shot("section-menu")
        await pickColor(menu, "#4363d8")
    })
    await recover()
    await attempt("path-bar", async () => {
        await blur()
        // The row of the bar: the path on the left, the buttons (new group, search, hide completed) on the right
        await shotOf("path-bar", $(`nav[aria-label=${JSON.stringify(await tr("notes.path.label"))}]`).$(".."))
    })
    await recover()
    await attempt("task-insert-line", async () => {
        const zone = await insertZoneAbove(n.tMockups)
        await hoverInsertZone(zone)
        await shot("task-insert-line", 200)
        await zone.$("button").click()
        await browser.waitUntil(async () => (await insertFields()).length === 1, { timeoutMsg: "the insert field did not open" })
        await shot("task-insert-field", 200)
        await browser.keys("Escape")
    })
    await recover()
    await attempt("task-selection", async () => {
        for (const text of [n.tMockups, n.tIcons, n.tCi]) {
            const area = await taskArea(text)
            await browser.execute((el: HTMLElement) => {
                const row = el.closest("[data-task-id]") as HTMLElement
                row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }))
            }, area as unknown as HTMLElement)
        }
        await parkMouse()
        await shot("task-selection")
        await browser.keys("Escape")
    })
    await recover()
    await attempt("task-keyboard", async () => {
        await browser.execute((aria: string, value: string) => {
            const area = Array.from(document.querySelectorAll<HTMLTextAreaElement>(`textarea[aria-label="${aria}"]`)).find((a) => a.value === value)
            ;(area?.closest("[role='treeitem']") as HTMLElement | null)?.focus()
        }, await tr("tasks.editText"), n.tMockups)
        // A key press makes the focus ring visible, as for a user on the keyboard
        await browser.keys("ArrowDown")
        await browser.keys("ArrowUp")
        await parkMouse()
        await shot("task-keyboard")
    })
    await recover()    // The history is per session of the workspace: it is captured now, before leaving it
    await attempt("history", async () => {
        await setPanel(true)
        await setTab("history")
        await blur()
        await shot("history")
        await setTab("details")
    })
    await recover()
    await attempt("note-background", async () => {
        const menu = await openContextMenu($('[data-testid="note-background"]'))
        await pickColor(menu, "#4363d8", undefined, "menu.noteBackground")
        await recover()
        // The background is applied: reopen the menu with the submenu open for the capture
        const again = await openContextMenu($('[data-testid="note-background"]'))
        const swatch = byLabel(await tr("dialogs.color.swatch", { color: await tr("common.colors.c4") }))
        await openSubmenu(again, await tr("menu.noteBackground"), swatch)
        await shot("note-background")
        await browser.keys(["Escape"])
        await recover()
        await browser.keys(["Control", "z"])    // Back to no background for the other captures
        await settle(400)
    })
    await recover()

    /* ---------------------------------------------------------------- templates, automations, dialogs */
    await attempt("create-template", async () => {
        const menu = await openContextMenu(treeRow(n.noteMain))
        await byText(await tr("menu.createTemplate"), menu).click()
        const dialog = $('[role="dialog"]')
        await dialog.waitForDisplayed()
        await typeInto(dialog.$('input[name="name"]'), n.template)
        await shot("create-template")
        await dialog.$('button[type="submit"]').click()
        await waitDialogGone()
    })
    await recover()
    await attempt("note-menu", async () => {
        await openContextMenu(treeRow(n.noteMain))
        await shot("note-menu")
    })
    await recover()
    await attempt("automations", async () => {
        const menu = await openContextMenu(treeRow(n.noteMain))
        await byText(await tr("automations.menu"), menu).click()
        const dialog = $(`//*[@role='dialog'][.//h2[normalize-space()=${xpathString(await tr("automations.title"))}]]`)
        await dialog.waitForDisplayed()
        await dialog.$("[role='status']").waitForExist({ reverse: true })
        await byText(await tr("automations.add"), dialog).click()
        await choose(dialog, await tr("automations.where"), n.secDev)
        await shot("automation-editor")
        await domClick(dialog.$(`.//*[@data-slot='dialog-footer']//button[normalize-space()=${xpathString(await tr("automations.next"))}]`))
        await settle(300)
        await choose(dialog, await tr("automations.actions.moveTo"), n.secDone)
        await domClick(dialog.$(`.//*[@data-slot='dialog-footer']//button[normalize-space()=${xpathString(await tr("automations.next"))}]`))
        await settle(300)
        await dialog.$(`.//*[@data-slot='dialog-footer']//button[normalize-space()=${xpathString(await tr("common.save"))}]`).click()
        await dialog.$(`h2=${await tr("automations.title")}`).waitForDisplayed()
        await shot("automations")
        await closeDialog()
    })
    await recover()
    await attempt("trash", async () => {
        await (await footerButton("trash.title")).click()
        await dialogEl().waitForDisplayed()
        await shot("trash")
        await closeDialog()
    })
    await recover()
    await attempt("archive", async () => {
        await (await footerButton("archive.title")).click()
        await dialogEl().waitForDisplayed()
        await shot("archive")
        await closeDialog()
    })
    await recover()
    await attempt("templates", async () => {
        await (await footerButton("dialogs.templates.title")).click()
        await dialogEl().waitForDisplayed()
        await shot("templates")
        await closeDialog()
    })
    await recover()
    await attempt("template-editor", async () => {
        await (await footerButton("dialogs.templates.title")).click()
        const dialog = dialogEl()
        await dialog.waitForDisplayed()
        await dialog.$(`[aria-label=${JSON.stringify(await tr("templateEditor.editAria", { name: n.template }))}]`).click()
        await dialog.waitForExist({ reverse: true })
        await (await templateEditorTab(n.template)).waitForDisplayed()
        await byLabel(await tr("menu.newGroup")).waitForDisplayed()
        await blur()
        await parkMouse()
        await shot("template-editor", 1500)
        await byLabel(await tr("notes.closeCurrent")).click()
        await (await templateEditorTab(n.template)).waitForDisplayed({ reverse: true })
    })
    await recover()
    await attempt("note-search", async () => {        await blur()
        await browser.keys(["Control", "k"])
        await dialogEl().waitForDisplayed()
        await shot("note-search")
        await closeDialog()
    })
    await recover()
    await attempt("shortcuts", async () => {
        await blur()
        await browser.keys("?")
        await dialogEl().waitForDisplayed()
        await shot("shortcuts")
        await closeDialog()
    })
    await recover()
    await attempt("app-menu", async () => {
        await $(`//*[@role='menubar']//button[normalize-space()='${await tr("appMenu.file")}']`).click()
        await $('[role="menu"]').waitForDisplayed()
        await shot("app-menu")
    })
    await recover()
    await goHome()

    /* ---------------------------------------------------------------- main screens, settings */
    await attempt("home", async () => {
        await $("h1").moveTo()
        await shot("home")
        await byLabel(await tr("home.viewList")).click()
        await $("h1").moveTo()
        await shot("home-list")
        await byLabel(await tr("home.viewGrid")).click()
        await $("h1").moveTo()
    })
    await captureWorkspace(n)
    await attempt("settings", async () => {
        await openSettings()
        for (const id of ["appearance", "notes", "audio", "shortcuts", "data", "system", "about"]) {
            await attempt(`settings-${id}`, async () => {
                await goCategory(id)
                if (id === "data") {
                    await byText(await tr("settings.data.backup.now.button")).click()
                    await settle(1200)
                }
                await shot(`settings-${id}`)
            })
        }
        await closeDialog()
    })

    await setAppearance("dark", nextLang)
    await attempt("home dark", async () => {
        await $("h1").moveTo()
        await shot("home")
    })
    await captureWorkspace(n)
    await attempt("settings dark", async () => {
        await openSettings()
        await goCategory("appearance")
        await shot("settings-appearance")
        await closeDialog()
    })

    /* ---------------------------------------------------------------- What's new tab (after an update) */
    await attempt("whats-new", async () => {
        await setLastSeenVersion("0.0.1")
        await browser.reloadSession()
        await waitForApp()
        await setAppearance("light", nextLang)
        await openWs(n.wsMain)
        await $('[role="tab"][data-note-id="-1"]').waitForDisplayed({ timeout: 20_000 })
        await shot("whats-new")
        await setAppearance("dark", nextLang)
        await $('[role="tab"][data-note-id="-1"]').waitForDisplayed()
        await shot("whats-new")
    })

    /* ---------------------------------------------------------------- clean up for the next language */
    await goHome()
    await setAppearance("light", nextLang)
    for (const name of [n.wsMain, n.wsPersonal, n.wsHome]) {
        const menu = await openContextMenu(byLabel(await tr("home.workspace.open", { name })))
        await byText(await tr("common.delete"), menu).click()
        const confirm = await topDialog()
        await byText(await tr("dialogs.delete.confirm"), confirm).click()
        await waitDialogGone()
    }
}

describe("Docs screenshots", () => {
    before(async () => {
        for (const l of ["en", "it"]) fs.rmSync(path.join(OUT, l), { recursive: true, force: true })
        await waitForApp()
        await byLabel(await tr("settings.title")).waitForDisplayed({ timeout: 30_000 })
        await browser.setWindowSize(1440, 900)
        await settle(800)
    })

    it("English", async () => { await tourFor("en") })
    it("Italian", async () => { await tourFor("it") })

    after(() => {
        if (skipped.length) console.log(`[docs-shots] skipped:
${skipped.map((s) => `  - ${s}`).join("\n")}`)
        else console.log("[docs-shots] nothing skipped")
    })
})
