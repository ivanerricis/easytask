import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useNoteBackgroundColor, useNoteBackgroundStyle } from "./use-note-background"
import { makeNote } from "@/test/ui-fixtures"
import type { WorkspaceDataTree } from "@/types/types"

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
