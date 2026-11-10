import { browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, groupCard, newSectionInGroup,
    openWorkspace, sectionCard, setLiveDrag, sql, tr, treeRow, typeInto, waitForApp,
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

/**
 * Presses on the source task, moves over the target (the point at `where` of its height, 0.92 = bottom edge, i.e. "after") and calls
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

/**
 * Live drag of the sections: with the pointer still down the other sections step aside (the wrapper of the whole card gets a
 * `transform`, its tasks ride on it) to open the room where the dragged one would land, and the dragged one collapses. It works inside
 * a group and from a group to another one. After the drop the order is the visual one, Ctrl+Z restores it and no card keeps a transform.
 */
const SECOND_GROUP = "Live Drag Group Two"
const S_ONE = SECTION
const S_TWO = "Live Section Two"
const S_THREE = "Live Section Three"
const S_OTHER = "Live Section Other"

type SectionBox = { title: string; top: number; height: number; transform: string; opacity: string }

/** The section cards of a group (the list of the direct tasks is not one of them), top to bottom by their VISUAL position. */
const sectionBoxes = async (group: string): Promise<SectionBox[]> => {
    const found = await browser.execute((el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>("[data-section-card]")).map(card => {
        const rect = card.getBoundingClientRect()
        return { title: card.querySelector<HTMLElement>("button[title]")?.title ?? "", top: rect.top, height: rect.height, transform: card.style.transform, opacity: card.style.opacity }
    }), (await groupCard(group).getElement()) as unknown as HTMLElement)
    return found.sort((a, b) => a.top - b.top)
}

const sectionBox = async (group: string, title: string) => {
    const found = (await sectionBoxes(group)).find(item => item.title === title)
    if (!found) throw new Error(`section "${title}" not found in ${group}`)
    return found
}

/** Titles of the sections of a group in the order they are drawn. */
const sectionOrder = async (group: string) => (await sectionBoxes(group)).map(item => item.title)

const waitForSectionOrder = async (group: string, expected: string[]) =>
    browser.waitUntil(async () => JSON.stringify(await sectionOrder(group)) === JSON.stringify(expected), {
        timeoutMsg: `${group} does not show ${expected.join(" > ")}: ${JSON.stringify(await sectionOrder(group))}`,
    })

const strayCardTransforms = async () =>
    browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>("[data-section-card], [data-direct-tasks]")).filter(card => card.style.transform !== "").length)

/**
 * Presses on the header of a section, moves over the section `target` (the point at `where` of its height: 0.1 = top half, 0.9 = bottom
 * half) and calls `whilePressed` with the pointer still down, then releases.
 */
const dragSection = async (source: string, target: string, where: number, whilePressed: () => Promise<void>) => {
    const points = await browser.execute((from: string, to: string, f: number) => {
        const card = (title: string) => Array.from(document.querySelectorAll<HTMLElement>("[data-section-card]"))
            .find(el => el.querySelector<HTMLElement>("button[title]")?.title === title)!
        const a = card(from).querySelector<HTMLElement>("button[title]")!.getBoundingClientRect()
        const b = card(to).getBoundingClientRect()
        return { a: { x: Math.round(a.left + a.width / 2), y: Math.round(a.top + a.height / 2) }, b: { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height * f) } }
    }, source, target, where)
    const steps = 30
    const at = (i: number) => ({ x: Math.round(points.a.x + ((points.b.x - points.a.x) * i) / steps), y: Math.round(points.a.y + ((points.b.y - points.a.y) * i) / steps) })
    const first = browser.action("pointer", { parameters: { pointerType: "mouse" } })
    first.move({ ...at(0), origin: "viewport" }).down()
    for (let i = 1; i <= 6; i++) first.move({ ...at(i), origin: "viewport", duration: 20 })
    await first.perform(true)
    for (let i = 7; i <= steps; i++) await browser.action("pointer", { parameters: { pointerType: "mouse" } }).move({ ...at(i), origin: "viewport", duration: 20 }).perform(true)
    try {
        await browser.pause(400) // the shifts glide for 150 ms
        await whilePressed()
    } finally {
        await browser.releaseActions()
    }
    await browser.pause(400)
}

describe("Live drag of the sections", () => {
    it("builds a group of three sections and a second group", async function () {
        if (process.platform === "linux") return this.skip()
        await newSectionInGroup(groupCard(GROUP), S_TWO)
        await newSectionInGroup(groupCard(GROUP), S_THREE)
        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), SECOND_GROUP)
        await browser.keys("Enter")
        await byText(SECOND_GROUP).waitForDisplayed()
        await newSectionInGroup(groupCard(SECOND_GROUP), S_OTHER)
        await waitForSectionOrder(GROUP, [S_ONE, S_TWO, S_THREE])
    })

    it("inside a group: the sections it passes step up by its room, the dragged one collapses; the drop and the undo are visual", async function () {
        if (process.platform === "linux") return this.skip()
        const before = { one: await sectionBox(GROUP, S_ONE), two: await sectionBox(GROUP, S_TWO), three: await sectionBox(GROUP, S_THREE) }
        const room = before.two.top - before.one.top

        await dragSection(S_ONE, S_THREE, 0.9, async () => {
            expect((await sectionBox(GROUP, S_ONE)).opacity).toBe("0")
            const two = await sectionBox(GROUP, S_TWO)
            const three = await sectionBox(GROUP, S_THREE)
            expect(two.transform).not.toBe("")
            expect(three.transform).not.toBe("")
            expect(Math.abs(two.top - (before.two.top - room))).toBeLessThan(3)
            expect(Math.abs(three.top - (before.three.top - room))).toBeLessThan(3)
        })

        await waitForSectionOrder(GROUP, [S_TWO, S_THREE, S_ONE])
        expect(await strayCardTransforms()).toBe(0)

        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "z"])
        await waitForSectionOrder(GROUP, [S_ONE, S_TWO, S_THREE])
        expect(await strayCardTransforms()).toBe(0)
    })

    it("to another group: the group it leaves closes, the one it joins opens, and the section lands there", async function () {
        if (process.platform === "linux") return this.skip()
        const before = { one: await sectionBox(GROUP, S_ONE), two: await sectionBox(GROUP, S_TWO), other: await sectionBox(SECOND_GROUP, S_OTHER) }
        const room = before.two.top - before.one.top

        await dragSection(S_ONE, S_OTHER, 0.1, async () => {
            expect((await sectionBox(GROUP, S_ONE)).opacity).toBe("0")
            const two = await sectionBox(GROUP, S_TWO)
            const other = await sectionBox(SECOND_GROUP, S_OTHER)
            expect(Math.abs(two.top - (before.two.top - room))).toBeLessThan(3)
            expect(Math.abs(other.top - (before.other.top + room))).toBeLessThan(3)
        })

        await waitForSectionOrder(SECOND_GROUP, [S_ONE, S_OTHER])
        await waitForSectionOrder(GROUP, [S_TWO, S_THREE])
        expect(await strayCardTransforms()).toBe(0)

        await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
        await browser.keys(["Control", "z"])
        await waitForSectionOrder(GROUP, [S_ONE, S_TWO, S_THREE])
        await waitForSectionOrder(SECOND_GROUP, [S_OTHER])
    })

    it("moves nothing while dragging a section when Live drag is off", async function () {
        if (process.platform === "linux") return this.skip()
        await setLiveDrag(false)
        try {
            const before = await sectionBoxes(GROUP)
            await dragSection(S_ONE, S_THREE, 0.9, async () => {
                for (const item of await sectionBoxes(GROUP)) {
                    expect(item.transform).toBe("")
                    expect(Math.abs(item.top - before.find(old => old.title === item.title)!.top)).toBeLessThan(2)
                }
            })
            await waitForSectionOrder(GROUP, [S_TWO, S_THREE, S_ONE])
            expect(await strayCardTransforms()).toBe(0)
        } finally {
            await setLiveDrag(true)
        }
    })
})
