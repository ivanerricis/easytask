import { $, browser, expect } from "@wdio/globals"
import {
    byLabel, byText, createFromSidebar, createWorkspace, domClick, openContextMenu, openWorkspace, pane, paneTab, tr, treeRow, waitForApp,
} from "../helpers"

/**
 * Split workspace: two panes side by side, each with its own tab bar and note. Everything is scoped with
 * `[data-pane="0"]` / `[data-pane="1"]` (helpers `pane` / `paneTab`).
 *
 * Not covered: persistence of the layout across a restart. The tabs live in settings.dat (not in SQLite, so `sql` cannot
 * see them) and the layout is restored only after a real restart (`browser.reloadSession()`, see persistence.e2e.ts);
 * it is covered by the unit tests of the layout reducer and of the tabs store.
 */
const WORKSPACE = "Split Workspace"
const NOTE_A = "Split Note A"
const NOTE_B = "Split Note B"

/** The content of a pane shows a note when its path bar has the breadcrumb of that note. */
const paneShows = async (index: 0 | 1, name: string) =>
    pane(index).$(`[aria-label=${JSON.stringify(await tr("notes.path.reveal", { name }))}]`)

const closeSplitButton = async (index: 0 | 1) => pane(index).$(`[aria-label=${JSON.stringify(await tr("notes.split.close"))}]`)

const rightGone = async (message: string) => {
    await $('[data-pane="1"]').waitForExist({ reverse: true, timeoutMsg: message })
}

/** Moves a note with the "Open on the right / left" entry of its sidebar context menu. */
const moveFromSidebar = async (name: string, key: "menu.openRight" | "menu.openLeft") => {
    const menu = await openContextMenu(treeRow(name))
    await byText(await tr(key), menu).click()
    await menu.waitForExist({ reverse: true, timeoutMsg: "the note menu did not close" })
}

/** Drags with the mouse in many small steps (as the other drag specs do) between two points of the viewport. */
const dragBetween = async (from: ChainablePromiseElement, to: ChainablePromiseElement) => {
    const center = (el: HTMLElement) => {
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }
    const start = await browser.execute(center, (await from.getElement()) as unknown as HTMLElement)
    const end = await browser.execute(center, (await to.getElement()) as unknown as HTMLElement)
    const pointer = browser.action("pointer", { parameters: { pointerType: "mouse" } })
    pointer.move({ x: start.x, y: start.y, origin: "viewport" }).down()
    const steps = 30
    for (let step = 1; step <= steps; step++) {
        pointer.move({
            x: Math.round(start.x + ((end.x - start.x) * step) / steps),
            y: Math.round(start.y + ((end.y - start.y) * step) / steps),
            origin: "viewport",
            duration: 20,
        })
    }
    await pointer.perform(true)
    await browser.releaseActions()
}

type ChainablePromiseElement = ReturnType<typeof $>

describe("Split workspace", () => {
    before(async () => {
        await waitForApp()
    })

    it("creates a workspace with two notes and opens both as tabs", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_A)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE_B)
        await treeRow(NOTE_A).click()
        await $(`[role="tab"][title=${JSON.stringify(NOTE_A)}]`).waitForDisplayed({ timeoutMsg: "the tab of note A is not shown" })
        await treeRow(NOTE_B).click()
        await $(`[role="tab"][title=${JSON.stringify(NOTE_B)}]`).waitForDisplayed({ timeoutMsg: "the tab of note B is not shown" })
        await expect($('[data-pane="1"]')).not.toExist()
    })

    it("splits: a second, empty pane appears on the right", async () => {
        await domClick(byLabel(await tr("notes.split.split")))
        const right = $(`[role="region"][data-pane="1"]`)
        await right.waitForDisplayed({ timeoutMsg: "the right pane did not appear" })
        await expect(right).toHaveAttribute("aria-label", await tr("notes.split.rightPane"))
        await expect($(`[role="separator"][aria-label=${JSON.stringify(await tr("notes.split.divider"))}]`)).toBeDisplayed()
        await expect(right.$('[role="tablist"]')).toBeDisplayed()
        await expect(right.$$('[role="tab"]')).toBeElementsArrayOfSize(0)
        await expect(right.$(`.//*[normalize-space()=${JSON.stringify(await tr("notes.split.emptyTitle"))}]`)).toBeDisplayed()
        // Both tabs are still in the left pane
        await expect(paneTab(0, NOTE_A)).toBeDisplayed()
        await expect(paneTab(0, NOTE_B)).toBeDisplayed()
    })

    it("opens note B on the right from the sidebar menu", async () => {
        await moveFromSidebar(NOTE_B, "menu.openRight")
        await paneTab(1, NOTE_B).waitForDisplayed({ timeoutMsg: "note B did not open in the right pane" })
        await expect(paneTab(0, NOTE_B)).not.toExist()
        await expect(paneTab(0, NOTE_A)).toBeDisplayed()
        await expect(paneTab(1, NOTE_A)).not.toExist()
    })

    it("shows its own note in each pane", async () => {
        await paneTab(0, NOTE_A).click()
        await (await paneShows(0, NOTE_A)).waitForDisplayed({ timeoutMsg: "the left pane does not show note A" })
        await (await paneShows(1, NOTE_B)).waitForDisplayed({ timeoutMsg: "the right pane does not show note B" })
        await expect(await paneShows(0, NOTE_B)).not.toExist()
        await expect(await paneShows(1, NOTE_A)).not.toExist()
        await expect(paneTab(0, NOTE_A)).toHaveAttribute("aria-selected", "true")
        await expect(paneTab(1, NOTE_B)).toHaveAttribute("aria-selected", "true")
    })

    it("dims the note and the tab bar of the pane without the focus, never the focused one", async () => {
        // The left pane has the focus (its tab was just clicked)
        await expect(pane(1).$('[data-testid="tabbar-dim"]')).toHaveAttribute("data-dimmed", "true")
        await expect(pane(1).$('[data-testid="pane-dim"]')).toHaveAttribute("data-dimmed", "true")
        await expect(pane(0).$('[data-testid="tabbar-dim"]')).toHaveAttribute("data-dimmed", "false")
        await expect(pane(0).$('[data-testid="pane-dim"]')).toHaveAttribute("data-dimmed", "false")
    })

    it("moves note B back to the left; the empty right pane closes by itself", async () => {
        await moveFromSidebar(NOTE_B, "menu.openLeft")
        await rightGone("the right pane did not close when it became empty")
        // One pane again: its tabs carry no data-pane
        await $(`[role="tab"][title=${JSON.stringify(NOTE_B)}]`).waitForDisplayed({ timeoutMsg: "note B is not in the left pane" })
        await expect($(`[role="tab"][title=${JSON.stringify(NOTE_A)}]`)).toBeDisplayed()
        // One pane again: the tab bar is the plain one
        await expect(byLabel(await tr("notes.openTabs"))).toBeDisplayed()
    })

    // The WebKitGTK driver of the Linux CI does not deliver the pointer events of a drag: it runs on Windows
    it("drags a tab from the left tab bar to the right one", async function () {
        if (process.platform === "linux") return this.skip()
        await domClick(byLabel(await tr("notes.split.split")))
        await $('[data-pane="1"]').waitForDisplayed({ timeoutMsg: "the right pane did not appear" })
        await dragBetween(paneTab(0, NOTE_B), pane(1).$('[role="tablist"]'))
        await paneTab(1, NOTE_B).waitForDisplayed({ timeoutMsg: "the tab did not move to the right pane" })
        await expect(paneTab(0, NOTE_B)).not.toExist()
        await expect(paneTab(0, NOTE_A)).toBeDisplayed()
        await (await paneShows(1, NOTE_B)).waitForDisplayed({ timeoutMsg: "the right pane does not show the dragged note" })
    })

    it("closing the split closes the tabs of the right pane", async () => {
        if (!(await $('[data-pane="1"]').isExisting())) {
            await domClick(byLabel(await tr("notes.split.split")))
            await $('[data-pane="1"]').waitForDisplayed({ timeoutMsg: "the right pane did not appear" })
            await moveFromSidebar(NOTE_B, "menu.openRight")
            await paneTab(1, NOTE_B).waitForDisplayed({ timeoutMsg: "note B did not open in the right pane" })
        }
        await domClick(await closeSplitButton(0))
        await rightGone("the right pane did not close")
        await $(`[role="tab"][title=${JSON.stringify(NOTE_A)}]`).waitForDisplayed({ timeoutMsg: "the tab of note A is gone" })
        await expect($(`[role="tab"][title=${JSON.stringify(NOTE_B)}]`)).not.toExist()
        await expect(byLabel(await tr("notes.openTabs"))).toBeDisplayed()
    })

    it("toggles the split with Ctrl+\\", async () => {
        // The focus must be out of any text field
        await $(`[role="tab"][title=${JSON.stringify(NOTE_A)}]`).click()
        await browser.keys(["Control", "\\"])
        await $('[data-pane="1"]').waitForDisplayed({ timeoutMsg: "Ctrl+\\ did not split the workspace" })
        await browser.keys(["Control", "\\"])
        await rightGone("Ctrl+\\ did not close the split")
    })
})
