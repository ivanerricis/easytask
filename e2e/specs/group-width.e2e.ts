import { browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, domClick, groupCard, newSectionInGroup, openWorkspace,
    sectionCard, sql, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/**
 * Width of a group: changed from the handle on its right edge, kept after an app restart, the percentage next to the ring hidden
 * when the group is narrow (the ring stays), double click to go back to the automatic width. Closed, the group is a strip.
 */
const WORKSPACE = "Width Workspace"
const NOTE = "Width Note"
const GROUP = "Width Group"
const SECTION = "Width Section"
const TASK = "Width task"

/** Width saved for the group (null = automatic). */
const savedWidth = async (): Promise<number | null> => {
    const rows = await sql<{ width: number | null }[]>("select", "SELECT width FROM section_group WHERE name = ? AND deleted_at IS NULL", [GROUP])
    return rows[0]?.width ?? null
}

/** The progress ring of the group (the details panel on the right has one with the same label, so look inside the card). */
const groupRing = async () => groupCard(GROUP).$(`[aria-label="${await tr("groups.progress")}"]`)
/** The percentage next to the ring, dropped when the group is narrow. */
const groupPercent = async () => groupCard(GROUP).$(`.//*[@aria-label="${await tr("groups.progress")}"]/following-sibling::span[contains(., "%")]`)
/** Rendered width of the card of the group, open or closed. */
const cardWidth = async (): Promise<number> => {
    const card = (await groupCard(GROUP).getElement()) as unknown as HTMLElement
    return browser.execute((el: HTMLElement) => el.getBoundingClientRect().width, card)
}
/** Rendered width of the group: the handle is the last child of its root element. */
const renderedWidth = async (): Promise<number> => {
    const handle = await byLabel(await tr("groups.width.handle"))
    return browser.execute((el: HTMLElement) => el.parentElement!.getBoundingClientRect().width, handle as unknown as HTMLElement)
}

/**
 * Narrows the group by a large step of the keyboard (Shift + arrow, 64 px) from the focused handle. The pointer moves of the driver are not
 * exact to the pixel (the drag with the mouse is covered by the unit tests), the arrow key is.
 */
const narrowWithKeyboard = async () => {
    const handle = byLabel(await tr("groups.width.handle"))
    await handle.waitForDisplayed()
    const element = (await handle.getElement()) as unknown as HTMLElement
    await browser.execute((el: HTMLElement) => el.focus(), element)
    await browser.keys(["Shift", "ArrowLeft"])
}

describe("Group width", () => {
    before(async () => {
        await waitForApp()
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()

        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })
        await newSectionInGroup(groupCard(GROUP), SECTION)
        await addTaskToSection(sectionCard(SECTION), TASK)
        await browser.waitUntil(async () => (await sql<unknown[]>("select", "SELECT id FROM task WHERE text = ?", [TASK])).length > 0, { timeoutMsg: "task not created" })
    })

    it("starts with the automatic width, the ring and its percentage", async () => {
        expect(await savedWidth()).toBeNull()
        await (await groupRing()).waitForDisplayed({ timeoutMsg: "the progress ring is not shown" })
        await (await groupPercent()).waitForDisplayed({ timeoutMsg: "the percentage is not shown" })
    })

    it("has the same horizontal scrollbar as the rest of the app (9px, no style of its own)", async () => {
        const height = await browser.execute(() => {
            const scroller = document.querySelector('[data-testid="group-scroll"]')!
            return getComputedStyle(scroller, "::-webkit-scrollbar").height
        })
        expect(height).toBe("9px")
    })

    it("resizes by dragging the handle, drops the percentage when narrow and saves the width", async () => {
        const before = await renderedWidth()
        // Narrower than the automatic width: under the threshold of the completion bar (320), which then goes away
        await narrowWithKeyboard()
        await browser.waitUntil(async () => (await renderedWidth()) < Math.min(before, 320), { timeoutMsg: "the group did not follow the handle" })
        await (await groupPercent()).waitForDisplayed({ reverse: true, timeoutMsg: "the percentage is still shown in a narrow group" })
        expect(await (await groupRing()).isDisplayed()).toBe(true)
        await browser.waitUntil(
            async () => {
                const saved = await savedWidth()
                return saved !== null && saved < 320 && Math.abs((await renderedWidth()) - saved) < 3
            },
            { timeoutMsg: "the width was not saved" },
        )
    })

    it("keeps the width after restarting the app", async () => {
        const saved = await savedWidth()
        await browser.reloadSession()
        await waitForApp()
        await openWorkspace(WORKSPACE)
        const close = byLabel(await tr("notes.closeCurrent"))
        if (!(await close.waitForDisplayed({ timeout: 4_000 }).then(() => true, () => false))) {
            await treeRow(NOTE).click()
            await close.waitForDisplayed()
        }
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was lost" })
        await browser.waitUntil(async () => Math.abs((await renderedWidth()) - saved!) < 1.5, { timeoutMsg: "the width was not restored" })
        expect(await (await groupPercent()).isExisting()).toBe(false)
    })

    it("becomes a narrow strip when collapsed and gets its width back when opened", async () => {
        const before = await renderedWidth()
        await domClick(byLabel(await tr("groups.collapse")))
        await byLabel(await tr("groups.expand")).waitForDisplayed()
        await browser.waitUntil(async () => (await cardWidth()) < 60, { timeoutMsg: "the closed group is not a strip" })
        await domClick(byLabel(await tr("groups.expand")))
        await byLabel(await tr("groups.collapse")).waitForDisplayed()
        await browser.waitUntil(async () => Math.abs((await renderedWidth()) - before) < 1.5, { timeoutMsg: "the width did not come back" })
    })

    it("goes back to the automatic width on double click", async () => {
        const handle = byLabel(await tr("groups.width.handle"))
        await handle.doubleClick()
        await browser.waitUntil(async () => (await savedWidth()) === null, { timeoutMsg: "the width was not cleared" })
        await (await groupPercent()).waitForDisplayed({ timeoutMsg: "the percentage did not come back" })
    })
})
