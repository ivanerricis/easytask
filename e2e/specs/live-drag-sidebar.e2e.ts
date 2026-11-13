import { browser, expect } from "@wdio/globals"
import { createFromSidebar, createWorkspace, openWorkspace, setLiveDrag, sql, waitForApp } from "../helpers"

/**
 * Live drag of the sidebar: with the pointer still down the other rows of the tree step aside (each row gets a `transform`) to open the
 * room where the dragged note or folder would land and close the one it leaves, and the dragged row collapses (it is invisible). Over the
 * middle of a folder nothing moves and the folder gets its ring. The line of the drop is drawn only with the live drag off.
 * After the drop the order is the visual one and no row keeps a `transform`.
 *
 * Drags run only on Windows (WebKitGTK of the CI does not deliver the events of the pointer actions).
 */
const WORKSPACE = "Live Sidebar Workspace"
const FOLDER_A = "Live Folder A"
const FOLDER_B = "Live Folder B"
const NOTES = ["Live Note 1", "Live Note 2", "Live Note 3"]

type Row = { label: string; top: number; height: number; transform: string; opacity: string; line: boolean; ring: boolean }

/** The rows of the tree, top to bottom by their VISUAL position (transforms included). */
const rows = async (): Promise<Row[]> => {
    const found = await browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>("[role=treeitem]")).map(row => {
        const rect = row.getBoundingClientRect()
        return {
            label: row.getAttribute("aria-label") ?? "",
            top: rect.top,
            height: rect.height,
            transform: row.style.transform,
            opacity: row.style.opacity,
            line: Array.from(row.children).some(child => child.classList.contains("bg-primary") && child.classList.contains("h-0.5")),
            ring: row.classList.contains("ring-primary"),
        }
    }))
    return found.sort((a, b) => a.top - b.top)
}

const row = async (label: string) => {
    const found = (await rows()).find(item => item.label === label)
    if (!found) throw new Error(`row "${label}" not found`)
    return found
}

/** Labels top to bottom as the user sees them (a collapsed, invisible row is left out). */
const visibleLabels = async () => (await rows()).filter(item => item.opacity !== "0").map(item => item.label)

/** The skeletons drawn in the room that opens, with their place on screen. */
const slots = async () => browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>("[data-live-slot]")).map(slot => {
    const rect = slot.getBoundingClientRect()
    return { top: rect.top, height: rect.height }
}))

const strayTransforms = async () =>
    browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>("[role=treeitem]")).filter(item => item.style.transform !== "" || item.style.opacity !== "").length
        + document.querySelectorAll("[data-live-slot]").length)

/** Where each note is saved: its folder name (null at the root) and position, from the database. */
const savedNotes = async () =>
    sql<{ name: string; folder: string | null }[]>(
        "select",
        `SELECT n.name AS name, f.name AS folder FROM note n LEFT JOIN folder f ON f.id = n.folderID
         WHERE n.name LIKE 'Live Note %' ORDER BY n.position, n.id`,
    )

/**
 * Presses on the source row, moves over the target (the point at `where` of its height: 0.1 = top, 0.5 = middle, 0.92 = bottom) and
 * calls `whilePressed` with the pointer still down, then releases.
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
    await browser.pause(500)
}

const labelsNow = async () => (await rows()).map(item => item.label)

describe("Live drag of the sidebar", () => {
    before(async () => {
        await waitForApp()
    })

    it("builds a workspace with two folders and three notes", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addFolder", "dialogs.addFolder.submit", FOLDER_A)
        await createFromSidebar("sidebar.addFolder", "dialogs.addFolder.submit", FOLDER_B)
        for (const name of NOTES) await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", name)
        await browser.waitUntil(async () => (await labelsNow()).length === 5, { timeoutMsg: "the tree does not show the five rows" })
        expect(await labelsNow()).toEqual([FOLDER_A, FOLDER_B, ...NOTES])
    })

    it("opens the room and collapses the dragged note, with no line, then saves the visual order", async function () {
        if (process.platform === "linux") return this.skip()
        const before = { two: await row(NOTES[1]), three: await row(NOTES[2]) }
        const room = before.two.top - (await row(NOTES[0])).top

        await drag(NOTES[0], NOTES[2], 0.92, async () => {
            expect((await row(NOTES[0])).opacity).toBe("0") // the source collapses
            expect(await visibleLabels()).toEqual([FOLDER_A, FOLDER_B, NOTES[1], NOTES[2]])
            const two = await row(NOTES[1])
            const three = await row(NOTES[2])
            // the two notes it passes step up by its room
            expect(two.transform).not.toBe("")
            expect(Math.abs(two.top - (before.two.top - room))).toBeLessThan(3)
            expect(Math.abs(three.top - (before.three.top - room))).toBeLessThan(3)
            expect((await rows()).some(item => item.line || item.ring)).toBe(false)
            // The skeleton fills the room after the third note, as tall as a row
            const found = await slots()
            expect(found).toHaveLength(1)
            expect(Math.abs(found[0].top - (three.top + room))).toBeLessThan(3)
            expect(Math.abs(found[0].height - three.height)).toBeLessThan(2)
        })

        await browser.waitUntil(async () => (await savedNotes()).map(item => item.name).join() === [NOTES[1], NOTES[2], NOTES[0]].join(), {
            timeoutMsg: `the saved order is not the visual one: ${JSON.stringify(await savedNotes())}`,
        })
        expect(await strayTransforms()).toBe(0)
        expect(await labelsNow()).toEqual([FOLDER_A, FOLDER_B, NOTES[1], NOTES[2], NOTES[0]])
    })

    it("going up opens the room before the row and shifts the rows after it down", async function () {
        if (process.platform === "linux") return this.skip()
        const before = { two: await row(NOTES[1]), three: await row(NOTES[2]) }

        await drag(NOTES[0], NOTES[1], 0.1, async () => {
            expect((await row(NOTES[0])).opacity).toBe("0")
            expect((await row(NOTES[1])).top).toBeGreaterThan(before.two.top + 3)
            expect((await row(NOTES[2])).top).toBeGreaterThan(before.three.top + 3)
            // The room opens where the second note was
            const found = await slots()
            expect(found).toHaveLength(1)
            expect(Math.abs(found[0].top - before.two.top)).toBeLessThan(3)
        })

        await browser.waitUntil(async () => (await savedNotes()).map(item => item.name).join() === [NOTES[0], NOTES[1], NOTES[2]].join(), {
            timeoutMsg: `the saved order is not the visual one: ${JSON.stringify(await savedNotes())}`,
        })
        expect(await strayTransforms()).toBe(0)
    })

    it("over the middle of a folder nothing moves and the folder gets its ring; the note lands inside", async function () {
        if (process.platform === "linux") return this.skip()
        const before = await rows()

        await drag(NOTES[2], FOLDER_B, 0.5, async () => {
            const during = await rows()
            expect((await row(FOLDER_B)).ring).toBe(true)
            expect(await slots()).toHaveLength(0)
            for (const item of during) {
                expect(item.transform).toBe("")
                expect(Math.abs(item.top - before.find(old => old.label === item.label)!.top)).toBeLessThan(2)
            }
        })

        await browser.waitUntil(async () => (await savedNotes()).find(item => item.name === NOTES[2])?.folder === FOLDER_B, {
            timeoutMsg: `the note is not in the folder: ${JSON.stringify(await savedNotes())}`,
        })
        expect(await strayTransforms()).toBe(0)
    })

    it("moves nothing while dragging and draws the line when Live drag is off", async function () {
        if (process.platform === "linux") return this.skip()
        await setLiveDrag(false)
        try {
            const before = await rows()
            await drag(NOTES[0], NOTES[1], 0.92, async () => {
                const during = await rows()
                for (const item of during) {
                    expect(item.transform).toBe("")
                    expect(Math.abs(item.top - before.find(old => old.label === item.label)!.top)).toBeLessThan(2)
                }
                expect(during.some(item => item.line)).toBe(true)
                expect(await slots()).toHaveLength(0)
            })
            await browser.waitUntil(async () => (await savedNotes()).filter(item => item.folder === null).map(item => item.name).join() === [NOTES[1], NOTES[0]].join(), {
                timeoutMsg: `the drop with the line did not save the order: ${JSON.stringify(await savedNotes())}`,
            })
            expect(await strayTransforms()).toBe(0)
        } finally {
            await setLiveDrag(true)
        }
    })
})
