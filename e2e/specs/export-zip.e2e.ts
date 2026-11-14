import fs from "node:fs"
import path from "node:path"
import { browser, expect } from "@wdio/globals"
import { dataDir, waitForApp } from "../helpers"

// The native file pickers cannot be driven, so this spec calls the Rust commands behind the zip export and import
// (`linked_files_size`, `export_zip`, `import_zip`, `delete_extracted_files`) through the page, like the app does.
// The TS side (dialog, JSON, rows) is covered by the unit tests.

type Summary = { added: number, missing: number }
type Imported = { json: string, files: Record<string, string> }

/** Calls a Tauri command from the page; a command with `onProgress` gets a channel that ignores the messages. */
const invoke = async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    const result = await browser.executeAsync(
        (cmd: string, params: Record<string, unknown>, done: (value: { ok?: unknown, error?: string }) => void) => {
            const internals = (window as unknown as {
                __TAURI_INTERNALS__: { invoke: (name: string, args: unknown) => Promise<unknown>, transformCallback: (callback: () => void) => number }
            }).__TAURI_INTERNALS__
            const sent = { ...params }
            if ("onProgress" in params) sent.onProgress = `__CHANNEL__:${internals.transformCallback(() => undefined)}`
            internals.invoke(cmd, sent).then(ok => done({ ok }), (error: unknown) => done({ error: String(error) }))
        },
        command, args,
    ) as { ok?: T, error?: string }
    if (result.error !== undefined) throw new Error(`${command}: ${result.error}`)
    return result.ok as T
}

const AUDIO = Buffer.from("not really audio, but the bytes must come back identical")
const IMAGE = Buffer.alloc(40_000, 7)

describe("Zip export and import of the linked files", () => {
    let root = ""
    let audioPath = ""
    let imagePath = ""
    let missingPath = ""
    let zipPath = ""
    let mediaDir = ""

    before(async () => {
        await waitForApp()
        const data = await dataDir()
        root = fs.mkdtempSync(path.join(data, "zip-spec-"))
        mediaDir = path.join(data, "media")
        audioPath = path.join(root, "Song.mp3")
        imagePath = path.join(root, "Picture.png")
        missingPath = path.join(root, "gone.mp4")
        zipPath = path.join(root, "out.easytask.zip")
        fs.writeFileSync(audioPath, AUDIO)
        fs.writeFileSync(imagePath, IMAGE)
    })

    after(() => {
        fs.rmSync(root, { recursive: true, force: true })
    })

    it("estimates the size of the linked files that exist and counts the missing ones", async () => {
        const info = await invoke<{ bytes: number, count: number, missing: number }>("linked_files_size", { paths: [audioPath, imagePath, imagePath, missingPath] })
        expect(info).toEqual({ bytes: AUDIO.length + IMAGE.length, count: 2, missing: 1 })
    })

    it("writes a zip with the JSON and the files, skipping the missing one", async () => {
        const json = JSON.stringify({ format: "easytask-workspace", version: 3 })
        const summary = await invoke<Summary>("export_zip", {
            dest: zipPath, json, onProgress: true,
            files: [
                { path: audioPath, entry: "files/0_Song.mp3" },
                { path: imagePath, entry: "files/1_Picture.png" },
                { path: missingPath, entry: "files/2_gone.mp4" },
            ],
        })
        expect(summary).toEqual({ added: 2, missing: 1 })
        const bytes = fs.readFileSync(zipPath)
        expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK")
        const text = bytes.toString("latin1")
        for (const entry of ["workspace.easytask.json", "files/0_Song.mp3", "files/1_Picture.png"]) expect(text).toContain(entry)
        expect(text).not.toContain("files/2_gone.mp4")
        expect(fs.existsSync(`${zipPath}.part`)).toBe(false)
    })

    it("refuses an entry name that could escape the archive", async () => {
        const error = await invoke("export_zip", { dest: path.join(root, "bad.zip"), json: "{}", onProgress: true, files: [{ path: audioPath, entry: "files/../evil.mp3" }] })
            .then(() => "", (e: Error) => e.message)
        expect(error).toContain("invalid entry name")
        expect(fs.existsSync(path.join(root, "bad.zip"))).toBe(false)
    })

    let imported: Imported
    it("imports the zip: the JSON comes back and the files are extracted into the media folder of the data folder", async () => {
        imported = await invoke<Imported>("import_zip", { src: zipPath, onProgress: true })
        expect(JSON.parse(imported.json)).toEqual({ format: "easytask-workspace", version: 3 })
        expect(Object.keys(imported.files).sort()).toEqual(["files/0_Song.mp3", "files/1_Picture.png"])
        for (const extracted of Object.values(imported.files)) {
            expect(path.dirname(extracted)).toBe(mediaDir)
            expect(fs.existsSync(extracted)).toBe(true)
        }
        expect(path.basename(imported.files["files/0_Song.mp3"])).toBe("Song.mp3")
        expect(fs.readFileSync(imported.files["files/0_Song.mp3"]).equals(AUDIO)).toBe(true)
        expect(fs.readFileSync(imported.files["files/1_Picture.png"]).equals(IMAGE)).toBe(true)
    })

    it("the extracted copies can be shown by the app like any linked file", async () => {
        await invoke("allow_audio_file", { path: imported.files["files/0_Song.mp3"] })
        await invoke("allow_media_file", { path: imported.files["files/1_Picture.png"] })
    })

    it("a second import never overwrites the first copies", async () => {
        const again = await invoke<Imported>("import_zip", { src: zipPath, onProgress: true })
        for (const [entry, extracted] of Object.entries(again.files)) {
            expect(extracted).not.toBe(imported.files[entry])
            expect(path.dirname(extracted)).toBe(mediaDir)
        }
        expect(fs.readFileSync(imported.files["files/0_Song.mp3"]).equals(AUDIO)).toBe(true)
        // A cancelled import: its copies are deleted, the other ones stay
        const deleted = await invoke<number>("delete_extracted_files", { paths: Object.values(again.files) })
        expect(deleted).toBe(2)
        for (const extracted of Object.values(again.files)) expect(fs.existsSync(extracted)).toBe(false)
        expect(fs.existsSync(imported.files["files/0_Song.mp3"])).toBe(true)
    })

    it("only deletes files inside the media folder", async () => {
        const deleted = await invoke<number>("delete_extracted_files", { paths: [audioPath, ...Object.values(imported.files)] })
        expect(deleted).toBe(2)
        expect(fs.existsSync(audioPath)).toBe(true)
        for (const extracted of Object.values(imported.files)) expect(fs.existsSync(extracted)).toBe(false)
    })

    it("rejects a file that is not a zip", async () => {
        const notZip = path.join(root, "fake.easytask.zip")
        fs.writeFileSync(notZip, "this is not a zip")
        const error = await invoke("import_zip", { src: notZip, onProgress: true }).then(() => "", (e: Error) => e.message)
        expect(error).toContain("INVALID_ARCHIVE")
    })
})
