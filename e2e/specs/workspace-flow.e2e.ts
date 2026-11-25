import { $, $$, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, domClick, openContextMenu, openSubmenu, openWorkspace, sectionCard, topDialog, tr, treeRow, typeInto,
    waitForApp, menuButton, menuButtonPredicate, openMenuWithButton,
    groupCard, newSectionInGroup, toolButton } from "../helpers"

const WORKSPACE = "E2E Workspace"
const FOLDER = "E2E Folder"
const NOTE = "E2E Note"
const GROUP = "E2E Group"
const SECTION_A = "Section A"
const SECTION_B = "Section B"
const TASK = "Write the e2e tests"

/**
 * Values of the task text areas inside a section card, read in a single page-side call
 * (reading element by element races with React re-renders and ends in stale element references).
 */
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

describe("Workspace, folders, notes, groups, sections and tasks", () => {
    before(async () => {
        await waitForApp()
    })

    it("creates a workspace and opens it", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
    })

    it("creates a folder and a note and opens the note", async () => {
        await createFromSidebar("sidebar.addFolder", "dialogs.addFolder.submit", FOLDER)
        await expect(treeRow(FOLDER)).toBeDisplayed()

        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
    })

    it("creates a group, two sections and a task", async () => {
        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        // Once saved, the group name is a button (the input only exists while the name is being edited)
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })

        for (const title of [SECTION_A, SECTION_B]) {
            await newSectionInGroup(groupCard(GROUP), title)
        }

        await addTaskToSection(sectionCard(SECTION_A), TASK)
        await browser.waitUntil(async () => (await taskValues(SECTION_A)).includes(TASK), { timeoutMsg: "task not created" })
    })

    it("completes the task", async () => {
        const checkbox = sectionCard(SECTION_A).$('[role="checkbox"]')
        await checkbox.click()
        await expect(checkbox).toHaveAttribute("aria-checked", "true")
        await checkbox.click()
        await expect(checkbox).toHaveAttribute("aria-checked", "false")
    })

    it("keeps the task text in place when it enters edit mode", async () => {
        const label = await tr("tasks.editText")
        const card = (await sectionCard(SECTION_A)) as unknown as HTMLElement
        // Position of the task text area (read-only state: it has the edit label) and of the focused one (edit state)
        const measure = (selector: "label" | "active") =>
            browser.execute((el: HTMLElement, aria: string, mode: string) => {
                const target = mode === "label"
                    ? Array.from(el.querySelectorAll<HTMLTextAreaElement>(`[aria-label="${aria}"]`))[0]
                    : (document.activeElement as HTMLTextAreaElement)
                const rect = target.getBoundingClientRect()
                return { tag: target.tagName, top: rect.top, left: rect.left, height: rect.height, width: rect.width }
            }, card, label, selector)

        const before = await measure("label")
        await sectionCard(SECTION_A).$(`[aria-label="${label}"]`).click()
        await browser.waitUntil(async () => (await measure("active")).tag === "TEXTAREA", { timeoutMsg: "the text did not enter edit mode" })
        const after = await measure("active")
        // Enter leaves the edit mode without changing the text
        await browser.keys("Enter")

        expect(Math.abs(after.top - before.top)).toBeLessThan(0.5)
        expect(Math.abs(after.left - before.left)).toBeLessThan(0.5)
        expect(Math.abs(after.height - before.height)).toBeLessThan(0.5)
    })

    it("moves the task to the other section", async () => {
        const menu = await openTaskMenu(TASK)
        // Destinations are menu items (role="menuitem") of the submenu, labelled with the section title
        const destination = $(`//*[@role='menuitem'][.//span[contains(normalize-space(), ${JSON.stringify(SECTION_B)})]]`)
        await openSubmenu(menu, await tr("menu.moveTo"), destination)
        await destination.click()

        await browser.waitUntil(async () => (await taskValues(SECTION_B)).includes(TASK), { timeoutMsg: "task not moved" })
        expect(await taskValues(SECTION_A)).not.toContain(TASK)
    })

    it("deletes the task to the trash and restores it", async () => {
        const menu = await openTaskMenu(TASK)
        await byText(await tr("common.delete"), menu).click()
        const confirmLabel = await tr("dialogs.delete.confirm")
        // The dialog opens once the menu has closed: wait for its button instead of reading the top dialog at once
        await browser.waitUntil(async () => {
            const dialog = await topDialog()
            return dialog !== undefined && (await byText(confirmLabel, dialog).isExisting())
        }, { timeoutMsg: "the delete confirmation did not open" })
        await byText(confirmLabel, await topDialog()).click()
        await browser.waitUntil(async () => !(await taskValues(SECTION_B)).includes(TASK), { timeoutMsg: "task not deleted" })

        await (await toolButton("trash.title")).click()
        const trash = $('[role="dialog"]')
        await trash.waitForDisplayed()
        await trash.$(`[aria-label=${JSON.stringify(await tr("trash.restoreAria", { name: TASK }))}]`).click()
        await expect(trash.$(`p=${await tr("trash.isEmpty")}`)).toBeDisplayed()
        await browser.keys("Escape")
        await trash.waitForExist({ reverse: true })

        await browser.waitUntil(async () => (await taskValues(SECTION_B)).includes(TASK), {
            timeoutMsg: "restored task is not shown again",
        })
    })

    it("hides the completed tasks and shows them again", async () => {
        const checkbox = sectionCard(SECTION_B).$('[role="checkbox"]')
        await domClick(checkbox)
        await expect(checkbox).toHaveAttribute("aria-checked", "true")

        const toggle = byLabel(await tr("notes.hideCompleted"))
        await domClick(toggle)
        await expect(toggle).toHaveAttribute("aria-pressed", "true")
        await browser.waitUntil(async () => !(await taskValues(SECTION_B)).includes(TASK), { timeoutMsg: "the completed task is still shown" })
        await expect(sectionCard(SECTION_B).$("[data-testid=\"hidden-completed\"]")).toHaveText(await tr("tasks.hiddenCompleted_one", { count: 1 }))

        await domClick(toggle)
        await expect(toggle).toHaveAttribute("aria-pressed", "false")
        await browser.waitUntil(async () => (await taskValues(SECTION_B)).includes(TASK), { timeoutMsg: "the completed task is not shown again" })
        await domClick(sectionCard(SECTION_B).$('[role="checkbox"]'))
    })

    it("duplicates a section with its tasks", async () => {
        const copy = `${SECTION_B} (${await tr("duplicate.suffix")})`
        const menu = await openMenuWithButton(await menuButton(sectionCard(SECTION_B)))
        await byText(await tr("menu.duplicate"), menu).click()

        await sectionCard(copy).waitForDisplayed({ timeoutMsg: "the section copy was not created" })
        await browser.waitUntil(async () => (await taskValues(copy)).includes(TASK), { timeoutMsg: "the tasks were not copied" })
    })

    it("duplicates a note and opens the copy", async () => {
        const copy = `${NOTE} (${await tr("duplicate.suffix")})`
        const menu = await openContextMenu(treeRow(NOTE))
        await byText(await tr("menu.duplicate"), menu).click()

        await treeRow(copy).waitForDisplayed({ timeoutMsg: "the note copy is not in the sidebar" })
        await sectionCard(SECTION_B).waitForDisplayed({ timeoutMsg: "the copy was not opened with its content" })
        await sectionCard(`${SECTION_B} (${await tr("duplicate.suffix")})`).waitForDisplayed()
    })
})
