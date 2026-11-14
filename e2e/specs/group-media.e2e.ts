import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { $, $$, browser, expect } from "@wdio/globals"
import {
    byLabel, byText, createFromSidebar, createWorkspace, dataDir, domClick, openWorkspace, sql, topDialog, tr, treeRow, typeInto,
    waitForApp,
} from "../helpers"

const WORKSPACE = "Media Workspace"
const NOTE = "Media Note"
const GROUP = "Media Group"
const FILES = ["media-red.png", "media-green.png", "media-blue.png"]
const MISSING = "media-gone.png"
const COLORS: [number, number, number][] = [[220, 40, 40], [40, 180, 60], [40, 70, 220]]

const dir: string[] = []
const written: string[] = []

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
})
const crc32 = (buffer: Buffer) => {
    let c = 0xffffffff
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const out = Buffer.alloc(8 + data.length + 4)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
}

/** A valid 16x16 PNG filled with one color (no image library needed). */
const makePng = ([r, g, b]: [number, number, number]) => {
    const size = 16
    const header = Buffer.alloc(13)
    header.writeUInt32BE(size, 0)
    header.writeUInt32BE(size, 4)
    header[8] = 8 // bit depth
    header[9] = 2 // RGB
    const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])
    const raw = Buffer.concat(Array.from({ length: size }, () => row))
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
    ])
}

/** The list of the media files of the group. */
const mediaList = async () => $(`[role="list"][aria-label=${JSON.stringify(await tr("media.files"))}]`)

/** Row (listitem) of a media file, found through its name. */
const mediaRow = async (name: string) =>
    (await mediaList()).$(`.//div[@role='listitem'][.//span[normalize-space()=${JSON.stringify(name)}]]`)

const openFile = async (name: string) => domClick(await (await mediaRow(name)).$("button"))

/** The full-window viewer (the dialog whose title is the viewer one). */
const viewerXpath = async () => `//div[@role='dialog'][.//h2[normalize-space()=${JSON.stringify(await tr("media.viewer.title"))}]]`
const viewer = async () => $(await viewerXpath())

describe("Images and videos in a group", () => {
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

        // The files are linked through the database (the app would open a native file picker, which the driver cannot use)
        dir[0] = await dataDir()
        for (const [index, name] of FILES.entries()) {
            const file = path.join(dir[0], name)
            fs.writeFileSync(file, makePng(COLORS[index]))
            written.push(file)
        }
        const rows = await sql<{ id: number }[]>("select", "SELECT id FROM section_group WHERE name = ?", [GROUP])
        const groupId = rows[0].id
        const paths = [...FILES.map(name => path.join(dir[0], name)), path.join(dir[0], MISSING)]
        for (const [position, file] of paths.entries())
            await sql("execute", "INSERT INTO media_file (section_groupID, name, path, position) VALUES (?, ?, ?, ?)", [groupId, path.basename(file), file, position])

        // The group loads its files when it mounts: close the note and open it again
        await byLabel(await tr("notes.closeCurrent")).click()
        await treeRow(NOTE).click()
        await (await mediaRow(FILES[0])).waitForDisplayed({ timeoutMsg: "the media files are not listed in the group" })
    })

    after(() => {
        for (const file of written) fs.rmSync(file, { force: true })
    })

    it("lists them one under the other, with a thumbnail that loads", async () => {
        const rows = await (await mediaList()).$$(".//div[@role='listitem']")
        expect(rows.length).toBe(FILES.length + 1)
        for (const name of FILES) {
            const row = await mediaRow(name)
            await browser.waitUntil(
                async () => browser.execute((el: HTMLElement) => {
                    const img = el.querySelector("img")
                    return !!img && img.complete && img.naturalWidth > 0
                }, (await row.getElement()) as unknown as HTMLElement),
                { timeoutMsg: `the thumbnail of ${name} did not load` },
            )
        }
    })

    it("shows the number of images and videos in the header", async () => {
        await expect($(`[role="img"][aria-label=${JSON.stringify(await tr("groups.mediaCount_other", { count: FILES.length + 1 }))}]`)).toBeDisplayed()
    })

    it("marks the file that is gone with a warning, the others have none", async () => {
        const gone = await mediaRow(MISSING)
        await browser.waitUntil(async () => (await gone.getAttribute("data-missing")) === "true", { timeoutMsg: "the missing file was not marked" })
        await expect(gone.$(`[role="img"][aria-label=${JSON.stringify(await tr("audio.missing.title"))}]`)).toBeDisplayed()
        expect(await (await mediaRow(FILES[0])).getAttribute("data-missing")).toBeNull()
    })

    it("opens the viewer, moves with the arrows and closes with Esc", async () => {
        await openFile(FILES[0])
        const dialog = await viewer()
        await dialog.waitForDisplayed({ timeoutMsg: "the viewer did not open" })
        await expect(dialog.$(`img[alt=${JSON.stringify(FILES[0])}]`)).toBeDisplayed()
        await expect(dialog.$(`span=${await tr("media.viewer.position", { current: 1, total: FILES.length + 1 })}`)).toBeDisplayed()

        await browser.keys("ArrowRight")
        await expect(dialog.$(`img[alt=${JSON.stringify(FILES[1])}]`)).toBeDisplayed()
        await expect(dialog.$(`span=${await tr("media.viewer.position", { current: 2, total: FILES.length + 1 })}`)).toBeDisplayed()
        await browser.keys("ArrowRight")
        await expect(dialog.$(`img[alt=${JSON.stringify(FILES[2])}]`)).toBeDisplayed()
        await browser.keys("ArrowLeft")
        await expect(dialog.$(`img[alt=${JSON.stringify(FILES[1])}]`)).toBeDisplayed()

        // The next button does the same as the arrow
        await domClick(byLabel(await tr("media.viewer.next")))
        await expect(dialog.$(`img[alt=${JSON.stringify(FILES[2])}]`)).toBeDisplayed()

        await browser.keys("Escape")
        await dialog.waitForExist({ reverse: true, timeoutMsg: "Esc did not close the viewer" })
    })

    it("a click on the missing file opens the file not found dialog instead of the viewer", async () => {
        await openFile(MISSING)
        const dialog = await topDialog()
        await dialog.waitForDisplayed({ timeoutMsg: "the missing file dialog did not open" })
        await expect(dialog.$(`h2=${await tr("audio.missing.title")}`)).toBeDisplayed()
        await expect(dialog.$(`p=${await tr("media.missing.description")}`)).toBeDisplayed()
        await expect(byText(await tr("audio.updatePath"), dialog)).toBeDisplayed()
        await domClick(byText(await tr("common.cancel"), dialog))
        await dialog.waitForExist({ reverse: true })
        expect((await $$(await viewerXpath())).length).toBe(0)
    })

    it("Delete reference moves the missing file to the trash", async () => {
        await openFile(MISSING)
        const dialog = await topDialog()
        await dialog.waitForDisplayed()
        await domClick(byText(await tr("audio.missing.deleteReference"), dialog))
        await (await mediaRow(MISSING)).waitForExist({ reverse: true, timeoutMsg: "the reference was not removed from the group" })
        const trashed = await sql<{ deleted_at: string | null }[]>("select", "SELECT deleted_at FROM media_file WHERE name = ?", [MISSING])
        expect(trashed[0].deleted_at).not.toBeNull()
    })
})
