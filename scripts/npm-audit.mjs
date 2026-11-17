// npm audit of the production dependencies, failing on high and critical advisories, like `npm audit --omit=dev --audit-level=high`,
// except the advisories listed below (npm audit has no ignore option). Remove an entry as soon as a fixed version exists.
import { execFileSync } from "node:child_process"

const ACCEPTED = {
    // picomatch ReDoS (via vite/tinyglobby, build tooling only): no fixed picomatch yet (Nov 2026)
    "https://github.com/advisories/GHSA-fc5q-39xc-vjpf": "picomatch ReDoS, no fixed version yet",
}
const BLOCKING = new Set(["high", "critical"])

let out
try {
    out = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", shell: process.platform === "win32" })
} catch (error) {
    // npm audit exits with 1 when it finds anything: the report is still on stdout
    out = error.stdout
    if (!out) throw error
}
const report = JSON.parse(out)
const advisories = new Map()
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
        if (typeof via === "object" && BLOCKING.has(via.severity)) advisories.set(via.url, `${via.name}: ${via.title} (${via.severity})`)
    }
}
const accepted = [...advisories.keys()].filter(url => url in ACCEPTED)
const blocking = [...advisories].filter(([url]) => !(url in ACCEPTED))
for (const url of accepted) console.log(`accepted: ${url} - ${ACCEPTED[url]}`)
for (const url of Object.keys(ACCEPTED).filter(url => !advisories.has(url))) console.log(`no longer reported, remove it from the list: ${url}`)
if (blocking.length > 0) {
    for (const [url, text] of blocking) console.error(`${text} - ${url}`)
    process.exit(1)
}
console.log("npm audit: no high or critical advisory in the production dependencies")
