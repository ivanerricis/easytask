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
