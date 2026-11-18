import { $, $$, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, cssColor, domClick, openWorkspace, sectionCard, sql, tr, treeRow, typeInto,
    waitForApp, type Rgba, menuButton, menuButtonPredicate, openMenuWithButton,
    groupCard, newSectionInGroup,
} from "../helpers"

const WORKSPACE = "Feat Workspace"
const NOTE = "Feat Note"
const TEMPLATE = "Feat Template"
const NOTE_FROM_TEMPLATE = "Feat Note From Template"
const GROUP = "Feat Group"
const SECTIONS = ["Feat S1", "Feat S2", "Feat S3"]
const TASKS = ["Feat T1", "Feat T2", "Feat T3"]

const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

/** Values of the task text areas of a section card, read in a single page-side call. */
const taskValues = async (sectionTitle: string) => {
    const label = await tr("tasks.editText")
    const card = await sectionCard(sectionTitle)
    return browser.execute(
        (el: HTMLElement, aria: string) =>
            Array.from(el.querySelectorAll<HTMLTextAreaElement>(`[aria-label="${aria}"]`)).map((area) => area.value),
        card as unknown as HTMLElement,
        label,
    )
}

/** Titles of the section cards on the page, in order (one page-side call). */
const sectionTitles = () =>
    browser.execute(() =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-section-card]")).map((card) => card.querySelector<HTMLElement>("button[title]")?.title ?? ""),
    )

/**
 * Order saved in the database (the specs check what was written; an undo asked before the write waits for it).
 */
const savedOrder = async (table: "section" | "task", column: "title" | "text", names: string[]) => {
    const rows = await sql<Record<string, string>[]>(
        "select",
        `SELECT ${column} AS name FROM ${table} WHERE deleted_at IS NULL AND ${column} IN (${names.map(() => "?").join(",")}) ORDER BY position`,
        names,
    )
    return rows.map((row) => row.name)
}

const waitForTasks = async (section: string, expected: string[]) => {
    await browser.waitUntil(async () => JSON.stringify(await taskValues(section)) === JSON.stringify(expected), {
        timeoutMsg: `the tasks of "${section}" are not ${expected.join(", ")}`,
    })
    await browser.waitUntil(async () => JSON.stringify(await savedOrder("task", "text", expected)) === JSON.stringify(expected), {
        timeoutMsg: `the order of the tasks was not saved: ${expected.join(", ")}`,
    })
}

const waitForSections = async (expected: string[]) => {
    await browser.waitUntil(async () => JSON.stringify(await sectionTitles()) === JSON.stringify(expected), {
        timeoutMsg: `the sections are not ${expected.join(", ")}`,
    })
    await browser.waitUntil(async () => JSON.stringify(await savedOrder("section", "title", expected)) === JSON.stringify(expected), {
        timeoutMsg: `the order of the sections was not saved: ${expected.join(", ")}`,
    })
}

/** Opens the "..." menu of a task (the button only shows on hover) and returns the open menu. */
const openTaskMenu = async (text: string) => {
    const candidates = await $$(`[aria-label="${await tr("tasks.editText")}"]`)
    let target: WebdriverIO.Element | undefined
    for (const candidate of candidates) {
        if ((await candidate.getValue()) === text) target = candidate
    }
    if (!target) throw new Error(`task "${text}" not found`)
    const row = await target.$(`./ancestor::div[.//button[${await menuButtonPredicate()}]][1]`)
    await row.moveTo()
    return openMenuWithButton(await menuButton(row))
}

const openSectionMenu = async (title: string) => openMenuWithButton(await menuButton(sectionCard(title)))

const addTask = async (section: string, text: string) => {
    const before = (await taskValues(section)).length
    await addTaskToSection(sectionCard(section), text)
    await browser.waitUntil(async () => (await taskValues(section)).length === before + 1, { timeoutMsg: `task "${text}" not created` })
}

/** Ctrl+<key> with the focus out of any text field (the app ignores undo/redo shortcuts inside them). */
const pressCtrl = async (key: string) => {
    await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
    await browser.keys(["Control", key])
}

const isRed = (color: Rgba) => color.r - Math.max(color.g, color.b) >= 60

/**
 * Checks the structure of a confirmation dialog (ConfirmDialog): close button with its accessible text, "Cancel" on the
 * left of the main action, an icon in the main action, and red title and main action only when it loses data.
 * Resolves with the dialog once it is open.
 */
const expectConfirmDialog = async (titleKey: string, destructive: boolean) => {
    const title = await tr(titleKey)
    const dialog = $(`//*[@role='dialog'][.//h2[normalize-space()=${xpathString(title)}]]`)
    await dialog.waitForDisplayed({ timeoutMsg: `the confirmation "${title}" did not open` })

    const info = await browser.execute((el: HTMLElement) => {
        const close = el.querySelector<HTMLElement>('[data-slot="dialog-close"]')
        const buttons = Array.from(el.querySelectorAll<HTMLElement>('[data-slot="button"]')).map((button) => ({
            text: (button.textContent ?? "").trim(),
            hasIcon: button.querySelector("svg") !== null,
            left: button.getBoundingClientRect().left,
        }))
        return { close: close ? { text: (close.textContent ?? "").trim(), visible: close.getBoundingClientRect().width > 0 } : null, buttons }
    }, (await dialog.getElement()) as unknown as HTMLElement)

    expect(info.close).not.toBeNull()
    expect(info.close?.visible).toBe(true)
    expect(info.close?.text).toBe(await tr("common.close"))
    expect(info.buttons.length).toBeGreaterThanOrEqual(2)
    expect(info.buttons[0].text).toBe(await tr("common.cancel"))
    const main = info.buttons[info.buttons.length - 1]
    expect(info.buttons[0].left).toBeLessThan(main.left)
    expect(main.hasIcon).toBe(true)

    const mainButton = dialog.$('(.//*[@data-slot="button"])[last()]')
    expect(isRed(await cssColor(dialog.$("h2"), "color"))).toBe(destructive)
    // Red text (soft destructive) or the destructive fill (irreversible actions, with light text). The fill is checked by
    // its class: the default accent is an orange red too, so its color would not tell the two apart
    const filled = /(^|\s)bg-destructive(\s|$)/.test((await mainButton.getAttribute("class")) ?? "")
    const redButton = isRed(await cssColor(mainButton, "color")) || filled
    expect(redButton).toBe(destructive)
    return dialog
}

const confirmAndClose = async (dialog: ChainableDialog, label: string) => {
    await byText(label, dialog).click()
    await dialog.waitForExist({ reverse: true })
}
type ChainableDialog = ReturnType<typeof $>

const openTrash = async () => {
    await $(`//button[.//span[normalize-space()='${await tr("trash.title")}']]`).click()
    const trash = $('[role="dialog"]')
    await trash.waitForDisplayed()
    return trash
}

/** Shows the tab of a kind of item of the trash (the trash lists one kind at a time). */
const openTrashTab = async (trash: ChainableDialog, type: string) => {
    // A real click: Radix tabs activate on mouse down, which the DOM click of domClick does not dispatch
    await trash.$(`[role="tab"][data-type="${type}"]`).click()
    await trash.$(`[role="tab"][data-type="${type}"][aria-selected="true"]`).waitForExist()
}

const closeTrash = async (trash: ChainableDialog) => {
    await domClick(byText(await tr("common.close"), trash))
    await trash.waitForExist({ reverse: true })
}

/** Moves the item through the "delete" entry of its menu and confirms the dialog. */
/**
 * Deletes from the menu of a task, section or group. A task always asks for a confirmation; an EMPTY section, group or
 * note does not ("Confirm deleting only when there is content", on by default), so pass `{ confirms: false }` for those.
 */
const deleteFromMenu = async (menu: ChainableDialog, { confirms = true }: { confirms?: boolean } = {}) => {
    await byText(await tr("common.delete"), menu).click()
    if (!confirms) return
    const dialog = await expectConfirmDialog("dialogs.delete.title", true)
    await confirmAndClose(dialog, await tr("dialogs.delete.confirm"))
}

describe("New features: reordering, undo, trash, templates and appearance", () => {
    // A dialog left open by a failed test would make every following test fail on a covered sidebar
    // (the settings tests share one open dialog on purpose)
    afterEach(async function () {
        if (this.currentTest?.fullTitle().includes(" settings ")) return
        const open = () => browser.execute(() => document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length)
        for (let i = 0; i < 3 && (await open()) > 0; i++) {
            await browser.keys("Escape")
            await browser.waitUntil(async () => (await open()) === 0, { timeout: 1_500 }).catch(() => undefined)
        }
    })

    before(async () => {
        await waitForApp()
    })

    it("creates a workspace, a note, a group, three sections and three tasks", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()

        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })

        for (const title of SECTIONS) {
            await newSectionInGroup(groupCard(GROUP), title)
        }
        for (const text of TASKS) await addTask(SECTIONS[0], text)
        await waitForTasks(SECTIONS[0], TASKS)
        await waitForSections(SECTIONS)
    })

    it("moves a task down from its menu, then undoes and redoes with Ctrl+Z / Ctrl+Y", async () => {
        // First task: "Move up" is disabled
        let menu = await openTaskMenu(TASKS[0])
        await expect(byText(await tr("menu.moveUp"), menu)).toHaveAttribute("aria-disabled", "true")
        await expect(byText(await tr("menu.moveDown"), menu)).not.toHaveAttribute("aria-disabled", "true")
        await byText(await tr("menu.moveDown"), menu).click()
        await waitForTasks(SECTIONS[0], [TASKS[1], TASKS[0], TASKS[2]])

        await pressCtrl("z")
        await waitForTasks(SECTIONS[0], TASKS)
        await pressCtrl("y")
        await waitForTasks(SECTIONS[0], [TASKS[1], TASKS[0], TASKS[2]])

        // Last task: "Move down" is disabled, "Move up" brings it one place up
        menu = await openTaskMenu(TASKS[2])
        await expect(byText(await tr("menu.moveDown"), menu)).toHaveAttribute("aria-disabled", "true")
        await byText(await tr("menu.moveUp"), menu).click()
        await waitForTasks(SECTIONS[0], [TASKS[1], TASKS[2], TASKS[0]])
        await pressCtrl("z")
        await waitForTasks(SECTIONS[0], [TASKS[1], TASKS[0], TASKS[2]])
        // Back to the original order for the next tests
        await pressCtrl("z")
        await waitForTasks(SECTIONS[0], TASKS)
    })

    it("shows the completed tasks last from the settings without changing the saved order", async () => {
        const toggleCompletedLast = async () => {
            await byLabel(await tr("settings.title")).click()
            await $('[role="dialog"]').waitForDisplayed()
            const nav = $(`[role="tablist"][aria-label="${await tr("settings.nav")}"]`)
            await byText(await tr("settings.notes.title"), nav).click()
            await $(`//*[@role="dialog"]//*[@role="switch"][@id=//label[normalize-space()=${xpathString(await tr("settings.notes.completedLast.label"))}]/@for]`).click()
            await browser.keys("Escape")
            await $('[role="dialog"]').waitForExist({ reverse: true })
        }
        const toggleFirstTask = async () => {
            const areas = await $$(`[aria-label="${await tr("tasks.editText")}"]`)
            for (const area of areas) {
                if ((await area.getValue()) !== TASKS[0]) continue
                const row = await area.$("./ancestor::div[@data-task-id][1]")
                await domClick(row.$('[role="checkbox"]'))
                return
            }
            throw new Error(`task "${TASKS[0]}" not found`)
        }

        await toggleFirstTask()
        // Off by default: the completed task keeps its place
        await waitForTasks(SECTIONS[0], TASKS)
        await toggleCompletedLast()
        // Shown last, while the saved order is still the original one
        await browser.waitUntil(async () => JSON.stringify(await taskValues(SECTIONS[0])) === JSON.stringify([TASKS[1], TASKS[2], TASKS[0]]), {
            timeoutMsg: "the completed task is not shown last",
        })
        expect(await savedOrder("task", "text", TASKS)).toEqual(TASKS)
        // The completed task cannot move up over the open ones
        const menu = await openTaskMenu(TASKS[0])
        await expect(byText(await tr("menu.moveUp"), menu)).toHaveAttribute("aria-disabled", "true")
        await browser.keys("Escape")

        // Back to the original state for the next tests
        await toggleCompletedLast()
        await waitForTasks(SECTIONS[0], TASKS)
        await toggleFirstTask()
    })

    it("moves a section down from its menu, then undoes and redoes", async () => {
        let menu = await openSectionMenu(SECTIONS[0])
        // The first section can still go up: the list of the direct tasks of the group sits above it
        await expect(byText(await tr("menu.moveUp"), menu)).not.toHaveAttribute("aria-disabled", "true")
        await byText(await tr("menu.moveDown"), menu).click()
        await waitForSections([SECTIONS[1], SECTIONS[0], SECTIONS[2]])

        await pressCtrl("z")
        await waitForSections(SECTIONS)
        await pressCtrl("y")
        await waitForSections([SECTIONS[1], SECTIONS[0], SECTIONS[2]])
        await pressCtrl("z")
        await waitForSections(SECTIONS)

        menu = await openSectionMenu(SECTIONS[2])
        await expect(byText(await tr("menu.moveDown"), menu)).toHaveAttribute("aria-disabled", "true")
        await expect(byText(await tr("menu.moveUp"), menu)).not.toHaveAttribute("aria-disabled", "true")
        await browser.keys("Escape")
        await menu.waitForExist({ reverse: true })
    })

    it("deletes a task and a section to the trash and restores them", async () => {
        await deleteFromMenu(await openTaskMenu(TASKS[2]))
        await browser.waitUntil(async () => !(await taskValues(SECTIONS[0])).includes(TASKS[2]), { timeoutMsg: "task not deleted" })
        await deleteFromMenu(await openSectionMenu(SECTIONS[2]), { confirms: false })
        await browser.waitUntil(async () => !(await sectionTitles()).includes(SECTIONS[2]), { timeoutMsg: "section not deleted" })

        const trash = await openTrash()
        for (const [type, name] of [["task", TASKS[2]], ["section", SECTIONS[2]]]) {
            await openTrashTab(trash, type)
            const restore = trash.$(`[aria-label=${JSON.stringify(await tr("trash.restoreAria", { name }))}]`)
            await domClick(restore)
            await restore.waitForExist({ reverse: true, timeoutMsg: `"${name}" was not restored` })
        }
        await expect(trash.$(`p=${await tr("trash.isEmpty")}`)).toBeDisplayed()
        await closeTrash(trash)

        await browser.waitUntil(async () => (await taskValues(SECTIONS[0])).includes(TASKS[2]), { timeoutMsg: "restored task is not shown" })
        await browser.waitUntil(async () => (await sectionTitles()).includes(SECTIONS[2]), { timeoutMsg: "restored section is not shown" })
    })

    it("deletes a task permanently from the trash", async () => {
        await deleteFromMenu(await openTaskMenu(TASKS[1]))
        await browser.waitUntil(async () => !(await taskValues(SECTIONS[0])).includes(TASKS[1]), { timeoutMsg: "task not deleted" })

        const trash = await openTrash()
        await openTrashTab(trash, "task")
        // The list re-renders while the tab settles: click through the DOM, which cannot hit a stale node
        await domClick(trash.$(`[aria-label=${JSON.stringify(await tr("trash.purgeAria", { name: TASKS[1] }))}]`))
        const dialog = await expectConfirmDialog("trash.purgeTitle", true)
        await confirmAndClose(dialog, await tr("trash.confirmPurge"))
        await expect(trash.$(`p=${await tr("trash.isEmpty")}`)).toBeDisplayed()
        await closeTrash(trash)
    })

    it("empties the trash after a confirmation", async () => {
        await deleteFromMenu(await openTaskMenu(TASKS[0]))
        await deleteFromMenu(await openSectionMenu(SECTIONS[2]), { confirms: false })
        await browser.waitUntil(async () => !(await sectionTitles()).includes(SECTIONS[2]), { timeoutMsg: "section not deleted" })

        const trash = await openTrash()
        await openTrashTab(trash, "task")
        await expect(trash.$(`[aria-label=${JSON.stringify(await tr("trash.restoreAria", { name: TASKS[0] }))}]`)).toBeDisplayed()
        await byText(await tr("trash.empty"), trash).click()
        const dialog = await expectConfirmDialog("trash.emptyTitle", true)
        await confirmAndClose(dialog, await tr("trash.confirmEmpty"))
        // Emptying closes the trash (nothing left to show): wait for it, then reopen it to check that it is empty
        await trash.waitForExist({ reverse: true, timeoutMsg: "the trash did not close after being emptied" })
        const reopened = await openTrash()
        await expect(reopened.$(`p=${await tr("trash.isEmpty")}`)).toBeDisplayed()
        await closeTrash(reopened)
    })

    it("creates a template from a note chosen in the search and a note from that template", async () => {
        await $(`//button[.//span[normalize-space()='${await tr("dialogs.templates.title")}']]`).click()
        const templates = $('[role="dialog"]')
        await templates.waitForDisplayed()
        await openMenuWithButton(byText(await tr("dialogs.templates.new"), templates))
        await byText(await tr("dialogs.templates.newFromNote")).click()

        // Choose the note in the search dialog
        const search = $('[role="dialog"] [cmdk-input]')
        await search.waitForDisplayed()
        await typeInto(search, NOTE)
        await $(`//*[@cmdk-item][.//span[normalize-space()=${xpathString(NOTE)}]]`).click()

        // The template name starts from the note name
        const nameInput = $('[role="dialog"] input[name="name"]')
        await nameInput.waitForDisplayed()
        await expect(nameInput).toHaveValue(NOTE)
        await typeInto(nameInput, TEMPLATE)
        const createDialog = $('//*[@role="dialog"][.//input[@name="name"]]')
        await byText(await tr("dialogs.createTemplate.title"), createDialog).click()
        await createDialog.waitForExist({ reverse: true })
        await expect(templates.$(`button=${TEMPLATE}`)).toBeDisplayed()

        // Note from the template
        await templates.$(`[aria-label=${JSON.stringify(await tr("dialogs.templates.createNoteFrom", { name: TEMPLATE }))}]`).click()
        const noteInput = $('[role="dialog"] input[name="name"]')
        await noteInput.waitForDisplayed()
        await expect(noteInput).toHaveValue(TEMPLATE)
        await typeInto(noteInput, NOTE_FROM_TEMPLATE)
        const noteDialog = $('//*[@role="dialog"][.//input[@name="name"]]')
        await byText(await tr("dialogs.noteFromTemplate.submit"), noteDialog).click()
        await noteDialog.waitForExist({ reverse: true })
        // The templates dialog closes by itself once the note exists
        await templates.waitForExist({ reverse: true })
        await expect(treeRow(NOTE_FROM_TEMPLATE)).toBeDisplayed()
    })

    describe("settings", () => {
        const category = async (key: string) => {
            const nav = $(`[role="tablist"][aria-label="${await tr("settings.nav")}"]`)
            await byText(await tr(key), nav).click()
        }

        /** The reset button must sit in the same row as the section title, on its right (the padding of the row keeps it clear of the X of the dialog). */
        const expectResetInTitleRow = async (titleKey: string) => {
            const title = await tr(titleKey)
            const resetText = await tr("settings.resetAll")
            const rects = await browser.execute((heading: string, label: string) => {
                const h3 = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] section > div > h3')).find((el) => el.textContent?.trim() === heading)
                const row = h3?.parentElement
                const button = row ? Array.from(row.querySelectorAll<HTMLElement>("button")).find((el) => el.textContent?.trim() === label) : undefined
                if (!h3 || !row || !button) return null
                const a = h3.getBoundingClientRect()
                const b = button.getBoundingClientRect()
                const r = row.getBoundingClientRect()
                const rowRight = r.right - parseFloat(getComputedStyle(row).paddingRight)
                return { titleMid: (a.top + a.bottom) / 2, buttonMid: (b.top + b.bottom) / 2, titleRight: a.right, buttonLeft: b.left, buttonRight: b.right, rowRight }
            }, title, resetText)
            expect(rects).not.toBeNull()
            expect(Math.abs((rects?.titleMid ?? 0) - (rects?.buttonMid ?? 99999))).toBeLessThan(4)
            expect(rects?.buttonLeft ?? 0).toBeGreaterThanOrEqual(rects?.titleRight ?? 99999)
            expect(Math.abs((rects?.rowRight ?? 0) - (rects?.buttonRight ?? 99999))).toBeLessThan(2)
        }

        const resetButton = async () => byText(await tr("settings.resetAll"), $('[role="dialog"] section'))

        before(async () => {
            await byLabel(await tr("settings.title")).click()
            await $('[role="dialog"]').waitForDisplayed()
        })

        it("changes size and intensity in Appearance and resets them all after a confirmation", async () => {
            await category("settings.appearance.title")
            const sizeLabel = await tr("settings.appearance.sidebarSize.label")
            const radio = async (key: string) => byText(await tr(`settings.appearance.sidebarSize.${key}`))
            const range = $(`[role="slider"][aria-label=${JSON.stringify(await tr("settings.appearance.colorIntensity.label"))}]`)
            const rowHeight = () => browser.execute(
                (name: string) => {
                    const row = Array.from(document.querySelectorAll<HTMLElement>('div[role="treeitem"]')).find((el) => el.textContent?.trim() === name)
                    return row ? row.getBoundingClientRect().height : 0
                },
                NOTE,
            )
            await expectResetInTitleRow("settings.appearance.title")
            await expect(await resetButton()).toBeDisabled()
            // The segmented control is a radiogroup named (aria-labelledby) by the label of its row
            await expect($(`//*[@role='radiogroup'][@aria-labelledby=//label[normalize-space()=${xpathString(sizeLabel)}]/@id]`)).toBeDisplayed()
            const normalHeight = await rowHeight()

            await (await radio("large")).click()
            await expect(await radio("large")).toHaveAttribute("aria-checked", "true")
            await browser.waitUntil(async () => (await rowHeight()) > normalHeight, { timeoutMsg: "the sidebar rows did not grow" })

            await (await radio("compact")).click()
            await expect(await radio("compact")).toHaveAttribute("aria-checked", "true")
            await browser.waitUntil(async () => (await rowHeight()) < normalHeight, { timeoutMsg: "the sidebar rows did not shrink" })

            await expect(range).toHaveAttribute("aria-valuetext", "100%")
            await range.click()
            await browser.execute((el: HTMLElement) => el.focus(), (await range.getElement()) as unknown as HTMLElement)
            await browser.keys(["ArrowRight", "ArrowRight"])
            await browser.waitUntil(async () => (await range.getAttribute("aria-valuetext")) !== "100%", { timeoutMsg: "the intensity did not change" })
            const changed = await range.getAttribute("aria-valuetext")

            await expect(await resetButton()).toBeEnabled()
            await (await resetButton()).click()
            // Resetting the settings does not lose data: the dialog is not red
            const dialog = await expectConfirmDialog("settings.appearance.reset.confirmTitle", false)
            await confirmAndClose(dialog, await tr("settings.appearance.reset.confirm"))

            await expect(await radio("normal")).toHaveAttribute("aria-checked", "true")
            await expect(range).toHaveAttribute("aria-valuetext", "100%")
            expect(changed).not.toBe("100%")
            await expect(await resetButton()).toBeDisabled()
            await browser.waitUntil(async () => Math.abs((await rowHeight()) - normalHeight) < 0.5, { timeoutMsg: "the rows are not back to normal" })
        })

        it("shows the reset button in the title row of Audio and Shortcuts as well", async () => {
            await category("settings.audio.title")
            await expectResetInTitleRow("settings.audio.title")
            await category("settings.shortcuts.title")
            await expectResetInTitleRow("settings.shortcuts.title")
        })

        it("resets the shortcuts after a confirmation", async () => {
            // Disabled until a shortcut is customised
            await expect(await resetButton()).toBeDisabled()
            const name = await tr("shortcuts.items.toggle-audio")
            await $(`[aria-label=${JSON.stringify(await tr("settings.shortcuts.editAria", { name }))}]`).click()
            await browser.keys(["Alt", "j"])
            await expect($(`[aria-label=${JSON.stringify(await tr("settings.shortcuts.resetAria", { name }))}]`)).toBeDisplayed()
            await expect(await resetButton()).toBeEnabled()

            await (await resetButton()).click()
            const dialog = await expectConfirmDialog("settings.shortcuts.resetAllTitle", false)
            await confirmAndClose(dialog, await tr("settings.resetAll"))
            await expect(await resetButton()).toBeDisabled()
        })

        after(async () => {
            await browser.keys("Escape")
            await $('[role="dialog"]').waitForExist({ reverse: true })
        })
    })
})
