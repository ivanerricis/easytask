import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { it as itLocale } from "./locales/it"

/** Keys looked up with a computed name: matched by prefix instead of by literal. */
const DYNAMIC_PREFIXES = [
    "common.colors.c",
    "undo.",
    "archive.types.",
    "trash.",
    "transfer.names.",
    "automations.steps.",
    "automations.triggers.",
    "automations.actions.",
    "automations.describe.",
    "automations.errors.",
    "rightPanel.",
    "settings.appearance.",
    "settings.themes.",
    "settings.data.backup.frequency.",
    "settings.notes.newTaskPosition.",
    "settings.notes.collapsedGroupLayout.",
    "settings.notes.taskDensity.",
    "settings.audio.playerSize.",
    "shortcuts.categories.",
    "shortcuts.items.",
    "shortcuts.keys.",
    "settings.shortcuts.categories.",
    "settings.shortcuts.items.",
    "settings.shortcuts.keys.",
    "audio.nowPlaying",
    "audio.paused",
    "audio.ended",
]

const SRC = resolve(__dirname, "..")
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

const flatten = (node: unknown, prefix = ""): string[] =>
    node !== null && typeof node === "object"
        ? Object.entries(node).flatMap(([key, value]) => flatten(value, prefix ? `${prefix}.${key}` : key))
        : [prefix]

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return name === "locales" ? [] : sourceFiles(path)
        return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : []
    })

describe("translation keys", () => {
    it("has no literal key that the source never references", () => {
        const keys = [...new Set(flatten(itLocale).map((key) => key.replace(PLURAL_SUFFIX, "")))]
        const source = sourceFiles(SRC).map((file) => readFileSync(file, "utf8")).join("\n")
        const unused = keys.filter((key) => !DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix)) && !new RegExp(`["'\`]${key.replace(/\./g, "\\.")}["'\`]`).test(source))
        expect(unused).toEqual([])
    })
})
