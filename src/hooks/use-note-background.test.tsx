import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { useNoteBackgroundColor, useNoteBackgroundCss, useNoteBackgroundImagePath, useNoteBackgroundStyle } from "./use-note-background"
import { makeNote } from "@/test/ui-fixtures"
import type { WorkspaceDataTree } from "@/types/types"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }))

let tree: WorkspaceDataTree | null = null
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceState: () => ({ workspaceDataTree: tree }) }))

const withNotes = (rootNotes: ReturnType<typeof makeNote>[], folderNotes: ReturnType<typeof makeNote>[] = []) => {
    tree = {
        rootNotes,
        rootFolders: [{
            id: 1, workspaceID: 1, folderID: null, name: "F", position: 0, creation_date: "", creation_time: "", edit_date: "", edit_time: "",
            subfolders: [], notes: folderNotes,
        }],
    } as unknown as WorkspaceDataTree
}

describe("useNoteBackgroundColor", () => {
    it("reads the background of a note at the root or in a folder", () => {
        withNotes([makeNote({ id: 1, bg_color: "#e6194b" })], [makeNote({ id: 2, bg_color: "#3cb44b" })])
        expect(renderHook(() => useNoteBackgroundColor(1)).result.current).toBe("#e6194b")
        expect(renderHook(() => useNoteBackgroundColor(2)).result.current).toBe("#3cb44b")
    })

    it("is null without a background, for an unknown note (a template draft), without id or without tree", () => {
        withNotes([makeNote({ id: 1 }), makeNote({ id: 3, bg_color: null })])
        expect(renderHook(() => useNoteBackgroundColor(1)).result.current).toBeNull()
        expect(renderHook(() => useNoteBackgroundColor(3)).result.current).toBeNull()
        expect(renderHook(() => useNoteBackgroundColor(99)).result.current).toBeNull()
        expect(renderHook(() => useNoteBackgroundColor(null)).result.current).toBeNull()
        tree = null
        expect(renderHook(() => useNoteBackgroundColor(1)).result.current).toBeNull()
    })
})

describe("useNoteBackgroundStyle", () => {
    it("is a light translucent layer of the color, and undefined without a color", () => {
        withNotes([makeNote({ id: 1, bg_color: "#ff0000" }), makeNote({ id: 2 })])
        expect(renderHook(() => useNoteBackgroundStyle(1)).result.current).toBe("rgba(255, 0, 0, 0.12)")
        expect(renderHook(() => useNoteBackgroundStyle(2)).result.current).toBeUndefined()
    })
})

describe("useNoteBackgroundImagePath", () => {
    it("reads the image of a note, null without one, for an unknown note or without id", () => {
        withNotes([makeNote({ id: 1, bg_image: "/img/a.png" }), makeNote({ id: 2 })])
        expect(renderHook(() => useNoteBackgroundImagePath(1)).result.current).toBe("/img/a.png")
        expect(renderHook(() => useNoteBackgroundImagePath(2)).result.current).toBeNull()
        expect(renderHook(() => useNoteBackgroundImagePath(99)).result.current).toBeNull()
        expect(renderHook(() => useNoteBackgroundImagePath(null)).result.current).toBeNull()
    })
})

describe("useNoteBackgroundCss", () => {
    it("is only the color without an image, and nothing without either", () => {
        withNotes([makeNote({ id: 1, bg_color: "#ff0000" }), makeNote({ id: 2 })])
        expect(renderHook(() => useNoteBackgroundCss(1)).result.current).toEqual({ background: "rgba(255, 0, 0, 0.12)" })
        expect(renderHook(() => useNoteBackgroundCss(2)).result.current).toBeUndefined()
    })

    it("allows the file, then layers the color veil, a neutral theme veil and the picture (cover, centered, no repeat)", async () => {
        vi.mocked(invoke).mockResolvedValue(undefined)
        withNotes([makeNote({ id: 1, bg_color: "#ff0000", bg_image: "/img/a.PNG" }), makeNote({ id: 2, bg_image: "/img/b.jpg" })])
        const withColor = renderHook(() => useNoteBackgroundCss(1))
        await waitFor(() => expect(withColor.result.current?.background).toContain("url("))
        expect(invoke).toHaveBeenCalledWith("allow_media_file", { path: "/img/a.PNG" })
        const layers = withColor.result.current!.background as string
        expect(layers.indexOf("rgba(255, 0, 0, 0.12)")).toBeLessThan(layers.indexOf("var(--background)"))
        expect(layers.indexOf("var(--background)")).toBeLessThan(layers.indexOf('url("asset:///img/a.PNG")'))
        expect(layers).toContain(") center / cover no-repeat")

        // No color: the theme veil alone keeps the text readable in light and dark
        const plain = renderHook(() => useNoteBackgroundCss(2))
        await waitFor(() => expect(plain.result.current?.background).toContain("url("))
        expect(plain.result.current!.background as string).toContain("var(--background)")
        expect(plain.result.current!.background as string).not.toContain("rgba")
    })

    it("falls back to the color when the file is missing (not allowed) or is not an image", async () => {
        vi.mocked(invoke).mockRejectedValue(new Error("media file not found"))
        withNotes([makeNote({ id: 1, bg_color: "#ff0000", bg_image: "/gone.png" }), makeNote({ id: 2, bg_image: "/clip.mp4" })])
        const missing = renderHook(() => useNoteBackgroundCss(1))
        await waitFor(() => expect(invoke).toHaveBeenCalled())
        expect(missing.result.current).toEqual({ background: "rgba(255, 0, 0, 0.12)" })
        vi.mocked(invoke).mockClear()
        expect(renderHook(() => useNoteBackgroundCss(2)).result.current).toBeUndefined()
        expect(invoke).not.toHaveBeenCalled()
    })
})
