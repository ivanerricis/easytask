import { $, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, closeTaskInput, createFromSidebar, createWorkspace, domClick, groupCard, newSectionInGroup,
    openContextMenu, openWorkspace, sectionCard, sql, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * Keyboard of the task lists: one tab stop per list, arrows / Home / End inside the list, Right / Left, Space, Enter,
 * Alt+Up / Alt+Down (the focus stays on the task) and Shift+F10.
 */
const WORKSPACE = "TaskKbd Workspace"
const NOTE = "TaskKbd Note"
const GROUP = "TaskKbd Group"
const S1 = "TaskKbd S1"
const S2 = "TaskKbd S2"
const A1 = "TaskKbd A1"
const A2 = "TaskKbd A2"
const A3 = "TaskKbd A3"
const SUB = "TaskKbd Sub"
const B1 = "TaskKbd B1"
const A2_RENAMED = "TaskKbd A2 renamed"

const xpathString = (value: string) => `'${value}'`

const rowOf = (text: string) => $(`//*[@role='treeitem'][@aria-label=${xpathString(text)}]`)

/** The task (aria-label of the row) that has the focus, or what else has it. */
const focusedTask = () => browser.execute(() => {
    const el = document.activeElement as HTMLElement | null
    const row = el?.closest("[role='treeitem']")
    return row && row === el ? row.getAttribute("aria-label") ?? "" : `<${el?.tagName ?? "none"} ${el?.getAttribute("aria-label") ?? ""}>`
})

const expectFocus = (text: string) =>
    browser.waitUntil(async () => (await focusedTask()) === text, { timeoutMsg: `the focus did not reach ${text}` })

/** Puts the focus on a row without a pointer (a click would also select it and may start the rename). */
const focusRow = async (text: string) => {
    const row = (await rowOf(text).getElement()) as unknown as HTMLElement
    await browser.execute((el: HTMLElement) => el.focus(), row)
    await expectFocus(text)
}

/** Focuses the first button of the section header and presses Tab until a task row has the focus. */
const enterList = async () => {
    const header = (await sectionCard(S1).$("button").getElement()) as unknown as HTMLElement
    await browser.execute((el: HTMLElement) => el.focus(), header)
    for (let i = 0; i < 8; i++) {
        await browser.keys("Tab")
        if ((await browser.execute(() => document.activeElement?.getAttribute("role"))) === "treeitem") return
    }
}

const addTask = async (section: string, text: string) => {
    await addTaskToSection(sectionCard(section), text)
    await rowOf(text).waitForDisplayed({ timeoutMsg: `task "${text}" not created` })
}

const topLevelOrder = async (names: string[]) => {
    const rows = await sql<{ text: string }[]>(
        "select",
        `SELECT text FROM task WHERE deleted_at IS NULL AND text IN (${names.map(() => "?").join(",")}) ORDER BY position`,
        names,
    )
    return rows.map(row => row.text)
}

const completed = async (text: string) => {
    const rows = await sql<{ completed: number | null }[]>("select", "SELECT completed FROM task WHERE text = ? AND deleted_at IS NULL", [text])
    return !!rows[0]?.completed
}

describe("Task list keyboard", () => {
    before(async () => {
        await waitForApp()
    })

    it("creates a note with two sections, tasks and a subtask", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
        await byText(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })
        await newSectionInGroup(groupCard(GROUP), S1)
        await newSectionInGroup(groupCard(GROUP), S2)

        for (const text of [A1, A2, A3]) await addTask(S1, text)
        await addTask(S2, B1)

        const add = rowOf(A3).$(`button[aria-label="${await tr("tasks.addSubtask")}"]`)
        await domClick(add)
        await typeInto(sectionCard(S1).$("input"), SUB)
        await browser.keys("Enter")
        await closeTaskInput()
        await rowOf(SUB).waitForDisplayed({ timeoutMsg: "the subtask was not created" })
    })

    it("a list is a tree and Tab crosses it in one stop", async () => {
        await expect($(`//*[@role='tree'][@aria-label=${xpathString(await tr("tasks.listOf", { name: S1 }))}]`)).toBeDisplayed()
        await expect(rowOf(SUB)).toHaveAttribute("aria-level", "2")
        // Tab from the header of the section enters the list on its tab stop
        await enterList()
        await expectFocus(A1)
        await expect(rowOf(A1)).toHaveAttribute("tabindex", "0")
        for (const other of [A2, A3, SUB]) await expect(rowOf(other)).toHaveAttribute("tabindex", "-1")

        // Going forward leaves the list without stopping on another task of it
        const listName = await tr("tasks.listOf", { name: S1 })
        const seen: string[] = []
        for (let i = 0; i < 10; i++) {
            await browser.keys("Tab")
            const owner = await browser.execute((name: string) => {
                const el = document.activeElement as HTMLElement | null
                return el?.closest(`[role='tree']`)?.getAttribute("aria-label") === name ? el.closest("[role='treeitem']")?.getAttribute("aria-label") ?? "" : ""
            }, listName)
            if (owner) seen.push(owner)
        }
        expect(seen.filter(name => name !== A1)).toEqual([])
    })

    it("the keyboard focus shows a focus ring on the row", async () => {
        await enterList()
        await expectFocus(A1)
        const outline = await browser.execute(() => {
            const style = getComputedStyle(document.activeElement as HTMLElement)
            return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
        })
        expect(outline.style).toBe("solid")
        expect(outline.width).toBeGreaterThanOrEqual(2)
    })

    it("Up / Down / Home / End move inside the section and stop at its edges", async () => {
        await focusRow(A1)
        await browser.keys("ArrowUp")
        await expectFocus(A1)
        await browser.keys("ArrowDown")
        await expectFocus(A2)
        await expect(rowOf(A2)).toHaveAttribute("tabindex", "0")
        await expect(rowOf(A1)).toHaveAttribute("tabindex", "-1")
        await browser.keys("End")
        await expectFocus(SUB)
        // The next section is not reached: the list ends here
        await browser.keys("ArrowDown")
        await expectFocus(SUB)
        await browser.keys("Home")
        await expectFocus(A1)
        await focusRow(B1)
        await browser.keys("ArrowUp")
        await expectFocus(B1)
    })

    it("Left closes a task with subtasks, Right opens it, then goes to the first subtask; Left goes back to the parent", async () => {
        await focusRow(A3)
        await expect(rowOf(A3)).toHaveAttribute("aria-expanded", "true")
        await browser.keys("ArrowLeft")
        await browser.waitUntil(async () => (await rowOf(A3).getAttribute("aria-expanded")) === "false", { timeoutMsg: "A3 did not close" })
        await expect(rowOf(SUB)).not.toBeExisting()
        await browser.keys("ArrowRight")
        await rowOf(SUB).waitForDisplayed({ timeoutMsg: "A3 did not open" })
        await browser.keys("ArrowRight")
        await expectFocus(SUB)
        await browser.keys("ArrowLeft")
        await expectFocus(A3)
    })

    it("Space completes the task and the focus stays on it", async () => {
        await focusRow(A2)
        await browser.keys(" ")
        await browser.waitUntil(() => completed(A2), { timeoutMsg: "A2 was not completed" })
        await expectFocus(A2)
        await browser.keys(" ")
        await browser.waitUntil(async () => !(await completed(A2)), { timeoutMsg: "A2 was not reopened" })
    })

    it("Enter renames, and the focus is back on the row after Enter", async () => {
        await focusRow(A2)
        await browser.keys("Enter")
        await browser.waitUntil(async () => browser.execute(() => document.activeElement instanceof HTMLTextAreaElement && !document.activeElement.readOnly), { timeoutMsg: "the rename field did not open" })
        await browser.keys(["Control", "a"])
        await browser.keys(A2_RENAMED)
        // WebKitWebDriver (Linux) can drop the Shift of capitals ("TaskKbd" arrives as "askKbd"): the text is then set
        // through the native setter plus an input event, which React picks up like typing (see typeInto)
        await browser.execute((text: string) => {
            const el = document.activeElement
            if (!(el instanceof HTMLTextAreaElement) || el.value === text) return
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, text)
            el.dispatchEvent(new Event("input", { bubbles: true }))
        }, A2_RENAMED)
        await browser.keys("Enter")
        await rowOf(A2_RENAMED).waitForDisplayed({ timeoutMsg: "the rename was not applied" })
        await expectFocus(A2_RENAMED)
    })

    it("Alt+Down / Alt+Up move the task, the focus stays on it and the order is saved", async () => {
        const names = [A1, A2_RENAMED, A3]
        await focusRow(A1)
        await browser.keys(["Alt", "ArrowDown"])
        await browser.waitUntil(async () => JSON.stringify(await topLevelOrder(names)) === JSON.stringify([A2_RENAMED, A1, A3]), { timeoutMsg: "A1 was not moved down in the database" })
        await expectFocus(A1)
        // The live region is visually hidden (sr-only): read its textContent, since WebKitGTK's getText returns nothing for it.
        // The announcer also alternates a trailing non-breaking space, which is dropped here.
        const announced = await tr("tasks.keyboard.moved", { position: 2, total: 3 })
        await browser.waitUntil(
            async () => (await browser.execute(() => document.querySelector("[role='status'][aria-live='polite'].sr-only")?.textContent ?? "")).replace(/\u00A0/g, " ").trim() === announced,
            { timeoutMsg: "the move was not announced" },
        )
        await browser.keys(["Alt", "ArrowUp"])
        await browser.waitUntil(async () => JSON.stringify(await topLevelOrder(names)) === JSON.stringify(names), { timeoutMsg: "A1 was not moved back up in the database" })
        await expectFocus(A1)
        // Arrows keep working from the moved task
        await browser.keys("ArrowDown")
        await expectFocus(A2_RENAMED)
    })

    it("Shift+F10 opens the menu of the task and Esc gives the focus back to the row", async () => {
        await focusRow(A2_RENAMED)
        await browser.keys(["Shift", "F10"])
        await $('[role="menu"]').waitForDisplayed({ timeoutMsg: "the menu did not open with Shift+F10" })
        await expect(byText(await tr("common.rename"), $('[role="menu"]'))).toBeDisplayed()
        await browser.keys("Escape")
        await $('[role="menu"]').waitForExist({ reverse: true, timeoutMsg: "the menu did not close" })
        await expectFocus(A2_RENAMED)
    })

    it("a right click on the text opens the menu without focusing the text or making it editable (card 164)", async () => {
        // Records every text field that takes the focus from now on: the read only text must never be one of them
        await browser.execute(() => {
            const w = window as unknown as { __focusedFields: string[] }
            w.__focusedFields = []
            document.addEventListener("focusin", e => {
                if (e.target instanceof HTMLTextAreaElement) w.__focusedFields.push(e.target.readOnly ? "readonly" : "editable")
            }, true)
        })
        const text = rowOf(A1).$("textarea")
        await openContextMenu(text)
        await browser.keys("Escape")
        await $('[role="menu"]').waitForExist({ reverse: true, timeoutMsg: "the menu did not close" })
        const state = await browser.execute(() => ({
            focused: (window as unknown as { __focusedFields: string[] }).__focusedFields,
            editable: document.querySelectorAll("[role='treeitem'] textarea:not([readonly])").length,
            active: document.activeElement?.tagName ?? "",
        }))
        expect(state.focused).toEqual([])
        expect(state.editable).toBe(0)
        expect(state.active).not.toBe("TEXTAREA")
    })

    const selectedTasks = () => browser.execute(() =>
        Array.from(document.querySelectorAll("[data-multi-selected='true']")).map(el => el.getAttribute("aria-label") ?? ""))

    it("Shift+Down extends the selection, Shift+Up shrinks it and the counter appears from 2 tasks", async () => {
        await focusRow(A1)
        await browser.keys(["Shift", "ArrowDown"])
        await expectFocus(A2_RENAMED)
        await browser.waitUntil(async () => (await $$("[data-multi-selected='true']").length) === 2, { timeoutMsg: "two tasks were not selected" })
        await expect($("[data-testid='selection-count']")).toBeDisplayed()
        await browser.keys(["Shift", "ArrowDown"])
        await browser.waitUntil(async () => (await $$("[data-multi-selected='true']").length) === 3, { timeoutMsg: "three tasks were not selected" })
        await browser.keys(["Shift", "ArrowUp"])
        await browser.waitUntil(async () => (await $$("[data-multi-selected='true']").length) === 2, { timeoutMsg: "the selection did not shrink" })
        expect((await selectedTasks()).map(label => label.startsWith(A1) || label.startsWith(A2_RENAMED)).every(Boolean)).toBe(true)
        await browser.keys("Escape")
        await browser.waitUntil(async () => (await $$("[data-multi-selected='true']").length) === 0, { timeoutMsg: "Esc did not clear the selection" })
    })

    it("Ctrl+Space adds a task that is not next to the selection, and plain arrows keep the selection", async () => {
        await focusRow(A1)
        await browser.keys(["Control", " "])
        await browser.waitUntil(async () => (await $$("[data-multi-selected='true']").length) === 1, { timeoutMsg: "A1 was not selected" })
        // Space alone would complete the task: it must not have
        expect(await completed(A1)).toBe(false)
        await browser.keys("ArrowDown")
        await browser.keys("ArrowDown")
        await expectFocus(A3)
        await browser.keys(["Control", " "])
        await browser.waitUntil(async () => (await $$("[data-multi-selected='true']").length) === 2, { timeoutMsg: "A3 was not added to the selection" })
        await expect($("[data-testid='selection-count']")).toBeDisplayed()
        await browser.keys(["Control", " "])
        await browser.waitUntil(async () => (await $$("[data-multi-selected='true']").length) === 1, { timeoutMsg: "A3 was not removed from the selection" })
        await browser.keys("Escape")
    })
})
