import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Tag } from "@/types/types"
import { makeTask } from "@/test/ui-fixtures"

const clipboard = vi.hoisted(() => ({ text: "", failWrite: false, failRead: false }))
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
    writeText: vi.fn(async (text: string) => {
        if (clipboard.failWrite) throw new Error("denied")
        clipboard.text = text
    }),
    readText: vi.fn(async () => {
        if (clipboard.failRead) throw new Error("denied")
        return clipboard.text
    }),
}))

import { clearCopiedTasks, copyTasks, readCopiedTasks, snapshotTasks, tasksToText, usesTags } from "./task-clipboard"

const tags: Tag[] = [{ id: 5, workspaceID: 1, name: "Casa", color: "#ff0000", position: 0 }]
const tree = [
    makeTask({ id: 1, text: "Radice", description: "nota", completed: true, priority: true, color: "#00ff00", tagIDs: [5], subtasks: [
        makeTask({ id: 2, taskID: 1, text: "Figlio", subtasks: [makeTask({ id: 3, taskID: 2, text: "Nipote" })] }),
    ] }),
    makeTask({ id: 4, text: "Altra" }),
]

beforeEach(() => {
    clipboard.text = ""
    clipboard.failWrite = false
    clipboard.failRead = false
    clearCopiedTasks()
})

describe("snapshotTasks", () => {
    it("copies the tasks with their subtasks, flags and tags by name", () => {
        const [root, other] = snapshotTasks(tree, tags)
        expect(root).toMatchObject({ text: "Radice", description: "nota", completed: true, priority: true, color: "#00ff00", tags: [{ name: "Casa", color: "#ff0000" }] })
        expect(root.subtasks.map(task => task.text)).toEqual(["Figlio"])
        expect(root.subtasks[0].subtasks.map(task => task.text)).toEqual(["Nipote"])
        expect(other.text).toBe("Altra")
        expect(other.subtasks).toEqual([])
    })

    it("carries the shape of a tag (the default pill writes none)", () => {
        const [shaped] = snapshotTasks(tree, [{ ...tags[0], shape: "dot" }])
        expect(shaped.tags).toEqual([{ name: "Casa", color: "#ff0000", shape: "dot" }])
        const [plain] = snapshotTasks(tree, [{ ...tags[0], shape: null }])
        expect(plain.tags).toEqual([{ name: "Casa", color: "#ff0000" }])
    })

    it("keeps the order it is given and leaves out a tag that is not in the list", () => {
        const [first, second] = snapshotTasks([tree[1], tree[0]], [])
        expect([first.text, second.text]).toEqual(["Altra", "Radice"])
        expect(second.tags).toBeUndefined()
    })
})

describe("tasksToText / usesTags", () => {
    it("writes one task per line with two spaces per level", () => {
        expect(tasksToText(snapshotTasks(tree, tags))).toBe("Radice\n  Figlio\n    Nipote\nAltra")
    })

    it("tells whether a tag is used at any depth", () => {
        expect(usesTags(snapshotTasks(tree, tags))).toBe(true)
        expect(usesTags(snapshotTasks([tree[1]], tags))).toBe(false)
        const deep = [makeTask({ id: 1, subtasks: [makeTask({ id: 2, taskID: 1, tagIDs: [5] })] })]
        expect(usesTags(snapshotTasks(deep, tags))).toBe(true)
    })
})

describe("copy and paste", () => {
    it("writes the text and gives the copy back while the clipboard still has it", async () => {
        const snapshot = snapshotTasks(tree, tags)
        expect(await copyTasks(snapshot)).toBe(true)
        expect(clipboard.text).toBe("Radice\n  Figlio\n    Nipote\nAltra")
        expect(await readCopiedTasks()).toEqual(snapshot)
    })

    it("gives nothing once something else was copied, or when nothing was copied", async () => {
        expect(await readCopiedTasks()).toBeNull()
        await copyTasks(snapshotTasks(tree, tags))
        clipboard.text = "other text"
        expect(await readCopiedTasks()).toBeNull()
    })

    it("an empty copy writes nothing and a denied clipboard keeps nothing", async () => {
        expect(await copyTasks([])).toBe(false)
        expect(clipboard.text).toBe("")
        clipboard.failWrite = true
        expect(await copyTasks(snapshotTasks(tree, tags))).toBe(false)
        clipboard.failWrite = false
        expect(await readCopiedTasks()).toBeNull()
        await copyTasks(snapshotTasks(tree, tags))
        clipboard.failRead = true
        expect(await readCopiedTasks()).toBeNull()
    })

    it("each paste gets its own copy (a change to it does not touch the next paste)", async () => {
        await copyTasks(snapshotTasks(tree, tags))
        const first = await readCopiedTasks()
        first![0].text = "changed"
        expect((await readCopiedTasks())![0].text).toBe("Radice")
    })
})
