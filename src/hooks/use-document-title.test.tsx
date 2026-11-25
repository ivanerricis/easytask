import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useDocumentTitle } from "./use-document-title"

const state = { tabs: [{ id: 1, name: "Shopping" }, { id: 2, name: "Work" }], activeId: 2 as number | null, workspace: { name: "Home" } as { name: string } | null }
vi.mock("@/contexts/use-tabs", () => ({ useTabs: () => ({ tabs: state.tabs }), useActiveNoteId: () => state.activeId }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: state.workspace }) }))

describe("useDocumentTitle", () => {
    afterEach(() => { state.activeId = 2; state.workspace = { name: "Home" }; document.title = "EasyTask" })

    it("names the document after the active note and the workspace", () => {
        renderHook(() => useDocumentTitle())
        expect(document.title).toBe("Work - Home - EasyTask")
    })

    it("drops the note when none is open", () => {
        state.activeId = null
        renderHook(() => useDocumentTitle())
        expect(document.title).toBe("Home - EasyTask")
    })

    it("goes back to the name of the app when the page goes away", () => {
        const { unmount } = renderHook(() => useDocumentTitle())
        unmount()
        expect(document.title).toBe("EasyTask")
    })
})
