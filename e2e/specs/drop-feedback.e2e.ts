import { browser, expect } from "@wdio/globals"
import {
    addTaskToGroup, byLabel, byText, createFromSidebar, createWorkspace, directTasks, groupCard, newSectionInGroup, openContextMenu,
    openWorkspace, sectionCard, setLiveDrag, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * The feedback of a drag (the insertion line between sections, the ring on the card or the list that receives a section or a task)
 * is drawn half outside the item it belongs to, so on the first and the last item of a group it sits under the edge of the area that
 * scrolls. It is measured with the pointer still down: the line / ring must be inside the visible area of every ancestor that clips.
 * The width handle of a group must not cover the vertical scrollbar of the group either.
 *
 * Drags run only on Windows (WebKitGTK of the CI does not deliver the events of the pointer actions).
 */
const WORKSPACE = "Drop Feedback Workspace"
const NOTE = "Drop Feedback Note"
const GROUP = "Drop Feedback Group"
const S1 = "Feedback One"
const S2 = "Feedback Two"
const S3 = "Feedback Three"
const TASK_A = "Feedback task A"
const TASK_B = "Feedback task B"

/** Top to bottom order of the direct tasks area ("tasks") and of the section cards (their titles) inside the group. */
const visibleOrder = async () =>
    browser.execute((group: HTMLElement) => {
        const items = Array.from(group.querySelectorAll<HTMLElement>("[data-direct-tasks], [data-section-card]"))
        return items.map(item => (item.hasAttribute("data-direct-tasks") ? "tasks" : item.querySelector<HTMLElement>("button[title]")?.title ?? ""))
    }, (await groupCard(GROUP).getElement()) as unknown as HTMLElement)

const waitForOrder = async (expected: string[]) => {
    await browser.waitUntil(async () => JSON.stringify(await visibleOrder()) === JSON.stringify(expected), {
        timeoutMsg: `the group does not show ${expected.join(" > ")}, it shows ${JSON.stringify(await visibleOrder())}`,
    })
}

/** Moves the list of the direct tasks one step down with the menu of the group. */
const moveListDown = async () => {
    const menu = await openContextMenu(groupCard(GROUP).$("button[aria-expanded]"))
    await byText(await tr("menu.moveDirectDown"), menu).click()
}

type Sample = { found: boolean, visible: boolean, clippedBy: string[] }

/**
 * Presses on `source`, moves it over `target` (top / bottom edge, or its center), and reads the feedback drawn while the pointer is still
 * down: the insertion line of a section card, or the ring of the card / list that receives the drag. Then drops.
 * "visible" = the whole line (or the ring, 2px around the box) is inside the visible area of every ancestor that scrolls or clips.
 */
const dragAndMeasure = async (
    source: () => ChainablePromiseElementLike,
    target: () => ChainablePromiseElementLike,
    where: "top" | "bottom" | "center",
    feedback: "line" | "ring",
): Promise<Sample> => {
    const start = await browser.execute((el: HTMLElement) => {
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }, (await source().getElement()) as unknown as HTMLElement)
    const end = await browser.execute((el: HTMLElement, at: string) => {
        const r = el.getBoundingClientRect()
        const y = at === "top" ? r.top + 3 : at === "bottom" ? r.bottom - 3 : r.top + r.height / 2
        return { x: Math.round(r.left + r.width / 2), y: Math.round(y) }
    }, (await target().getElement()) as unknown as HTMLElement, where)

    const pointer = browser.action("pointer", { parameters: { pointerType: "mouse" } })
    pointer.move({ x: start.x, y: start.y, origin: "viewport" }).down()
    const steps = 20
    for (let step = 1; step <= steps; step++) {
        pointer.move({
            x: Math.round(start.x + ((end.x - start.x) * step) / steps),
            y: Math.round(start.y + ((end.y - start.y) * step) / steps),
            origin: "viewport",
            duration: 20,
        })
    }
    await pointer.perform(true)
    // The feedback (line or ring) is drawn on the next dragover: wait for it; a missing one is reported by the sample below
    await browser.waitUntil(
        async () => browser.execute((group: HTMLElement) => group.querySelector("[data-section-card].ring-primary, [data-direct-tasks].ring-primary, [data-section-card] > div.bg-primary, [data-direct-tasks] > div.bg-primary") !== null, (await groupCard(GROUP).getElement()) as unknown as HTMLElement),
        { timeout: 3_000 },
    ).catch(() => undefined)

    const sample = await browser.execute((group: HTMLElement, kind: string): Sample => {
        const nodes = kind === "line"
            ? Array.from(group.querySelectorAll<HTMLElement>("[data-section-card] > div.bg-primary, [data-direct-tasks] > div.bg-primary"))
            : Array.from(group.querySelectorAll<HTMLElement>("[data-section-card].ring-primary, [data-direct-tasks].ring-primary"))
        const node = nodes[0]
        if (!node) return { found: false, visible: false, clippedBy: [] }
        const box = node.getBoundingClientRect()
        // A ring is drawn 2px outside the box of its element
        const grow = kind === "ring" ? 2 : 0
        const clippedBy: string[] = []
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent)
            if (style.overflowX === "visible" && style.overflowY === "visible") continue
            const area = parent.getBoundingClientRect()
            // The scrollbars are not part of the visible area
            const right = area.right - (parent.offsetWidth - parent.clientWidth)
            const bottom = area.bottom - (parent.offsetHeight - parent.clientHeight)
            const tolerance = 0.5
            if (box.top - grow < area.top - tolerance || box.left - grow < area.left - tolerance
                || box.bottom + grow > bottom + tolerance || box.right + grow > right + tolerance) {
                clippedBy.push(parent.getAttribute("data-testid") ?? parent.className)
            }
        }
        return { found: true, visible: clippedBy.length === 0, clippedBy }
    }, (await groupCard(GROUP).getElement()) as unknown as HTMLElement, feedback)

    await browser.releaseActions()
    return sample
}

type ChainablePromiseElementLike = ReturnType<typeof sectionCard>

const header = (title: string) => sectionCard(title).$("button[title]") as ChainablePromiseElementLike
const firstDirectTask = () => directTasks(groupCard(GROUP)).$("[data-task-id]") as ChainablePromiseElementLike

describe("Feedback of the drag at the edges of a group", () => {
    before(async function () {
        if (process.platform === "linux") return this.skip()
        await waitForApp()
    })

    it("creates a group with two direct tasks and three sections", async function () {
        if (process.platform === "linux") return this.skip()
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()

        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })

        await addTaskToGroup(groupCard(GROUP), TASK_A)
        await addTaskToGroup(groupCard(GROUP), TASK_B)
        await newSectionInGroup(groupCard(GROUP), S1)
        await newSectionInGroup(groupCard(GROUP), S2)
        await newSectionInGroup(groupCard(GROUP), S3)
        await waitForOrder(["tasks", S1, S2, S3])
    })

    it("turns the live drag off: the insertion line of the sections is drawn only without it", async function () {
        if (process.platform === "linux") return this.skip()
        await setLiveDrag(false)
    })

    it("shows the insertion line under the LAST section, whole", async function () {
        if (process.platform === "linux") return this.skip()
        const sample = await dragAndMeasure(() => header(S1), () => sectionCard(S3), "bottom", "line")
        expect(sample.found).toBe(true)
        expect(sample.clippedBy).toEqual([])
        await waitForOrder(["tasks", S2, S3, S1])
    })

    it("shows the insertion line over the FIRST section, whole", async function () {
        if (process.platform === "linux") return this.skip()
        // [tasks, S2, S3, S1] -> the list goes to the bottom, so S2 is the first item of the group
        await moveListDown()
        await moveListDown()
        await moveListDown()
        await waitForOrder([S2, S3, S1, "tasks"])

        const sample = await dragAndMeasure(() => header(S1), () => sectionCard(S2), "top", "line")
        expect(sample.found).toBe(true)
        expect(sample.clippedBy).toEqual([])
        await waitForOrder([S1, S2, S3, "tasks"])
    })

    it("shows the insertion line under the list of the direct tasks when it is the last item", async function () {
        if (process.platform === "linux") return this.skip()
        const sample = await dragAndMeasure(() => header(S1), () => directTasks(groupCard(GROUP)), "bottom", "line")
        expect(sample.found).toBe(true)
        expect(sample.clippedBy).toEqual([])
        await waitForOrder([S2, S3, "tasks", S1])
    })

    it("shows the whole ring on the first section and on the last one when a task is dragged over them", async function () {
        if (process.platform === "linux") return this.skip()
        // [S2, S3, tasks, S1]: S2 is the first item, S1 the last one
        const onFirst = await dragAndMeasure(firstDirectTask, () => sectionCard(S2), "center", "ring")
        expect(onFirst.found).toBe(true)
        expect(onFirst.clippedBy).toEqual([])

        const onLast = await dragAndMeasure(firstDirectTask, () => sectionCard(S1), "center", "ring")
        expect(onLast.found).toBe(true)
        expect(onLast.clippedBy).toEqual([])
    })

    it("shows the whole ring on the list of the direct tasks when a task is dragged over it", async function () {
        if (process.platform === "linux") return this.skip()
        // The two tasks were dropped on sections: bring one back to the list from the first section, over the list itself
        const sourceTask = () => sectionCard(S2).$("[data-task-id]") as ChainablePromiseElementLike
        if (!(await sourceTask().isExisting())) return
        const sample = await dragAndMeasure(sourceTask, () => directTasks(groupCard(GROUP)), "center", "ring")
        expect(sample.found).toBe(true)
        expect(sample.clippedBy).toEqual([])
    })

    it("does not put the width handle over the vertical scrollbar of a group that scrolls", async function () {
        if (process.platform === "linux") return this.skip()
        // Enough direct tasks to make the group scroll
        const groupEl = async () => (await groupCard(GROUP).getElement()) as unknown as HTMLElement
        const isScrolling = async () => browser.execute((group: HTMLElement) =>
            Array.from(group.querySelectorAll<HTMLElement>("*")).some(el => getComputedStyle(el).overflowY === "auto" && el.scrollHeight > el.clientHeight + 1),
        await groupEl())
        for (let i = 0; i < 40 && !(await isScrolling()); i++) await addTaskToGroup(groupCard(GROUP), `Scroll filler ${i}`)
        expect(await isScrolling()).toBe(true)

        const rects = await browser.execute((group: HTMLElement) => {
            const area = Array.from(group.querySelectorAll<HTMLElement>("*"))
                .find(el => getComputedStyle(el).overflowY === "auto" && el.scrollHeight > el.clientHeight + 1)!
            const box = area.getBoundingClientRect()
            const bar = area.offsetWidth - area.clientWidth
            const handle = group.querySelector<HTMLElement>('[data-testid="group-resize-handle"]')!.getBoundingClientRect()
            return { barWidth: bar, barLeft: box.right - bar, barRight: box.right, handleLeft: handle.left, handleRight: handle.right }
        }, await groupEl())
        expect(rects.barWidth).toBeGreaterThan(0)
        // The handle sits outside the group: it must not overlap the scrollbar, i.e. start where the scrollbar ends (or after)
        expect(rects.handleLeft).toBeGreaterThanOrEqual(rects.barRight - 0.5)
    })

    after(async function () {
        if (process.platform === "linux") return
        await setLiveDrag(true)
    })
})
