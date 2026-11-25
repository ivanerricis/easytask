/**
 * Creates a data folder full of realistic fake data (Italian), to try every feature of the app by hand.
 *
 *   npm run seed:demo                       -> %USERPROFILE%\EasyTask-demo
 *   npm run seed:demo -- --target <dir>     -> another folder
 *   npm run seed:demo -- --target <dir> --force
 *
 * Then start the app on it: `$env:EASYTASK_DATA_DIR='<dir>'; npm run tauri dev`.
 *
 * The database is built with the real `initDB` (so the schema is exactly the app one) on node:sqlite.
 * An existing database / settings file in the target is never deleted: with --force it is MOVED to a
 * `backup-before-demo-<date>` folder inside the target. The real default data folder (Documents\EasyTask) is only
 * written with --target pointing at it AND --force, and only when the app is not running.
 */
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const DB_FILE = "easytask.db"
const MOVED_FILES = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`, `${DB_FILE}-journal`, "settings.dat"]

// ---------------------------------------------------------------- dates

const pad = (value: number) => String(value).padStart(2, "0")
const dateOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`
const daysFromNow = (days: number, base = new Date()) => {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, base.getHours(), base.getMinutes())
    return date
}

// ---------------------------------------------------------------- CLI and guards

export type SeedOptions = { target: string, force: boolean, now?: Date }

/** The folders the app uses with no EASYTASK_DATA_DIR: <Documents>\EasyTask (also under OneDrive). */
export function realDataDirs(): string[] {
    const home = os.homedir()
    const candidates = [path.join(home, "Documents", "EasyTask")]
    try {
        for (const entry of fs.readdirSync(home))
            if (entry.toLowerCase().startsWith("onedrive")) candidates.push(path.join(home, entry, "Documents", "EasyTask"), path.join(home, entry, "Documenti", "EasyTask"))
    } catch { /* no home listing */ }
    if (process.platform === "win32") {
        try {
            const out = execFileSync("powershell", ["-NoProfile", "-Command", "[Environment]::GetFolderPath('MyDocuments')"], { encoding: "utf8" }).trim()
            if (out) candidates.push(path.join(out, "EasyTask"))
        } catch { /* keep the guesses */ }
    }
    return candidates.map(dir => path.resolve(dir))
}

const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()

function appIsRunning(): boolean {
    if (process.platform !== "win32") return false
    try {
        const out = execFileSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8" }).toLowerCase()
        return out.includes('"easytask.exe"')
    } catch { return false }
}

/** Moves what the seed would overwrite to backup-before-demo-<date>; returns that folder (null when nothing was there). */
function backupExisting(target: string): string | null {
    const present = [...MOVED_FILES, "files"].filter(name => fs.existsSync(path.join(target, name)))
    if (present.length === 0) return null
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backup = path.join(target, `backup-before-demo-${stamp}`)
    fs.mkdirSync(backup, { recursive: true })
    for (const name of present) fs.renameSync(path.join(target, name), path.join(backup, name))
    return backup
}

// ---------------------------------------------------------------- generated files

function wav(file: string, seconds: number, sample: (t: number) => [number, number]) {
    const rate = 44100
    const frames = Math.round(seconds * rate)
    const data = Buffer.alloc(frames * 4)
    for (let i = 0; i < frames; i++) {
        const [l, r] = sample(i / rate)
        data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l * 32767))), i * 4)
        data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r * 32767))), i * 4 + 2)
    }
    const header = Buffer.alloc(44)
    header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8)
    header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22)
    header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34)
    header.write("data", 36); header.writeUInt32LE(data.length, 40)
    fs.writeFileSync(file, Buffer.concat([header, data]))
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
})
const crc32 = (buf: Buffer) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

function png(file: string, size: number, color: (x: number, y: number) => [number, number, number]) {
    const chunk = (type: string, body: Buffer) => {
        const head = Buffer.alloc(8)
        head.writeUInt32BE(body.length, 0); head.write(type, 4)
        const crc = Buffer.alloc(4)
        crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])))
        return Buffer.concat([head, body, crc])
    }
    const raw = Buffer.alloc(size * (size * 3 + 1))
    for (let y = 0; y < size; y++) {
        raw[y * (size * 3 + 1)] = 0
        for (let x = 0; x < size; x++) raw.set(color(x, y), y * (size * 3 + 1) + 1 + x * 3)
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2
    fs.writeFileSync(file, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
    ]))
}

function pdf(file: string, text: string) {
    const stream = `BT /F1 20 Tf 72 720 Td (${text}) Tj ET`
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    let out = "%PDF-1.4\n"
    const offsets: number[] = []
    objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n` })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    fs.writeFileSync(file, out, "latin1")
}

type Files = Record<"pdf" | "logo" | "txt" | "mockup" | "tone" | "mix" | "missing", string>

function createFiles(target: string): Files {
    const dir = path.join(target, "files")
    fs.mkdirSync(dir, { recursive: true })
    const files: Files = {
        pdf: path.join(dir, "preventivo.pdf"), logo: path.join(dir, "logo.png"), txt: path.join(dir, "note.txt"),
        mockup: path.join(dir, "mockup.png"), tone: path.join(dir, "tono-440hz.wav"), mix: path.join(dir, "mix-demo.wav"),
        missing: path.join(dir, "contratto-fornitore.pdf"),
    }
    pdf(files.pdf, "Preventivo demo - Lancio prodotto")
    png(files.logo, 128, (x, y) => [40 + x, 90 + Math.round(y / 2), 220])
    png(files.mockup, 320, (x, y) => [250 - Math.round(y / 2), 120 + Math.round(x / 3), 60 + Math.round((x + y) / 4)])
    fs.writeFileSync(files.txt, "Appunti di esempio per l'allegato.\nSecondo rigo: controllare il budget entro venerdi.\n", "utf8")
    // A clean sine at -20 dBFS (about -23 LUFS): a quiet, known reference
    wav(files.tone, 5, t => { const v = 0.1 * Math.sin(2 * Math.PI * 440 * t); return [v, v] })
    // 30 s of chords with a slow swell and a loud peak at the end: wide loudness range, peaks close to 0 dBFS
    wav(files.mix, 30, t => {
        const swell = 0.25 + 0.75 * Math.sin(Math.PI * Math.min(t, 29) / 29) ** 2
        const chord = Math.sin(2 * Math.PI * 220 * t) + 0.7 * Math.sin(2 * Math.PI * 330 * t) + 0.5 * Math.sin(2 * Math.PI * 880 * t * (1 + 0.002 * Math.sin(t)))
        const click = t > 28 && t < 28.05 ? 0.9 : 0
        return [swell * 0.28 * chord + click, swell * 0.28 * (chord * 0.9 + Math.sin(2 * Math.PI * 261.6 * t) * 0.4)]
    })
    return files
}

// ---------------------------------------------------------------- the database

type Value = SQLInputValue

export type SeedResult = { target: string, dbFile: string, backup: string | null, counts: Record<string, number> }

export async function seedDemo({ target, force, now = new Date() }: SeedOptions): Promise<SeedResult> {
    target = path.resolve(target)
    const real = realDataDirs().find(dir => same(dir, target))
    const dbFile = path.join(target, DB_FILE)
    const hasData = MOVED_FILES.some(name => fs.existsSync(path.join(target, name)))
    if (real && !force) throw new Error(`${target} is the real data folder of the app: pass --force to seed it (the existing data is moved to a backup folder)`)
    if (hasData && !force) throw new Error(`${target} already contains EasyTask data: pass --force to move it to a backup folder and seed again`)
    if (hasData && appIsRunning()) throw new Error("EasyTask seems to be running: close it first")
    fs.mkdirSync(target, { recursive: true })
    const backup = backupExisting(target)
    const files = createFiles(target)

    // The real initDB, on node:sqlite, with the Tauri `db_transaction` command faked
    const sqlite = new DatabaseSync(dbFile)
    sqlite.exec("PRAGMA foreign_keys=ON")
    const transaction = async (command: string, args?: { statements?: { sql: string }[] }) => {
        if (command !== "db_transaction") throw new Error(`Unexpected command ${command}`)
        sqlite.exec("BEGIN")
        try {
            for (const [index, statement] of (args?.statements ?? []).entries()) {
                try { sqlite.exec(statement.sql) } catch (error: unknown) { throw `statement ${index} failed: ${String(error)}` }
            }
            sqlite.exec("COMMIT")
            return []
        } catch (error: unknown) {
            try { sqlite.exec("ROLLBACK") } catch { /* already rolled back */ }
            throw error
        }
    }
    ;(globalThis as Record<string, unknown>).window = { __TAURI_INTERNALS__: { invoke: transaction, transformCallback: () => 0 } }
    const { initDB } = await import("../src/db/initDb")
    const adapter = {
        select: async (sql: string, params: Value[] = []) => sqlite.prepare(sql).all(...params),
        execute: async (sql: string) => { sqlite.exec(sql); return { rowsAffected: 0, lastInsertId: 0 } },
    }
    await initDB(adapter as never)

    const run = (sql: string, ...params: Value[]) => Number(sqlite.prepare(sql).run(...params).lastInsertRowid)
    const stamp = (days: number, hour = 10, minute = 0) => { const d = daysFromNow(days, now); d.setHours(hour, minute); return d }
    const at = (days: number, hour = 10, minute = 0): [string, string] => { const d = stamp(days, hour, minute); return [dateOf(d), timeOf(d)] }
    const moment = (days: number, hour: number, minute = 0) => { const [d, t] = at(days, hour, minute); return `${d} ${t}` }
    const dayOf = (days: number) => dateOf(daysFromNow(days, now))

    sqlite.exec("BEGIN")

    // ---- builders
    const workspace = (name: string, color: string) => run("INSERT INTO workspace (name, color, creation_date, creation_time) VALUES (?, ?, ?, '09:00')", name, color, dayOf(-120))
    const folder = (ws: number, parent: number | null, name: string, position: number, color: string | null = null) =>
        run("INSERT INTO folder (workspaceID, folderID, name, color, position) VALUES (?, ?, ?, ?, ?)", ws, parent, name, color, position)
    type NoteOpts = { color?: string | null, bg?: string | null, edit?: number, archived?: boolean, deleted?: boolean, body?: string }
    const note = (ws: number, parent: number | null, name: string, position: number, o: NoteOpts = {}) => {
        const [editDate, editTime] = at(o.edit ?? -1, 15, 30)
        return run(`INSERT INTO note (workspaceID, folderID, name, color, bg_color, kind, body, position, creation_date, edit_date, edit_time, archived_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ws, parent, name, o.color ?? null, o.bg ?? null, o.body === undefined ? "note" : "page", o.body ?? null,
            position, dayOf((o.edit ?? -1) - 40), editDate, editTime, o.archived ? moment(-15, 11) : null, o.deleted ? moment(-3, 17) : null)
    }
    type Group = { id: number, direct: number }
    const group = (noteId: number, name: string | null, position: number, color: string | null = null, deleted = false): Group => {
        const id = run("INSERT INTO section_group (noteID, name, position, color, deleted_at) VALUES (?, ?, ?, ?, ?)", noteId, name, position, color, deleted ? moment(-2, 18) : null)
        const direct = run("INSERT INTO section (groupID, title, position, is_default) VALUES (?, NULL, 0, 1)", id)
        return { id, direct }
    }
    const section = (g: Group, title: string, position: number, color: string | null = null) =>
        run("INSERT INTO section (groupID, title, position, color) VALUES (?, ?, ?, ?)", g.id, title, position, color)

    const tags = new Map<string, number>()
    const tag = (ws: number, name: string, color: string, shape: string | null = null) => {
        const id = run("INSERT INTO tag (workspaceID, name, color, shape, position) VALUES (?, ?, ?, ?, ?)", ws, name, color, shape, tags.size)
        tags.set(`${ws}:${name}`, id)
        return id
    }
    type TaskOpts = {
        desc?: string, done?: number | [number, number], priority?: boolean, color?: string, due?: [number, string?], tags?: [number, string[]]
        files?: [string, string][], deleted?: boolean, archived?: boolean, edit?: number
    }
    const counters = new Map<number, number>()
    const task = (sectionId: number, parent: number | null, text: string, o: TaskOpts = {}): number => {
        const key = parent ?? -sectionId
        const position = counters.get(key) ?? 0
        counters.set(key, position + 1)
        const completedAt = o.done === undefined ? null : Array.isArray(o.done) ? moment(o.done[0], o.done[1], 10 + (position * 7) % 50) : moment(o.done, 11, (position * 7) % 60)
        const [editDate, editTime] = completedAt ? [completedAt.slice(0, 10), completedAt.slice(11)] : at(o.edit ?? -2, 14, 5)
        const due = o.due ? [dayOf(o.due[0]), o.due[1] ?? null] : [null, null]
        const id = run(`INSERT INTO task (sectionID, taskID, text, description, completed, completed_at, priority, color, due_date, due_time, position,
            creation_date, edit_date, edit_time, deleted_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            sectionId, parent, text, o.desc ?? null, completedAt ? 1 : 0, completedAt, o.priority ? 1 : 0, o.color ?? null, due[0], due[1], position,
            dayOf(-60), editDate, editTime, o.deleted ? moment(-4, 9) : null, o.archived ? moment(-20, 9) : null)
        for (const tagName of o.tags?.[1] ?? []) run("INSERT INTO task_tag (taskID, tagID) VALUES (?, ?)", id, tags.get(`${o.tags![0]}:${tagName}`)!)
        ;(o.files ?? []).forEach(([name, file], index) => run("INSERT INTO task_file (taskID, name, path, position) VALUES (?, ?, ?, ?)", id, name, file, index))
        return id
    }

    // ================================================================ workspace 1: Lancio prodotto
    const w1 = workspace("Lancio prodotto", "#4363d8")
    const T = (name: string) => tags.get(`${w1}:${name}`)!
    void T
    tag(w1, "Urgente", "#e6194b"); tag(w1, "Design", "#911eb4", "rounded"); tag(w1, "Sviluppo", "#4363d8", "dot")
    tag(w1, "Marketing", "#f58231", "tag"); tag(w1, "Legale", "#3cb44b"); tag(w1, "Budget", "#d9bf01", "rounded"); tag(w1, "Cliente", "#13d7d7", "dot")
    const tg = (...names: string[]): [number, string[]] => [w1, names]

    const marketing = folder(w1, null, "Marketing", 0, "#f58231")
    const campagne = folder(w1, marketing, "Campagne", 0)
    const sviluppo = folder(w1, null, "Sviluppo", 1, "#4363d8")
    const riunioni = folder(w1, null, "Riunioni", 2)

    // -- Roadmap lancio
    const roadmap = note(w1, null, "Roadmap lancio", 0, { color: "#4363d8" })
    const gPrep = group(roadmap, "Fase 1 - Preparazione", 0, "due")
    const sTodo = section(gPrep, "Da fare", 1)
    const sDoing = section(gPrep, "In corso", 2, "#f58231")
    const sDone = section(gPrep, "Fatto", 3, "#3cb44b")
    const tCont = task(sTodo, null, "Firmare il contratto con il fornitore https://example.com/fornitore", {
        priority: true, due: [-1], tags: tg("Legale", "Urgente"), desc: "**Scadenza passata.** Serve la firma di:\n\n- Laura (amministrazione)\n- Marco (direzione)\n\n- [ ] Revisione legale\n- [x] Bozza ricevuta\n\nVedi [portale fornitori](https://example.com/portale).",
        files: [["Contratto fornitore (file spostato)", files.missing], ["Preventivo", files.pdf]],
    })
    task(sTodo, tCont, "Chiedere revisione al legale", { done: [-3, 16] })
    task(sTodo, tCont, "Raccogliere le firme", { due: [-1] })
    task(sTodo, null, "Approvare il budget del trimestre", { due: [-8], tags: tg("Budget"), desc: "Budget in ritardo da **una settimana**.", color: "#e6194b" })
    const tToday = task(sTodo, null, "Preparare la presentazione per gli investitori", { due: [0], tags: tg("Cliente", "Design"), priority: true, files: [["Logo", files.logo], ["Note", files.txt]], desc: "Scadenza **oggi** senza orario." })
    task(sTodo, tToday, "Slide dei numeri", { due: [0] })
    task(sTodo, tToday, "Slide della roadmap")
    const soon = daysFromNow(0, now); soon.setMinutes(soon.getMinutes() + 10)
    task(sDoing, null, "Chiamata con il cliente pilota", { due: [0, timeOf(soon)], tags: tg("Cliente", "Urgente"), desc: `Notifica prevista alle **${timeOf(soon)}** (circa 10 minuti dopo il seed).` })
    task(sDoing, null, "Scrivere il comunicato stampa", { due: [1], tags: tg("Marketing"), desc: "Bozza in [Linee guida brand](https://example.com/brand).\n\n1. Titolo\n2. Citazione del CEO\n3. Dati chiave" })
    const tLand = task(sDoing, null, "Sviluppare la landing page", { due: [3], tags: tg("Sviluppo", "Design") })
    task(sDoing, tLand, "Hero e call to action", { done: [-1, 12] })
    task(sDoing, tLand, "Modulo di iscrizione", { due: [2] })
    const tSeo = task(sDoing, tLand, "Ottimizzazione SEO", { due: [3] })
    task(sDoing, tSeo, "Meta tag e sitemap")
    task(sDoing, tSeo, "Velocita di caricamento")
    task(sDone, null, "Definire il posizionamento", { done: [-6, 10], tags: tg("Marketing") })
    task(sDone, null, "Scegliere il nome del prodotto", { done: [-9, 15] })
    task(sDone, null, "Aprire il dominio https://prodotto-demo.example.org", { done: [-13, 9], tags: tg("Sviluppo") })
    // direct tasks of the group (hidden default section)
    task(gPrep.direct, null, "Aggiornare la roadmap ogni venerdi", { due: [5], desc: "Promemoria **ricorrente**, da rimettere in agenda." })

    const gLaunch = group(roadmap, "Fase 2 - Lancio", 1, "progress")
    const sEvents = section(gLaunch, "Eventi", 1)
    const sPress = section(gLaunch, "Stampa", 2, "#911eb4")
    task(gLaunch.direct, null, "Confermare la data del lancio", { due: [6], priority: true })
    task(gLaunch.direct, null, "Brief per l'agenzia", { done: [-2, 17] })
    task(sEvents, null, "Prenotare la sala per l'evento", { due: [10], tags: tg("Budget") })
    task(sEvents, null, "Inviare gli inviti", { due: [14], tags: tg("Marketing") })
    task(sEvents, null, "Catering", { due: [20], tags: tg("Budget") })
    task(sPress, null, "Elenco giornalisti", { done: [-4, 14] })
    task(sPress, null, "Kit stampa", { due: [8], tags: tg("Design", "Marketing"), files: [["Mockup", files.mockup]] })
    const gMedia = group(roadmap, "Materiali audio e immagini", 2, "#13d7d7")
    task(gMedia.direct, null, "Ascoltare il jingle e controllare il volume (LUFS)", { desc: "I due file audio del gruppo servono per provare **LUFS**, picco reale e forma d'onda." })
    run("INSERT INTO audio_file (section_groupID, name, path, position) VALUES (?, ?, ?, 0)", gMedia.id, "Tono 440 Hz.wav", files.tone)
    run("INSERT INTO audio_file (section_groupID, name, path, position) VALUES (?, ?, ?, 1)", gMedia.id, "Mix demo 30 s.wav", files.mix)
    run("INSERT INTO media_file (section_groupID, name, path, position) VALUES (?, ?, ?, 0)", gMedia.id, "Mockup.png", files.mockup)
    run("INSERT INTO media_file (section_groupID, name, path, position) VALUES (?, ?, ?, 1)", gMedia.id, "Logo.png", files.logo)
    const gOld = group(roadmap, "Gruppo eliminato di prova", 3, "#9a6324", true)
    task(gOld.direct, null, "Attivita del gruppo nel cestino")

    // -- Marketing
    const piano = note(w1, marketing, "Piano marketing", 0, { color: "#f58231", bg: "#fff7ed" })
    const gCh = group(piano, "Canali", 0, "#f58231")
    task(gCh.direct, null, "Definire il calendario editoriale", { due: [2], tags: tg("Marketing"), desc: "Canali:\n\n- **Blog** ogni martedi\n- **Newsletter** ogni due settimane\n- LinkedIn tre volte a settimana" })
    const sSocial = section(gCh, "Social", 1)
    const sMail = section(gCh, "Newsletter", 2)
    task(sSocial, null, "Scrivere i post di lancio", { due: [4], tags: tg("Marketing") })
    task(sSocial, null, "Acquistare gli spazi pubblicitari", { due: [-3], tags: tg("Budget", "Urgente"), priority: true })
    task(sMail, null, "Segmentare la lista contatti", { done: [-5, 11] })
    task(sMail, null, "Template della newsletter", { due: [12], tags: tg("Design") })
    const gBud = group(piano, "Budget", 1, "#d9bf01")
    task(gBud.direct, null, "Preventivo agenzia", { files: [["Preventivo agenzia.pdf", files.pdf]], tags: tg("Budget") })
    task(gBud.direct, null, "Report spese di ottobre", { done: [-20, 10] })

    const social = note(w1, campagne, "Campagna social", 0, { color: "#f032e6" })
    const gC1 = group(social, "Settimana 1", 0)
    const sC1 = section(gC1, "Contenuti", 1)
    task(sC1, null, "Video di presentazione", { due: [7], tags: tg("Design", "Marketing") })
    task(sC1, null, "Caroselli per Instagram", { due: [9], tags: tg("Design") })
    task(sC1, null, "Hashtag e menzioni", { done: [-7, 16] })
    task(gC1.direct, null, "Approvazione finale del cliente", { due: [45], tags: tg("Cliente"), desc: "Scadenza **lontana** (oltre un mese)." })

    // -- Sviluppo: sprint with many completions + automations
    const sprint = note(w1, sviluppo, "Sprint backlog", 0, { color: "#3cb44b" })
    const gSp = group(sprint, "Sprint 12", 0, "progress")
    const spTodo = section(gSp, "Da fare", 1)
    const spDoing = section(gSp, "In corso", 2)
    const spDone = section(gSp, "Fatto", 3, "#3cb44b")
    task(spTodo, null, "Migrazione del database di produzione", { due: [-2], tags: tg("Sviluppo", "Urgente"), priority: true })
    task(spTodo, null, "Test di carico sull'API", { due: [4], tags: tg("Sviluppo") })
    task(spTodo, null, "Documentare gli endpoint", { due: [11], tags: tg("Sviluppo") })
    task(spDoing, null, "Refactoring del modulo di login", { tags: tg("Sviluppo") })
    task(spDoing, null, "Notifiche push", { due: [0], tags: tg("Sviluppo", "Cliente") })
    const completions: [string, number, number][] = []
    const titles = ["Correggere il layout mobile", "Aggiornare le dipendenze", "Scrivere i test del carrello", "Ottimizzare le immagini", "Fix del timeout di sessione",
        "Pulire i log", "Rivedere la pull request di Anna", "Configurare la CI", "Aggiungere il tema scuro", "Traduzione in inglese", "Sistemare il form di contatto", "Indice sul database"]
    for (let week = 0; week < 12; week++) {
        const count = [4, 6, 3, 7, 5, 2, 8, 4, 6, 5, 3, 7][week]
        for (let i = 0; i < count; i++) completions.push([titles[(week + i) % titles.length], -(week * 7 + 1 + (i * 2) % 7), 9 + (i * 3) % 9])
    }
    completions.forEach(([title, offset, hour], index) => task(spDone, null, `${title}${index >= titles.length ? ` (${index})` : ""}`, { done: [offset === 0 ? -1 : Math.min(offset, -1), hour], tags: index % 3 === 0 ? tg("Sviluppo") : undefined }))
    const gSp2 = group(sprint, "Sprint 13 (pianificazione)", 1, "#9dcf01")
    task(gSp2.direct, null, "Stima delle storie utente", { due: [14] })
    task(gSp2.direct, null, "Retrospettiva dello sprint 12", { due: [7] })

    const bug = note(w1, sviluppo, "Bug da risolvere", 1, { color: "#e6194b" })
    const gBug = group(bug, "Bug aperti", 0, "due")
    const bugOpen = section(gBug, "Aperti", 1)
    const bugFix = section(gBug, "Risolti", 2, "#3cb44b")
    task(bugOpen, null, "Crash all'apertura dei file grandi", { priority: true, due: [-7], tags: tg("Urgente", "Sviluppo"), desc: "Riproducibile con file > 50 MB.\n\n```\nTypeError: cannot read properties of undefined\n```" })
    task(bugOpen, null, "Il tema scuro cambia colore ai link", { due: [1], tags: tg("Design") })
    task(bugOpen, null, "Notifica duplicata alle 9:00", { due: [3] })
    task(bugFix, null, "Errore 500 nel login", { done: [-2, 10], tags: tg("Sviluppo") })
    task(bugFix, null, "Scroll bloccato su Safari", { done: [-10, 15] })

    // -- Riunioni
    const kickoff = note(w1, riunioni, "Verbale kickoff", 0, { edit: -75 })
    const gK = group(kickoff, "Decisioni", 0)
    task(gK.direct, null, "Lancio previsto a fine trimestre", { done: [-74, 11] })
    task(gK.direct, null, "Assegnare un referente per ogni area", { done: [-74, 11] })
    const vecchio = note(w1, riunioni, "Appunti fornitori 2025", 1, { edit: -48 })
    const gV = group(vecchio, "Fornitori", 0)
    task(gV.direct, null, "Richiedere offerte a tre fornitori", { done: [-50, 10] })
    task(gV.direct, null, "Confrontare tempi di consegna", { edit: -48 })

    // -- Pages
    note(w1, null, "Linee guida brand", 1, { color: "#911eb4", body: `# Linee guida del brand

Questo documento riassume **tono di voce**, colori e usi del logo.

## Tono di voce

- Chiaro e diretto
- *Mai* gergo tecnico senza spiegazione
- Esempi positivi e negativi

## Colori

1. Blu \`#4363d8\`
2. Arancio \`#f58231\`
3. Verde \`#3cb44b\`

## Checklist prima della pubblicazione

- [x] Controllo ortografico
- [x] Logo in alta risoluzione
- [ ] Approvazione della direzione
- [ ] Traduzione in inglese

## Esempio di codice per il bottone

\`\`\`css
.btn-primary {
  background: #4363d8;
  border-radius: 8px;
}
\`\`\`

Altri dettagli sul [sito del progetto](https://example.com/brand).
` })
    note(w1, riunioni, "Riunione settimanale", 2, { edit: -2, body: `# Riunione settimanale

## Ordine del giorno

1. Stato della roadmap
2. Rischi del lancio
3. Varie

## Azioni

- [x] Aggiornare il piano marketing
- [ ] Invitare il cliente pilota
- [ ] Fissare la demo di venerdi

> Prossima riunione: lunedi alle 10:00, link https://example.com/meet

| Area | Referente |
| --- | --- |
| Sviluppo | Marco |
| Marketing | Giulia |
` })
    note(w1, null, "Brainstorm nome prodotto", 2, { archived: true, edit: -20 })
    const bozza = note(w1, null, "Bozza vecchia da buttare", 3, { deleted: true })
    const gB = group(bozza, "Appunti", 0)
    task(gB.direct, null, "Cosa c'era in questa bozza")
    const archivedNote = Number(sqlite.prepare("SELECT id FROM note WHERE name = 'Brainstorm nome prodotto'").get()!.id)
    const gArch = group(archivedNote, "Idee", 0)
    task(gArch.direct, null, "Nomi corti e facili da ricordare")
    // archived and trashed single items
    task(sDone, null, "Task archiviato di prova", { archived: true, done: [-25, 10] })
    task(sTodo, null, "Task nel cestino di prova", { deleted: true })

    // -- Templates (content is the JSON snapshot the app stores)
    const templateTask = (text: string, extra: Record<string, unknown> = {}, subtasks: unknown[] = []) =>
        ({ text, description: null, completed: false, priority: false, color: null, position: 0, subtasks, ...extra })
    const withPositions = (tasks: Record<string, unknown>[]) => tasks.map((t, position) => ({ ...t, position }))
    const releaseContent = {
        version: 1,
        groups: [{
            name: "Rilascio", color: "progress", position: 0,
            sections: [
                { title: "Da fare", color: null, position: 0, tasks: withPositions([templateTask("Congelare il codice"), templateTask("Eseguire i test di regressione", { priority: true }, withPositions([templateTask("Test su Windows"), templateTask("Test su macOS")])), templateTask("Aggiornare il changelog")]) },
                { title: "In corso", color: "#f58231", position: 1, tasks: [] },
                { title: "Fatto", color: "#3cb44b", position: 2, tasks: [] },
            ],
        }],
        automations: [{ name: "Sposta in Fatto", enabled: true, trigger: { type: "task.completed", sectionId: { group: 0, section: 0 } }, actions: [{ type: "moveTo", sectionId: { group: 0, section: 2 }, at: "bottom" }] }],
    }
    const meetingContent = {
        version: 1,
        groups: [{
            name: "Riunione", color: null, position: 0, tasks: withPositions([templateTask("Preparare l'ordine del giorno"), templateTask("Inviare il verbale", { description: "Entro **24 ore** dalla riunione." })]),
            sections: [{ title: "Azioni", color: "#4363d8", position: 1, tasks: withPositions([templateTask("Assegnare i responsabili", {}, [templateTask("Marco"), templateTask("Giulia")])]) }],
        }],
    }
    run("INSERT INTO note_template (workspaceID, sourceNoteID, name, color, content) VALUES (?, NULL, ?, ?, ?)", w1, "Checklist di rilascio", "#3cb44b", JSON.stringify(releaseContent))
    run("INSERT INTO note_template (workspaceID, sourceNoteID, name, color, content) VALUES (?, ?, ?, ?, ?)", w1, roadmap, "Modello di riunione", "#4363d8", JSON.stringify(meetingContent))
    run("INSERT INTO note_template (workspaceID, sourceNoteID, name, content, deleted_at) VALUES (?, NULL, ?, ?, ?)", w1, "Modello eliminato", JSON.stringify(meetingContent), moment(-5, 12))

    // -- Automations
    const auto = (noteId: number, name: string, trigger: unknown, actions: unknown[], position: number, enabled = true) =>
        run("INSERT INTO automation (noteID, name, enabled, trigger, actions, position) VALUES (?, ?, ?, ?, ?, ?)", noteId, name, enabled ? 1 : 0, JSON.stringify(trigger), JSON.stringify(actions), position)
    auto(roadmap, "Scaduti in rosso e con priorita", { type: "task.overdue", sectionId: null }, [{ type: "setPriority", value: true }, { type: "setColor", color: "#e6194b" }], 0)
    auto(roadmap, "Completato: sposta in Fatto", { type: "task.completed", sectionId: sDoing }, [{ type: "moveTo", sectionId: sDone, at: "bottom" }], 1)
    auto(roadmap, "Tutte le sottoattivita fatte: completa", { type: "subtasks.completed", sectionId: null }, [{ type: "setCompleted", value: true }], 2)
    auto(sprint, "Sprint scaduto: tag Urgente", { type: "task.overdue", sectionId: null }, [{ type: "addTag", tagId: tags.get(`${w1}:Urgente`)! }], 0)
    auto(sprint, "Sprint concluso: sposta in fondo", { type: "group.completed", groupId: gSp.id }, [{ type: "moveGroup", at: "bottom" }], 1, false)
    auto(bug, "Nuovo bug: spostalo in Aperti", { type: "task.created", sectionId: null }, [{ type: "setColor", color: "#f58231" }], 0)

    // ================================================================ workspace 2: Personale
    const w2 = workspace("Personale", "#f58231")
    tag(w2, "Casa", "#3cb44b", "dot"); tag(w2, "Salute", "#e6194b", "rounded"); tag(w2, "Viaggi", "#13d7d7"); tag(w2, "Lettura", "#911eb4", "tag")
    const p = (...names: string[]): [number, string[]] => [w2, names]
    const hobby = folder(w2, null, "Hobby", 0)
    const casa = note(w2, null, "Spesa e casa", 0, { color: "#3cb44b" })
    const gSpesa = group(casa, "Spesa", 0, "due")
    const sSuper = section(gSpesa, "Supermercato", 1)
    task(sSuper, null, "Latte, uova e pane", { due: [0], tags: p("Casa") })
    task(sSuper, null, "Frutta e verdura", { due: [1], tags: p("Casa", "Salute") })
    task(sSuper, null, "Detersivo e carta igienica", { due: [4], tags: p("Casa") })
    task(gSpesa.direct, null, "Ritirare il pacco in posta https://example.com/tracking", { due: [-1] })
    const gLavori = group(casa, "Lavori di casa", 1, "#4363d8")
    task(gLavori.direct, null, "Chiamare l'idraulico", { due: [-4], priority: true, tags: p("Casa") })
    task(gLavori.direct, null, "Cambiare le lampadine del corridoio", { done: [-3, 19] })
    const gOldP = group(casa, "Gruppo vecchio eliminato", 2, null, true)
    task(gOldP.direct, null, "Roba che non serve piu")
    const viaggio = note(w2, null, "Viaggio in Giappone", 1, { color: "#13d7d7" })
    const gPrenota = group(viaggio, "Prenotazioni", 0, "progress")
    const sVoli = section(gPrenota, "Voli e hotel", 1)
    const tVolo = task(sVoli, null, "Prenotare i voli per Tokyo", { due: [15], tags: p("Viaggi"), files: [["Itinerario.txt", files.txt]] })
    task(sVoli, tVolo, "Confrontare le compagnie")
    task(sVoli, tVolo, "Controllare il bagaglio incluso", { done: [-1, 21] })
    task(sVoli, null, "Hotel a Kyoto", { due: [30], tags: p("Viaggi") })
    task(sVoli, null, "Assicurazione di viaggio", { done: [-12, 20], tags: p("Viaggi") })
    task(gPrenota.direct, null, "Rinnovare il passaporto", { priority: true, due: [6], tags: p("Viaggi"), desc: "Serve **prima** della prenotazione dei voli.\n\n- [x] Foto tessera\n- [ ] Appuntamento in questura" })
    task(sVoli, null, "Task cancellato dal viaggio", { deleted: true })
    const allenamento = note(w2, null, "Allenamento", 2, { color: "#e6194b" })
    const gAll = group(allenamento, "Settimana tipo", 0, "progress")
    const sAll = section(gAll, "Sessioni fatte", 1, "#3cb44b")
    for (let week = 0; week < 12; week++) for (let i = 0; i < 2 + (week % 3); i++) task(sAll, null, `Corsa ${week * 3 + i + 1}`, { done: [-(week * 7 + 2 + i * 2), 7 + i], tags: p("Salute") })
    task(gAll.direct, null, "Prenotare la visita medica sportiva", { due: [9], tags: p("Salute") })
    const libri = note(w2, null, "Diario di lettura", 3, { color: "#911eb4", body: `# Diario di lettura

## Quest'anno

- [x] *Il nome della rosa*
- [x] *Sapiens*
- [ ] *Il barone rampante*
- [ ] Un saggio di fisica

## Appunti

Citazioni da ricordare, con **grassetto** e *corsivo*.

\`\`\`js
const libriLetti = 2
\`\`\`

Lista dei desideri su [una libreria online](https://example.com/libri).
` })
    void libri
    const fai = note(w2, hobby, "Progetti fai-da-te", 0, { edit: -90 })
    const gF = group(fai, "Falegnameria", 0)
    task(gF.direct, null, "Costruire la libreria del salotto", { edit: -90, tags: p("Casa") })
    task(gF.direct, null, "Comprare le viti", { done: [-90, 10] })
    run("INSERT INTO note_template (workspaceID, sourceNoteID, name, content) VALUES (?, NULL, ?, ?)", w2, "Lista della spesa", JSON.stringify({
        version: 1, groups: [{ name: "Spesa", color: null, position: 0, tasks: withPositions([templateTask("Frutta"), templateTask("Verdura"), templateTask("Pane")]), sections: [] }],
    }))

    sqlite.exec("COMMIT")

    // The edit date of the workspaces is refreshed by triggers on every insert: show it as recent but not "just now"
    sqlite.exec("PRAGMA foreign_key_check")
    const count = (sql: string) => Number((sqlite.prepare(sql).get() as { n: number }).n)
    const counts = {
        workspaces: count("SELECT COUNT(*) n FROM workspace"),
        folders: count("SELECT COUNT(*) n FROM folder"),
        notes: count("SELECT COUNT(*) n FROM note WHERE kind = 'note' AND deleted_at IS NULL AND archived_at IS NULL"),
        pages: count("SELECT COUNT(*) n FROM note WHERE kind = 'page'"),
        archivedNotes: count("SELECT COUNT(*) n FROM note WHERE archived_at IS NOT NULL"),
        trashedNotes: count("SELECT COUNT(*) n FROM note WHERE deleted_at IS NOT NULL"),
        groups: count("SELECT COUNT(*) n FROM section_group"),
        tasks: count("SELECT COUNT(*) n FROM task"),
        completedTasks: count("SELECT COUNT(*) n FROM task WHERE completed = 1"),
        trashedTasks: count("SELECT COUNT(*) n FROM task WHERE deleted_at IS NOT NULL"),
        tags: count("SELECT COUNT(*) n FROM tag"),
        taskFiles: count("SELECT COUNT(*) n FROM task_file"),
        audioFiles: count("SELECT COUNT(*) n FROM audio_file"),
        mediaFiles: count("SELECT COUNT(*) n FROM media_file"),
        templates: count("SELECT COUNT(*) n FROM note_template"),
        automations: count("SELECT COUNT(*) n FROM automation"),
    }
    sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    sqlite.close()
    return { target, dbFile, backup, counts }
}

// ---------------------------------------------------------------- main

function parseArgs(argv: string[]): SeedOptions {
    let target = path.join(os.homedir(), "EasyTask-demo")
    let force = false
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === "--force") force = true
        else if (arg === "--target") target = argv[++i] ?? ""
        else if (arg.startsWith("--target=")) target = arg.slice("--target=".length)
        else if (!arg.startsWith("--")) target = arg
        else throw new Error(`Unknown option ${arg}`)
    }
    if (!target) throw new Error("--target needs a folder")
    return { target, force }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    seedDemo(parseArgs(process.argv.slice(2))).then(result => {
        console.log(`Demo data written to ${result.target}`)
        if (result.backup) console.log(`Previous data moved to ${result.backup}`)
        console.log(result.counts)
        console.log(`Start the app on it (PowerShell): $env:EASYTASK_DATA_DIR='${result.target}'; npm run tauri dev`)
    }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exit(1)
    })
}
