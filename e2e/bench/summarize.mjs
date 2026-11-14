// Medians of a benchmark result: node e2e/bench/summarize.mjs <result json> [label]
// Prints a markdown table, one row per scenario (and live on/off).
import fs from "node:fs"

const [file, label = ""] = process.argv.slice(2)
if (!file) { console.error("usage: node e2e/bench/summarize.mjs <result-profilefalse.json> [label]"); process.exit(1) }
const results = JSON.parse(fs.readFileSync(file, "utf8"))
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN }
const col = (runs, pick) => +median(runs.map(pick)).toFixed(1)

const rows = [
    ["drags that moved the task (of runs)", r => (r.moved ? 1 : 0)],
    ["p95 frame (drag)", r => r.drag.p95],
    ["max frame at target change (100 ms)", r => r.changeAny.max],
    ["max frame, section change", r => r.changeSection.max],
    ["long tasks per drag", r => r.longTasksRel.filter(l => l.phase === "drag").length],
    ["start: long tasks in 1.5 s", r => r.start1500.longTasks],
    ["start: max frame in 1.5 s", r => r.start1500.max],
    ["drop: long task sum (ms)", r => r.drop1500.longSum],
    ["drop: longest task (ms)", r => r.drop1500.longMax],
    ["drop: max frame in 1.5 s", r => r.drop1500.max],
]
const keys = Object.keys(results)
console.log(`${label ? `### ${label}\n\n` : ""}| metric | ${keys.join(" | ")} |\n|---|${keys.map(() => "---").join("|")}|`)
for (const [name, pick] of rows) console.log(`| ${name} | ${keys.map(k => col(results[k], pick)).join(" | ")} |`)
