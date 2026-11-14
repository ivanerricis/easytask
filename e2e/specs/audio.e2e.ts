import fs from "node:fs"
import path from "node:path"
import { $, browser, expect } from "@wdio/globals"
import {
    byLabel, byText, createFromSidebar, createWorkspace, dataDir, domClick, openWorkspace, sql, topDialog, tr, treeRow, typeInto,
    waitForApp,
} from "../helpers"

const WORKSPACE = "Audio Workspace"
const NOTE = "Audio Note"
const GROUP = "Audio Group"
const FILE = "Audio tone.wav"
const MISSING = "Audio missing.wav"
/** Long enough to try the +/-5 s arrows and the 15 s buttons (they clamp at the end), short enough to reach the end. */
const SECONDS = 12

let wavPath = ""

/** PCM16 mono 8 kHz sine wave. */
const makeWav = (seconds: number) => {
    const rate = 8000
    const samples = rate * seconds
    const buffer = Buffer.alloc(44 + samples * 2)
    buffer.write("RIFF", 0)
    buffer.writeUInt32LE(36 + samples * 2, 4)
    buffer.write("WAVEfmt ", 8)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20) // PCM
    buffer.writeUInt16LE(1, 22) // mono
    buffer.writeUInt32LE(rate, 24)
    buffer.writeUInt32LE(rate * 2, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write("data", 36)
    buffer.writeUInt32LE(samples * 2, 40)
    for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2)
    return buffer
}

type AudioState = { exists: boolean; paused: boolean; ended: boolean; time: number; duration: number; muted: boolean; rate: number }

/** State of the <audio> element of the player, read in one page-side call. */
const audioState = (): Promise<AudioState> =>
    browser.execute(() => {
        const audio = document.querySelector("audio")
        if (!audio) return { exists: false, paused: true, ended: false, time: 0, duration: 0, muted: false, rate: 1 }
        return { exists: true, paused: audio.paused, ended: audio.ended, time: audio.currentTime, duration: audio.duration, muted: audio.muted, rate: audio.playbackRate }
    })

const waitAudio = (check: (state: AudioState) => boolean, timeoutMsg: string) =>
    browser.waitUntil(async () => check(await audioState()), { timeout: 15_000, timeoutMsg })

/** Row of an audio file in the group (found through its name). */
const audioRow = async (name: string) =>
    $(`//button[.//span[normalize-space()=${JSON.stringify(name)}]][ancestor::div[@aria-label=${JSON.stringify(await tr("audio.files"))}]]`)

/** Icon of the row (lucide name: music, audio-lines, pause, square) and its sr-only state text. */
const rowState = async (name: string) => {
    const row = (await (await audioRow(name)).getElement()) as unknown as HTMLElement
    return browser.execute((el: HTMLElement) => {
        const classes = Array.from(el.querySelector("svg")?.classList ?? [])
        const icon = ["audio-lines", "pause", "square", "music"].find((n) => classes.some((c) => c === `lucide-${n}` || c === `lucide-${n}-icon`))
        return { icon, sr: el.querySelector(".sr-only")?.textContent ?? "", current: el.getAttribute("aria-current") }
    }, row)
}

const clickRow = async (name: string) => domClick(await audioRow(name))

/** Pauses the player if it is playing (through its own button) and waits until it is paused. */
const ensurePaused = async () => {
    if (!(await audioState()).paused) await domClick(byLabel(await tr("audio.player.pause")))
    await waitAudio((s) => s.paused, "the player did not pause")
}

/** Focuses the seek slider (a click would move it). */
const focusSeek = async () => {
    const slider = (await byLabel(await tr("audio.player.seek")).getElement()) as unknown as HTMLElement
    await browser.execute((el: HTMLElement) => el.focus(), slider)
}

describe("Audio files and the floating player", () => {
    before(async function () {
        await waitForApp()
        const supported = await browser.execute(() => document.createElement("audio").canPlayType("audio/wav") !== "")
        if (!supported) {
            console.log("[e2e] this webview cannot play audio/wav: the audio tests are skipped")
            this.skip()
        }

        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })

        // The files are attached through the database (the app would open a native file picker)
        const dir = await dataDir()
        wavPath = path.join(dir, "audio-e2e-tone.wav")
        fs.writeFileSync(wavPath, makeWav(SECONDS))
        const rows = await sql<{ id: number }[]>("select", "SELECT id FROM section_group WHERE name = ?", [GROUP])
        const groupId = rows[0].id
        await sql("execute", "INSERT INTO audio_file (section_groupID, name, path, position) VALUES (?, ?, ?, 0)", [groupId, FILE, wavPath])
        await sql("execute", "INSERT INTO audio_file (section_groupID, name, path, position) VALUES (?, ?, ?, 1)", [
            groupId, MISSING, path.join(dir, "audio-e2e-does-not-exist.wav"),
        ])

        // The group loads its files when it mounts: close the note and open it again
        await byLabel(await tr("notes.closeCurrent")).click()
        await treeRow(NOTE).click()
        await (await audioRow(FILE)).waitForDisplayed({ timeoutMsg: "the audio file is not listed in the group" })
        await (await audioRow(MISSING)).waitForDisplayed()

        // canPlayType says "maybe" even where no decoder is installed (CI runner): the metadata tells the truth
        await clickRow(FILE)
        const decodes = await browser.waitUntil(
            async () => (await audioState()).exists && (await audioState()).duration > 0,
            { timeout: 8_000 },
        ).catch(() => false)
        if (decodes) {
            await domClick(byLabel(await tr("audio.player.close")))
            await browser.waitUntil(async () => !(await audioState()).exists, { timeoutMsg: "the player did not close" })
        } else {
            console.log("[e2e] this webview cannot decode the test WAV: the audio tests are skipped")
            this.skip()
        }
    })

    after(() => {
        if (wavPath) fs.rmSync(wavPath, { force: true })
    })

    it("shows nothing but the note icon before a file is played", async () => {
        expect((await audioState()).exists).toBe(false)
        expect(await rowState(FILE)).toEqual({ icon: "music", sr: "", current: null })
    })

    it("plays a file when its row is clicked", async () => {
        await clickRow(FILE)
        await waitAudio((s) => s.exists && !s.paused && s.time > 0, "the file did not start playing")
        await byLabel(await tr("audio.player.seek")).waitForDisplayed()
        await expect($(`//div[@title=${JSON.stringify(FILE)}]`)).toBeDisplayed()
        await browser.waitUntil(async () => (await rowState(FILE)).icon === "audio-lines", { timeoutMsg: "the row does not show the playing icon" })
        expect(await rowState(FILE)).toEqual({ icon: "audio-lines", sr: await tr("audio.nowPlaying"), current: "true" })
        expect((await audioState()).duration).toBeGreaterThan(SECONDS - 0.5)
    })

    it("pauses on the same row and resumes from where it was", async () => {
        await waitAudio((s) => s.time > 0.3, "the playback does not advance")
        await clickRow(FILE)
        await waitAudio((s) => s.paused, "the second click did not pause")
        const paused = await audioState()
        expect(paused.time).toBeGreaterThan(0.2)
        await browser.waitUntil(async () => (await rowState(FILE)).icon === "pause", { timeoutMsg: "the row does not show the pause icon" })
        expect((await rowState(FILE)).sr).toBe(await tr("audio.paused"))
        await expect(byLabel(await tr("audio.player.play"))).toBeDisplayed()

        await clickRow(FILE)
        await waitAudio((s) => !s.paused, "the third click did not resume")
        const resumed = await audioState()
        // It continues, it does not start over
        expect(resumed.time).toBeGreaterThanOrEqual(paused.time - 0.05)
        await expect(byLabel(await tr("audio.player.pause"))).toBeDisplayed()
    })

    it("shows the square icon when the track plays to its end", async () => {
        // +15 s on a track shorter than that goes to the end while it plays
        await domClick(byLabel(await tr("audio.player.forward", { seconds: 15 })))
        await waitAudio((s) => s.ended && s.paused, "the track did not end")
        await browser.waitUntil(async () => (await rowState(FILE)).icon === "square", { timeoutMsg: "the row does not show the ended icon" })
        expect((await rowState(FILE)).sr).toBe(await tr("audio.ended"))
        await expect(byLabel(await tr("audio.player.play"))).toBeDisplayed()
    })

    it("restarts from the beginning, also from the end", async () => {
        await domClick(byLabel(await tr("audio.player.restart")))
        await waitAudio((s) => !s.paused && !s.ended && s.time < 3, "the restart did not play from the start")
        await browser.waitUntil(async () => (await rowState(FILE)).icon === "audio-lines", { timeoutMsg: "the row does not show the playing icon again" })
        await ensurePaused()
    })

    it("skips 15 seconds back and forward within the limits of the track", async () => {
        await ensurePaused()
        await domClick(byLabel(await tr("audio.player.back", { seconds: 15 })))
        await waitAudio((s) => s.time === 0, "back from the start must stay at 0")

        await domClick(byLabel(await tr("audio.player.forward", { seconds: 15 })))
        await waitAudio((s) => Math.abs(s.time - s.duration) < 0.01, "forward must stop at the end of the track")

        await domClick(byLabel(await tr("audio.player.back", { seconds: 15 })))
        // 12 s - 15 s is before the start: clamped to 0
        await waitAudio((s) => s.time === 0, "back must stop at 0")
    })

    it("moves the position by 5 seconds with the arrows of the seek bar", async () => {
        await ensurePaused()
        await domClick(byLabel(await tr("audio.player.restart")))
        await ensurePaused()
        await domClick(byLabel(await tr("audio.player.back", { seconds: 15 })))
        await waitAudio((s) => s.time === 0, "could not go back to 0")

        await focusSeek()
        await browser.keys("ArrowRight")
        await waitAudio((s) => Math.abs(s.time - 5) < 0.01, "ArrowRight must move 5 s forward")
        await browser.keys("ArrowUp")
        await waitAudio((s) => Math.abs(s.time - 10) < 0.01, "ArrowUp must move 5 s forward")
        await browser.keys("ArrowLeft")
        await waitAudio((s) => Math.abs(s.time - 5) < 0.01, "ArrowLeft must move 5 s back")
        await browser.keys("ArrowDown")
        await waitAudio((s) => s.time === 0, "ArrowDown must move 5 s back")
        await browser.keys("ArrowLeft")
        await waitAudio((s) => s.time === 0, "going back from 0 must stay at 0")
        // The arrows are handled by the player: the track did not start or stop
        expect((await audioState()).paused).toBe(true)
    })

    it("plays and pauses with the space bar from the seek bar", async () => {
        await ensurePaused()
        await focusSeek()
        await browser.keys("Space")
        await waitAudio((s) => !s.paused, "Space did not start the playback")
        await focusSeek()
        await browser.keys("Space")
        await waitAudio((s) => s.paused, "Space did not pause the playback")
    })

    it("mutes and unmutes", async () => {
        const mute = byLabel(await tr("audio.player.mute"))
        await expect(mute).toHaveAttribute("aria-pressed", "false")
        await domClick(mute)
        const unmute = byLabel(await tr("audio.player.unmute"))
        await expect(unmute).toHaveAttribute("aria-pressed", "true")
        await waitAudio((s) => s.muted, "the audio element is not muted")
        await domClick(unmute)
        await expect(byLabel(await tr("audio.player.mute"))).toHaveAttribute("aria-pressed", "false")
        await waitAudio((s) => !s.muted, "the audio element is still muted")
    })

    it("cycles through the playback speeds", async () => {
        expect((await audioState()).rate).toBe(1)
        const cycle = [1, 1.25, 1.5, 2, 0.75, 1]
        for (let i = 0; i < cycle.length - 1; i++) {
            // The button is labelled with the current rate and moves to the next one
            await domClick(byLabel(await tr("audio.player.speed", { rate: cycle[i] })))
            await waitAudio((s) => s.rate === cycle[i + 1], `the rate did not become ${cycle[i + 1]}`)
            await expect(byLabel(await tr("audio.player.speed", { rate: cycle[i + 1] }))).toBeDisplayed()
        }
    })

    it("closes the player with the X and the row goes back to the note icon", async () => {
        await ensurePaused()
        await domClick(byLabel(await tr("audio.player.close")))
        await byLabel(await tr("audio.player.seek")).waitForExist({ reverse: true, timeoutMsg: "the player is still open" })
        expect((await audioState()).exists).toBe(false)
        await browser.waitUntil(async () => (await rowState(FILE)).icon === "music", { timeoutMsg: "the row does not show the note icon" })
        expect(await rowState(FILE)).toEqual({ icon: "music", sr: "", current: null })
    })

    it("marks the file that is gone with a warning icon, the others have none", async () => {
        const row = async (name: string) => (await audioRow(name)).$("..")
        await browser.waitUntil(async () => (await (await row(MISSING)).getAttribute("data-missing")) === "true", { timeoutMsg: "the missing file was not marked" })
        await expect((await row(MISSING)).$(`[role="img"][aria-label=${JSON.stringify(await tr("audio.missing.title"))}]`)).toBeDisplayed()
        expect(await (await row(FILE)).getAttribute("data-missing")).toBeNull()
    })

    it("tells when the file is no longer at the saved path", async () => {
        await clickRow(MISSING)
        const dialog = await topDialog()
        await dialog.waitForDisplayed({ timeoutMsg: "the missing file dialog did not open" })
        await expect(dialog.$(`h2=${await tr("audio.missing.title")}`)).toBeDisplayed()
        await expect(byText(await tr("audio.missing.deleteReference"), dialog)).toBeDisplayed()
        await expect(byText(await tr("audio.updatePath"), dialog)).toBeDisplayed()
        await expect(byText(await tr("common.cancel"), dialog)).toBeDisplayed()
        expect((await audioState()).exists).toBe(false)

        // Cancel keeps the reference
        await domClick(byText(await tr("common.cancel"), dialog))
        await dialog.waitForExist({ reverse: true })
        await expect(await audioRow(MISSING)).toBeDisplayed()

        // Delete reference moves it to the trash and the row disappears
        await clickRow(MISSING)
        const again = await topDialog()
        await again.waitForDisplayed()
        await domClick(byText(await tr("audio.missing.deleteReference"), again))
        await (await audioRow(MISSING)).waitForExist({ reverse: true, timeoutMsg: "the reference was not removed from the group" })
        await again.waitForExist({ reverse: true, timeoutMsg: "the dialog is still open" })
    })
})
