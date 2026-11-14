import { beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_IMPORT_FILE_BYTES } from "@/types/transfer"

let size = 10
let fileContent = "{}"
const readTextFile = vi.fn(async () => fileContent)
const suggestDBItemNames = vi.fn()
const importDBWorkspace = vi.fn()
const importDBItems = vi.fn()
const buildDBItemExport = vi.fn()
const buildDBWorkspaceExport = vi.fn()
const buildDBItemsExport = vi.fn()
const open = vi.fn()
const save = vi.fn()
const writeTextFile = vi.fn()
const invoke = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
    invoke: (...a: unknown[]) => invoke(...a),
    Channel: class { onmessage: ((message: unknown) => void) | undefined },
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...a: unknown[]) => open(...a), save: (...a: unknown[]) => save(...a) }))
vi.mock("@tauri-apps/plugin-fs", () => ({
    readTextFile: () => readTextFile(),
    writeTextFile: (...a: unknown[]) => writeTextFile(...a),
    stat: vi.fn(async () => ({ size })),
}))
vi.mock("@/db/queries/transfer", () => ({
    buildDBWorkspaceExport: (...a: unknown[]) => buildDBWorkspaceExport(...a),
    buildDBItemsExport: (...a: unknown[]) => buildDBItemsExport(...a),
    buildDBItemExport: (...a: unknown[]) => buildDBItemExport(...a),
    importDBItems: (...a: unknown[]) => importDBItems(...a),
    importDBWorkspace: (...a: unknown[]) => importDBWorkspace(...a),
    suggestDBWorkspaceImportName: vi.fn(async () => "WS (importato)"),
    suggestDBItemNames: (...a: unknown[]) => suggestDBItemNames(...a),
    validateWorkspaceExport: (data: unknown) => data,
}))

import { exportItemToFile, exportItemsToFile, exportWorkspaceToFile, importItemsFromFile, importWorkspaceFromFile } from "./workspace-transfer"

beforeEach(() => {
    size = 10
    fileContent = "{}"
    suggestDBItemNames.mockReset().mockResolvedValue([{ type: "note", name: "N (2)" }, { type: "folder", name: "F" }])
    readTextFile.mockClear()
    importDBWorkspace.mockReset().mockResolvedValue({ workspaceId: 1, skippedFiles: 0 })
    importDBItems.mockReset().mockResolvedValue({ skippedFiles: 0, items: [] })
    invoke.mockReset()
    buildDBItemExport.mockReset().mockResolvedValue({ format: "easytask-workspace", notes: [] })
    open.mockReset().mockResolvedValue("/x/ws.easytask.json")
    buildDBWorkspaceExport.mockReset().mockResolvedValue({ format: "easytask-workspace", scope: "workspace", notes: [] })
    buildDBItemsExport.mockReset().mockResolvedValue({ format: "easytask-workspace", scope: "items", notes: [] })
    save.mockReset().mockResolvedValue("/x/out.easytask.json")
    writeTextFile.mockReset()
})

describe("importWorkspaceFromFile", () => {
    it("rejects a file above the size limit before reading it", async () => {
        size = MAX_IMPORT_FILE_BYTES + 1
        await expect(importWorkspaceFromFile()).rejects.toMatchObject({ code: "TRANSFER_FILE_TOO_LARGE" })
        expect(readTextFile).not.toHaveBeenCalled()
    })

    it("imports a file within the limit with the proposed name when nobody is asked", async () => {
        await expect(importWorkspaceFromFile()).resolves.toEqual({ workspaceId: 1, skippedFiles: 0 })
        expect(readTextFile).toHaveBeenCalledTimes(1)
        expect(importDBWorkspace).toHaveBeenCalledWith({}, { name: "WS (importato)", extractedFiles: {} })
    })

    it("lets the user choose the name, and imports nothing when the choice is cancelled", async () => {
        const choose = vi.fn(async (proposed: { name: string }[], submit: (names: string[]) => Promise<unknown>) => {
            expect(proposed).toEqual([{ type: "workspace", name: "WS (importato)" }])
            return submit(["Mio"])
        })
        await importWorkspaceFromFile(choose as never)
        expect(importDBWorkspace).toHaveBeenCalledWith({}, { name: "Mio", extractedFiles: {} })

        importDBWorkspace.mockClear()
        await expect(importWorkspaceFromFile((async () => null) as never)).resolves.toBeNull()
        expect(importDBWorkspace).not.toHaveBeenCalled()
    })

    it("refuses an items file before asking any name", async () => {
        fileContent = JSON.stringify({ scope: "items" })
        const choose = vi.fn()
        await expect(importWorkspaceFromFile(choose as never)).rejects.toMatchObject({ code: "TRANSFER_ITEMS_FILE" })
        expect(choose).not.toHaveBeenCalled()
    })
})

describe("importItemsFromFile", () => {
    it("imports the file into the given workspace and folder, with the names the user chose", async () => {
        fileContent = JSON.stringify({ scope: "items" })
        await expect(importItemsFromFile(7, 3)).resolves.toEqual({ skippedFiles: 0, items: [] })
        expect(suggestDBItemNames).toHaveBeenCalledWith({ scope: "items" }, 7, 3)
        expect(importDBItems).toHaveBeenCalledWith({ scope: "items" }, 7, 3, { names: ["N (2)", "F"], extractedFiles: {} })

        await importItemsFromFile(7, null, ((_: unknown, submit: (names: string[]) => Promise<unknown>) => submit(["A", "B"])) as never)
        expect(importDBItems).toHaveBeenLastCalledWith({ scope: "items" }, 7, null, { names: ["A", "B"], extractedFiles: {} })
    })

    it("refuses a workspace file before asking any name", async () => {
        const choose = vi.fn()
        await expect(importItemsFromFile(7, null, choose as never)).rejects.toMatchObject({ code: "TRANSFER_WORKSPACE_FILE" })
        expect(choose).not.toHaveBeenCalled()
    })

    it("rejects a file above the size limit before reading it", async () => {
        size = MAX_IMPORT_FILE_BYTES + 1
        await expect(importItemsFromFile(7, null)).rejects.toMatchObject({ code: "TRANSFER_FILE_TOO_LARGE" })
        expect(importDBItems).not.toHaveBeenCalled()
    })
})

describe("exportItemToFile", () => {
    it("proposes the item name as file name and writes the export", async () => {
        await expect(exportItemToFile("note", { id: 4, name: "A/B" })).resolves.toEqual({ missingFiles: 0 })
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "A_B.easytask.json" }))
        expect(buildDBItemExport).toHaveBeenCalledWith("note", 4)
        expect(writeTextFile).toHaveBeenCalledTimes(1)
    })

    it("does nothing when the dialog is cancelled", async () => {
        save.mockResolvedValue(null)
        await expect(exportItemToFile("folder", { id: 1, name: "F" })).resolves.toBeNull()
        expect(writeTextFile).not.toHaveBeenCalled()
    })
})

describe("exportWorkspaceToFile", () => {
    it("proposes the workspace name as file name and writes the pretty printed export", async () => {
        await expect(exportWorkspaceToFile({ id: 3, name: "Casa: spese?" })).resolves.toEqual({ missingFiles: 0 })
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "Casa_ spese_.easytask.json" }))
        expect(buildDBWorkspaceExport).toHaveBeenCalledWith(3)
        expect(writeTextFile).toHaveBeenCalledWith("/x/out.easytask.json", JSON.stringify({ format: "easytask-workspace", scope: "workspace", notes: [] }, null, 2))
    })

    it("falls back to a generic file name when the name has no usable characters", async () => {
        await exportWorkspaceToFile({ id: 3, name: "   " })
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "workspace.easytask.json" }))
    })

    it("does nothing when the dialog is cancelled", async () => {
        save.mockResolvedValue(null)
        await expect(exportWorkspaceToFile({ id: 3, name: "W" })).resolves.toBeNull()
        expect(writeTextFile).not.toHaveBeenCalled()
    })
})

describe("exportItemsToFile", () => {
    it("writes several items in one file named after the given name", async () => {
        const items = [{ type: "note" as const, id: 1 }, { type: "folder" as const, id: 2 }]
        await expect(exportItemsToFile(items, "Selezione")).resolves.toEqual({ missingFiles: 0 })
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "Selezione.easytask.json" }))
        expect(buildDBItemsExport).toHaveBeenCalledWith(items, "Selezione")
        expect(writeTextFile).toHaveBeenCalledTimes(1)
    })

    it("does nothing when the dialog is cancelled", async () => {
        save.mockResolvedValue(null)
        await expect(exportItemsToFile([{ type: "note", id: 1 }], "S")).resolves.toBeNull()
        expect(writeTextFile).not.toHaveBeenCalled()
    })
})

describe("picking an import file", () => {
    it("returns null without reading anything when the dialog is cancelled", async () => {
        open.mockResolvedValue(null)
        await expect(importWorkspaceFromFile()).resolves.toBeNull()
        await expect(importItemsFromFile(1, null)).resolves.toBeNull()
        expect(readTextFile).not.toHaveBeenCalled()
    })

    it("rejects a file that is not valid JSON", async () => {
        fileContent = "{ not json"
        await expect(importWorkspaceFromFile()).rejects.toMatchObject({ code: "TRANSFER_INVALID_FILE" })
        expect(importDBWorkspace).not.toHaveBeenCalled()
    })
})

/** A workspace export with two notes that link files (the same audio is used twice). */
const withLinkedFiles = () => ({
    format: "easytask-workspace", scope: "workspace",
    notes: [
        { audio: [{ groupIndex: 0, name: "Song", path: "C:\\music\\song.mp3", position: 0 }], media: [{ groupIndex: 0, name: "Pic", path: "D:\\img\\pic.png", position: 0 }] },
        { audio: [{ groupIndex: 0, name: "Song 2", path: "C:\\music\\song.mp3", position: 0 }], media: [] },
    ],
})

describe("exporting with the linked files", () => {
    beforeEach(() => {
        buildDBWorkspaceExport.mockResolvedValue(withLinkedFiles())
        invoke.mockImplementation(async (command: string) => {
            if (command === "linked_files_size") return { bytes: 1500, count: 2, missing: 0 }
            if (command === "export_zip") return { added: 2, missing: 0 }
            return undefined
        })
    })
    const workspace = { id: 3, name: "Casa" }

    it("does not ask anything (paths only) when the caller gives no question", async () => {
        await exportWorkspaceToFile(workspace)
        expect(invoke).not.toHaveBeenCalled()
        expect(writeTextFile).toHaveBeenCalledTimes(1)
    })

    it("asks with the distinct paths and the estimated size, and writes the json when the answer is no", async () => {
        const askIncludeFiles = vi.fn(async () => false)
        await expect(exportWorkspaceToFile(workspace, { askIncludeFiles })).resolves.toEqual({ missingFiles: 0 })
        expect(invoke).toHaveBeenCalledWith("linked_files_size", { paths: ["C:\\music\\song.mp3", "D:\\img\\pic.png"] })
        expect(askIncludeFiles).toHaveBeenCalledWith({ bytes: 1500, count: 2, missing: 0 })
        expect(save).toHaveBeenCalledWith({ filters: [{ name: "EasyTask", extensions: ["json"] }], defaultPath: "Casa.easytask.json" })
        expect(writeTextFile).toHaveBeenCalledTimes(1)
        expect(invoke).not.toHaveBeenCalledWith("export_zip", expect.anything())
        // The json is untouched: no archive entry names
        expect(writeTextFile.mock.calls[0][1]).not.toContain("files/")
    })

    it("writes a zip through the rust command when the answer is yes, naming the entries and sharing the one of a repeated path", async () => {
        save.mockResolvedValue("/x/out.easytask.zip")
        const onProgress = vi.fn()
        invoke.mockImplementation(async (command: string) => {
            if (command === "linked_files_size") return { bytes: 1500, count: 2, missing: 0 }
            return { added: 1, missing: 1 }
        })
        await expect(exportWorkspaceToFile(workspace, { askIncludeFiles: async () => true, onProgress })).resolves.toEqual({ missingFiles: 1 })
        expect(save).toHaveBeenCalledWith({ filters: [{ name: "EasyTask", extensions: ["zip"] }], defaultPath: "Casa.easytask.zip" })
        expect(writeTextFile).not.toHaveBeenCalled()
        const call = invoke.mock.calls.find(([command]) => command === "export_zip")!
        const args = call[1] as { dest: string, json: string, files: { path: string, entry: string }[], onProgress: { onmessage: (p: unknown) => void } }
        expect(args.dest).toBe("/x/out.easytask.zip")
        expect(args.files).toEqual([
            { path: "C:\\music\\song.mp3", entry: "files/0_song.mp3" },
            { path: "D:\\img\\pic.png", entry: "files/1_pic.png" },
        ])
        const json = JSON.parse(args.json)
        expect(json.notes[0].audio[0]).toMatchObject({ path: "C:\\music\\song.mp3", file: "files/0_song.mp3" })
        expect(json.notes[0].media[0]).toMatchObject({ file: "files/1_pic.png" })
        expect(json.notes[1].audio[0].file).toBe("files/0_song.mp3")
        // The progress of the channel reaches the caller
        args.onProgress.onmessage({ done: 5, total: 10 })
        expect(onProgress).toHaveBeenCalledWith({ done: 5, total: 10 })
    })

    it("exports nothing when the question is cancelled", async () => {
        await expect(exportWorkspaceToFile(workspace, { askIncludeFiles: async () => null })).resolves.toBeNull()
        expect(save).not.toHaveBeenCalled()
        expect(writeTextFile).not.toHaveBeenCalled()
    })

    it("does not ask when none of the linked files exists", async () => {
        invoke.mockResolvedValue({ bytes: 0, count: 0, missing: 2 })
        const askIncludeFiles = vi.fn()
        await exportWorkspaceToFile(workspace, { askIncludeFiles })
        expect(askIncludeFiles).not.toHaveBeenCalled()
        expect(writeTextFile).toHaveBeenCalledTimes(1)
    })

    it("does not ask when the export links no file, and cancels cleanly on the save dialog", async () => {
        buildDBWorkspaceExport.mockResolvedValue({ format: "easytask-workspace", scope: "workspace", notes: [] })
        const askIncludeFiles = vi.fn()
        await exportWorkspaceToFile(workspace, { askIncludeFiles })
        expect(askIncludeFiles).not.toHaveBeenCalled()
        expect(invoke).not.toHaveBeenCalled()

        buildDBWorkspaceExport.mockResolvedValue(withLinkedFiles())
        save.mockResolvedValue(null)
        await expect(exportWorkspaceToFile(workspace, { askIncludeFiles: async () => true })).resolves.toBeNull()
        expect(invoke).not.toHaveBeenCalledWith("export_zip", expect.anything())
    })
})

describe("importing a zip", () => {
    const extracted = { "files/0_song.mp3": "D:\\data\\media\\song.mp3" }
    beforeEach(() => {
        open.mockResolvedValue("/x/ws.easytask.zip")
        invoke.mockImplementation(async (command: string) => command === "import_zip" ? { json: JSON.stringify({ scope: "workspace" }), files: extracted } : 1)
    })

    it("lets Rust read the archive and imports the JSON with the extracted files", async () => {
        const onProgress = vi.fn()
        await expect(importWorkspaceFromFile(undefined, onProgress)).resolves.toEqual({ workspaceId: 1, skippedFiles: 0 })
        expect(open).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ name: "EasyTask", extensions: ["json", "zip"] }] }))
        expect(invoke).toHaveBeenCalledWith("import_zip", expect.objectContaining({ src: "/x/ws.easytask.zip" }))
        expect(readTextFile).not.toHaveBeenCalled()
        expect(importDBWorkspace).toHaveBeenCalledWith({ scope: "workspace" }, { name: "WS (importato)", extractedFiles: extracted })
        expect(invoke).not.toHaveBeenCalledWith("delete_extracted_files", expect.anything())
    })

    it("works for an items file too", async () => {
        invoke.mockImplementation(async (command: string) => command === "import_zip" ? { json: JSON.stringify({ scope: "items" }), files: extracted } : 1)
        await importItemsFromFile(7, 3)
        expect(importDBItems).toHaveBeenCalledWith({ scope: "items" }, 7, 3, { names: ["N (2)", "F"], extractedFiles: extracted })
    })

    it("deletes the extracted files when the user cancels the names", async () => {
        await expect(importWorkspaceFromFile((async () => null) as never)).resolves.toBeNull()
        expect(invoke).toHaveBeenCalledWith("delete_extracted_files", { paths: ["D:\\data\\media\\song.mp3"] })
    })

    it("deletes the extracted files when the import fails", async () => {
        importDBWorkspace.mockRejectedValue(new Error("boom"))
        await expect(importWorkspaceFromFile()).rejects.toThrow("boom")
        expect(invoke).toHaveBeenCalledWith("delete_extracted_files", { paths: ["D:\\data\\media\\song.mp3"] })
    })

    it("deletes the extracted files when the file of the wrong kind is refused", async () => {
        await expect(importItemsFromFile(7, null)).rejects.toMatchObject({ code: "TRANSFER_WORKSPACE_FILE" })
        expect(invoke).toHaveBeenCalledWith("delete_extracted_files", { paths: ["D:\\data\\media\\song.mp3"] })
    })

    it("rejects an archive with an invalid JSON and deletes what was extracted", async () => {
        invoke.mockImplementation(async (command: string) => command === "import_zip" ? { json: "{ nope", files: extracted } : 1)
        await expect(importWorkspaceFromFile()).rejects.toMatchObject({ code: "TRANSFER_INVALID_FILE" })
        expect(invoke).toHaveBeenCalledWith("delete_extracted_files", { paths: ["D:\\data\\media\\song.mp3"] })
    })

    it("maps the errors of the rust command: unsafe or damaged archive, JSON too large", async () => {
        invoke.mockRejectedValue("INVALID_ARCHIVE: unsafe entry name")
        await expect(importWorkspaceFromFile()).rejects.toMatchObject({ code: "TRANSFER_INVALID_FILE" })
        invoke.mockRejectedValue("JSON_TOO_LARGE")
        await expect(importWorkspaceFromFile()).rejects.toMatchObject({ code: "TRANSFER_FILE_TOO_LARGE" })
        expect(importDBWorkspace).not.toHaveBeenCalled()
    })
})
