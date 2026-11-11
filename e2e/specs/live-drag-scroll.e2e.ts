import { browser, expect } from "@wdio/globals"
import {
    byLabel, byText, createFromSidebar, createWorkspace, domClick, openContextMenu, openWorkspace, pane, paneTab, setLiveDrag, sql, tr,
    treeRow, waitForApp,
} from "../helpers"

/**
 * Live drag where the columns scroll sideways and where there are two panes.
 *
 * 1. Horizontal scroll: a note whose groups are wider than the window together (`data-testid="group-scroll"` scrolls). With the pointer
 *    still down at the edge of the area, the room opened by the live drag and the columns that stepped aside must not be cut by the
 *    container, the autoscroll of dnd-kit must not make the target flip back and forth, and the drop must leave the expected order.
 * 2. Split view: a group, a section and a task dragged inside a pane with the live drag on move their own pane only (nothing moves, and
 *    nothing is highlighted, in the other pane) and drop where they should.
 *
 * Drags run only on Windows (WebKitGTK of the CI does not deliver the events of the pointer actions).
 */
const WORKSPACE = "Live Scroll Workspace"
const NOTE_A = "Live Scroll Note A"
const NOTE_B = "Live Scroll Note B"
const NOTE_C = "Live Scroll Note C"

type SeedGroup = { name: string, width?: number, sections: { title: string, tasks: string[] }[] }

/** Writes groups, sections and tasks of a note straight into the database (the page is reloaded afterwards). */
const seedNote = async (noteName: string, groups: SeedGroup[]) => {
    const [{ id: noteId }] = await sql<{ id: number }[]>("select", "SELECT id FROM note WHERE name = ?", [noteName])
    for (const [gi, group] of groups.entries()) {
        const g = (await sql<number[]>("execute", "INSERT INTO section_group (noteID, position, name, width) VALUES (?, ?, ?, ?)", [noteId, gi, group.name, group.width ?? null]))[1]
        await sql("execute", "INSERT INTO section (groupID, title, position, is_default) VALUES (?, NULL, 0, 1)", [g])
        for (const [si, section] of group.sections.entries()) {
            const s = (await sql<number[]>("execute", "INSERT INTO section (groupID, title, position) VALUES (?, ?, ?)", [g, section.title, si + 1]))[1]
            for (const [ti, text] of section.tasks.entries()) await sql("execute", "INSERT INTO task (sectionID, text, position) VALUES (?, ?, ?)", [s, text, ti])
        }
    }
}

const savedGroups = async (noteName: string) =>
    (await sql<{ name: string }[]>("select", `SELECT g.name AS name FROM section_group g JOIN note n ON n.id = g.noteID
        WHERE n.name = ? AND g.deleted_at IS NULL ORDER BY g.position, g.id`, [noteName])).map(row => row.name)

const savedSections = async (groupName: string) =>
    (await sql<{ title: string }[]>("select", `SELECT s.title AS title FROM section s JOIN section_group g ON g.id = s.groupID
        WHERE g.name = ? AND s.is_default = 0 AND s.deleted_at IS NULL ORDER BY s.position, s.id`, [groupName])).map(row => row.title)

const savedTasks = async (sectionTitle: string) =>
    (await sql<{ text: string }[]>("select", `SELECT t.text AS text FROM task t JOIN section s ON s.id = t.sectionID
        WHERE s.title = ? AND t.taskID IS NULL AND t.deleted_at IS NULL ORDER BY t.position, t.id`, [sectionTitle])).map(row => row.text)

const waitForSaved = async (read: () => Promise<string[]>, expected: string[]) =>
    browser.waitUntil(async () => JSON.stringify(await read()) === JSON.stringify(expected), {
        timeoutMsg: `the saved order is not ${expected.join(" > ")}: ${JSON.stringify(await read())}`,
    })

type Point = { x: number, y: number }

/**
 * Presses at `start`, moves to `end` in small steps (the first ones in the same chain as the press, so the drag has activated before the
 * next call), calls `whilePressed` with the pointer still down, then releases.
 */
const dragPoints = async (start: Point, end: Point, whilePressed: () => Promise<void>) => {
    const steps = 30
    const at = (i: number): Point => ({ x: Math.round(start.x + ((end.x - start.x) * i) / steps), y: Math.round(start.y + ((end.y - start.y) * i) / steps) })
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
    await browser.pause(500)
}

/** Center of the title button of a group / section card (the drag handle), or of a task row. */
const headerPoint = (kind: "group" | "section" | "task", name: string) => browser.execute((k: string, label: string): Point => {
    const el = k === "task"
        ? document.querySelector<HTMLElement>(`[role=treeitem][aria-label="${label}"]`)!
        : Array.from(document.querySelectorAll<HTMLElement>(k === "group" ? "[data-group-wrap]" : "[data-section-card]"))
            .find(node => node.querySelector<HTMLElement>("button[title]")?.title === label)!.querySelector<HTMLElement>("button[title]")!
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
}, kind, name)

/** A point at a fraction of the card of a group / section, or of the row of a task. */
const cardPoint = (kind: "group" | "section" | "task", name: string, fx: number, fy: number) => browser.execute((k: string, label: string, x: number, y: number): Point => {
    const titled = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).find(node => node.querySelector<HTMLElement>("button[title]")?.title === label)!
    const el = k === "task"
        ? document.querySelector<HTMLElement>(`[role=treeitem][aria-label="${label}"]`)!
        : k === "group" ? titled("[data-group-wrap]").querySelector<HTMLElement>("[data-group-card]")! : titled("[data-section-card]")
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width * x), y: Math.round(r.top + r.height * y) }
}, kind, name, fx, fy)


/** The group columns of the open panes with their visual boxes, left to right, plus the geometry of the scrolling container. */
const columns = (paneIndex: 0 | 1 | null) => browser.execute((index: number | null) => {
    const root: ParentNode = index === null ? document : document.querySelector(`[data-pane="${index}"]`)!
    const scroller = root.querySelector<HTMLElement>('[data-testid="group-scroll"]')!
    const area = scroller.getBoundingClientRect()
    const wraps = Array.from(root.querySelectorAll<HTMLElement>("[data-group-wrap]")).map(wrap => {
        const r = wrap.getBoundingClientRect()
        return { title: wrap.querySelector<HTMLElement>("button[title]")?.title ?? "", left: r.left, right: r.right, transform: wrap.style.transform, opacity: wrap.style.opacity }
    }).sort((a, b) => a.left - b.left)
    return {
        wraps,
        scrollLeft: scroller.scrollLeft, scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth,
        areaLeft: area.left, areaRight: area.right - (scroller.offsetWidth - scroller.clientWidth),
    }
}, paneIndex)

/** Same for the transforms of the sections and the tasks of a pane (what moved there). */
const transformedIn = (paneIndex: 0 | 1) => browser.execute((index: number) => {
    const root = document.querySelector(`[data-pane="${index}"]`)!
    return Array.from(root.querySelectorAll<HTMLElement>("[data-group-wrap], [data-section-card], [data-direct-tasks], [data-task-wrap]"))
        .filter(el => el.style.transform !== "" || el.style.opacity === "0").length
}, paneIndex)

/** Feedback highlighted anywhere in a pane (rings and insertion lines of the drop). */
const feedbackIn = (paneIndex: 0 | 1) => browser.execute((index: number) => {
    const root = document.querySelector(`[data-pane="${index}"]`)!
    return root.querySelectorAll("[data-section-card].ring-primary, [data-direct-tasks].ring-primary, [data-group-card].ring-primary, [data-task-id].ring-primary").length
}, paneIndex)

/**
 * Sets the window size and waits until the page really has it (the window may start maximized, or at the size another spec left;
 * WebKitGTK resizes after the command returns). Compares the inner size with a margin for the frame of a decorated window.
 */
const resizeWindow = async (width: number, height: number) => {
    const margin = 40
    await browser.setWindowSize(width, height)
    let seen = { width: 0, height: 0 }
    await browser.waitUntil(async () => {
        seen = await browser.execute(() => ({ width: window.innerWidth, height: window.innerHeight }))
        return Math.abs(seen.width - width) <= margin && Math.abs(seen.height - height) <= margin
    }, { timeoutMsg: `the window did not reach ${width}x${height}: inner size ${seen.width}x${seen.height}` })
}

/**
 * The scroll offsets of every element that may not scroll during a drag: all but the row of the groups and the lists of the groups
 * of the pane the drag happens in (those scroll by themselves near their edges). Compared before and after the drag.
 */
const offsetsOutside = (paneIndex: 0 | 1 | null) => browser.execute((index: number | null) => {
    const scope = index === null ? null : document.querySelector(`[data-pane="${index}"]`)
    const own = (el: Element) => (el.matches('[data-testid="group-scroll"], [data-group-list]') && (scope === null || scope.contains(el)))
    return Array.from(document.querySelectorAll<HTMLElement>("*")).map((el, i) => ({ i, el }))
        .filter(({ el }) => !own(el) && (el.scrollTop !== 0 || el.scrollLeft !== 0 || el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth))
        .map(({ i, el }) => `${i}:${el.tagName.toLowerCase()}${el.getAttribute("data-pane") ? `[pane ${el.getAttribute("data-pane")}]` : ""}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}@${Math.round(el.scrollLeft)},${Math.round(el.scrollTop)}`)
}, paneIndex)

describe("Live drag with horizontal scroll and in a split view", () => {
    let previousSize: { width: number, height: number } | undefined
    let previousLiveDrag: boolean | undefined

    before(async () => {
        await waitForApp()
        previousSize = await browser.getWindowSize()
        await resizeWindow(1200, 800)
        // The specs share the preferences: the drags below need the live drag on, whatever another spec left
        previousLiveDrag = await setLiveDrag(true)
    })

    after(async () => {
        if (previousLiveDrag !== undefined) await setLiveDrag(previousLiveDrag)
        if (previousSize) await browser.setWindowSize(previousSize.width, previousSize.height)
    })

    it("builds two notes with wide groups", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_A)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_B)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_C)
        // Note A: four groups of 420 px (more than the area of a half window and, split, much more than a pane)
        await seedNote(NOTE_A, ["Scroll G1", "Scroll G2", "Scroll G3", "Scroll G4"].map(name => ({
            name, width: 420, sections: [{ title: `${name}-S1`, tasks: [`${name} task a`, `${name} task b`, `${name} task c`] }, { title: `${name}-S2`, tasks: [`${name} task d`, `${name} task e`] }],
        })))
        // Note C (split view tests): three narrow groups
        await seedNote(NOTE_C, ["Pane G1", "Pane G2", "Pane G3"].map(name => ({
            name, width: 160, sections: [{ title: `${name}-S1`, tasks: [`${name} task a`, `${name} task b`, `${name} task c`] }, { title: `${name}-S2`, tasks: [`${name} task d`, `${name} task e`] }],
        })))
        await seedNote(NOTE_B, ["Other G1", "Other G2"].map(name => ({
            name, width: 420, sections: [{ title: `${name}-S1`, tasks: [`${name} task a`, `${name} task b`] }],
        })))
        await browser.refresh()
        await waitForApp()
        try { await openWorkspace(WORKSPACE) } catch { /* already open after the reload */ }
        await treeRow(NOTE_A).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
        await byText("Scroll G1").waitForDisplayed({ timeoutMsg: "the seeded groups are not shown" })
        const { scrollWidth, clientWidth } = await columns(null)
        expect(scrollWidth).toBeGreaterThan(clientWidth + 100) // the area really scrolls sideways
    })

    describe("scroll", () => {
        const expectedOrder = ["Scroll G2", "Scroll G3", "Scroll G4", "Scroll G1"]

        /** Order of the transformed columns as a signature: which columns have stepped aside, sampled while the pointer rests at the edge. */
        const sampleWhileAtEdge = async (kind: "group" | "section") => {
            const signatures: string[] = []
            const scrolls: number[] = []
            const clipped: string[] = []
            for (let i = 0; i < 12; i++) {
                const state = await columns(null)
                scrolls.push(state.scrollLeft)
                signatures.push(state.wraps.map(c => `${c.title}:${c.transform === "" ? 0 : 1}:${c.opacity === "0" ? "h" : "v"}`).join("|"))
                // A column that stepped aside must stay inside what the container can show: not before its left edge (unreachable by
                // scrolling) nor past the end of its content
                for (const c of state.wraps) {
                    if (c.transform === "" && c.opacity !== "0") continue
                    if (c.opacity === "0") continue
                    const contentLeft = c.left - state.areaLeft + state.scrollLeft
                    const contentRight = c.right - state.areaLeft + state.scrollLeft
                    if (contentLeft < -0.5) clipped.push(`${kind}: ${c.title} starts ${contentLeft.toFixed(1)}px before the container`)
                    if (contentRight > state.scrollWidth + 0.5) clipped.push(`${kind}: ${c.title} ends ${(contentRight - state.scrollWidth).toFixed(1)}px past the content (${state.scrollWidth})`)
                }
                await browser.pause(120)
            }
            return { signatures, scrolls, clipped }
        }

        /** The target "flips back" when a signature comes back after another one replaced it (A, B, A). */
        const flips = (signatures: string[]) => {
            const runs = signatures.filter((s, i) => i === 0 || s !== signatures[i - 1])
            return runs.length - new Set(runs).size
        }

        /**
         * With the pointer still down, after the autoscroll: moves it from the empty area past the last group (nothing is a target there,
         * the rows stay where they were) to `to` and samples what the live drag shows there.
         */
        const settleAt = async (kind: "group" | "section", from: Point, to: Point) => {
            const pointer = browser.action("pointer", { parameters: { pointerType: "mouse" } })
            for (let i = 1; i <= 10; i++) pointer.move({ x: Math.round(from.x + ((to.x - from.x) * i) / 10), y: Math.round(from.y + ((to.y - from.y) * i) / 10), origin: "viewport", duration: 20 })
            await pointer.perform(true)
            await browser.pause(400)
            return sampleWhileAtEdge(kind)
        }

        it("a group dragged to the right edge: the autoscroll leaves no cut column and no flip, and the drop is where expected", async function () {
            if (process.platform === "linux") return this.skip()
            await byText("Scroll G1").waitForDisplayed()
            const start = await headerPoint("group", "Scroll G1")
            const area = await columns(null)
            // Over the right part of the visible area, where the autoscroll of dnd-kit starts
            const end = { x: Math.round(area.areaRight - 24), y: start.y }
            let result!: Awaited<ReturnType<typeof sampleWhileAtEdge>>
            let landed!: Awaited<ReturnType<typeof sampleWhileAtEdge>>
            const offsets = await offsetsOutside(null)
            await dragPoints(start, end, async () => {
                result = await sampleWhileAtEdge("group")
                expect(["a container outside the groups scrolled", await offsetsOutside(null)]).toEqual(["a container outside the groups scrolled", offsets])
                landed = await settleAt("group", end, await cardPoint("group", "Scroll G4", 0.85, 0.02).then(p => ({ x: p.x, y: end.y })))
            })
            expect(result.clipped).toEqual([])
            expect(Math.max(...result.scrolls)).toBeGreaterThan(result.scrolls[0])
            expect([`the target flipped: ${JSON.stringify([...new Set(result.signatures)])}`, flips(result.signatures)]).toEqual([`the target flipped: ${JSON.stringify([...new Set(result.signatures)])}`, 0])
            expect(landed.clipped).toEqual([])
            expect([`the target flipped: ${JSON.stringify([...new Set(landed.signatures)])}`, flips(landed.signatures)]).toEqual([`the target flipped: ${JSON.stringify([...new Set(landed.signatures)])}`, 0])
            await waitForSaved(() => savedGroups(NOTE_A), expectedOrder)
        })

        it("Ctrl+Z restores the order", async function () {
            if (process.platform === "linux") return this.skip()
            await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
            await browser.keys(["Control", "z"])
            await waitForSaved(() => savedGroups(NOTE_A), ["Scroll G1", "Scroll G2", "Scroll G3", "Scroll G4"])
            await browser.execute(() => { document.querySelector<HTMLElement>('[data-testid="group-scroll"]')!.scrollLeft = 0 })
        })

        it("a section dragged to the right edge: the room it opens is not cut and the target does not flip", async function () {
            if (process.platform === "linux") return this.skip()
            const start = await headerPoint("section", "Scroll G1-S1")
            const area = await columns(null)
            const end = { x: Math.round(area.areaRight - 24), y: start.y + 40 }
            let result!: Awaited<ReturnType<typeof sampleWhileAtEdge>>
            let landed!: Awaited<ReturnType<typeof sampleWhileAtEdge>>
            await dragPoints(start, end, async () => {
                result = await sampleWhileAtEdge("section")
                landed = await settleAt("section", end, await cardPoint("section", "Scroll G4-S2", 0.5, 0.9))
            })
            expect(result.clipped).toEqual([])
            expect([`the target flipped: ${JSON.stringify([...new Set(result.signatures)])}`, flips(result.signatures)]).toEqual([`the target flipped: ${JSON.stringify([...new Set(result.signatures)])}`, 0])
            expect(landed.clipped).toEqual([])
            expect([`the target flipped: ${JSON.stringify([...new Set(landed.signatures)])}`, flips(landed.signatures)]).toEqual([`the target flipped: ${JSON.stringify([...new Set(landed.signatures)])}`, 0])
            // It was dropped at the end of the last group after the autoscroll
            await waitForSaved(() => savedSections("Scroll G4"), ["Scroll G4-S1", "Scroll G4-S2", "Scroll G1-S1"])
            expect(await savedSections("Scroll G1")).toEqual(["Scroll G1-S2"])
            await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
            await browser.keys(["Control", "z"])
            await waitForSaved(() => savedSections("Scroll G1"), ["Scroll G1-S1", "Scroll G1-S2"])
        })
    })

    describe("split view", () => {
        it("opens note B on the right and note C on the left", async function () {
            await resizeWindow(1800, 900)
            await treeRow(NOTE_C).click()
            await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
            await domClick(byLabel(await tr("notes.split.split")))
            await pane(1).waitForDisplayed({ timeoutMsg: "the right pane did not appear" })
            const menu = await openContextMenu(treeRow(NOTE_B))
            await byText(await tr("menu.openRight"), menu).click()
            await menu.waitForExist({ reverse: true })
            await paneTab(1, NOTE_B).waitForDisplayed({ timeoutMsg: "note B did not open in the right pane" })
            await paneTab(0, NOTE_C).click()
            await byText("Other G1").waitForDisplayed({ timeoutMsg: "the right pane does not show its groups" })
            await byText("Pane G1").waitForDisplayed()
        })

        const quiet = async () => {
            expect(["the other pane moved", await transformedIn(1)]).toEqual(["the other pane moved", 0])
            expect(["the other pane shows feedback", await feedbackIn(1)]).toEqual(["the other pane shows feedback", 0])
        }

        it("a group dragged inside the left pane moves that pane only, and drops in place", async function () {
            if (process.platform === "linux") return this.skip()
            const start = await headerPoint("group", "Pane G1")
            const end = await cardPoint("group", "Pane G2", 0.9, 0)
            end.y = start.y
            await dragPoints(start, end, async () => {
                const left = await columns(0)
                expect(left.wraps.find(c => c.title === "Pane G1")!.opacity).toBe("0")
                expect(left.wraps.some(c => c.transform !== "" && c.title !== "Pane G1")).toBe(true)
                await quiet()
            })
            await waitForSaved(() => savedGroups(NOTE_C), ["Pane G2", "Pane G1", "Pane G3"])
            await waitForSaved(() => savedGroups(NOTE_B), ["Other G1", "Other G2"])
            expect(await transformedIn(0)).toBe(0)
            await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
            await browser.keys(["Control", "z"])
            await waitForSaved(() => savedGroups(NOTE_C), ["Pane G1", "Pane G2", "Pane G3"])
        })

        it("a section dragged inside the left pane moves that pane only, and drops in place", async function () {
            if (process.platform === "linux") return this.skip()
            const start = await headerPoint("section", "Pane G1-S1")
            const end = await cardPoint("section", "Pane G1-S2", 0.5, 0.9)
            await dragPoints(start, end, async () => {
                const section = await browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>('[data-pane="0"] [data-section-card]'))
                    .filter(card => card.style.transform !== "" || card.style.opacity === "0").length)
                expect(section).toBeGreaterThan(0)
                await quiet()
            })
            await waitForSaved(() => savedSections("Pane G1"), ["Pane G1-S2", "Pane G1-S1"])
            await waitForSaved(() => savedSections("Other G1"), ["Other G1-S1"])
            expect(await transformedIn(0)).toBe(0)
            await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
            await browser.keys(["Control", "z"])
            await waitForSaved(() => savedSections("Pane G1"), ["Pane G1-S1", "Pane G1-S2"])
        })

        it("a task dragged inside the left pane moves that pane only, and drops in place", async function () {
            if (process.platform === "linux") return this.skip()
            const start = await headerPoint("task", "Pane G2 task a")
            const end = await cardPoint("task", "Pane G2 task c", 0.5, 0.92)
            await dragPoints(start, end, async () => {
                const moved = await browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>('[data-pane="0"] [data-task-wrap]'))
                    .filter(wrap => wrap.style.transform !== "" || wrap.style.opacity === "0").length)
                expect(moved).toBeGreaterThan(0)
                await quiet()
            })
            await waitForSaved(() => savedTasks("Pane G2-S1"), ["Pane G2 task b", "Pane G2 task c", "Pane G2 task a"])
            await waitForSaved(() => savedTasks("Other G1-S1"), ["Other G1 task a", "Other G1 task b"])
            expect(await transformedIn(0)).toBe(0)
            await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
            await browser.keys(["Control", "z"])
            await waitForSaved(() => savedTasks("Pane G2-S1"), ["Pane G2 task a", "Pane G2 task b", "Pane G2 task c"])
        })

        it("a task dragged to the edges of the left pane scrolls nothing outside its groups, the right pane included", async function () {
            if (process.platform === "linux") return this.skip()
            const start = await headerPoint("task", "Pane G2 task a")
            const paneBox = await browser.execute(() => {
                const r = document.querySelector('[data-pane="0"]')!.getBoundingClientRect()
                return { right: Math.round(r.right), bottom: Math.round(Math.min(r.bottom, window.innerHeight)) }
            })
            const offsets = await offsetsOutside(0)
            // Held in the band at the bottom right corner of the pane, where an ancestor that scrolls would move
            const corner = { x: paneBox.right - 6, y: paneBox.bottom - 6 }
            await dragPoints(start, corner, async () => {
                for (let i = 0; i < 6; i++) {
                    expect(["a container outside the groups of the pane scrolled", await offsetsOutside(0)]).toEqual(["a container outside the groups of the pane scrolled", offsets])
                    await browser.pause(150)
                }
                // Back to where it started, so the drop changes nothing
                const back = browser.action("pointer", { parameters: { pointerType: "mouse" } })
                for (let i = 1; i <= 10; i++) back.move({ x: Math.round(corner.x + ((start.x - corner.x) * i) / 10), y: Math.round(corner.y + ((start.y - corner.y) * i) / 10), origin: "viewport", duration: 20 })
                await back.perform(true)
                await browser.pause(300)
            })
            await waitForSaved(() => savedTasks("Pane G2-S1"), ["Pane G2 task a", "Pane G2 task b", "Pane G2 task c"])
            expect(["the other pane scrolled", await offsetsOutside(0)]).toEqual(["the other pane scrolled", offsets])
        })

        it("the same in the right pane leaves the left one alone", async function () {
            if (process.platform === "linux") return this.skip()
            const start = await headerPoint("task", "Other G1 task a")
            const end = await cardPoint("task", "Other G1 task b", 0.5, 0.92)
            await dragPoints(start, end, async () => {
                expect(["the left pane moved", await transformedIn(0)]).toEqual(["the left pane moved", 0])
                expect(["the left pane shows feedback", await feedbackIn(0)]).toEqual(["the left pane shows feedback", 0])
                expect(await transformedIn(1)).toBeGreaterThan(0)
            })
            await waitForSaved(() => savedTasks("Other G1-S1"), ["Other G1 task b", "Other G1 task a"])
            await waitForSaved(() => savedGroups(NOTE_C), ["Pane G1", "Pane G2", "Pane G3"])
        })
    })
})
