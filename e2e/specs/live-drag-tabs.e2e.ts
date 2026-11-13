import { browser, expect } from "@wdio/globals"
import { byLabel, createFromSidebar, createWorkspace, domClick, openWorkspace, pane, setLiveDrag, tr, treeRow, waitForApp } from "../helpers"

/**
 * Live drag of the open tabs: the other tabs step sideways to open the room where the dragged one would land (and close the one it
 * leaves) instead of showing a line, in one bar, between the two bars of the split view, and in a bar that scrolls. An empty bar has no
 * tab to step aside and keeps its line; with the setting off the line is the only feedback.
 *
 * Drags run only on Windows (WebKitGTK of the CI does not deliver the events of the pointer actions).
 */
const WORKSPACE = "Live Tabs Workspace"
// Nine tabs: enough to make the bar scroll when the window is narrow
const NOTES = ["Live Tab A", "Live Tab B", "Live Tab C", "Live Tab D", "Live Tab E", "Live Tab F", "Live Tab G", "Live Tab H", "Live Tab I"]
const [A, B, C, , E] = NOTES
/** The tabs without the ones in `names`. */
const without = (...names: string[]) => NOTES.filter(name => !names.includes(name))
/** The tabs with `name` moved to the place right after `after` (null: to the start). */
const movedAfter = (name: string, after: string | null) => {
    const rest = without(name)
    rest.splice(after === null ? 0 : rest.indexOf(after) + 1, 0, name)
    return rest
}

type Point = { x: number, y: number }

/** The titles of the tabs of a bar, left to right (null: the only bar). */
const tabOrder = (paneIndex: 0 | 1 | null) => browser.execute((index: number | null) => {
    const root: ParentNode = index === null ? document : document.querySelector(`[data-pane="${index}"]`)!
    return Array.from(root.querySelectorAll<HTMLElement>('[data-tab-wrap] [role="tab"]')).map(tab => tab.title)
}, paneIndex)

/** A point at a fraction of the width of the tab of a note (the wrapper that moves). */
const tabPoint = (name: string, fx: number) => browser.execute((label: string, x: number): Point => {
    const tab = Array.from(document.querySelectorAll<HTMLElement>('[data-tab-wrap] [role="tab"]')).find(el => el.title === label)!
    const r = tab.closest<HTMLElement>("[data-tab-wrap]")!.getBoundingClientRect()
    return { x: Math.round(r.left + r.width * x), y: Math.round(r.top + r.height / 2) }
}, name, fx)

/** What the tabs show right now: the wrappers that stepped aside, the hidden ones and the drop lines of a bar (null: all the bars). */
const barState = (paneIndex: 0 | 1 | null) => browser.execute((index: number | null) => {
    const root: ParentNode = index === null ? document : document.querySelector(`[data-pane="${index}"]`)!
    const wraps = Array.from(root.querySelectorAll<HTMLElement>("[data-tab-wrap]"))
    const bar = wraps[0]?.closest<HTMLElement>('[role="tablist"]') ?? root.querySelector<HTMLElement>('[role="tablist"]')!
    return {
        moved: wraps.filter(w => w.style.transform !== "").length,
        hidden: wraps.filter(w => w.style.opacity === "0").length,
        lines: bar.querySelectorAll(".bg-primary.w-0\\.5").length,
        scrollLeft: bar.scrollLeft, scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth, right: bar.getBoundingClientRect().right,
        overlay: document.querySelector('[data-testid="tab-drag-overlay"]') !== null,
    }
}, paneIndex)

/** Presses at `start`, moves to `end` in small steps, calls `whilePressed` with the pointer still down, then releases. */
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
    await browser.pause(700)
}

const waitForOrder = async (paneIndex: 0 | 1 | null, expected: string[]) =>
    browser.waitUntil(async () => JSON.stringify(await tabOrder(paneIndex)) === JSON.stringify(expected), {
        timeoutMsg: `the tabs are not ${expected.join(" > ")}: ${JSON.stringify(await tabOrder(paneIndex))}`,
    })

describe("Live drag of the tabs", () => {
    before(async () => {
        await waitForApp()
        await browser.setWindowSize(1800, 900)
    })

    it("opens nine notes as tabs", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        for (const name of NOTES) await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", name)
        for (const name of NOTES) await treeRow(name).click()
        await waitForOrder(null, NOTES)
    })

    describe("one bar", () => {
        it("a tab dragged to the right: the ones in between step aside, the dragged one is hidden, no line, and it drops there", async function () {
            if (process.platform === "linux") return this.skip()
            await setLiveDrag(true)
            const start = await tabPoint(A, 0.5)
            const end = await tabPoint(C, 0.85)
            await dragPoints(start, { x: end.x, y: start.y }, async () => {
                const state = await barState(null)
                expect(state.moved).toBeGreaterThan(0)
                expect(state.hidden).toBe(1)
                expect(state.lines).toBe(0)
                expect(state.overlay).toBe(true)
            })
            await waitForOrder(null, movedAfter(A, C))
            expect(await barState(null)).toMatchObject({ moved: 0, hidden: 0, overlay: false })
        })

        it("dragging it back to the start restores the order", async function () {
            if (process.platform === "linux") return this.skip()
            const start = await tabPoint(A, 0.5)
            const end = await tabPoint(B, 0.15)
            await dragPoints(start, { x: end.x, y: start.y }, async () => { /* just drop */ })
            await waitForOrder(null, NOTES)
        })

        it("with the live drag off the tabs stay still and a line shows where it lands", async function () {
            if (process.platform === "linux") return this.skip()
            await setLiveDrag(false)
            const start = await tabPoint(A, 0.5)
            const end = await tabPoint(C, 0.85)
            await dragPoints(start, { x: end.x, y: start.y }, async () => {
                const state = await barState(null)
                // (the dragged tab itself follows the pointer, as before)
                expect(state.moved).toBeLessThanOrEqual(1)
                expect(state.hidden).toBe(0)
                expect(state.lines).toBe(1)
            })
            await waitForOrder(null, movedAfter(A, C))
            await setLiveDrag(true)
            const back = await tabPoint(A, 0.5)
            const first = await tabPoint(B, 0.15)
            await dragPoints(back, { x: first.x, y: back.y }, async () => { /* just drop */ })
            await waitForOrder(null, NOTES)
        })
    })

    describe("a drag that ends at once", () => {
        it("pressing, moving and releasing in the same moment leaves no cover over the window", async () => {
            // dnd-kit does not report the end of a drag that ends before its first render: the closed hand cover must go anyway
            const start = await tabPoint(B, 0.5)
            await browser.execute((x: number, y: number) => {
                const target = document.elementFromPoint(x, y)!
                const init = (cx: number, buttons: number) => ({ bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons })
                target.dispatchEvent(new PointerEvent("pointerdown", init(x, 1)))
                document.dispatchEvent(new PointerEvent("pointermove", init(x + 10, 1)))
                document.dispatchEvent(new PointerEvent("pointerup", init(x + 10, 0)))
            }, start.x, start.y)
            await browser.waitUntil(async () => browser.execute(() => document.querySelector("[data-drag-cursor]") === null), {
                timeoutMsg: "the cover of the drag stayed over the window",
            })
            await waitForOrder(null, NOTES)
        })
    })

    describe("a bar that scrolls", () => {
        it("a tab dragged past the right edge: the autoscroll leaves no stuck tab and the drop is at the end", async function () {
            if (process.platform === "linux") return this.skip()
            await browser.setWindowSize(760, 800)
            await browser.waitUntil(async () => {
                const { scrollWidth, clientWidth } = await barState(null)
                return scrollWidth > clientWidth + 20
            }, { timeoutMsg: "the bar does not scroll sideways with nine tabs" })
            const start = await tabPoint(A, 0.5)
            const bar = await barState(null)
            const end = { x: Math.round(bar.right - 24), y: start.y }
            await dragPoints(start, end, async () => {
                const states: number[] = []
                for (let i = 0; i < 6; i++) {
                    states.push((await barState(null)).scrollLeft)
                    await browser.pause(150)
                }
                expect(Math.max(...states)).toBeGreaterThan(0)
                expect((await barState(null)).hidden).toBe(1)
            })
            await waitForOrder(null, [...without(A), A])
            expect(await barState(null)).toMatchObject({ moved: 0, hidden: 0 })
            await browser.setWindowSize(1800, 900)
            // Back to the start for the next specs
            const last = await tabPoint(A, 0.5)
            const first = await tabPoint(B, 0.15)
            await dragPoints(last, { x: first.x, y: last.y }, async () => { /* just drop */ })
            await waitForOrder(null, NOTES)
        })
    })

    describe("split view", () => {
        it("splits and moves a tab between the bars: the right bar opens the room, the left one closes it", async function () {
            if (process.platform === "linux") return this.skip()
            await domClick(byLabel(await tr("notes.split.split")))
            await pane(1).waitForDisplayed({ timeoutMsg: "the right pane did not appear" })
            // The empty right bar: no tab steps aside and its line shows
            const start = await tabPoint(E, 0.5)
            const empty = await browser.execute((): Point => {
                const r = document.querySelector<HTMLElement>('[data-pane="1"] [role="tablist"]')!.getBoundingClientRect()
                return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
            })
            await dragPoints(start, empty, async () => {
                const state = await barState(1)
                expect(state.lines).toBe(1)
                expect(state.moved + (await barState(0)).moved).toBe(0)
            })
            await waitForOrder(1, [E])
            await waitForOrder(0, without(E))
            // Now between the tabs of the right bar: moving the third left tab before the only right one
            const from = await tabPoint(C, 0.5)
            const to = await tabPoint(E, 0.15)
            await dragPoints(from, to, async () => {
                const right = await barState(1)
                const left = await barState(0)
                expect(right.moved).toBe(1)
                expect(left.moved).toBeGreaterThan(0)
                expect(left.hidden).toBe(1)
                expect(right.lines + left.lines).toBe(0)
            })
            await waitForOrder(1, [C, E])
            await waitForOrder(0, without(C, E))
            expect(await barState(0)).toMatchObject({ moved: 0, hidden: 0 })
            expect(await barState(1)).toMatchObject({ moved: 0, hidden: 0 })
        })
    })
})
