import { $, $$, browser } from "@wdio/globals"
import { byLabel, byText, chooseLanguage, closeTaskInput, currentLang, newSectionInGroup, openSubmenu, sectionCard, tr, treeRow, typeInto } from "../helpers"

/**
 * Helpers shared by the screenshot tours (ui-tour and docs-shots): they drive the real app through the UI, as a user would.
 */

export type Theme = "light" | "dark"
export type Lang = "it" | "en"

export const settle = (ms = 400) => browser.pause(ms)
export const pad = (n: number) => String(n).padStart(2, "0")

export const recover = async () => {
    for (let i = 0; i < 3; i++) {
        await browser.keys("Escape").catch(() => undefined)
        await settle(150)
    }
}

export const dialogEl = () => $('[role="dialog"], [role="alertdialog"]')
export const waitDialogGone = async () => { await $('[role="dialog"], [role="alertdialog"]').waitForExist({ reverse: true, timeout: 10_000 }) }
export const closeDialog = async () => { await browser.keys("Escape"); await waitDialogGone() }

/* ------------------------------------------------------------------ appearance / settings */

export const openSettings = async () => {
    await byLabel(await tr("settings.title")).click()
    await dialogEl().waitForDisplayed()
}

export const goCategory = async (id: string) => {
    const nav = $(`[role="tablist"][aria-label=${JSON.stringify(await tr("settings.nav"))}]`)
    await byText(await tr(`settings.${id}.title`), nav).click()
    await settle(500)
}

/** Theme and language are changed from Settings -> Appearance, exactly as a user would. */
export const applyAppearance = async (nextTheme: Theme, nextLang: Lang) => {
    await openSettings()
    await goCategory("appearance")
    await $(`//button[starts-with(@aria-label, '${await tr("settings.appearance.theme.toggle")}:')]`).click()
    const item = $(`//*[@role='menuitemradio'][normalize-space()='${await tr(`settings.appearance.theme.${nextTheme}`)}']`)
    await item.waitForDisplayed()
    await item.click()
    await chooseLanguage(nextLang === "it" ? "Italiano" : "English")
    await browser.waitUntil(async () => (await currentLang()) === nextLang, { timeoutMsg: "language did not change" })
    await browser.waitUntil(
        async () => (await browser.execute(() => document.documentElement.classList.contains("dark"))) === (nextTheme === "dark"),
        { timeoutMsg: "theme did not change" },
    )
    await closeDialog()
}

/* ------------------------------------------------------------------ navigation helpers */

export const waitHome = async () => { await $(`h2=${await tr("home.recent")}`).waitForDisplayed({ timeout: 20_000 }) }
export const waitWorkspace = async () => { await byLabel(await tr("sidebar.toggle")).waitForDisplayed({ timeout: 20_000 }) }

export const goHome = async () => {
    await byLabel(await tr("workspace.backHome")).click()
    await waitHome()
    await settle(300)
}

export const openWs = async (name: string) => {
    await byLabel(await tr("home.workspace.open", { name })).click()
    await waitWorkspace()
    await settle(600)
}

export const expanded = async (label: string) => (await byLabel(label).getAttribute("aria-expanded")) === "true"

/**
 * Opens/closes a sidebar. In the compact window the sidebars are overlays: the rail toggle must stay clickable and close
 * the overlay; if the click does not work (or does not close it) Escape is the fallback.
 */
export const setToggle = async (label: string, open: boolean) => {
    if ((await expanded(label)) === open) return
    try {
        await byLabel(label).click()
    } catch {
        await browser.keys("Escape")
    }
    await settle(500)
    if (!open && (await expanded(label)) !== open) {
        await browser.keys("Escape")
        await settle(400)
    }
}
export const setSidebar = async (open: boolean) => setToggle(await tr("sidebar.toggle"), open)
export const setPanel = async (open: boolean) => setToggle(await tr("rightPanel.toggle"), open)
export const setTab = async (tab: "details" | "history") => {
    await $(`//*[@role='tab'][normalize-space()='${await tr(`rightPanel.${tab}`)}']`).click()
    await settle(300)
}

export const openNote = async (name: string) => {
    await setSidebar(true)
    await treeRow(name).click()
    await byLabel(await tr("notes.closeCurrent")).waitForDisplayed({ timeout: 10_000 })
    await settle(500)
}

/* ------------------------------------------------------------------ seed helpers */

export const submitDialog = async () => {
    const dialog = $('[role="dialog"]')
    await dialog.$('button[type="submit"]').click()
    await waitDialogGone()
}

export const fillDialogName = async (name: string) => {
    const dialog = $('[role="dialog"]')
    await dialog.waitForDisplayed()
    await typeInto(dialog.$('input[name="name"]'), name)
}

// Same order as PALETTE_COLORS (src/lib/colors.ts): the swatches are named after their color
export const PALETTE_ORDER = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe", "#008080", "#e6beff", "#9a6324", "#fffac8", "#000075"]

export const pickColor = async (menu: ChainablePromiseElement | WebdriverIO.Element, colour: string, afterOpen?: () => Promise<void>, submenuKey = "menu.changeColor") => {
    const colourName = await tr(`common.colors.c${PALETTE_ORDER.indexOf(colour) + 1}`)
    const swatch = byLabel(await tr("dialogs.color.swatch", { color: colourName }))
    await openSubmenu(menu, await tr(submenuKey), swatch)
    if (afterOpen) await afterOpen()
    await swatch.click()
    await settle(400)
}

export const taskRowAction = async (text: string, selector: string) => {
    const edit = await tr("tasks.editText")
    const found = await browser.execute(
        (value: string, aria: string, sel: string) => {
            const area = Array.from(document.querySelectorAll<HTMLTextAreaElement>(`textarea[aria-label="${aria}"]`))
                .find((a) => a.value === value)
            const row = area?.closest("[data-task-id]")
            const target = row?.querySelector<HTMLElement>(sel)
            if (!target) return false
            target.click()
            return true
        },
        text, edit, selector,
    )
    if (!found) throw new Error(`task "${text}" or its control "${selector}" not found`)
}

export const taskExists = (text: string) => browser.waitUntil(
    async () => browser.execute(
        (value: string, aria: string) =>
            Array.from(document.querySelectorAll<HTMLTextAreaElement>(`textarea[aria-label="${aria}"]`)).some((a) => a.value === value),
        text, await tr("tasks.editText"),
    ),
    { timeoutMsg: `task "${text}" not shown` },
)

/** Opens the "..." menu of a task (the button is only visible on hover, so it is hovered first). */
export const openTaskMenu = async (text: string) => {
    const open = await tr("common.menuOf", { name: text })
    let target: WebdriverIO.Element | undefined
    for (const candidate of await $$(`[aria-label="${await tr("tasks.editText")}"]`)) {
        if ((await candidate.getValue()) === text) target = candidate
    }
    if (!target) throw new Error(`task "${text}" not found`)
    await target.scrollIntoView()
    const row = await target.$(`./ancestor::div[.//button[@aria-label="${open}"]][1]`)
    await row.moveTo()
    await row.$(`button[aria-label="${open}"]`).click()
    const menu = $('[role="menu"]')
    await menu.waitForDisplayed()
    return menu
}

/** Shows the details of a task: "Show details" of its menu (the row has no button for it). */
export const showTaskDetails = async (text: string) => {
    const menu = await openTaskMenu(text)
    await byText(await tr("details.showTask"), menu).click()
}

export const addTask = async (section: string, text: string) => {
    await sectionCard(section).$(`[aria-label="${await tr("tasks.add")}"]`).click()
    const input = sectionCard(section).$("input")
    await typeInto(input, text)
    await browser.keys("Enter")
    await taskExists(text)
    // The field stays open for the next task (preference "keep adding tasks"): wait for the saved task, then Esc closes it
    await closeTaskInput()
}

export const addSubtask = async (parent: string, text: string) => {
    await taskRowAction(parent, `button[aria-label="${await tr("tasks.addSubtask")}"]`)
    const input = byLabel(await tr("tasks.newSubtask"))
    await typeInto(input, text)
    await browser.keys("Enter")
    await taskExists(text)
    await browser.keys("Escape")
    await settle(300)
}

export const addGroup = async (name: string) => {
    await byLabel(await tr("menu.newGroup")).click()
    await typeInto(byLabel(await tr("groups.nameLabel")), name)
    await browser.keys("Enter")
    await byText(name).waitForDisplayed({ timeoutMsg: `group ${name} not created` })
}

/** Adds a section to the last group of the note (the one just created), from the menu of the group. */
export const addSection = async (title: string) => {
    const groups = Array.from(await $$("[data-group-card]"))
    if (groups.length === 0) throw new Error("no group to add a section to")
    await newSectionInGroup(groups[groups.length - 1], title)
}
