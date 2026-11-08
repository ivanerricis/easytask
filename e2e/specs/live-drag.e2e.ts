import { browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, closeAllDialogs, createFromSidebar, createWorkspace, groupCard, newSectionInGroup, openSettingsOn,
    openWorkspace, sectionCard, settingsSwitch, sql, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * Live drag of the tasks: with the pointer still down the other tasks step aside (their wrapper gets a `transform`) to open the room
 * where the dragged task would land, and the dragged one collapses (its wrapper is invisible). After the drop the saved order is the
 * visual one, Ctrl+Z restores the old one and no wrapper keeps a `transform`. With the "Live drag" preference off nothing moves.
 *
 * Drags run only on Windows (WebKitGTK of the CI does not deliver the events of the pointer actions).
 */
const WORKSPACE = "Live Drag Workspace"
const NOTE = "Live Drag Note"
const GROUP = "Live Drag Group"
const SECTION = "Live Drag Section"
const TASKS = ["Live uno", "Live due", "Live tre", "Live quattro"]

type Box = { id: string; text: string; top: number; height: number; transform: string; opacity: string }

/** Wrappers of the tasks of the section, top to bottom by their VISUAL position (transforms included). */
const boxes = async (): Promise<Box[]> => {
    const found = await browser.execute(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-task-wrap]"))
        return rows.map(wrap => {
            const rect = wrap.getBoundingClientRect()
            const row = wrap.querySelector<HTMLElement>("[data-task-id]")
            return { id: wrap.getAttribute("data-task-wrap") ?? "", text: row?.getAttribute("aria-label") ?? "", top: rect.top, height: rect.height, transform: wrap.style.transform, opacity: wrap.style.opacity }
        })
    })
    return found.sort((a, b) => a.top - b.top)
}

const box = async (text: string) => {
    const found = (await boxes()).find(item => item.text === text)
    if (!found) throw new Error(`task "${text}" not found`)
    return found
}

/** Texts top to bottom as the user sees them while the drag is on (the dragged task, invisible, is left out). */
const visibleTexts = async () => (await boxes()).filter(item => item.opacity !== "0").map(item => item.text)

/** Order saved in the database for the tasks of the section. */
const savedOrder = async () => {
    const rows = await sql<{ text: string }[]>(
        "select",
        `SELECT t.text AS text FROM task t JOIN section s ON s.id = t.sectionID
         WHERE s.title = ? AND t.taskID IS NULL AND t.deleted_at IS NULL ORDER BY t.position, t.id`,
        [SECTION],
    )
    return rows.map(row => row.text)
}

const waitForSaved = async (expected: string[]) =>
    browser.waitUntil(async () => JSON.stringify(await savedOrder()) === JSON.stringify(expected), {
        timeoutMsg: `the saved order is not ${expected.join(" > ")}: ${JSON.stringify(await savedOrder())}`,
    })

const strayTransforms = async () =>
    browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>("[data-task-wrap]")).filter(wrap => wrap.style.transform !== "").length)

/** Sets the "Live drag" preference of Settings > Notes. */
const setLiveDrag = async (on: boolean) => {
    await openSettingsOn("notes")
    const toggle = await settingsSwitch("settings.notes.liveDrag.label")
    if (((await toggle.getAttribute("aria-checked")) === "true") !== on) await toggle.click()
    await closeAllDialogs()
}

/**
 * Presses on the source task, moves over the target (the point at `where` of its height, 0.92 = lower part, i.e. "after") and calls
 * `whilePressed` with the pointer still down, then releases. The first moves are in the same chain of actions as the press, so the
 * drag activates before the next call.
 */
const drag = async (source: string, target: string, where: number, whilePressed: () => Promise<void>) => {
    const points = await browser.execute((from: string, to: string, f: number) => {
        const at = (label: string, factor: number) => {
            const r = document.querySelector<HTMLElement>(`[role=treeitem][aria-label="${label}"]`)!.getBoundingClientRect()
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * factor) }
        }
        return { a: at(from, 0.5), b: at(to, f) }
    }, source, target, where)
    const steps = 24
    const y = (i: number) => Math.round(points.a.y + ((points.b.y - points.a.y) * i) / steps)
    const first = browser.action("pointer", { parameters: { pointerType: "mouse" } })
    first.move({ x: points.a.x, y: points.a.y, origin: "viewport" }).down()
    for (let i = 1; i <= 6; i++) first.move({ x: points.a.x, y: y(i), origin: "viewport", duration: 20 })
    await first.perform(true)
    for (let i = 7; i <= steps; i++) {
        await browser.action("pointer", { parameters: { pointerType: "mouse" } })
            .move({ x: points.a.x, y: y(i), origin: "viewport", duration: 20 }).perform(true)
    }
    try {
        await browser.pause(400) // the shifts glide for 150 ms
        await whilePressed()
    } finally {
        await browser.releaseActions()
    }
    await browser.pause(400)
}

describe("Live drag of the tasks", () => {
    before(async () => {
        await waitForApp()
    })

    it("builds a note with one section and four tasks", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed()
        await newSectionInGroup(groupCard(GROUP), SECTION)
        for (const text of TASKS) await addTaskToSection(sectionCard(SECTION), text)
        await waitForSaved(TASKS)
    })

    it("opens the room and collapses the dragged task while the pointer is down, then saves, undoes and leaves no transform", async function () {
        if (process.platform === "linux") return this.skip()
        const before = {
            uno: await box(TASKS[0]), due: await box(TASKS[1]), tre: await box(TASKS[2]), quattro: await box(TASKS[3]),
        }
        const room = before.due.top - before.uno.top

        // Drag the first task over the lower part of the third: it goes after it
        await drag(TASKS[0], TASKS[2], 0.92, async () => {
            expect((await box(TASKS[0])).opacity).toBe("0") // the source collapses
            expect(await visibleTexts()).toEqual([TASKS[1], TASKS[2], TASKS[3]])
            const due = await box(TASKS[1])
            const tre = await box(TASKS[2])
            const quattro = await box(TASKS[3])
            // the two tasks it passes step up by its room...
            expect(due.transform).not.toBe("")
            expect(tre.transform).not.toBe("")
            expect(Math.abs(due.top - (before.due.top - room))).toBeLessThan(3)
            expect(Math.abs(tre.top - (before.tre.top - room))).toBeLessThan(3)
            // ...and the one after the landing point stays, with the gap above it
            expect(Math.abs(quattro.top - before.quattro.top)).toBeLessThan(3)
            expect(quattro.top - tre.top).toBeGreaterThan(tre.height + room - 3)
        })

        const expected = [TASKS[1], TASKS[2], TASKS[0], TASKS[3]]
        await waitForSaved(expected)
        expect(await strayTransforms()).toBe(0)
        expect((await boxes()).map(item => item.text)).toEqual(expected)

        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "z"])
        await waitForSaved(TASKS)
        expect((await boxes()).map(item => item.text)).toEqual(TASKS)
        expect(await strayTransforms()).toBe(0)
    })

    it("moves nothing while dragging when Live drag is off", async function () {
        if (process.platform === "linux") return this.skip()
        await setLiveDrag(false)
        const before = await boxes()

        await drag(TASKS[0], TASKS[2], 0.92, async () => {
            const during = await boxes()
            expect(during.map(item => item.text)).toEqual(before.map(item => item.text))
            for (const item of during) {
                expect(item.transform).toBe("")
                expect(Math.abs(item.top - before.find(old => old.id === item.id)!.top)).toBeLessThan(2)
            }
        })

        // The drop still works with the indicator only
        await waitForSaved([TASKS[1], TASKS[2], TASKS[0], TASKS[3]])
        expect(await strayTransforms()).toBe(0)
        await setLiveDrag(true)
    })
})
