import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { $, browser, expect } from "@wdio/globals"
import type { ChainablePromiseElement } from "webdriverio"
import {
    addTaskToSection, backgroundOf, byLabel, byText, compose, contrastRatio, createFromSidebar, createWorkspace, cssColor, domClick, inTheme,
    openWorkspace, sql, tr, treeRow, typeInto, waitForApp, type Rgba,
    groupCard, newSectionInGroup,
} from "../helpers"

const WORKSPACE = "Layout Workspace"
const NOTE = "Layout Note"
const OTHER_NOTE = "Layout Other Note"
const GROUP = "Layout Group"
const SECTION = "Layout Section"
const TASK = "Layout task"
const SUBTASK = "Layout subtask"
const DONE_TASK = "Layout done task"
const AUDIO_NAME = "layout-tone.wav"

/** A 4 s sine (PCM 16 bit, mono, 8 kHz) in a temporary folder. */
const writeWav = () => {
    const rate = 8000
    const seconds = 4
    const samples = rate * seconds
    const buffer = Buffer.alloc(44 + samples * 2)
    buffer.write("RIFF", 0)
    buffer.writeUInt32LE(36 + samples * 2, 4)
    buffer.write("WAVEfmt ", 8)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(1, 22)
    buffer.writeUInt32LE(rate, 24)
    buffer.writeUInt32LE(rate * 2, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write("data", 36)
    buffer.writeUInt32LE(samples * 2, 40)
    for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easytask-layout-e2e-"))
    const file = path.join(dir, AUDIO_NAME)
    fs.writeFileSync(file, buffer)
    return file
}

const idOf = async (table: "task" | "section_group", column: "text" | "name", value: string): Promise<number> => {
    const rows = await sql<{ id: number }[]>("select", `SELECT id FROM ${table} WHERE ${column} = ? AND deleted_at IS NULL`, [value])
    return rows[0].id
}

/** Adds a task to the section through the "+" of its header. */
const addTask = async (text: string) => {
    const card = $(`//div[@data-section-card][.//button[@title=${JSON.stringify(SECTION)}]]`)
    await addTaskToSection(card, text)
    await browser.waitUntil(
        async () => browser.execute((value: string) => Array.from(document.querySelectorAll("textarea")).some(area => area.value === value), text),
        { timeoutMsg: `task "${text}" not created` },
    )
}

/** The slider of the player (the Radix thumb has the label): the fill of its range over its track, its value and the audio element. */
const readRange = (label: string) =>
    browser.execute((aria: string) => {
        const thumb = document.querySelector<HTMLElement>(`[role="slider"][aria-label="${aria}"]`)!
        const slider = thumb.closest<HTMLElement>('[data-slot="slider"]')!
        const track = slider.querySelector<HTMLElement>('[data-slot="slider-track"]')!.getBoundingClientRect().width
        const range = slider.querySelector<HTMLElement>('[data-slot="slider-range"]')!.getBoundingClientRect().width
        const audio = document.querySelector("audio")!
        return {
            progress: track > 0 ? range / track : 0,
            value: Number(thumb.getAttribute("aria-valuenow")),
            currentTime: audio.currentTime,
            duration: audio.duration,
            volume: audio.volume,
        }
    }, label)

/** Computed colors settle after the theme class changes (transitions): read until two reads agree. */
const settled = async <T>(read: () => Promise<T>): Promise<T> => {
    let last = JSON.stringify(await read())
    let value!: T
    await browser.waitUntil(async () => {
        value = await read()
        const now = JSON.stringify(value)
        const same = now === last
        last = now
        return same
    }, { timeoutMsg: "the colors did not settle" })
    return value
}

const contrastOf = (element: ChainablePromiseElement, property = "color") =>
    settled(async () => {
        const background = await backgroundOf(element)
        const color = await cssColor(element, property)
        return contrastRatio(compose(color, background), background)
    })

describe("Layout and appearance", () => {
    const failures: string[] = []
    let canPlay = false
    let groupId = 0
    let taskId = 0
    let subtaskId = 0
    let wavPath = ""

    before(async () => {
        await waitForApp()
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", OTHER_NOTE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()

        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })
        await newSectionInGroup(groupCard(GROUP), SECTION)

        await addTask(TASK)
        await addTask(DONE_TASK)
        taskId = await idOf("task", "text", TASK)
        await domClick($(`[data-task-id="${taskId}"] [aria-label="${await tr("tasks.addSubtask")}"]`))
        await typeInto($(`[aria-label="${await tr("tasks.newSubtask")}"]`), SUBTASK)
        await browser.keys("Enter")
        await browser.waitUntil(async () => (await sql<unknown[]>("select", "SELECT id FROM task WHERE text = ?", [SUBTASK])).length > 0)
        await browser.keys("Escape")
        subtaskId = await idOf("task", "text", SUBTASK)

        // Data the UI cannot create without dialogs: a description and an audio file with a real duration
        groupId = await idOf("section_group", "name", GROUP)
        await sql("execute", "UPDATE task SET description = ? WHERE id = ?", ["Some description", taskId])
        wavPath = writeWav()
        await sql("execute", "INSERT INTO audio_file (section_groupID, name, path) VALUES (?, ?, ?)", [groupId, AUDIO_NAME, wavPath])
        canPlay = await browser.execute(() => document.createElement("audio").canPlayType("audio/wav") !== "")

        // Reload the note from the database: another note and back
        await treeRow(OTHER_NOTE).click()
        await treeRow(NOTE).click()
        await $(`[data-task-id="${taskId}"] [data-testid="description-indicator"]`).waitForExist({ timeoutMsg: "the description was not loaded" })
    })

    describe("audio player", () => {
        before(async function () {
            if (!canPlay) {
                console.log("[layout] audio/wav cannot be played by this webview: the player tests are skipped")
                this.skip()
            }
            await domClick($(`button[title=${JSON.stringify(wavPath)}]`))
            await byLabel(await tr("audio.player.seek")).waitForDisplayed({ timeoutMsg: "the player did not open" })
            // canPlayType says "maybe" even where no decoder is installed (CI runner): the metadata tells the truth
            const decodes = await browser.waitUntil(
                async () => browser.execute(() => {
                    const audio = document.querySelector("audio")!
                    return Number.isFinite(audio.duration) && audio.duration > 0
                }),
                { timeout: 8_000 },
            ).catch(() => false)
            if (!decodes) {
                console.log("[layout] this webview cannot decode the test WAV: the player tests are skipped")
                this.skip()
            }
            await browser.execute(() => document.querySelector("audio")!.pause())
        })

        it("fills the seek bar up to the playback position", async () => {
            const label = await tr("audio.player.seek")
            const thumb = byLabel(label)
            // Moved the way a user does (the paused element is not buffered: seeking it from the page never completes)
            const steps: [string, () => Promise<void>, number][] = [
                ["Home", async () => { await browser.keys("Home") }, 0],
                ["a click in the middle of the bar", async () => { await $('[data-slot="slider"]').click() }, 0.5],
                ["End", async () => { await browser.keys("End") }, 1],
            ]
            for (const [what, move, fraction] of steps) {
                await browser.execute((el: HTMLElement) => el.focus(), (await thumb.getElement()) as unknown as HTMLElement)
                await move()
                await browser.waitUntil(async () => Math.abs((await readRange(label)).currentTime / 4 - fraction) < 0.1, { timeoutMsg: `seek: ${what}` })
                const state = await settled(() => readRange(label))
                expect(Math.abs(state.progress - state.currentTime / state.duration)).toBeLessThan(0.02)
                expect(Math.abs(state.progress - fraction)).toBeLessThan(0.1)
            }
        })

        it("fills the volume bar up to the volume", async () => {
            const label = await tr("audio.player.volume")
            const thumb = byLabel(label)
            await browser.execute((el: HTMLElement) => el.focus(), (await thumb.getElement()) as unknown as HTMLElement)
            // Home = 0, End = 1, then the arrows move it by 1% (Page Down by 10%)
            for (const [key, value] of [["Home", 0], ["End", 1], ["PageDown", 0.9]] as const) {
                await browser.keys(key)
                await browser.waitUntil(async () => Math.abs((await readRange(label)).volume - value) < 0.011, { timeoutMsg: `volume ${value}` })
                const state = await settled(() => readRange(label))
                expect(Math.abs(state.progress - value)).toBeLessThan(0.02)
            }
        })
    })

    it("becomes a narrow strip when collapsed and gets its width back at once when opened again", async () => {
        const collapse = await tr("groups.collapse")
        const expand = await tr("groups.expand")
        // Width of the group (the card that holds its header) and a click on a header button
        const measure = (label: string) => browser.execute((aria: string) => {
            const button = document.querySelector(`button[aria-label="${aria}"]`)!
            return button.closest<HTMLElement>("[data-group-card]")!.getBoundingClientRect().width
        }, label)

        const before = await measure(collapse)
        await domClick(byLabel(collapse))
        await byLabel(expand).waitForDisplayed()
        const collapsed = await measure(expand)
        // Closed, the group is a strip with its arrow, ring and name written vertically
        expect(collapsed).toBeLessThan(60)

        // Click and record the width of every frame for ~500 ms in the page. The open width comes back right away: the group can
        // settle by a few px in the first frame or two (its content sizes it again), never wider than before, then it stays put
        const widths = await browser.executeAsync((aria: string, done: (value: number[]) => void) => {
            const button = document.querySelector<HTMLElement>(`button[aria-label="${aria}"]`)!
            const node = button.closest<HTMLElement>("[data-group-card]")!
            const samples: number[] = []
            const start = performance.now()
            const frame = () => {
                samples.push(node.getBoundingClientRect().width)
                if (performance.now() - start < 500) requestAnimationFrame(frame)
                else done(samples)
            }
            button.click()
            requestAnimationFrame(frame)
        }, expand)
        expect(widths.length).toBeGreaterThan(3)
        for (const width of widths) {
            expect(width).toBeLessThan(before + 1)
            expect(width).toBeGreaterThan(before - 8)
        }
        for (const width of widths.slice(Math.floor(widths.length / 2))) expect(Math.abs(width - before)).toBeLessThan(1)
        await byLabel(collapse).waitForDisplayed()
    })

    describe("WCAG contrast", () => {
        const check = (what: string, theme: string, ratio: number, minimum: number) => {
            console.log(`[contrast] ${theme} ${what}: ${ratio.toFixed(2)} (min ${minimum})`)
            if (ratio < minimum) failures.push(`${theme} ${what}: ${ratio.toFixed(2)} < ${minimum}`)
        }

        for (const theme of ["light", "dark"] as const) {
            it(`reads text, icons and borders in the ${theme} theme`, async () => {
                await inTheme(theme, async () => {
                    const row = `[data-task-id="${taskId}"]`
                    check("task text", theme, await contrastOf($(`${row} textarea`)), 4.5)
                    check("subtask counter", theme, await contrastOf($(`${row} [title="${await tr("tasks.subtaskProgress", { done: 0, total: 1 })}"]`)), 4.5)
                    check("description icon", theme, await contrastOf($(`${row} [data-testid="description-indicator"]`)), 3)

                    for (const key of ["window.minimize", "window.maximize", "window.close"]) {
                        const button = byLabel(await tr(key))
                        if (await button.isExisting()) check(`window button ${key}`, theme, await contrastOf(button), 3)
                    }

                    // The border of an empty checkbox is painted over the box's own background
                    const box = $(`[data-task-id="${subtaskId}"] [role="checkbox"]`)
                    const border = await settled(async () => {
                        const background = await backgroundOf(box)
                        const color = await cssColor(box, "border-top-color")
                        return contrastRatio(compose(color, background), background)
                    })
                    check("empty checkbox border", theme, border, 3)

                    // The tick on the accent color: the check mark of a completed task
                    const doneId = await idOf("task", "text", DONE_TASK)
                    const completed = $(`[data-task-id="${doneId}"] [role="checkbox"]`)
                    if ((await completed.getAttribute("aria-checked")) !== "true") {
                        await domClick(completed)
                        await expect(completed).toHaveAttribute("aria-checked", "true")
                    }
                    const tick = completed.$('[data-slot="checkbox-indicator"]')
                    const accent = await settled(async () => {
                        const background = await backgroundOf(completed)
                        const color: Rgba = await cssColor(tick, "color")
                        return contrastRatio(compose(color, background), background)
                    })
                    check("check mark on the accent color", theme, accent, 3)

                    // Primary button of a dialog (text on the accent color)
                    await byLabel(await tr("sidebar.addNote")).click()
                    const dialog = $('[role="dialog"]')
                    await dialog.waitForDisplayed()
                    await typeInto(dialog.$('input[name="name"]'), `Layout contrast ${theme}`)
                    check("primary button text", theme, await contrastOf(byText(await tr("dialogs.addNote.submit"), dialog)), 4.5)
                    await browser.keys("Escape")
                    await dialog.waitForExist({ reverse: true })
                })
            })
        }

        it("has no contrast failures", () => {
            expect(failures).toEqual([])
        })
    })

    it("does not scroll the whole page sideways: nothing pokes out of the window, not even the hit areas of the buttons at its edges", async () => {
        const overflow = await browser.execute(() => ({
            html: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
            body: [document.body.scrollWidth, document.body.clientWidth],
        }))
        expect(overflow.html[0]).toBeLessThanOrEqual(overflow.html[1])
        expect(overflow.body[0]).toBeLessThanOrEqual(overflow.body[1])
    })
})
