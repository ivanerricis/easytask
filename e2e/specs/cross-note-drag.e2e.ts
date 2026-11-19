import { $, $$, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, domClick, groupCard, newSectionInGroup, openContextMenu, openWorkspace,
    pane, paneTab, sectionCard, sql, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * Drag between the two notes of the split view. Crossing to the other note is allowed only while Ctrl is held for the drag: without
 * it the zones of the other note are not targets (nothing moves there, nothing is saved). With Ctrl the task is moved to the other
 * note; with Ctrl and Alt held at the release it is copied. One Ctrl+Z puts it all back.
 *
 * Drags run only on Windows (WebKitGTK of the CI does not deliver the events of the pointer actions).
 */
const WORKSPACE = "Cross Drag Workspace"
const NOTE_A = "Cross Note A"
const NOTE_B = "Cross Note B"
const GROUP_A = "Cross Group A"
const GROUP_B = "Cross Group B"
const SECTION_A = "Cross Section A"
const SECTION_B = "Cross Section B"
const TASK = "Cross mover"
const OTHER = "Cross stayer"

const CONTROL = ""
const ALT = ""

/** The note that holds each live task with this text (sorted), from the database. */
const notesOf = async (text: string): Promise<string[]> => {
    const rows = await sql<{ name: string }[]>(
        "select",
        `SELECT n.name AS name FROM task t JOIN section s ON s.id = t.sectionID JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID
         WHERE t.text = ? AND t.deleted_at IS NULL ORDER BY n.name`,
        [text],
    )
    return rows.map(row => row.name)
}

const waitForNotes = async (text: string, expected: string[]) =>
    browser.waitUntil(async () => JSON.stringify(await notesOf(text)) === JSON.stringify(expected), {
        timeoutMsg: `"${text}" is not in ${expected.join(", ")}: ${JSON.stringify(await notesOf(text))}`,
    })

/** Wrappers of the tasks of a pane that are shifted by the live drag. */
const shiftedIn = async (index: 0 | 1) =>
    browser.execute((p: number) => Array.from(document.querySelectorAll<HTMLElement>(`[data-pane="${p}"] [data-task-wrap]`)).filter(wrap => wrap.style.transform !== "").length, index)

const strayTransforms = async () =>
    browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>("[data-task-wrap]")).filter(wrap => wrap.style.transform !== "").length + document.querySelectorAll("[data-live-slot]").length)

/** A point of an element in the viewport: the middle of its width, `where` of its height (0.9 = the lower edge of a task row: "after" it). */
const centerOf = async (target: ChainablePromiseElement, where = 0.5) => {
    const element = (await target.getElement()) as unknown as HTMLElement
    return browser.execute((el: HTMLElement, f: number) => {
        const rect = el.getBoundingClientRect()
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height * f) }
    }, element, where)
}

type ChainablePromiseElement = ReturnType<typeof $>

/** The row of a task of a pane (a task row is an item of the tree of the note). */
const taskRow = (index: 0 | 1, text: string) => $(`[data-pane="${index}"] [role="treeitem"][aria-label=${JSON.stringify(text)}]`)

/**
 * Presses on `from`, moves to `to` and releases, in one chain of actions with the keyboard: Ctrl (when `ctrl`) goes down before the
 * press and stays down until after the release; Alt (when `alt`) goes down just before the release. `whilePressed` runs with the
 * pointer still down (the actions of the first part are performed, the release is a second call).
 */
const drag = async (
    from: ChainablePromiseElement, to: ChainablePromiseElement,
    { ctrl = false, alt = false, whilePressed }: { ctrl?: boolean, alt?: boolean, whilePressed?: () => Promise<void> } = {},
) => {
    const a = await centerOf(from)
    // The lower edge of the target row: the task goes after it (the middle would make it a subtask, which opens no room)
    const b = await centerOf(to, 0.9)
    const steps = 30
    const at = (i: number) => ({ x: Math.round(a.x + ((b.x - a.x) * i) / steps), y: Math.round(a.y + ((b.y - a.y) * i) / steps), origin: "viewport" as const })
    const pointer = browser.action("pointer", { parameters: { pointerType: "mouse" } })
    const keys = browser.action("key")
    // Tick 0: Ctrl down and the pointer over the source. Then the press and the moves
    if (ctrl) keys.down(CONTROL); else keys.pause(0)
    pointer.move({ ...at(0), duration: 0 })
    pointer.down(); keys.pause(0)
    for (let i = 1; i <= steps; i++) { pointer.move({ ...at(i), duration: 20 }); keys.pause(0) }
    await browser.actions([keys, pointer])
    try {
        await browser.pause(400) // the shifts glide for 150 ms
        await whilePressed?.()
    } finally {
        const releasePointer = browser.action("pointer", { parameters: { pointerType: "mouse" } })
        const releaseKeys = browser.action("key")
        if (alt) { releaseKeys.down(ALT); releasePointer.pause(0) }
        releasePointer.pause(50); releaseKeys.pause(0)
        releasePointer.up(); releaseKeys.pause(0)
        releasePointer.pause(0)
        if (alt) releaseKeys.up(ALT)
        if (ctrl) releaseKeys.up(CONTROL)
        await browser.actions([releaseKeys, releasePointer])
        await browser.releaseActions()
    }
    await browser.pause(600)
}

/** Moves a note with the "Open on the right" entry of its sidebar context menu. */
const openOnRight = async (name: string) => {
    const menu = await openContextMenu(treeRow(name))
    await byText(await tr("menu.openRight"), menu).click()
    await menu.waitForExist({ reverse: true, timeoutMsg: "the note menu did not close" })
}

const buildNote = async (note: string, group: string, section: string, tasks: string[]) => {
    await treeRow(note).click()
    await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
    await byLabel(await tr("menu.newGroup")).click()
    await typeInto(byLabel(await tr("groups.nameLabel")), group)
    await browser.keys("Enter")
    await byText(group).waitForDisplayed()
    await newSectionInGroup(groupCard(group), section)
    for (const text of tasks) await addTaskToSection(sectionCard(section), text)
}

describe("Drag between the two notes of the split view", () => {
    before(async () => {
        await waitForApp()
    })

    it("builds two notes, each with a group, a section and tasks, and opens the second one on the right", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_A)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_B)
        await buildNote(NOTE_A, GROUP_A, SECTION_A, [TASK, OTHER])
        await buildNote(NOTE_B, GROUP_B, SECTION_B, ["Cross resident"])
        await domClick(byLabel(await tr("notes.split.split")))
        await $('[data-pane="1"]').waitForDisplayed({ timeoutMsg: "the right pane did not appear" })
        await openOnRight(NOTE_B)
        await paneTab(1, NOTE_B).waitForDisplayed({ timeoutMsg: "note B did not open in the right pane" })
        await paneTab(0, NOTE_A).click()
        await taskRow(0, TASK).waitForDisplayed({ timeoutMsg: "the left pane does not show the task" })
        await taskRow(1, "Cross resident").waitForDisplayed({ timeoutMsg: "the right pane does not show its task" })
        await waitForNotes(TASK, [NOTE_A])
    })

    it("does not cross to the other note without Ctrl: nothing shifts there and nothing is saved", async function () {
        if (process.platform === "linux") return this.skip()
        await drag(taskRow(0, TASK), taskRow(1, "Cross resident"), {
            whilePressed: async () => {
                expect(await shiftedIn(1)).toBe(0)
                expect(await $$("[data-live-slot]")).toHaveLength(0)
            },
        })
        await waitForNotes(TASK, [NOTE_A])
        expect(await strayTransforms()).toBe(0)
        await expect(taskRow(0, TASK)).toBeDisplayed()
    })

    it("moves the task to the other note with Ctrl, and one Ctrl+Z brings it back", async function () {
        if (process.platform === "linux") return this.skip()
        await drag(taskRow(0, TASK), taskRow(1, "Cross resident"), {
            ctrl: true,
            whilePressed: async () => {
                // The room opens in the other note while the task is dragged over it
                expect(await shiftedIn(1)).toBeGreaterThan(0)
            },
        })
        await waitForNotes(TASK, [NOTE_B])
        await taskRow(1, TASK).waitForDisplayed({ timeoutMsg: "the task is not in the right pane" })
        await expect(taskRow(0, TASK)).not.toExist()
        expect(await strayTransforms()).toBe(0)

        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "z"])
        await waitForNotes(TASK, [NOTE_A])
        await taskRow(0, TASK).waitForDisplayed({ timeoutMsg: "the task did not come back to the left pane" })
        await expect(taskRow(1, TASK)).not.toExist()
    })

    it("copies the task with Ctrl and Alt: it is in both notes, and Ctrl+Z removes the copy", async function () {
        if (process.platform === "linux") return this.skip()
        await drag(taskRow(0, TASK), taskRow(1, "Cross resident"), { ctrl: true, alt: true })
        await waitForNotes(TASK, [NOTE_A, NOTE_B])
        await taskRow(1, TASK).waitForDisplayed({ timeoutMsg: "the copy is not in the right pane" })
        await expect(taskRow(0, TASK)).toBeDisplayed()

        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "z"])
        await waitForNotes(TASK, [NOTE_A])
        await expect(taskRow(1, TASK)).not.toExist()
        await expect(pane(0)).toBeDisplayed()
    })
})
