import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { browser } from "@wdio/globals"
import type { Options } from "@wdio/types"

/**
 * WebdriverIO + tauri-driver configuration (https://v2.tauri.app/develop/tests/webdriver/).
 *
 * - onPrepare: creates a unique temporary data directory (EASYTASK_DATA_DIR, read by the backend so the
 *   tests never touch the real Documents/EasyTask) and builds the debug app unless E2E_SKIP_BUILD=1.
 * - beforeSession / afterSession: start and stop tauri-driver (it launches the app for each session).
 * - onComplete: removes the temporary data directory.
 *
 * Environment: E2E_SKIP_BUILD=1 reuses an existing debug binary, E2E_APP=<path> uses a custom binary,
 * E2E_NATIVE_DRIVER=<path> uses a specific msedgedriver / WebKitWebDriver, E2E_SHARD=<current>/<total> (e.g. 2/3)
 * runs only that share of the spec files (the CI splits the suite across runners).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const isWindows = process.platform === "win32"
const binName = isWindows ? "EasyTask.exe" : "EasyTask"
const application = process.env.E2E_APP ?? path.join(root, "src-tauri", "target", "debug", binName)

const [shardCurrent, shardTotal] = (process.env.E2E_SHARD ?? "").split("/").map(Number)
const shard = shardCurrent >= 1 && shardTotal >= shardCurrent ? { current: shardCurrent, total: shardTotal } : undefined

const edgeArgs = (process.env.E2E_EDGE_ARGS ?? "").split(/\s+/).filter(Boolean)

let dataDir = ""
let tauriDriver: ChildProcess | undefined
let exiting = false

const stopDriver = () => {
    exiting = true
    tauriDriver?.kill()
}

/**
 * Version of the installed WebView2 Runtime (the engine the app really runs on), read from the registry.
 * It can differ from the version of Microsoft Edge (on which edgedriver would otherwise be matched): msedgedriver
 * must match the WebView2 runtime, or the session fails with "DevToolsActivePort file doesn't exist".
 */
const webView2Version = (): string | undefined => {
    const guid = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    const keys = [
        ["HKLM", "SOFTWARE", "WOW6432Node", "Microsoft", "EdgeUpdate", "Clients", guid].join("\\"),
        ["HKLM", "SOFTWARE", "Microsoft", "EdgeUpdate", "Clients", guid].join("\\"),
        ["HKCU", "SOFTWARE", "Microsoft", "EdgeUpdate", "Clients", guid].join("\\"),
    ]
    for (const key of keys) {
        const out = spawnSync("reg", ["query", key, "/v", "pv"], { encoding: "utf8" })
        const match = /pv\s+REG_SZ\s+(\d+\.\d+\.\d+\.\d+)/.exec(out.stdout ?? "")
        if (match) return match[1]
    }
    return undefined
}

/** Downloads (once) an msedgedriver that matches the installed WebView2 Runtime on Windows. */
const resolveNativeDriver = async (): Promise<string | undefined> => {
    if (process.env.E2E_NATIVE_DRIVER) return process.env.E2E_NATIVE_DRIVER
    if (!isWindows) return undefined
    const { download } = await import("edgedriver")
    const version = webView2Version()
    console.log(`[e2e] WebView2 runtime: ${version ?? "not detected (falling back to the installed Edge)"}`)
    const cacheDir = path.join(os.tmpdir(), "easytask-e2e-edgedriver", version ?? "edge")
    fs.mkdirSync(cacheDir, { recursive: true })
    const driver = await download(version, cacheDir)
    console.log(`[e2e] native driver: ${driver}`)
    const reported = spawnSync(driver, ["--version"], { encoding: "utf8" })
    console.log(`[e2e] msedgedriver version: ${reported.stdout?.trim() || reported.error?.message || "unknown"}`)
    if (process.env.E2E_DRIVER_LOG !== "1") return driver
    // tauri-driver does not forward arguments to the native driver: a .cmd wrapper adds verbose logging
    // (it shows how msedgedriver launches the app and why it cannot find DevToolsActivePort)
    fs.mkdirSync(outputDir, { recursive: true })
    const wrapper = path.join(outputDir, "msedgedriver-verbose.cmd")
    const log = path.join(outputDir, "msedgedriver-%RANDOM%.log") // one file per session
    fs.writeFileSync(wrapper, `@echo off\r\n"${driver}" --verbose --log-path="${log}" %*\r\n`)
    return wrapper
}

/** Output of tauri-driver and failure screenshots are written here (uploaded by the CI on failure). */
const outputDir = path.join(root, "e2e", "output")

export const config: Options.Testrunner & { capabilities: unknown[] } = {
    runner: "local",
    hostname: "127.0.0.1",
    port: 4444,
    specs: ["./specs/**/*.e2e.ts"],
    maxInstances: 1,
    ...(shard ? { shard } : {}),
    capabilities: [
        {
            maxInstances: 1,
            // E2E_EDGE_ARGS (space separated, e.g. "--no-sandbox") is passed to the WebView2 browser by tauri-driver
            "tauri:options": { application, ...(edgeArgs.length > 0 ? { args: edgeArgs } : {}) },
        },
    ],
    reporters: ["spec"],
    framework: "mocha",
    mochaOpts: { ui: "bdd", timeout: 120_000 },
    waitforTimeout: 10_000,
    connectionRetryTimeout: 120_000,
    connectionRetryCount: 1,
    logLevel: "warn",

    onPrepare: () => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "easytask-e2e-"))
        // Inherited by tauri-driver and, through it, by the app under test
        process.env.EASYTASK_DATA_DIR = dataDir
        console.log(`[e2e] data dir: ${dataDir}`)

        if (process.env.E2E_SKIP_BUILD === "1") return
        console.log("[e2e] building the debug app (tauri build --debug --no-bundle)...")
        const result = spawnSync("npm", ["run", "tauri", "--", "build", "--debug", "--no-bundle"], {
            cwd: root,
            stdio: "inherit",
            shell: true,
        })
        if (result.status !== 0) throw new Error("tauri build failed")
    },

    beforeSession: async () => {
        const nativeDriver = await resolveNativeDriver()
        exiting = false
        const args = nativeDriver ? ["--native-driver", nativeDriver] : []
        fs.mkdirSync(outputDir, { recursive: true })
        const logFile = fs.openSync(path.join(outputDir, "tauri-driver.log"), "a")
        tauriDriver = spawn(path.join(os.homedir(), ".cargo", "bin", "tauri-driver"), args, {
            stdio: [null, logFile, logFile],
            env: process.env,
        })
        tauriDriver.on("error", (error) => {
            console.error("[e2e] tauri-driver error:", error)
            process.exit(1)
        })
        tauriDriver.on("exit", (code) => {
            if (!exiting) {
                console.error("[e2e] tauri-driver exited with code:", code)
                process.exit(1)
            }
        })
        // Wait until the driver accepts connections on :4444
        const deadline = Date.now() + 30_000
        while (Date.now() < deadline) {
            const listening = await new Promise<boolean>((resolve) => {
                const socket = net.connect(4444, "127.0.0.1")
                socket.once("connect", () => { socket.destroy(); resolve(true) })
                socket.once("error", () => { socket.destroy(); resolve(false) })
            })
            if (listening) return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        throw new Error("tauri-driver did not start listening on port 4444")
    },

    // The window state of the app lives in the temporary data folder now, so every session starts at the default size (1000x700).
    // Several specs were written for the maximized window the real profile used to hand them: start there on Windows
    before: async () => {
        if (process.platform !== "win32") return
        // The window is created hidden and shown after the setup: wait until the page has a size before touching the window
        const inner = () => browser.execute(() => window.innerWidth).catch(() => 0)
        await browser.waitUntil(async () => (await inner()) > 0, { timeout: 30_000, timeoutMsg: "the page has no size (the window is not shown)" })
        await browser.maximizeWindow()
        await browser.waitUntil(async () => (await inner()) >= 1200, { timeout: 20_000, timeoutMsg: `the window did not maximize: inner width ${await inner()}` })
    },

    afterTest: async (test, _context, result) => {
        if (result.passed) return
        const name = `${test.parent} ${test.title}`.replace(/[^\w-]+/g, "_")
        fs.mkdirSync(outputDir, { recursive: true })
        await browser.saveScreenshot(path.join(outputDir, `${name}.png`)).catch(() => undefined)
    },

    afterSession: () => {
        stopDriver()
    },

    onComplete: () => {
        stopDriver()
        if (!dataDir) return
        // Keep the app's own log for the CI artifact before the temporary data directory is removed
        try {
            fs.cpSync(path.join(dataDir, "logs"), path.join(outputDir, "app-logs"), { recursive: true })
        } catch { /* the app may never have started */ }
        fs.rmSync(dataDir, { recursive: true, force: true })
    },
}

process.on("exit", stopDriver)
process.on("SIGINT", () => { stopDriver(); process.exit(1) })
process.on("SIGTERM", () => { stopDriver(); process.exit(1) })
