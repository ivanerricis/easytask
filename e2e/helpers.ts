import fs from "node:fs"
import path from "node:path"
import { $, $$, browser } from "@wdio/globals"
import type { ChainablePromiseElement } from "webdriverio"
import { en } from "../src/i18n/locales/en"
import { it as itLocale } from "../src/i18n/locales/it"

type Vars = Record<string, string | number>

/**
 * The app follows the language of the system (default), so the specs read the language the UI is
 * currently using (<html lang>) and look the labels up in the very same locale files the app ships.
 */
export const currentLang = async (): Promise<"it" | "en"> =>
    (await browser.execute(() => document.documentElement.lang)) === "it" ? "it" : "en"

export const trIn = (lang: "it" | "en", key: string, vars: Vars = {}): string => {
    let node: unknown = lang === "it" ? itLocale : en
    for (const part of key.split(".")) node = (node as Record<string, unknown>)?.[part]
    if (typeof node !== "string") throw new Error(`Missing translation "${key}" (${lang})`)
    return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ""))
}

/** Translates a key in the language currently shown by the UI. */
export const tr = async (key: string, vars: Vars = {}): Promise<string> => trIn(await currentLang(), key, vars)

const cssString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

/** Element by its accessible name (aria-label). */
export const byLabel = (label: string) => $(`[aria-label=${cssString(label)}]`)

/** The language select of Settings > Appearance: a combobox tied (label for=id) to the label of its row, in the current language. */
const languageSelect = async () =>
    $(`//button[@role='combobox'][@id=//label[normalize-space()=${xpathString(await tr("settings.appearance.language.label"))}]/@for]`)

/**
 * The label of the language selected in the select of Settings > Appearance. It opens the list and reads the checked option
 * (the text shown by the closed select is empty for the WebKitGTK driver), then closes the list.
 */
export const selectedLanguage = async (): Promise<string> => {
    await (await languageSelect()).click()
    const listbox = $("[role='listbox']")
    await listbox.waitForDisplayed({ timeoutMsg: "the language list did not open" })
    const label: string = await browser.execute(() =>
        (Array.from(document.querySelectorAll("[role='option']")).find(option => option.getAttribute("data-state") === "checked")?.textContent ?? "").trim(),
    )
    await browser.keys("Escape")
    await listbox.waitForExist({ reverse: true, timeoutMsg: "the language list did not close" })
    return label
}

/**
 * Picks a language in the select of Settings > Appearance, by the label of its option ("Italiano", "English", the translated
 * "System"). It moves with the keyboard (the highlighted option starts on the selected one): a click on an option is not
 * reliable on WebKitGTK, where the pointer events of the list differ.
 */
export const chooseLanguage = async (label: string) => {
    await (await languageSelect()).click()
    const listbox = $("[role='listbox']")
    await listbox.waitForDisplayed({ timeoutMsg: "the language list did not open" })
    // The keys go to the list only once an option has the focus (Radix marks it with data-highlighted)
    await browser.waitUntil(
        async () => await browser.execute(() => document.querySelector("[role='option'][data-highlighted]") !== null),
        { timeoutMsg: "no language option got the focus" },
    )
    const labels: string[] = await browser.execute(() =>
        Array.from(document.querySelectorAll("[role='option']")).map(option => (option.textContent ?? "").trim()),
    )
    const selected: number = await browser.execute(() =>
        Array.from(document.querySelectorAll("[role='option']")).findIndex(option => option.getAttribute("data-state") === "checked"),
    )
    const target = labels.indexOf(label)
    if (target < 0) throw new Error(`No language option "${label}" (found: ${labels.join(", ")})`)
    const key = target > selected ? "ArrowDown" : "ArrowUp"
    for (let step = 0; step < Math.abs(target - selected); step++) await browser.keys(key)
    await browser.keys("Enter")
    // The list closes with an animation: an Escape pressed before it is gone would only close the list
    await listbox.waitForExist({ reverse: true, timeoutMsg: "the language list did not close" })
}

/** Button (or any element) whose visible text is exactly `text`, optionally inside `scope`. */
export const byText = (text: string, scope?: ChainablePromiseElement | WebdriverIO.Element) =>
    (scope ?? $("body")).$(`.//*[self::button or @role='button' or @role='radio' or @role='menuitem' or @role='menuitemradio' or @role='tab'][normalize-space()=${xpathString(text)}]`)

/**
 * The "add task" button of a section card (it is a "+" icon with an aria-label). The input that replaces
 * it carries the same label, so only buttons are matched.
 */
const addTaskButton = async (scope: ChainablePromiseElement | WebdriverIO.Element) =>
    scope.$(`button[aria-label="${await tr("tasks.add")}"]`)

/**
 * The "..." menu button inside `scope`: labelled "Menu: <name>" when the item has a name, "Apri menu" otherwise.
 */
export const menuButtonPredicate = async (): Promise<string> => {
    const prefix = (await tr("common.menuOf", { name: "" })).trim()
    return `@aria-label=${xpathString(await tr("common.openMenu"))} or starts-with(@aria-label, ${xpathString(prefix)})`
}

export const menuButton = async (scope: ChainablePromiseElement | WebdriverIO.Element) =>
    scope.$(`.//button[${await menuButtonPredicate()}]`)

export const topDialog = async () => {
    const dialogs = Array.from(await $$('[role="dialog"], [role="alertdialog"]'))
    return dialogs[dialogs.length - 1]
}

export const waitForApp = async () => {
    await browser.waitUntil(
        async () => (await browser.execute(() => document.getElementById("root")?.childElementCount ?? 0)) > 0,
        { timeout: 60_000, timeoutMsg: "the app UI did not render" },
    )
}

/** Fills a text input and waits until the value is the one typed. */
export const typeInto = async (input: ChainablePromiseElement, value: string) => {
    await input.waitForDisplayed()
    // Something can still cover the field (a closing dialog, a toast): wait a moment, then report what is on top
    try {
        await input.click()
    } catch (error) {
        await input.waitForClickable({ timeout: 2_000 }).catch(() => undefined)
        await input.click().catch(async () => {
            const covering = await browser.execute((el: HTMLElement) => {
                const rect = el.getBoundingClientRect()
                const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
                return top ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 80)} [${top.getAttribute("data-slot") ?? ""}]` : "nothing"
            }, input as unknown as HTMLElement)
            throw new Error(`typeInto: the field is covered by ${covering} (${String(error)})`)
        })
    }
    await input.setValue(value)
    // WebKitWebDriver (Linux) sometimes drops the Shift of the first key ("Auto" arrives as "auto"): the value is then set
    // through the native setter plus an input event, which React picks up like typing
    if (await input.getValue() !== value) {
        const element = await input
        await browser.execute((el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, text)
            el.dispatchEvent(new Event("input", { bubbles: true }))
        }, element as unknown as HTMLInputElement, value)
    }
}

/**
 * Creates a workspace from the home page and checks that it shows up in the list.
 * The click on the button is repeated when the dialog does not open: right after the start the home page can still be
 * drawing itself (the button is replaced under the click), which happened now and then in the Linux job of the CI.
 */
export const createWorkspace = async (name: string) => {
    const open = byText(await tr("home.createWorkspace.open"))
    const dialog = $('[role="dialog"]')
    for (let attempt = 1; attempt <= 3; attempt++) {
        await open.waitForClickable()
        await open.click()
        const shown = await dialog.waitForDisplayed({ timeout: attempt < 3 ? 4_000 : 10_000 }).then(() => true, () => false)
        if (shown) break
    }
    await dialog.waitForDisplayed({ timeoutMsg: "the create workspace dialog did not open" })
    await typeInto(dialog.$('input[name="name"]'), name)
    await byText(await tr("home.createWorkspace.title"), dialog).click()
    await dialog.waitForExist({ reverse: true })
    await byLabel(await tr("home.workspace.open", { name })).waitForDisplayed()
}

export const openWorkspace = async (name: string) => {
    await byLabel(await tr("home.workspace.open", { name })).click()
    await byLabel(await tr("sidebar.addNote")).waitForDisplayed({ timeout: 20_000 })
}

/** Creates an item from a sidebar dialog (folder or note): the button opens a dialog with a "name" field. */
export const createFromSidebar = async (buttonKey: string, submitKey: string, name: string) => {
    await byLabel(await tr(buttonKey)).click()
    const dialog = $('[role="dialog"]')
    await dialog.waitForDisplayed()
    await typeInto(dialog.$('input[name="name"]'), name)
    await byText(await tr(submitKey), dialog).click()
    await dialog.waitForExist({ reverse: true })
}

/** Sidebar tree row (folder or note) with the given name. */
export const treeRow = (name: string) =>
    $(`//div[@role='treeitem'][.//span[normalize-space()=${xpathString(name)}]]`)

/** The card of a section, found through the title of its header. */
export const sectionCard = (title: string) =>
    $(`//div[@data-section-card][.//button[@title=${xpathString(title)}]]`)

/** Right click on an element and return the (last) open menu. */
export const openContextMenu = async (target: ChainablePromiseElement) => {
    await target.scrollIntoView()
    await target.click({ button: "right" })
    const menu = $('[role="menu"]')
    await menu.waitForDisplayed({ timeoutMsg: "the context menu did not open" })
    return menu
}

/**
 * Opens the menu of an item with its "..." button and returns it. WebKitWebDriver sometimes focuses the button without
 * delivering the pointer press the menu opens on (the Linux CI), so when the button is not expanded after the click it is
 * opened with the keyboard instead, which works on every backend.
 */
export const openMenuWithButton = async (button: ChainablePromiseElement) => {
    await button.click()
    const expanded = await browser
        .waitUntil(async () => (await button.getAttribute("aria-expanded")) === "true", { timeout: 2_000 })
        .then(() => true, () => false)
    if (!expanded) {
        await browser.execute((el: HTMLElement) => el.focus(), (await button.getElement()) as unknown as HTMLElement)
        await browser.keys("Enter")
    }
    const menu = $('[role="menu"]')
    await menu.waitForDisplayed({ timeoutMsg: "the item menu did not open" })
    return menu
}

/**
 * Opens a Radix submenu in a way that works on every WebDriver backend: the hover that normally opens it is not
 * reliably dispatched by WebKitGTK, so click the trigger and, if the item is still not there, focus it and press
 * ArrowRight. Resolves when `item` is displayed.
 */
export const openSubmenu = async (
    menu: ChainablePromiseElement | WebdriverIO.Element,
    triggerText: string,
    item: ChainablePromiseElement,
) => {
    const text = xpathString(triggerText)
    const trigger = menu.$(`.//*[@role='menuitem' and @aria-haspopup='menu'][normalize-space()=${text}]`)
    await trigger.waitForDisplayed({ timeoutMsg: `the submenu trigger "${triggerText}" is not shown` })
    await trigger.click()
    if (await item.waitForDisplayed({ timeout: 4_000 }).then(() => true, () => false)) return
    // Resolve the element first: WebKitGTK does not serialise an unresolved chainable promise as a DOM node
    const element = (await trigger.getElement()) as unknown as HTMLElement
    await browser.execute((el: HTMLElement) => el.focus(), element)
    await browser.keys("ArrowRight")
    await item.waitForDisplayed({ timeoutMsg: `the submenu "${triggerText}" did not open` })
}

/**
 * Clicks through the DOM: on WebKitGTK a tooltip left open by the previous step can cover the target and make a
 * WebDriver click fail with "element click intercepted".
 */
export const domClick = async (element: ChainablePromiseElement) => {
    const resolved = (await element.getElement()) as unknown as HTMLElement
    await browser.execute((el: HTMLElement) => el.click(), resolved)
}

export type Rgba = { r: number; g: number; b: number; a: number }

/**
 * A computed CSS color of an element (any syntax the webview returns: rgb, oklch, color-mix...) as sRGB, resolved
 * by painting it on a 1x1 canvas. `property` is a CSS property name such as "color" or "border-top-color".
 */
export const cssColor = async (element: ChainablePromiseElement, property: string): Promise<Rgba> => {
    const resolved = (await element.getElement()) as unknown as HTMLElement
    return browser.execute((el: HTMLElement, prop: string) => {
        const value = getComputedStyle(el).getPropertyValue(prop)
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = value
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
        return { r, g, b, a: a / 255 }
    }, resolved, property)
}

/** `top` painted over `bottom` (alpha compositing); `bottom` is taken as opaque. */
export const compose = (top: Rgba, bottom: Rgba): Rgba => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
})

const luminance = ({ r, g, b }: Rgba) => {
    const channel = (value: number) => {
        const v = value / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.x contrast ratio (1-21) between two opaque colors. */
export const contrastRatio = (a: Rgba, b: Rgba): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}

/**
 * The opaque background an element is really painted on: the first non-transparent computed background walking up
 * the ancestors (translucent layers are composed over what is below them), white if nothing is opaque.
 */
export const backgroundOf = async (element: ChainablePromiseElement): Promise<Rgba> => {
    const resolved = (await element.getElement()) as unknown as HTMLElement
    const layers = await browser.execute((el: HTMLElement) => {
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!
        const out: { r: number; g: number; b: number; a: number }[] = []
        for (let node: HTMLElement | null = el; node; node = node.parentElement) {
            ctx.clearRect(0, 0, 1, 1)
            ctx.fillStyle = getComputedStyle(node).backgroundColor
            ctx.fillRect(0, 0, 1, 1)
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
            if (a > 0) out.push({ r, g, b, a: a / 255 })
            if (a === 255) break
        }
        return out
    }, resolved)
    return layers.reduceRight<Rgba>((below, layer) => compose(layer, below), { r: 255, g: 255, b: 255, a: 1 })
}

/** Runs `fn` with the app in the given theme (class `dark` on <html>) and restores the previous state. */
export const inTheme = async <T>(theme: "light" | "dark", fn: () => Promise<T>): Promise<T> => {
    const was = await browser.execute(() => document.documentElement.classList.contains("dark"))
    await browser.execute((dark: boolean) => document.documentElement.classList.toggle("dark", dark), theme === "dark")
    try {
        return await fn()
    } finally {
        await browser.execute((dark: boolean) => document.documentElement.classList.toggle("dark", dark), was)
    }
}

/** Folder of the app data (database, backups), as the Rust command `data_dir` reports it. */
export const dataDir = (): Promise<string> =>
    browser.executeAsync((done: (value: string) => void) => {
        const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: unknown) => Promise<string> } }).__TAURI_INTERNALS__
        void internals.invoke("data_dir").then(done)
    })

/** Path of the SQLite database for the sql plugin ("sqlite:<dir>/easytask.db"). */
const dbUrl = async (): Promise<string> => {
    const dir = await dataDir()
    return `sqlite:${dir}${dir.includes("\\") ? "\\" : "/"}easytask.db`
}

/** Runs a statement through the sql plugin of the page (`select` returns rows, otherwise the result of execute). */
export const sql = async <T = unknown>(kind: "select" | "execute", query: string, values: unknown[] = []): Promise<T> =>
    browser.executeAsync(
        (db: string, action: string, text: string, params: unknown[], done: (value: unknown) => void) => {
            const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__
            void internals.invoke("plugin:sql|load", { db })
                .then(() => internals.invoke(`plugin:sql|${action}`, { db, query: text, values: params }))
                .then(done, (error: unknown) => done({ error: String(error) }))
        },
        await dbUrl(), kind, query, values,
    ) as Promise<T>

/**
 * The card of a group, found through the label of its header (its name, or "Gruppo N" when it has none).
 * The header button carries the name as its title and says "<Group name>: <label>, press Enter to rename" as its
 * accessible name (groups.renameAria), so it is matched by the title or by the label inside that sentence.
 */
export const groupCard = (label: string) =>
    $(`//div[@data-group-card][.//button[@title=${xpathString(label)} or contains(@aria-label, ${xpathString(`: ${label},`)})]]`)

/**
 * Creates a section from the menu of a group (there is no section button in the group): right click on its header,
 * "Nuova sezione", then the name in the inline field. Resolves once the section card is shown.
 */
export const newSectionInGroup = async (group: ChainablePromiseElement | WebdriverIO.Element, title: string) => {
    // The first button with aria-expanded of the card is the chevron of the group header
    const menu = await openContextMenu(group.$("button[aria-expanded]"))
    await byText(await tr("sections.new"), menu).click()
    await typeInto(byLabel(await tr("sections.titleLabel")), title)
    await browser.keys("Enter")
    await sectionCard(title).waitForDisplayed({ timeoutMsg: `section ${title} not created` })
}

/** The area of the tasks created directly in a group (the list sits among its sections where the user placed it, on top by default). */
export const directTasks = (group: ChainablePromiseElement | WebdriverIO.Element) => group.$("[data-direct-tasks]")

/** The dashed "Nuovo task" button of a group: it adds a task to the direct area (found by its visible text, it has no aria-label). */
export const groupAddTaskButton = async (group: ChainablePromiseElement | WebdriverIO.Element) =>
    directTasks(group).$(`.//button[normalize-space()=${xpathString(await tr("groups.addTask"))}]`)

/**
 * Closes the field of a new task. It stays open after saving (preference "keep adding tasks") and takes the focus back
 * only when the task is saved, so wait for that before pressing Esc.
 */
export const closeTaskInput = async () => {
    await browser.waitUntil(
        async () => browser.execute(() => { const el = document.activeElement; return el instanceof HTMLInputElement && el.value === "" }),
        { timeout: 5_000, timeoutMsg: "the new task field did not take the focus back" },
    )
    await browser.keys("Escape")
}
/**
 * Adds a task to a section (or to the card `scope` that holds the "+" button): opens the field, types `text` and confirms
 * with Enter (the field has no buttons). It leaves the field closed: it stays open after saving (preference "keep adding
 * tasks"), so it waits for the saved task and then closes it with Esc.
 */
export const addTaskToSection = async (scope: ChainablePromiseElement | WebdriverIO.Element, text: string) => {
    await (await addTaskButton(scope)).click()
    await typeInto(scope.$("input"), text)
    await browser.keys("Enter")
    await closeTaskInput()
}

/** Adds a task directly in a group with its "Nuovo task" button, typing `text` and confirming with Enter. */
export const addTaskToGroup = async (group: ChainablePromiseElement | WebdriverIO.Element, text: string) => {
    await (await groupAddTaskButton(group)).click()
    await typeInto(directTasks(group).$("input"), text)
    await browser.keys("Enter")
    await closeTaskInput()
}

/** Top to bottom texts of the tasks (subtasks included) inside `scope`, read in a single page-side call. */
export const taskTexts = async (scope: ChainablePromiseElement | WebdriverIO.Element): Promise<string[]> => {
    const label = await tr("tasks.editText")
    const el = (await scope.getElement()) as unknown as HTMLElement
    return browser.execute(
        (root: HTMLElement, aria: string) => Array.from(root.querySelectorAll<HTMLTextAreaElement>(`[aria-label="${aria}"]`)).map(area => area.value),
        el,
        label,
    )
}

/** Hover zones of the "+" insert lines inside `scope` (one above each visible task, none under the last). */
export const insertZones = async (scope: ChainablePromiseElement) => Array.from(await scope.$$('[data-testid="task-insert-zone"]'))

/**
 * The hover zone of the "+" line right above the task with this text (the nearest zone before it in document order, so it
 * also finds the lines of subtasks). Tagged with `data-e2e-zone` in the page and returned selected by it.
 */
export const insertZoneAbove = async (text: string) => {
    const label = await tr("tasks.editText")
    const found = await browser.execute((aria: string, value: string) => {
        document.querySelectorAll("[data-e2e-zone]").forEach(el => el.removeAttribute("data-e2e-zone"))
        const area = Array.from(document.querySelectorAll<HTMLTextAreaElement>(`[aria-label="${aria}"]`)).find(a => a.value === value)
        if (!area) return false
        const before = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="task-insert-zone"]'))
            .filter(zone => zone.compareDocumentPosition(area) & Node.DOCUMENT_POSITION_FOLLOWING)
        const zone = before[before.length - 1]
        if (!zone) return false
        zone.setAttribute("data-e2e-zone", "true")
        return true
    }, label, text)
    if (!found) throw new Error(`no insert line above the task "${text}"`)
    return $('[data-e2e-zone="true"]')
}

/** Computed opacity of the "+" button of an insert line zone (0 = hidden, 1 = shown by the hover). */
export const insertPlusOpacity = async (zone: ChainablePromiseElement): Promise<number> => {
    const el = (await zone.$("button").getElement()) as unknown as HTMLElement
    return browser.execute((button: HTMLElement) => Number(getComputedStyle(button).opacity), el)
}

/** Moves the mouse onto an insert line zone and waits until its "+" shows. */
export const hoverInsertZone = async (zone: ChainablePromiseElement) => {
    await zone.scrollIntoView({ block: "center" })
    await zone.moveTo()
    await browser.waitUntil(async () => (await insertPlusOpacity(zone)) > 0.9, { timeoutMsg: "the + of the insert line did not show on hover" })
}

/** The field of a new task opened by an insert line (there can be only one). An input: the "New task" button of a group has the same label. */
export const insertFields = async () => Array.from(await $$(`input[aria-label=${cssString(await tr("tasks.insertLine.label"))}]`))

/** Opens the Settings dialog on a category and returns the dialog. */
export const openSettingsOn = async (category: "appearance" | "notes") => {
    await domClick(byLabel(await tr("settings.title")))
    const dialog = $('[role="dialog"]')
    await dialog.waitForDisplayed({ timeoutMsg: "the settings dialog did not open" })
    // A real click: Radix tabs activate on mouse down, which the DOM click of domClick does not dispatch
    await byText(await tr(`settings.${category}.title`), dialog).click()
    return dialog
}

/** The switch of a settings row, named by its <label for>. */
export const settingsSwitch = async (labelKey: string) => {
    const label = (await tr(labelKey)).replace(/'/g, "\\'")
    return $(`//*[@role="dialog"]//*[@role="switch"][@id=//label[normalize-space()='${label}']/@for]`)
}

/** Closes every open dialog with Escape. */
export const closeAllDialogs = async () => {
    await browser.waitUntil(
        async () => {
            if (Array.from(await $$('[role="dialog"]')).length === 0) return true
            await browser.keys("Escape")
            return false
        },
        { timeoutMsg: "the dialog did not close", interval: 500 },
    )
}

/** Opens the dialog of the templates (button at the bottom of the left sidebar) and returns it. */
export const openTemplatesDialog = async () => {
    await $(`//button[.//span[normalize-space()=${JSON.stringify(await tr("dialogs.templates.title"))}]]`).click()
    const dialog = $('[role="dialog"]')
    await dialog.waitForDisplayed({ timeoutMsg: "the templates dialog did not open" })
    return dialog
}

/** The tab of the editor of a template (its label carries the full name in the title). */
export const templateEditorTab = async (name: string) => $(`[title=${cssString(await tr("templateEditor.tab", { name }))}]`)

/** A pane of the split workspace (`[data-pane]`, 0 = left, 1 = right); everything of the pane is searched inside it. */
export const pane = (index: 0 | 1) => $(`[data-pane="${index}"]`)

/** The tab of a note inside a pane (the tab carries the full note name in its title). */
export const paneTab = (index: 0 | 1, noteName: string) => $(`[data-pane="${index}"] [role="tab"][title=${cssString(noteName)}]`)

/** Writes the preference through the store plugin of the page (the app keeps the file in memory: editing the file would be overwritten) and waits for the file. */
export const setLastSeenVersion = async (version: string) => {
    const file = path.join(await dataDir(), "settings.dat")
    await browser.executeAsync((storePath: string, value: string, done: (result: string | null) => void) => {
        const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: unknown) => Promise<number> } }).__TAURI_INTERNALS__
        void internals.invoke("plugin:store|load", { path: storePath })
            .then(rid => internals.invoke("plugin:store|set", { rid, key: "lastSeenVersion", value })
                .then(() => internals.invoke("plugin:store|save", { rid })))
            .then(() => done(null), (error: unknown) => done(String(error)))
    }, file, version).then(error => { if (error) throw new Error(`could not write the preference: ${error}`) })
    await browser.waitUntil(
        () => { try { return fs.readFileSync(file, "utf8").includes(`"lastSeenVersion": "${version}"`) } catch { return false } },
        { timeout: 15_000, timeoutMsg: "settings.dat does not contain the new lastSeenVersion" },
    )
}
