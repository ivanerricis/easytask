import { $, browser, expect } from "@wdio/globals"
import { byText, createFromSidebar, createWorkspace, openContextMenu, openWorkspace, paneTab, tr, treeRow, waitForApp } from "../helpers"

/**
 * Dragging a tab of the single bar onto the right half of the note opens the split view with that note in the right pane, like "Open on
 * the right" of its menu. Over that half a highlighted box shows where the note opens; dropped elsewhere the tab just reorders; Esc cancels.
 *
 * Drags run only on Windows (WebKitGTK of the CI does not deliver the events of the pointer actions).
 */
const WORKSPACE = "Tab Split Workspace"
const NOTE_A = "Tab Split A"
const NOTE_B = "Tab Split B"
// The WebDriver code of the Escape key
const ESCAPE = ""

type Point = { x: number, y: number }

const tabSelector = (name: string) => `[role="tab"][title=${JSON.stringify(name)}]`

/** The middle of a tab. */
const tabCenter = (name: string) => browser.execute((selector: string): Point => {
    const rect = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
}, tabSelector(name))

/** A point of the note of the only pane: `fx` of its width, below the tab bar. */
const notePoint = (fx: number) => browser.execute((f: number): Point => {
    const area = document.querySelector<HTMLElement>("[data-pane-area]")!.getBoundingClientRect()
    return { x: Math.round(area.left + area.width * f), y: Math.round(area.top + area.height * 0.6) }
}, fx)

const tabOrder = () => browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>('[data-tab-wrap] [role="tab"]')).map(tab => tab.title))

const previewRect = () => browser.execute(() => {
    const box = document.querySelector<HTMLElement>('[data-testid="split-drop-preview"]')
    if (!box) return null
    const rect = box.getBoundingClientRect()
    const area = document.querySelector<HTMLElement>("[data-pane-area]")!.getBoundingClientRect()
    return { left: Math.round(rect.left), right: Math.round(rect.right), middle: Math.round(area.left + area.width / 2), areaRight: Math.round(area.right) }
})

/** Presses on a tab, moves to `end` in small steps, calls `whilePressed` with the pointer still down, then releases. */
const dragTab = async (name: string, end: Point, whilePressed?: () => Promise<void>) => {
    const start = await tabCenter(name)
    const steps = 30
    const at = (i: number): Point => ({ x: Math.round(start.x + ((end.x - start.x) * i) / steps), y: Math.round(start.y + ((end.y - start.y) * i) / steps) })
    const pointer = browser.action("pointer", { parameters: { pointerType: "mouse" } })
    pointer.move({ ...at(0), origin: "viewport", duration: 0 }).down()
    for (let i = 1; i <= steps; i++) pointer.move({ ...at(i), origin: "viewport", duration: 20 })
    await pointer.perform(true)
    try {
        await browser.pause(300)
        await whilePressed?.()
        await browser.action("pointer", { parameters: { pointerType: "mouse" } }).up().perform(true)
    } finally {
        await browser.releaseActions()
    }
    await browser.pause(600)
}

const moveFromSidebar = async (name: string, key: "menu.openRight" | "menu.openLeft") => {
    const menu = await openContextMenu(treeRow(name))
    await byText(await tr(key), menu).click()
    await menu.waitForExist({ reverse: true, timeoutMsg: "the note menu did not close" })
}

describe("Dragging a tab onto the right half of the note (single view)", () => {
    before(async () => {
        await waitForApp()
    })

    it("builds two notes, both open as tabs of the only pane", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_A)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_B)
        await treeRow(NOTE_A).click()
        await treeRow(NOTE_B).click()
        await $(tabSelector(NOTE_B)).waitForDisplayed({ timeoutMsg: "the tab of note B is not shown" })
        await expect($('[data-pane="1"]')).not.toExist()
    })

    it("shows no preview over the left half, and reorders the tabs when dropped there or on the bar", async function () {
        if (process.platform === "linux") return this.skip()
        await dragTab(NOTE_B, await notePoint(0.25), async () => {
            expect(await previewRect()).toBeNull()
        })
        await expect($('[data-pane="1"]')).not.toExist()
        expect(await tabOrder()).toEqual([NOTE_A, NOTE_B])
        const first = await tabCenter(NOTE_A)
        await dragTab(NOTE_B, { x: first.x - 20, y: first.y })
        await expect($('[data-pane="1"]')).not.toExist()
        expect(await tabOrder()).toEqual([NOTE_B, NOTE_A])
    })

    it("shows a box over the right half while dragging, and Esc cancels: no split, the order is unchanged", async function () {
        if (process.platform === "linux") return this.skip()
        await dragTab(NOTE_B, await notePoint(0.75), async () => {
            const box = await previewRect()
            expect(box).not.toBeNull()
            expect(Math.abs(box!.left - box!.middle)).toBeLessThanOrEqual(2)
            expect(Math.abs(box!.right - box!.areaRight)).toBeLessThanOrEqual(2)
            await browser.action("key").down(ESCAPE).up(ESCAPE).perform(true)
            await browser.pause(200)
            expect(await previewRect()).toBeNull()
        })
        await expect($('[data-pane="1"]')).not.toExist()
        expect(await tabOrder()).toEqual([NOTE_B, NOTE_A])
    })

    it("opens the split with the note in the right pane when dropped on the right half", async function () {
        if (process.platform === "linux") return this.skip()
        await dragTab(NOTE_B, await notePoint(0.75))
        await $('[data-pane="1"]').waitForDisplayed({ timeoutMsg: "the split did not open" })
        await paneTab(1, NOTE_B).waitForDisplayed({ timeoutMsg: "note B is not in the right pane" })
        await expect(paneTab(0, NOTE_A)).toBeDisplayed()
        await expect(paneTab(0, NOTE_B)).not.toExist()
        await expect($('[data-testid="split-drop-preview"]')).not.toExist()
    })

    it("offers no split with a single open tab: nothing to leave in the left pane", async function () {
        if (process.platform === "linux") return this.skip()
        await moveFromSidebar(NOTE_B, "menu.openLeft")
        await $('[data-pane="1"]').waitForExist({ reverse: true, timeoutMsg: "the right pane did not close" })
        // Close the other tab, so only note B is open
        await $(tabSelector(NOTE_A)).click()
        await $(`[aria-label=${JSON.stringify(await tr("notes.closeCurrent"))}]`).click()
        await $(tabSelector(NOTE_A)).waitForExist({ reverse: true, timeoutMsg: "the tab of note A did not close" })
        await dragTab(NOTE_B, await notePoint(0.75), async () => {
            expect(await previewRect()).toBeNull()
        })
        await expect($('[data-pane="1"]')).not.toExist()
        await expect($(tabSelector(NOTE_B))).toBeDisplayed()
    })
})
