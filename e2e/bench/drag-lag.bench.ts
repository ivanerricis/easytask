/* eslint-disable */
// @ts-nocheck
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { browser } from "@wdio/globals"
import {
    byLabel, closeAllDialogs, createFromSidebar, createWorkspace, groupCard, newSectionInGroup, openSettingsOn, openWorkspace, settingsSwitch,
    sql, tr, treeRow, typeInto, waitForApp,
} from "../helpers"

/** Drag lag benchmark on a synthetic note of 213 tasks (see e2e/bench/README.md). Results go to LAG_OUT (default e2e/bench/results, gitignored). */
const OUT = process.env.LAG_OUT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "results")
fs.mkdirSync(OUT, { recursive: true })
const RUNS = Number(process.env.LAG_RUNS ?? 3)
const PROFILE = process.env.LAG_PROFILE === "1" // patches getBoundingClientRect / getComputedStyle + MutationObserver (perturbs a little)
const WORKSPACE = "Lag Workspace"
const NOTE = "Molti task"
const GROUP = "Lag G1"

import { execSync } from "node:child_process"
let ws: any = null
let seq = 0
const pending = new Map<number, (v: any) => void>()
const cdpConnect = async () => {
    const out = execSync("powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='msedgewebview2.exe'\\\" | ForEach-Object { $_.CommandLine }\"", { encoding: "utf8", maxBuffer: 1 << 24 })
    const line = out.split(/\r?\n/).find(l => l.includes(`webview-exe-name=${path.basename(process.env.E2E_APP ?? "EasyTask.exe")}`) && l.includes("--user-data-dir"))
    const dir = /--user-data-dir="?([^"]+?)"?\s/.exec(line ?? "")?.[1]
    if (!dir) throw new Error("no user data dir: " + out.slice(0, 400))
    const active = fs.readFileSync(path.join(dir, "DevToolsActivePort"), "utf8").split(/\r?\n/)
    const list: any[] = await (await fetch(`http://127.0.0.1:${active[0]}/json`)).json()
    const page = list.find(t => t.type === "page")
    ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    ws.onmessage = (e: any) => { const d = JSON.parse(e.data); pending.get(d.id)?.(d); pending.delete(d.id) }
}
const cdp = async (method: string, params: any = {}) => {
    if (!ws) await cdpConnect()
    const id = ++seq
    const p = new Promise<any>(res => pending.set(id, res))
    ws.send(JSON.stringify({ id, method, params }))
    const d = await p
    if (d.error) throw new Error(method + ": " + JSON.stringify(d.error))
    return d.result ?? {}
}
const save = (name: string, data: unknown) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1))

const installProbe = async (profile: boolean) => browser.execute((profile: boolean) => {
    const w = window as any
    if (w.__lag?.stop) w.__lag.stop()
    const lag: any = { loaf: [], frames: [], long: [], events: [], calls: [], muts: [], running: true }
    w.__lag = lag
    w.__rcCommits = []
    w.__rcOn = true
    const loop = () => { if (!lag.running) return; lag.frames.push(performance.now()); lag.raf = requestAnimationFrame(loop) }
    lag.raf = requestAnimationFrame(loop)
    try {
        lag.po = new PerformanceObserver(list => { for (const e of list.getEntries()) lag.long.push({ start: e.startTime, dur: e.duration }) })
        lag.po.observe({ type: "longtask", buffered: false })
    } catch (e) { lag.poError = String(e) }
    try {
        lag.po2 = new PerformanceObserver(list => { for (const e of list.getEntries() as any[]) lag.loaf.push({ start: e.startTime, dur: e.duration, renderStart: e.renderStart, styleStart: e.styleAndLayoutStart, blocking: e.blockingDuration, scripts: (e.scripts || []).map((s: any) => ({ inv: s.invoker, type: s.invokerType, url: String(s.sourceURL).split("/").pop(), fn: s.sourceFunctionName, pos: s.sourceCharPosition, dur: s.duration, forced: s.forcedStyleAndLayoutDuration, exec: s.executionStart })) }) })
        lag.po2.observe({ type: "long-animation-frame", buffered: false })
    } catch (e) { lag.loafError = String(e) }
    const onEvent = (e: PointerEvent) => lag.events.push({ type: e.type, t: performance.now(), stamp: e.timeStamp, x: e.clientX, y: e.clientY })
    for (const type of ["pointerdown", "pointermove", "pointerup"]) document.addEventListener(type, onEvent as any, { capture: true, passive: true })
    lag.listeners = onEvent
    if (profile) {
        const gbr = Element.prototype.getBoundingClientRect
        const gcs = window.getComputedStyle
        lag.orig = { gbr, gcs }
        Element.prototype.getBoundingClientRect = function (this: Element) { const t = performance.now(); const r = gbr.call(this); lag.calls.push(["gbr", t, performance.now() - t]); return r }
        window.getComputedStyle = function (this: any, ...a: any[]) { const t = performance.now(); const r = gcs.apply(window, a as any); lag.calls.push(["gcs", t, performance.now() - t]); return r } as any
        lag.mo = new MutationObserver(records => {
            let child = 0, attr = 0, style = 0
            for (const r of records) { if (r.type === "childList") child += r.addedNodes.length + r.removedNodes.length; else if (r.attributeName === "style") style++; else attr++ }
            lag.muts.push([performance.now(), child, attr, style])
        })
        lag.mo.observe(document.body, { subtree: true, childList: true, attributes: true })
    }
    lag.stop = () => {
        lag.running = false
        cancelAnimationFrame(lag.raf)
        lag.po?.disconnect(); lag.po2?.disconnect()
        lag.mo?.disconnect()
        for (const type of ["pointerdown", "pointermove", "pointerup"]) document.removeEventListener(type, lag.listeners, { capture: true } as any)
        if (lag.orig) { Element.prototype.getBoundingClientRect = lag.orig.gbr; window.getComputedStyle = lag.orig.gcs }
    }
}, profile)

const collectProbe = async () => browser.execute(() => {
    const lag = (window as any).__lag
    lag.stop()
    return { commits: (window as any).__rcCommits ?? [], loaf: lag.loaf, loafError: lag.loafError, frames: lag.frames, long: lag.long, events: lag.events, calls: lag.calls, muts: lag.muts, poError: lag.poError }
})

/** Rest layout of tasks (top level) and sections, in viewport coordinates. */
const layout = async () => browser.execute(() => {
    const q = (s: string) => Array.from(document.querySelectorAll<HTMLElement>(s))
    const rect = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
    return {
        w: innerWidth, h: innerHeight,
        tasks: q("[data-task-wrap]").map(el => ({ id: el.getAttribute("data-task-wrap"), sec: el.getAttribute("data-task-section"), top: !el.parentElement?.closest("[data-task-wrap]"), ...rect(el) })),
        sections: q("[data-section-card]").map(el => ({ ...rect(el), title: el.textContent?.slice(0, 20) })),
    }
})

const pct = (values: number[], p: number) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0 }

const analyse = (raw: any, lay: any, profile: boolean) => {
    const ev = raw.events
    const down = ev.find((e: any) => e.type === "pointerdown")
    const up = ev.find((e: any) => e.type === "pointerup")
    const moves = ev.filter((e: any) => e.type === "pointermove" && e.t >= down.t)
    const act = moves.find((e: any) => Math.hypot(e.x - down.x, e.y - down.y) >= 5) ?? moves[0]
    const frames: number[] = raw.frames
    const gaps = frames.slice(1).map((t, i) => ({ t, gap: t - frames[i] }))
    const inRange = (a: number, b: number) => gaps.filter(g => g.t >= a && g.t <= b)
    const stat = (a: number, b: number) => {
        const g = inRange(a, b).map(x => x.gap)
        const long = raw.long.filter((l: any) => l.start >= a && l.start <= b)
        return {
            ms: +(b - a).toFixed(0), frames: g.length, mean: +(g.reduce((s, x) => s + x, 0) / Math.max(1, g.length)).toFixed(1), p95: +pct(g, 0.95).toFixed(1), max: +Math.max(0, ...g).toFixed(1),
            over50: g.filter(x => x > 50).length, longTasks: long.length, longMax: +Math.max(0, ...long.map((l: any) => l.dur)).toFixed(0), longSum: +long.reduce((s: number, l: any) => s + l.dur, 0).toFixed(0),
        }
    }
    // destination of a pointer position at rest
    const dest = (x: number, y: number) => {
        const t = lay.tasks.filter((k: any) => x >= k.l && x <= k.r && y >= k.t && y <= k.b).sort((a: any, b: any) => (a.r - a.l) * (a.b - a.t) - (b.r - b.l) * (b.b - b.t))[0]
        const s = lay.sections.find((k: any) => x >= k.l && x <= k.r && y >= k.t && y <= k.b)
        return { task: t?.id ?? null, sec: t?.sec ?? (s ? "s:" + s.title : null) }
    }
    const changes: { t: number, kind: string }[] = []
    let prev: any = null
    for (const m of moves.filter((m: any) => m.t <= up.t)) {
        const d = dest(m.x, m.y)
        if (prev && d.task !== prev.task) changes.push({ t: m.t, kind: d.sec !== prev.sec ? "section" : "task" })
        prev = d
    }
    const winChange = (kind: string | null) => {
        const sel = changes.filter(c => !kind || c.kind === kind)
        const g: number[] = []
        for (const c of sel) for (const x of inRange(c.t, c.t + 100)) g.push(x.gap)
        return { n: sel.length, max: +Math.max(0, ...g).toFixed(1), over50: g.filter(x => x > 50).length }
    }
    const latency = moves.slice(0, 40).map((m: any) => +(m.t - m.stamp).toFixed(0))
    const out: any = {
        activateAtMs: +(act.t - down.t).toFixed(0),
        // from the activation to the release (the drag proper) and the same after the first second (steady state)
        drag: stat(act.t, up.t),
        dragAfterStart: stat(act.t + 1000, up.t),
        steady: stat(act.t + 1800, up.t),
        start1500: stat(act.t - 50, act.t + 1500),
        drop1500: stat(up.t - 20, up.t + 1500),
        changeAny: winChange(null), changeSection: winChange("section"),
        inputLatencyFirst10: latency.slice(0, 10), inputLatencyMax: Math.max(...latency),
        longTasksRel: raw.long.map((l: any) => ({ at: +(l.start - act.t).toFixed(0), dur: +l.dur.toFixed(0), phase: l.start > up.t ? "drop" : "drag" })),
        upAtRel: +(up.t - act.t).toFixed(0),
        commits: (raw.commits ?? []).filter((c: any) => c.total > 0).map((c: any) => ({ at: +(c.t - act.t).toFixed(0), ms: c.ms, total: c.total, top: c.top, why: c.whyLog })),
        poError: raw.poError, loafError: raw.loafError,
        loaf: raw.loaf.map((l: any) => ({ ...l, start: +(l.start - act.t).toFixed(0), renderStart: +(l.renderStart - act.t).toFixed(0), styleStart: +(l.styleStart - act.t).toFixed(0) })),
    }
    if (profile) {
        const bucket = (a: number, b: number) => {
            const c = raw.calls.filter((k: any) => k[1] >= a && k[1] <= b)
            const agg = (kind: string) => { const x = c.filter((k: any) => k[0] === kind); return { n: x.length, ms: +x.reduce((s: number, k: any) => s + k[2], 0).toFixed(1) } }
            const m = raw.muts.filter((k: any) => k[0] >= a && k[0] <= b)
            return { gbr: agg("gbr"), gcs: agg("gcs"), moCallbacks: m.length, child: m.reduce((s: number, k: any) => s + k[1], 0), attr: m.reduce((s: number, k: any) => s + k[2], 0), style: m.reduce((s: number, k: any) => s + k[3], 0) }
        }
        out.prof = { start: bucket(act.t - 50, act.t + 600), start1500: bucket(act.t - 50, act.t + 1500), move: bucket(act.t + 1500, up.t), drop: bucket(up.t - 20, up.t + 1500) }
        // timeline of the first 1.6 s after the activation in 50 ms bins: calls, mutations
        const bins: any[] = []
        for (let b = -100; b < 1600; b += 50) { const x = bucket(act.t + b, act.t + b + 50); bins.push([b, x.gbr.n, x.gbr.ms, x.gcs.n, x.child, x.style]) }
        out.prof.startBins = bins
        const dbins: any[] = []
        for (let b = -100; b < 1600; b += 50) { const x = bucket(up.t + b, up.t + b + 50); dbins.push([b, x.gbr.n, x.gbr.ms, x.gcs.n, x.child, x.style]) }
        out.prof.dropBins = dbins
    }
    return out
}

const median = (xs: number[]) => pct(xs, 0.5)

const setLiveDrag = async (on: boolean) => {
    await openSettingsOn("notes")
    const toggle = await settingsSwitch("settings.notes.liveDrag.label")
    if (((await toggle.getAttribute("aria-checked")) === "true") !== on) await toggle.click()
    await closeAllDialogs()
}

const dragPath = async (path: { x: number, y: number }[]) => {
    const first = path[0]
    const a = browser.action("pointer", { parameters: { pointerType: "mouse" } })
    a.move({ x: first.x, y: first.y, origin: "viewport" }).down()
    for (const p of path.slice(1)) a.move({ x: p.x, y: p.y, origin: "viewport", duration: 16 })
    a.pause(350).up()
    await a.perform(true)
    await browser.releaseActions()
}

const line = (from: { x: number, y: number }, to: { x: number, y: number }, steps: number) =>
    Array.from({ length: steps + 1 }, (_, i) => ({ x: Math.round(from.x + ((to.x - from.x) * i) / steps), y: Math.round(from.y + ((to.y - from.y) * i) / steps) }))

describe("lag benchmark", () => {
    let secIds: number[] = []

    it("builds the 213 task note", async () => {
        await waitForApp()
        await browser.setWindowSize(1440, 900)
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await groupCard(GROUP).waitForDisplayed()
        await newSectionInGroup(groupCard(GROUP), "G1-S1")
        const [{ id: noteId }] = await sql("select", "SELECT id FROM note WHERE name = ?", [NOTE])
        const [{ id: g1 }] = await sql("select", "SELECT id FROM section_group WHERE noteID = ?", [noteId])
        const g2 = (await sql("execute", "INSERT INTO section_group (noteID, position, name) VALUES (?, 1, 'Lag G2')", [noteId]))[1]
        const g3 = (await sql("execute", "INSERT INTO section_group (noteID, position, name) VALUES (?, 2, 'Lag G3')", [noteId]))[1]
        const groups = [g1, g2, g3]
        for (const g of [g2, g3]) await sql("execute", "INSERT INTO section (groupID, title, position, is_default) VALUES (?, NULL, 0, 1)", [g])
        // 4 sections per group (G1 already has G1-S1)
        for (let gi = 0; gi < 3; gi++) for (let si = 1; si <= 4; si++) {
            if (gi === 0 && si === 1) continue
            await sql("execute", "INSERT INTO section (groupID, title, position) VALUES (?, ?, ?)", [groups[gi], `G${gi + 1}-S${si}`, si])
        }
        secIds = (await sql("select", "SELECT s.id AS id FROM section s JOIN section_group g ON g.id = s.groupID WHERE g.noteID = ? AND s.is_default = 0 ORDER BY g.position, s.position", [noteId])).map((r: any) => r.id)
        // 213 tasks = 193 top level + 20 subtasks
        let n = 0
        const perSection = Array.from({ length: 12 }, (_, i) => 16 + (i < 1 ? 1 : 0))
        const topIds: number[] = []
        for (let si = 0; si < 12; si++) {
            const rows: any[] = []
            for (let k = 0; k < perSection[si]; k++) { n++; rows.push([secIds[si], `Task ${n} della sezione ${si + 1}`, k]) }
            const res = await sql("execute", `INSERT INTO task (sectionID, text, position) VALUES ${rows.map(() => "(?, ?, ?)").join(",")}`, rows.flat())
            const first = res[1] - rows.length + 1
            for (let k = 0; k < rows.length; k++) topIds.push(first + k)
        }
        for (let i = 0; i < 20; i++) await sql("execute", "INSERT INTO task (taskID, text, position) VALUES (?, ?, 0)", [topIds[i * 9], `Sub ${i + 1}`])
        const [{ c }] = await sql("select", "SELECT COUNT(*) AS c FROM task t JOIN section s ON s.id = t.sectionID OR t.taskID IS NOT NULL", [])
        const [{ total }] = await sql("select", "SELECT COUNT(*) AS total FROM task", [])
        save("seed.json", { noteId, groups, secIds, total, top: topIds.length })
        console.log("[lag] seeded tasks:", total)
        await browser.refresh()
        await waitForApp()
        try { await openWorkspace(WORKSPACE) } catch (e) { console.log("[lag] workspace already open after reload") }
        if (!(await byLabel(await tr("notes.closeCurrent")).isDisplayed())) await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
        await browser.pause(2000)
        await browser.saveScreenshot(path.join(OUT, "note.png"))
    })

    const scenarios: Record<string, () => Promise<{ path: { x: number, y: number }[], lay: any }>> = {
        // task within the same section (baseline): row 3 -> row 9 of section 1
        within: async () => {
            await browser.execute(() => document.querySelectorAll("*").forEach(() => {}) as any)
            await browser.execute(() => { document.querySelectorAll<HTMLElement>("*").forEach(el => { if (el.scrollTop) el.scrollTop = 0 }) })
            await browser.pause(300)
            const lay = await layout()
            const tops = lay.tasks.filter((t: any) => t.top && t.sec === String(0) || true)
            const g1 = lay.tasks.filter((t: any) => t.top).sort((a: any, b: any) => a.t - b.t).filter((t: any) => t.l < lay.w / 3)
            const src = g1[2], dst = g1[8]
            return { lay, path: line({ x: Math.round((src.l + src.r) / 2), y: Math.round((src.t + src.b) / 2) }, { x: Math.round((dst.l + dst.r) / 2), y: Math.round((dst.t + dst.b) / 2) }, 40) }
        },
        // across the boundary section 1 / section 2 of group 1
        between: async () => {
            await browser.execute((id: number) => {
                const first = document.querySelectorAll<HTMLElement>(`[data-task-section="${id}"]`)[0]
                first?.scrollIntoView({ block: "center" })
            }, secIds[1])
            await browser.pause(400)
            const lay = await layout()
            const sec1 = lay.tasks.filter((t: any) => t.top && t.sec === String(secIds[0])).sort((a: any, b: any) => a.t - b.t)
            const sec2 = lay.tasks.filter((t: any) => t.top && t.sec === String(secIds[1])).sort((a: any, b: any) => a.t - b.t)
            const visible = (t: any) => t.t > 80 && t.b < lay.h - 20
            const s1 = sec1.filter(visible), s2 = sec2.filter(visible)
            const src = s1[s1.length - 3] ?? s1[s1.length - 1]
            const dst = s2[Math.min(4, s2.length - 1)]
            return { lay, path: line({ x: Math.round((src.l + src.r) / 2), y: Math.round((src.t + src.b) / 2) }, { x: Math.round((dst.l + dst.r) / 2), y: Math.round((dst.t + dst.b) / 2) }, 40) }
        },
        // across groups: section 1 of group 1 -> section 1 of group 2 (horizontal)
        groups: async () => {
            await browser.execute(() => { document.querySelectorAll<HTMLElement>("*").forEach(el => { if (el.scrollTop) el.scrollTop = 0; if (el.scrollLeft) el.scrollLeft = 0 }) })
            await browser.pause(300)
            const lay = await layout()
            const col = (i: number) => lay.tasks.filter((t: any) => t.top).sort((a: any, b: any) => a.t - b.t).filter((t: any) => t.l >= (lay.w * i) / 3 && t.l < (lay.w * (i + 1)) / 3)
            const c1 = col(0), c2 = col(1)
            const src = c1[2], dst = c2.length > 4 ? c2[4] : c2[c2.length - 1]
            if (process.env.LAG_DEBUG === "1") console.log("[lag] groups", JSON.stringify({ w: lay.w, c1: c1.length, c2: c2.length, src, dst }))
            return { lay, path: line({ x: Math.round((src.l + src.r) / 2), y: Math.round((src.t + src.b) / 2) }, { x: Math.round((dst.l + dst.r) / 2), y: Math.round((dst.t + dst.b) / 2) }, 40) }
        },
    }


    if (process.env.LAG_RENDERS === "1") {
        it("installs the React commit hook", async () => {
            const source = `(() => {
                const hook = {
                    supportsFiber: true, renderers: new Map(), isDisabled: false,
                    inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id },
                    checkDCE() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {},
                    onCommitFiberRoot(id, root) {
                                                const t0 = performance.now()
                        const counts = new Map()
                        const why = ${JSON.stringify(process.env.LAG_WHY ?? "")}
                        const whyMap = new Map()
                        const explain = (f) => {
                            const a = f.alternate
                            if (!a) return "mount"
                            const out = { props: [], ctx: [], hooks: [] }
                            const pp = a.memoizedProps || {}, np = f.memoizedProps || {}
                            for (const k of new Set([...Object.keys(pp), ...Object.keys(np)])) if (pp[k] !== np[k]) out.props.push(k)
                            let d = f.dependencies && f.dependencies.firstContext, e = a.dependencies && a.dependencies.firstContext, i = 0
                            while (d && e) {
                                if (d.memoizedValue !== e.memoizedValue) out.ctx.push(i + ":" + (d.memoizedValue && typeof d.memoizedValue === "object" ? Object.keys(d.memoizedValue).slice(0, 8).join("|") : String(d.memoizedValue)))
                                d = d.next; e = e.next; i++
                            }
                            let h = f.memoizedState, g = a.memoizedState, j = 0
                            while (h && g && typeof h === "object" && "next" in h) { if (h.memoizedState !== g.memoizedState) out.hooks.push(j); h = h.next; g = g.next; j++ }
                            return out
                        }
                        const seen = new Set()
                        const prev = window.__rcPrev || new Set()
                        const walk = (fiber) => {
                            let f = fiber
                            while (f) {
                                seen.add(f)
                                if (window.__rcOn && !prev.has(f) && (f.tag === 0 || f.tag === 11 || f.tag === 14 || f.tag === 15) && (f.flags & 1)) {
                                    const type = f.type
                                    const fn = typeof type === "function" ? type : (type && (type.type || type.render))
                                    const src = fn ? Function.prototype.toString.call(fn).slice(0, 70).replace(/\\s+/g, " ") : "?"
                                    const key = (fn && fn.name ? fn.name : "anon") + " :: " + src
                                    counts.set(key, (counts.get(key) || 0) + 1)
                                    // LAG_WHY=<text of the source>: why the first component that contains it re-rendered (changed props, contexts, hooks)
                                    if (why && fn && Function.prototype.toString.call(fn).includes(why)) { const e = explain(f); const up = []; for (let q = f.return; q && up.length < 6; q = q.return) { const t = q.type; const g = typeof t === "function" ? t : (t && (t.type || t.render)); if (g) up.push(g.name || Function.prototype.toString.call(g).slice(0, 40).replace(/\\s+/g, " ")) }
                                    const k = typeof e === "string" ? e : JSON.stringify({ props: e.props, ctx: e.ctx, up }); whyMap.set(k, (whyMap.get(k) || 0) + 1) }
                                }
                                if (f.child && (f.subtreeFlags & 1 || f.flags & 1 || true)) walk(f.child)
                                f = f.sibling
                            }
                        }
                        walk(root.current)
                        window.__rcPrev = seen
                        if (!window.__rcOn) return
                        let total = 0
                        for (const v of counts.values()) total += v
                        const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14)
                        ;(window.__rcCommits = window.__rcCommits || []).push({ t: t0, ms: +(performance.now() - t0).toFixed(1), total, top, whyLog: [...whyMap] })
                    },
                }
                Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", { configurable: true, value: hook })
            })()`
            await cdp("Page.enable")
            await cdp("Page.addScriptToEvaluateOnNewDocument", { source })
            await browser.refresh()
            await waitForApp()
            try { await openWorkspace(WORKSPACE) } catch (e) { /* already open */ }
            if (!(await byLabel(await tr("notes.closeCurrent")).isDisplayed())) await treeRow(NOTE).click()
            await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
            await browser.pause(2500)
        })
    }

    const results: any = {}
    const only = (process.env.LAG_ONLY ?? "").split(",").filter(Boolean)
    for (const live of [true, false]) for (const name of Object.keys(scenarios)) {
        if (only.length && !only.includes(`${name}:${live}`)) continue
        it(`${name} live=${live} profile=${PROFILE}`, async () => {
            await setLiveDrag(live)
            if (Number(process.env.LAG_THROTTLE) > 1) await cdp("Emulation.setCPUThrottlingRate", { rate: Number(process.env.LAG_THROTTLE) }) // a slower machine
            await browser.pause(800)
            const runs: any[] = []
            for (let r = 0; r < RUNS + 1; r++) { // run 0 is a warm up
                const { path: p, lay } = await scenarios[name]()
                const CPU = process.env.LAG_CPU === "1" && r === RUNS
                if (CPU) { await cdp("Profiler.enable"); await cdp("Profiler.setSamplingInterval", { interval: 200 }); await cdp("Profiler.start") }
                await installProbe(PROFILE)
                await browser.pause(300)
                const order = () => browser.execute(() => Array.from(document.querySelectorAll("[data-task-wrap]")).map(el => el.getAttribute("data-task-wrap") + "@" + el.getAttribute("data-task-section")).join(","))
                const orderBefore = await order()
                await dragPath(p)
                await browser.pause(1500)
                if (process.env.LAG_DEBUG === "1") await browser.saveScreenshot(path.join(OUT, `after-${name}-${live}-${r}.png`))
                const moved = (await order()) !== orderBefore // a drag that moved nothing would measure the wrong thing
                const raw = await collectProbe()
                if (CPU) { const { profile } = await cdp("Profiler.stop") as any; fs.writeFileSync(path.join(OUT, `cpu-${name}-live${live}.cpuprofile`), JSON.stringify(profile)) }
                if (r > 0) runs.push({ ...analyse(raw, lay, PROFILE), moved })
                if (r === RUNS) save(`raw-${name}-live${live}-profile${PROFILE}.json`, { raw: { ...raw, frames: raw.frames.length }, lay: { w: lay.w, h: lay.h } })
                // undo the move
                await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
                await browser.keys(["Control", "z"])
                await browser.pause(1200)
            }
            results[`${name}|live=${live}`] = runs
            save(`result-profile${PROFILE}${process.env.LAG_CPU === "1" ? "-cpu" : ""}.json`, results)
        })
    }
})
