import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Tag } from "@/types/types"
import { createTagsStore, WorkspaceTagsContext } from "@/contexts/workspace-data/tags"
import { PreferencesContext, type PreferencesContextType } from "@/contexts/preferences-context-object"
import { TagBadge } from "@/components/tag-badge"
import { reportError } from "@/lib/report-error"
import { TagBadgeMenu } from "./TagBadgeMenu"

vi.mock("@/lib/report-error", async () => (await import("@/test/mocks")).reportErrorMock())
const mutations = { assign: vi.fn(), rename: vi.fn(), recolor: vi.fn(), reshape: vi.fn(), remove: vi.fn(), create: vi.fn() }
vi.mock("@/hooks/use-tag-mutations", () => ({ useTagMutations: () => mutations }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: null }) }))

const bug: Tag = { id: 1, workspaceID: 1, name: "Bug", color: "#e6194b", shape: null, position: 0 }

const setup = (kind: "tasks" | "groups" | "sections" = "tasks", outer?: { onContextMenu?: () => void, onKeyDown?: () => void, onPointerDown?: () => void }) => {
    const store = createTagsStore()
    store.set({ workspaceId: 1, tags: [bug] })
    return render(
        <PreferencesContext.Provider value={{ skippedConfirms: [], setSkippedConfirms: vi.fn() } as unknown as PreferencesContextType}>
            <WorkspaceTagsContext.Provider value={store}>
                <div {...outer}>
                    <TagBadgeMenu tag={bug} target={{ kind, id: 12 }}><TagBadge tag={bug} /></TagBadgeMenu>
                </div>
            </WorkspaceTagsContext.Provider>
        </PreferencesContext.Provider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of Object.values(mutations)) fn.mockResolvedValue(undefined)
})

describe("TagBadgeMenu", () => {
    it("opens its own menu on a right click, without the menu of the row or header it sits in", async () => {
        const onContextMenu = vi.fn()
        setup("tasks", { onContextMenu })
        fireEvent.contextMenu(screen.getByTestId("tag-badge"))
        expect(await screen.findByRole("menuitem", { name: "Modifica tag…" })).toBeInTheDocument()
        expect(screen.getByRole("menuitem", { name: "Togli il tag" })).toBeInTheDocument()
        expect(onContextMenu).not.toHaveBeenCalled()
    })

    it.each(["tasks", "groups", "sections"] as const)("removes the tag from that %s only, not from the workspace", async kind => {
        const user = userEvent.setup()
        setup(kind)
        fireEvent.contextMenu(screen.getByTestId("tag-badge"))
        await user.click(await screen.findByRole("menuitem", { name: "Togli il tag" }))
        expect(mutations.assign).toHaveBeenCalledWith(bug, { kind, ids: [12] }, false)
        expect(mutations.remove).not.toHaveBeenCalled()
    })

    it("reports a failed removal", async () => {
        const user = userEvent.setup()
        mutations.assign.mockRejectedValueOnce(new Error("boom"))
        setup()
        fireEvent.contextMenu(screen.getByTestId("tag-badge"))
        await user.click(await screen.findByRole("menuitem", { name: "Togli il tag" }))
        await waitFor(() => expect(reportError).toHaveBeenCalled())
    })

    it("edits the tag in a dialog with the same name, shape and color controls as the tag list, and no delete", async () => {
        const user = userEvent.setup()
        setup()
        fireEvent.contextMenu(screen.getByTestId("tag-badge"))
        await user.click(await screen.findByRole("menuitem", { name: "Modifica tag…" }))
        const dialog = await screen.findByRole("dialog", { name: "Modifica tag" })
        expect(dialog).toBeInTheDocument()
        expect(screen.getByRole("radiogroup", { name: "Forma" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Elimina il tag" })).not.toBeInTheDocument()
        const field = screen.getByRole("textbox", { name: "Nome del tag" })
        await user.clear(field)
        await user.type(field, "Defect{Enter}")
        expect(mutations.rename).toHaveBeenCalledWith(bug, "Defect")
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("keeps clicks and keys of the dialog out of the row", async () => {
        const user = userEvent.setup()
        const onKeyDown = vi.fn()
        const onPointerDown = vi.fn()
        setup("tasks", { onKeyDown, onPointerDown })
        fireEvent.contextMenu(screen.getByTestId("tag-badge"))
        await user.click(await screen.findByRole("menuitem", { name: "Modifica tag…" }))
        const dialog = await screen.findByRole("dialog")
        onKeyDown.mockClear()
        onPointerDown.mockClear()
        fireEvent.keyDown(dialog, { key: "a" })
        fireEvent.pointerDown(dialog)
        expect(onKeyDown).not.toHaveBeenCalled()
        expect(onPointerDown).not.toHaveBeenCalled()
    })

    it("does not start a drag from a press with a button other than the main one", () => {
        const onPointerDown = vi.fn()
        setup("tasks", { onPointerDown })
        fireEvent.pointerDown(screen.getByTestId("tag-badge-trigger"), { button: 2 })
        expect(onPointerDown).not.toHaveBeenCalled()
        fireEvent.pointerDown(screen.getByTestId("tag-badge-trigger"), { button: 0 })
        expect(onPointerDown).toHaveBeenCalledTimes(1)
    })
})
