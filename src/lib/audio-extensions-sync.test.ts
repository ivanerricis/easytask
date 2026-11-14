import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { AUDIO_EXTENSIONS } from "@/db/queries/audio"
import { MEDIA_EXTENSIONS } from "@/db/queries/media"

function rustExtensions(name: string): string[] {
    const rust = readFileSync(resolve(__dirname, "../../src-tauri/src/files.rs"), "utf8")
    const match = rust.match(new RegExp(`const ${name}:\\s*\\[&str;\\s*\\d+\\]\\s*=\\s*\\[([^\\]]*)\\]`))
    expect(match, `${name} not found in files.rs`).not.toBeNull()
    return [...match![1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort()
}

describe("AUDIO_EXTENSIONS", () => {
    it("is identical in the Rust backend (src-tauri/src/files.rs) and the frontend", () => {
        expect(rustExtensions("AUDIO_EXTENSIONS")).toEqual([...AUDIO_EXTENSIONS].sort())
    })
})

describe("MEDIA_EXTENSIONS", () => {
    it("is identical in the Rust backend (src-tauri/src/files.rs) and the frontend", () => {
        expect(rustExtensions("MEDIA_EXTENSIONS")).toEqual([...MEDIA_EXTENSIONS].sort())
    })
})
