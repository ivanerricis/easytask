import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Note } from "@/types/types"
import { flattenTree } from "./flat-tree"
import { clearTreeShifts, registerTreeRow } from "./tree-live-shift"
import { useTreeLive } from "./use-tree-live"

vi.mock("@/contexts/use-preference", () => ({ usePreference: () => true }))
vi.mock("./item-size", () => ({ TREE_ROW_GAP: 4, useItemSize: () => ({ rowPx: 28, indentPx: 20, guidePx: 12 }) }))

beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 1)
    vi.stubGlobal("cancelAnimationFrame", () => { })
})
afterEach(() => {
    clearTreeShifts(false)
    registerTreeRow("note-1", null)
    vi.unstubAllGlobals()
})

const rows = flattenTree({
    rootFolders: [],
    rootNotes: [1, 2, 3].map(id => ({ id, name: `N${id}`, folderID: null }) as unknown as Note),
}, new Set())
const target = { folderId: null, index: 2 }

describe("useTreeLive.show", () => {
    it("says nothing is shown when no row is registered, so the drop line is drawn instead", () => {
        const { result } = renderHook(() => useTreeLive(rows, {}))
        act(() => { result.current.start({ type: "note", id: 1 }, { keyboard: false, selection: false }) })
        expect(result.current.show(target, "after", true)).toBe(false)
    })

    it("says the room is shown once the rows are registered", () => {
        registerTreeRow("note-1", document.createElement("div"))
        const { result } = renderHook(() => useTreeLive(rows, {}))
        act(() => { result.current.start({ type: "note", id: 1 }, { keyboard: false, selection: false }) })
        expect(result.current.show(target, "after", true)).toBe(true)
    })
})

describe("useTreeLive.show in the place of the dragged row but at another depth", () => {
    const nested = flattenTree({
        rootFolders: [{ id: 1, name: "F", folderID: null, subfolders: [], notes: [{ id: 10, name: "N10", folderID: 1 } as unknown as Note] } as never],
        rootNotes: [{ id: 100, name: "N100", folderID: null } as unknown as Note],
    }, new Set())

    it("opens the room at the new depth (the row leaves its old place, with its old guides) instead of showing nothing", () => {
        let frame: FrameRequestCallback | null = null
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1 })
        const dragged = document.createElement("div")
        registerTreeRow("note-10", dragged)
        const { result } = renderHook(() => useTreeLive(nested, {}))
        act(() => { result.current.start({ type: "note", id: 10 }, { keyboard: false, selection: false }) })
        // From the last place of the folder to the first of the root notes: the same index in the flat list, one level less
        expect(result.current.show({ folderId: null, index: 0 }, "after", true)).toBe(true)
        ;(frame as FrameRequestCallback | null)?.(0)
        expect(dragged.style.opacity).toBe("0")
        registerTreeRow("note-10", null)
    })
})
