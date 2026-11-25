import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { $, browser, expect } from "@wdio/globals"
import { byLabel, byText, createWorkspace, dataDir, sql, tr, waitForApp } from "../helpers"

// Export a complete workspace to a `.easytask.zip` (with the linked files) and import it back through the real UI.
//
// The native pickers cannot be driven by the WebDriver. The app opens them through the dialog plugin, i.e. through
// `window.__TAURI_INTERNALS__.invoke("plugin:dialog|save" / "plugin:dialog|open")`: the spec wraps that function in the page and
// answers those two commands with a path of its own, every other command goes to the real backend. Nothing is added to the app
// (no test hook that could end up in a release build): the menu, the "include the files" question, the zip writer in Rust, the
// import names dialog and the database import all run exactly as in use.
// The paths-only `.easytask.json` is not covered: it is written with plugin-fs, whose scope is extended by the real picker only.

const SOURCE = "Xfer Source"
const SONG = "Xfer Song.mp3"
const PICTURE = "Xfer Picture.png"
const BACKGROUND = "Xfer Background.png"

const AUDIO_BYTES = Buffer.from("not really an mp3, but the bytes must come back identical")

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
    header[8] = 8
    header[9] = 2
    const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])
    const raw = Buffer.concat(Array.from({ length: size }, () => row))
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
    ])
}
const PICTURE_BYTES = makePng([220, 40, 40])
const BACKGROUND_BYTES = makePng([40, 70, 220])

/** A toast with the given text and no "·" suffix (the import message must not be "... n files skipped"). */
const toastWith = (text: string) => $(`//*[@data-sonner-toast][contains(normalize-space(.), ${JSON.stringify(text)}) and not(contains(., "·"))]`)

type Row = Record<string, unknown>
const select = <T = Row>(query: string, values: unknown[] = []) => sql<T[]>("select", query, values)

/** Runs an INSERT and returns the id of the new row. */
const insert = async (query: string, values: unknown[]): Promise<number> => {
    const result = await sql<unknown>("execute", query, values)
    const id = Array.isArray(result) ? result[1] : undefined
    if (typeof id !== "number" || id <= 0) throw new Error(`INSERT did not return an id: ${JSON.stringify(result)}`)
    return id
}

/**
 * Answers the two native pickers of the dialog plugin with the given paths; every other command goes to the real backend.
 * `window.__TAURI_INTERNALS__.invoke` is a read-only property, so the commands are caught one step below it: Tauri sends them with
 * a fetch to `ipc://localhost/<command>` (`http://ipc.localhost/...` on Windows) and reads the answer from the response, which the
 * wrapper of `window.fetch` builds itself for the two picker commands.
 */
const stubPickers = async (savePath: string, openPath: string) => {
    await browser.execute((save: string, open: string) => {
        const w = window as unknown as { __e2ePickers?: { save: string, open: string }, __e2eCalls?: string[], __e2eFetch?: typeof fetch }
        w.__e2ePickers = { save, open }
        w.__e2eCalls = []
        if (w.__e2eFetch) return
        const original = window.fetch.bind(window)
        w.__e2eFetch = original
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
            const url = decodeURIComponent(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
            for (const [command, key] of [["plugin:dialog|save", "save"], ["plugin:dialog|open", "open"]] as const) {
                if (!url.includes(`/${command}`)) continue
                w.__e2eCalls!.push(command)
                return Promise.resolve(new Response(JSON.stringify(w.__e2ePickers![key]), {
                    headers: { "Tauri-Response": "ok", "Content-Type": "application/json" },
                }))
            }
            return original(input, init)
        }
    }, savePath, openPath)
}

/** What is on screen and in the stub when a step fails: toasts, dialogs, the picker calls and whether the file was written. */
const diagnostics = async (zipPath: string) => JSON.stringify(await browser.execute((zip: string) => ({
    wrapped: !!(window as unknown as { __e2eFetch?: unknown }).__e2eFetch,
    calls: (window as unknown as { __e2eCalls?: string[] }).__e2eCalls,
    toasts: [...document.querySelectorAll("[data-sonner-toast]")].map(el => el.textContent),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map(el => (el.textContent ?? "").slice(0, 200)),
    zip,
}), zipPath))

const pickerCalls = () => browser.execute(() => (window as unknown as { __e2eCalls?: string[] }).__e2eCalls ?? [])

/**
 * Everything of a workspace that an export/import must keep, with no id: rows are described by names and positions, so two
 * workspaces can be compared with toEqual. The rows of the automations are mapped from ids to names too.
 */
const snapshot = async (workspaceId: number) => {
    const tags = await select("SELECT name, color, shape, position FROM tag WHERE workspaceID = ? ORDER BY position, name", [workspaceId])
    const folders = await select(
        `SELECT f.name, f.color, f.position, f.archived_at, p.name AS parent FROM folder f LEFT JOIN folder p ON p.id = f.folderID
         WHERE f.workspaceID = ? AND f.deleted_at IS NULL ORDER BY p.name, f.position, f.name`, [workspaceId])
    const notes = await select(
        `SELECT n.name, n.color, n.bg_color, n.position, n.archived_at, f.name AS folder, n.bg_image IS NOT NULL AS has_bg_image
         FROM note n LEFT JOIN folder f ON f.id = n.folderID WHERE n.workspaceID = ? AND n.deleted_at IS NULL ORDER BY n.name`, [workspaceId])
    const groups = await select(
        `SELECT n.name AS note, g.name, g.color, g.width, g.position, g.archived_at FROM section_group g JOIN note n ON n.id = g.noteID
         WHERE n.workspaceID = ? AND g.deleted_at IS NULL ORDER BY n.name, g.position`, [workspaceId])
    const sections = await select(
        `SELECT n.name AS note, g.position AS grp, s.title, s.color, s.position, s.is_default, s.task_order, s.archived_at
         FROM section s JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID
         WHERE n.workspaceID = ? AND s.deleted_at IS NULL ORDER BY n.name, g.position, s.position`, [workspaceId])
    const tasks = await select(
        `SELECT n.name AS note, g.position AS grp, s.title AS section, s.is_default, p.text AS parent, t.text, t.description, t.completed,
                t.priority, t.color, t.position, t.archived_at
         FROM task t JOIN section s ON s.id = t.sectionID JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID
         LEFT JOIN task p ON p.id = t.taskID
         WHERE n.workspaceID = ? AND t.deleted_at IS NULL ORDER BY n.name, g.position, s.position, p.text, t.position, t.text`, [workspaceId])
    const taskTags = await select(
        `SELECT n.name AS note, t.text, tg.name AS tag FROM task_tag tt JOIN task t ON t.id = tt.taskID JOIN tag tg ON tg.id = tt.tagID
         JOIN section s ON s.id = t.sectionID JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID
         WHERE n.workspaceID = ? ORDER BY n.name, t.text, tg.name`, [workspaceId])
    const groupTags = await select(
        `SELECT n.name AS note, g.position AS grp, tg.name AS tag FROM section_group_tag gt JOIN section_group g ON g.id = gt.groupID
         JOIN tag tg ON tg.id = gt.tagID JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ? ORDER BY n.name, g.position, tg.name`, [workspaceId])
    const sectionTags = await select(
        `SELECT n.name AS note, g.position AS grp, s.title, tg.name AS tag FROM section_tag st JOIN section s ON s.id = st.sectionID
         JOIN tag tg ON tg.id = st.tagID JOIN section_group g ON g.id = s.groupID JOIN note n ON n.id = g.noteID
         WHERE n.workspaceID = ? ORDER BY n.name, g.position, s.title, tg.name`, [workspaceId])

    // Automations: ids of sections, groups and tags become names/positions
    const sectionName = new Map<number, string>()
    const groupPosition = new Map<number, number>()
    for (const row of await select<{ id: number, grp: number, title: string | null, is_default: number }>(
        `SELECT s.id, g.position AS grp, s.title, s.is_default FROM section s JOIN section_group g ON g.id = s.groupID
         JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ?`, [workspaceId]))
        sectionName.set(row.id, `${row.grp}/${row.is_default ? "(direct)" : row.title}`)
    for (const row of await select<{ id: number, position: number }>(
        "SELECT g.id, g.position FROM section_group g JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ?", [workspaceId]))
        groupPosition.set(row.id, row.position)
    const tagName = new Map((await select<{ id: number, name: string }>("SELECT id, name FROM tag WHERE workspaceID = ?", [workspaceId])).map(row => [row.id, row.name]))
    const named = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(named)
        if (value === null || typeof value !== "object") return value
        return Object.fromEntries(Object.entries(value).map(([key, item]) => {
            if (key === "sectionId" && typeof item === "number") return [key, sectionName.get(item)]
            if (key === "groupId" && typeof item === "number") return [key, groupPosition.get(item)]
            if (key === "tagId" && typeof item === "number") return [key, tagName.get(item)]
            return [key, named(item)]
        }))
    }
    const automations = (await select<{ note: string, name: string | null, enabled: number, trigger: string, actions: string, position: number }>(
        `SELECT n.name AS note, a.name, a.enabled, a.trigger, a.actions, a.position FROM automation a JOIN note n ON n.id = a.noteID
         WHERE n.workspaceID = ? ORDER BY n.name, a.position`, [workspaceId]))
        .map(row => ({ ...row, trigger: named(JSON.parse(row.trigger)), actions: named(JSON.parse(row.actions)) }))

    const templates = (await select<{ name: string, color: string | null, bg_color: string | null, has_bg_image: number, content: string }>(
        `SELECT name, color, bg_color, bg_image IS NOT NULL AS has_bg_image, content FROM note_template
         WHERE workspaceID = ? AND deleted_at IS NULL ORDER BY name`, [workspaceId]))
        .map(row => ({ ...row, content: JSON.parse(row.content) as unknown }))

    return { tags, folders, notes, groups, sections, tasks, taskTags, groupTags, sectionTags, automations, templates }
}

/** The linked files (audio, media), by note and group; the path is returned apart, since an import points to its own copies. */
const linkedFiles = async (workspaceId: number) => {
    const rows: { kind: string, note: string, grp: number, name: string, position: number, path: string }[] = []
    for (const [kind, table] of [["audio", "audio_file"], ["media", "media_file"]] as const)
        rows.push(...(await select<{ note: string, grp: number, name: string, position: number, path: string }>(
            `SELECT n.name AS note, g.position AS grp, a.name, a.position, a.path FROM ${table} a JOIN section_group g ON g.id = a.section_groupID
             JOIN note n ON n.id = g.noteID WHERE n.workspaceID = ? AND a.deleted_at IS NULL ORDER BY n.name, g.position, a.position`, [workspaceId]))
            .map(row => ({ kind, ...row })))
    return rows
}

const withoutPath = <T extends { path: string }>(rows: T[]) => rows.map(row => { const { path: _unused, ...rest } = row; void _unused; return rest })

describe("Export and import of a whole workspace", () => {
    let root = ""
    let mediaDir = ""
    let zipPath = ""
    let sourceId = 0
    let importedId = 0
    let importedName = ""
    let expected: Awaited<ReturnType<typeof snapshot>>

    before(async () => {
        await waitForApp()
        const data = await dataDir()
        mediaDir = path.join(data, "media")
        root = fs.mkdtempSync(path.join(data, "transfer-spec-"))
        zipPath = path.join(root, "workspace.easytask.zip")
        fs.writeFileSync(path.join(root, SONG), AUDIO_BYTES)
        fs.writeFileSync(path.join(root, PICTURE), PICTURE_BYTES)
        fs.writeFileSync(path.join(root, BACKGROUND), BACKGROUND_BYTES)

        await createWorkspace(SOURCE)
        sourceId = (await select<{ id: number }>("SELECT id FROM workspace WHERE name = ?", [SOURCE]))[0].id
    })

    after(async () => {
        // The copies the import made in the media folder, then the folder of the spec
        if (importedId) {
            for (const file of await linkedFiles(importedId)) if (path.dirname(file.path) === mediaDir) fs.rmSync(file.path, { force: true })
            for (const row of await select<{ bg_image: string }>(
                "SELECT bg_image FROM note WHERE workspaceID = ? AND bg_image IS NOT NULL UNION SELECT bg_image FROM note_template WHERE workspaceID = ? AND bg_image IS NOT NULL",
                [importedId, importedId]))
                if (path.dirname(row.bg_image) === mediaDir) fs.rmSync(row.bg_image, { force: true })
        }
        fs.rmSync(root, { recursive: true, force: true })
    })

    it("builds a complete workspace", async () => {
        const alpha = await insert("INSERT INTO tag (workspaceID, name, color, shape, position) VALUES (?, ?, ?, ?, 0)", [sourceId, "Xfer Alpha", "#ef4444", "dot"])
        const beta = await insert("INSERT INTO tag (workspaceID, name, color, shape, position) VALUES (?, ?, ?, ?, 1)", [sourceId, "Xfer Beta", "#3b82f6", "star"])
        const gamma = await insert("INSERT INTO tag (workspaceID, name, color, shape, position) VALUES (?, ?, ?, ?, 2)", [sourceId, "Xfer Gamma", "#10b981", "diamond"])
        await insert("INSERT INTO tag (workspaceID, name, color, shape, position) VALUES (?, ?, NULL, NULL, 3)", [sourceId, "Xfer Unused"])

        const folder = await insert("INSERT INTO folder (workspaceID, folderID, name, color, position) VALUES (?, NULL, ?, ?, 0)", [sourceId, "Xfer Folder", "#8b5cf6"])
        const subfolder = await insert("INSERT INTO folder (workspaceID, folderID, name, color, position) VALUES (?, ?, ?, NULL, 0)", [sourceId, folder, "Xfer Subfolder"])
        const bgImage = path.join(root, BACKGROUND)
        const note = await insert("INSERT INTO note (workspaceID, folderID, name, color, bg_color, bg_image, position) VALUES (?, ?, ?, ?, ?, ?, 0)",
            [sourceId, subfolder, "Xfer Note", "#f59e0b", "#1e293b", bgImage])
        const rootNote = await insert("INSERT INTO note (workspaceID, folderID, name, color, position) VALUES (?, NULL, ?, NULL, 1)", [sourceId, "Xfer Root Note"])

        const addGroup = async (noteId: number, position: number, name: string, color: string | null, width: number | null) => {
            const group = await insert("INSERT INTO section_group (noteID, position, name, color, width) VALUES (?, ?, ?, ?, ?)", [noteId, position, name, color, width])
            // Every group has its hidden default section, the one of its direct tasks
            const direct = await insert("INSERT INTO section (groupID, title, position, is_default) VALUES (?, NULL, 0, 1)", [group])
            return { group, direct }
        }
        const addSection = (group: number, title: string, color: string | null, position: number, order: string | null) =>
            insert("INSERT INTO section (groupID, title, color, position, task_order) VALUES (?, ?, ?, ?, ?)", [group, title, color, position, order])
        const addTask = (section: number, parent: number | null, text: string, position: number, extra: { description?: string, completed?: boolean, priority?: boolean, color?: string } = {}) =>
            insert("INSERT INTO task (sectionID, taskID, text, description, completed, priority, color, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [section, parent, text, extra.description ?? null, extra.completed ? 1 : 0, extra.priority ? 1 : 0, extra.color ?? null, position])
        const tagTask = (task: number, tag: number) => sql("execute", "INSERT INTO task_tag (taskID, tagID) VALUES (?, ?)", [task, tag])

        const one = await addGroup(note, 0, "Xfer Group One", "#22c55e", 420)
        await sql("execute", "INSERT INTO section_group_tag (groupID, tagID) VALUES (?, ?)", [one.group, alpha])
        const direct = await addTask(one.direct, null, "Xfer direct task", 0, { description: "Written directly in the group" })
        await tagTask(direct, gamma)
        const todo = await addSection(one.group, "Xfer Todo", "#ef4444", 1, "open-first")
        await sql("execute", "INSERT INTO section_tag (sectionID, tagID) VALUES (?, ?)", [todo, beta])
        const done = await addSection(one.group, "Xfer Done", null, 2, null)
        const parent = await addTask(todo, null, "Xfer parent task", 0, { description: "With subtasks", priority: true, color: "#f97316" })
        await tagTask(parent, alpha)
        await tagTask(parent, beta)
        const child = await addTask(todo, parent, "Xfer child task", 0, { completed: true })
        await addTask(todo, child, "Xfer grandchild task", 0)
        await addTask(todo, parent, "Xfer second child", 1)
        const finished = await addTask(todo, null, "Xfer finished task", 1, { completed: true })
        await tagTask(finished, gamma)
        await addTask(done, null, "Xfer done task", 0, { completed: true, color: "#0ea5e9" })

        const two = await addGroup(note, 1, "Xfer Group Two", null, null)
        const other = await addSection(two.group, "Xfer Other", null, 1, null)
        await addTask(other, null, "Xfer other task", 0)

        const solo = await addGroup(rootNote, 0, "Xfer Solo Group", null, null)
        await addTask(solo.direct, null, "Xfer solo task", 0, { priority: true })

        // Linked files: an audio file and an image in the first group
        await insert("INSERT INTO audio_file (section_groupID, name, path, position) VALUES (?, ?, ?, 0)", [one.group, SONG, path.join(root, SONG)])
        await insert("INSERT INTO media_file (section_groupID, name, path, position) VALUES (?, ?, ?, 0)", [one.group, PICTURE, path.join(root, PICTURE)])

        // An automation: when a task of "Todo" is completed, move it to "Done" (top) and tag it
        await insert("INSERT INTO automation (noteID, name, enabled, trigger, actions, position) VALUES (?, ?, 1, ?, ?, 0)", [
            note, "Xfer rule", JSON.stringify({ type: "task.completed", sectionId: todo }),
            JSON.stringify([{ type: "moveTo", sectionId: done, at: "top" }, { type: "addTag", tagId: gamma }]),
        ])

        // A template with its own content (tags by name) and background
        const templateContent = {
            version: 1,
            groups: [{
                name: "Xfer Template Group", position: 0, color: null,
                sections: [{
                    title: "Xfer Template Section", color: null, position: 0,
                    tasks: [{
                        text: "Xfer template task", description: "From the template", completed: false, priority: true, color: null, position: 0,
                        tags: [{ name: "Xfer Alpha", color: "#ef4444", shape: "dot" }],
                        subtasks: [{ text: "Xfer template subtask", description: null, completed: false, priority: false, color: null, position: 0, subtasks: [] }],
                    }],
                }],
            }],
        }
        await insert("INSERT INTO note_template (workspaceID, name, color, bg_color, bg_image, content) VALUES (?, ?, ?, ?, ?, ?)",
            [sourceId, "Xfer Template", "#a855f7", "#0f172a", bgImage, JSON.stringify(templateContent)])

        expected = await snapshot(sourceId)
        expect(expected.tags.length).toBe(4)
        expect(expected.folders.length).toBe(2)
        expect(expected.notes.length).toBe(2)
        expect(expected.groups.length).toBe(3)
        expect(expected.tasks.length).toBe(9)
        expect(expected.taskTags.length).toBe(4)
        expect(expected.automations.length).toBe(1)
        expect(expected.templates.length).toBe(1)
        expect((await linkedFiles(sourceId)).length).toBe(2)
    })

    it("exports it from the menu of the workspace, with the linked files", async () => {
        await stubPickers(zipPath, zipPath)
        await byLabel(await tr("common.menuOf", { name: SOURCE })).click()
        await byText(await tr("menu.export")).click()

        // 3 distinct files: the song, the picture and the background image (used by the note and by the template)
        const question = $('[role="alertdialog"], [role="dialog"]')
        await question.waitForDisplayed({ timeoutMsg: "the question about the linked files did not show up" })
        await expect(question).toHaveText(expect.stringContaining(await tr("transfer.includeFilesTitle")))
        await byText(await tr("transfer.includeFilesYes"), question).click()

        await toastWith(await tr("transfer.exported")).waitForDisplayed({ timeout: 20_000 }).catch(async () => {
            throw new Error(`the export did not finish: ${await diagnostics(zipPath)}`)
        })
        expect(await pickerCalls()).toEqual(["plugin:dialog|save"])
        const zip = fs.readFileSync(zipPath)
        expect(zip.subarray(0, 2).toString("latin1")).toBe("PK")
        const text = zip.toString("latin1")
        for (const entry of ["workspace.easytask.json", SONG, PICTURE, BACKGROUND]) expect(text).toContain(entry)
        expect(fs.existsSync(`${zipPath}.part`)).toBe(false)
    })

    it("imports the zip with the Import button, as a new workspace", async () => {
        importedName = `${SOURCE} (${await tr("errors.transfer.suffix")})`
        await byText(await tr("home.import")).click()
        const dialog = $('[role="dialog"]')
        await dialog.waitForDisplayed().catch(async () => { throw new Error(`the import names dialog did not open: ${await diagnostics(zipPath)}`) })
        expect(await browser.execute(() => (document.querySelector('[role="dialog"] input') as HTMLInputElement | null)?.value)).toBe(importedName)
        await byText(await tr("transfer.importAction"), dialog).click()

        // The exact "imported" message (no "n files skipped"): every linked file was found and kept
        await toastWith(await tr("transfer.imported")).waitForDisplayed({ timeoutMsg: "the import did not finish (or skipped files)" })
        expect(await pickerCalls()).toEqual(["plugin:dialog|save", "plugin:dialog|open"])
        const rows = await select<{ id: number }>("SELECT id FROM workspace WHERE name = ?", [importedName])
        expect(rows.length).toBe(1)
        importedId = rows[0].id
        expect(importedId).not.toBe(sourceId)
    })

    it("brought back everything: folders, notes, groups, sections, tasks, tags and their links, automation, template", async () => {
        const actual = await snapshot(importedId)
        // Each part on its own, so a failure says what differs
        for (const part of Object.keys(expected) as (keyof typeof expected)[]) expect({ part, rows: actual[part] }).toEqual({ part, rows: expected[part] })
    })

    it("restored the colors, shapes and the order of the tags (also the unused one)", async () => {
        const tags = await select<{ name: string, color: string | null, shape: string | null, position: number }>(
            "SELECT name, color, shape, position FROM tag WHERE workspaceID = ? ORDER BY position", [importedId])
        expect(tags).toEqual([
            { name: "Xfer Alpha", color: "#ef4444", shape: "dot", position: 0 },
            { name: "Xfer Beta", color: "#3b82f6", shape: "star", position: 1 },
            { name: "Xfer Gamma", color: "#10b981", shape: "diamond", position: 2 },
            { name: "Xfer Unused", color: null, shape: null, position: 3 },
        ])
    })

    it("restored the linked files as copies in the media folder, with the same bytes", async () => {
        const source = await linkedFiles(sourceId)
        const copies = await linkedFiles(importedId)
        expect(withoutPath(copies)).toEqual(withoutPath(source))
        const originals: Record<string, Buffer> = { audio: AUDIO_BYTES, media: PICTURE_BYTES }
        for (const copy of copies) {
            expect(path.dirname(copy.path)).toBe(mediaDir)
            expect(copy.path).not.toBe(source.find(file => file.kind === copy.kind)!.path)
            expect(fs.readFileSync(copy.path).equals(originals[copy.kind])).toBe(true)
        }
        // The background images of the note and of the template (one entry of the archive, one copy each use)
        const backgrounds = await select<{ bg_image: string }>(
            "SELECT bg_image FROM note WHERE workspaceID = ? AND bg_image IS NOT NULL UNION ALL SELECT bg_image FROM note_template WHERE workspaceID = ? AND bg_image IS NOT NULL",
            [importedId, importedId])
        expect(backgrounds.length).toBe(2)
        for (const { bg_image } of backgrounds) {
            expect(path.dirname(bg_image)).toBe(mediaDir)
            expect(fs.readFileSync(bg_image).equals(BACKGROUND_BYTES)).toBe(true)
        }
    })

    it("left the source workspace untouched", async () => {
        expect(await snapshot(sourceId)).toEqual(expected)
        expect(fs.existsSync(path.join(root, SONG))).toBe(true)
    })
})
