import { useEffect } from "react"
import type { ReactNode } from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GroupContainer } from "./GroupContainer"
import { useTabsActions } from "@/contexts/use-tabs"
import { useGroupMoves } from "../note-dnd-state"
import { getDBNoteData, updateDBNoteBackground } from "@/db/queries/note"
import { getDBNoteAudioFiles } from "@/db/queries/audio"
import { updateDBGroupPositions } from "@/db/queries/group"
import { deferred, renderWithProviders } from "@/test/ui-render"
import { makeGroup } from "@/test/ui-fixtures"
import { APP_COMMAND_EVENT } from "@/lib/app-commands"
import { ItemMenu } from "@/components/item-menu"
import { MenuItem } from "@/components/menu-kind"
import { useItemMenuState } from "@/hooks/use-item-menu-state"

vi.mock("@/db/queries/workspace", () => ({ getDBWorkspaces: vi.fn(), createDBWorkspace: vi.fn(), getDBWorkspaceData: vi.fn() }))
vi.mock("@/db/queries/note", () => ({ getDBNoteData: vi.fn(), createDBNoteInFolder: vi.fn(), createDBWorkspaceNote: vi.fn(), updateDBNoteBackground: vi.fn() }))
vi.mock("@/db/queries/folder", () => ({ createDBSubFolder: vi.fn(), createDBWorkspaceFolder: vi.fn(), updateDBFolderColorContent: vi.fn() }))
vi.mock("@/db/queries/section", () => ({ createDBSection: vi.fn(), createDBSectionInGroup: vi.fn() }))
vi.mock("@/db/queries/task", () => ({
    createDBSubTask: vi.fn(), createDBTask: vi.fn(), updateDBTaskCompletion: vi.fn(),
    updateDBTaskDescription: vi.fn(), updateDBTaskPriority: vi.fn(),
}))
vi.mock("@/db/queries/group", () => ({ updateDBGroupPositions: vi.fn() }))
vi.mock("@/db/queries/shared_queries", () => ({ renameDBItem: vi.fn(), updateDBColor: vi.fn(), deleteDBItem: vi.fn() }))

const setHideCompletedTasks = vi.fn()
const prefs = { showAudioFileCount: true, showGroupSeparators: false, hideCompletedTasks: false, setHideCompletedTasks }
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))
vi.mock("@/db/queries/audio", () => ({ getDBGroupAudioFiles: vi.fn(), getDBNoteAudioFiles: vi.fn() }))
vi.mock("@/db/queries/media", () => ({ getDBGroupMediaFiles: vi.fn(async () => []), getDBNoteMediaCounts: vi.fn(async () => ({})) }))

// The group stub exposes the move the drag & drop runs on drop (the real dnd-kit drag is not drivable in jsdom)
let moveGroupTo: (groupId: number, index: number) => Promise<void>
vi.mock("./Group", () => ({
    Group: function GroupStub({ group }: { group: { id: number } }) {
        moveGroupTo = useGroupMoves().moveGroupTo
        const menu = useItemMenuState()
        // Like the real group: its own menu on its right click
        return <ItemMenu state={menu} items={<MenuItem>Menu del gruppo</MenuItem>}><div data-testid="group">{group.id}</div></ItemMenu>
    },
}))
vi.mock("../section/AddSection", () => ({ AddSection: () => null }))

function SelectNote({ children }: { children: ReactNode }) {
    const { openNote } = useTabsActions()
    useEffect(() => { openNote(1) }, [openNote])
    return <>{children}</>
}

const order = () => screen.getAllByTestId("group").map(el => el.textContent)

describe("GroupContainer reorder", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        prefs.showGroupSeparators = false
        prefs.hideCompletedTasks = false
        vi.mocked(getDBNoteAudioFiles).mockResolvedValue({})
        vi.mocked(getDBNoteData).mockResolvedValue({
            groups: [makeGroup({ id: 1, position: 0 }), makeGroup({ id: 2, position: 1 }), makeGroup({ id: 3, position: 2 })],
            sections: [],
            tasks: [],
        } as never)
        vi.spyOn(console, "error").mockImplementation(() => {})
    })

    const renderLoaded = async () => {
        renderWithProviders(<SelectNote><GroupContainer /></SelectNote>)
        await waitFor(() => expect(screen.getAllByTestId("group")).toHaveLength(3))
    }

    it("loads the groups of the current note sorted by position", async () => {
        await renderLoaded()
        expect(order()).toEqual(["1", "2", "3"])
        expect(getDBNoteData).toHaveBeenCalledWith(1)
    })

    it("shows the new order immediately and persists it", async () => {
        const pending = deferred()
        vi.mocked(updateDBGroupPositions).mockReturnValue(pending.promise as never)
        await renderLoaded()

        let done!: Promise<void>
        await act(async () => { done = moveGroupTo(1, 2) })

        // Optimistic: visible while the write is still pending
        expect(order()).toEqual(["2", "3", "1"])

        await act(async () => {
            pending.resolve()
            await done
        })
        expect(order()).toEqual(["2", "3", "1"])
        const saved = vi.mocked(updateDBGroupPositions).mock.calls[0][0]
        expect(saved.map(g => [g.id, g.position])).toEqual([[2, 0], [3, 1], [1, 2]])
    })

    it("rolls back to the previous order when persisting fails", async () => {
        const pending = deferred()
        vi.mocked(updateDBGroupPositions).mockReturnValue(pending.promise as never)
        await renderLoaded()

        let done!: Promise<void>
        await act(async () => { done = moveGroupTo(1, 1) })
        expect(order()).toEqual(["2", "1", "3"])

        await act(async () => {
            pending.reject(new Error("db error"))
            await done
        })
        expect(order()).toEqual(["1", "2", "3"])
    })

    it("shows the empty note hints only when the note has no groups", async () => {
        vi.mocked(getDBNoteData).mockResolvedValue({ groups: [], sections: [], tasks: [] } as never)
        renderWithProviders(<SelectNote><GroupContainer /></SelectNote>)
        expect(await screen.findByText("Nota vuota")).toBeTruthy()
    })

    it("does not show the empty note hints when there are groups", async () => {
        await renderLoaded()
        expect(screen.queryByText("Nota vuota")).toBeNull()
    })

    it("draws no guide line between groups by default", async () => {
        await renderLoaded()
        expect(screen.queryAllByTestId("group-separator")).toHaveLength(0)
    })

    it("draws an aria-hidden vertical line between adjacent groups when enabled", async () => {
        prefs.showGroupSeparators = true
        await renderLoaded()
        const lines = screen.getAllByTestId("group-separator")
        expect(lines).toHaveLength(2)
        lines.forEach(line => expect(line).toHaveAttribute("aria-hidden", "true"))
    })

    describe("right click on the empty area", () => {
        const emptyArea = () => screen.getByTestId("group-scroll")

        it("opens a menu with exactly the new group and the hide completed entries", async () => {
            await renderLoaded()
            fireEvent.contextMenu(emptyArea())
            const items = screen.getAllByRole("menuitem")
            expect(items.map(item => item.textContent)).toEqual([
                expect.stringContaining("Nuovo gruppo"),
                expect.stringContaining("Nascondi task completati"),
                expect.stringContaining("Sfondo della nota"),
            ])
        })

        it("opens it on an empty note too", async () => {
            vi.mocked(getDBNoteData).mockResolvedValue({ groups: [], sections: [], tasks: [] } as never)
            renderWithProviders(<SelectNote><GroupContainer /></SelectNote>)
            await screen.findByText("Nota vuota")
            fireEvent.contextMenu(screen.getByText("Nota vuota"))
            expect(screen.getAllByRole("menuitem")).toHaveLength(3)
        })

        it("saves the background chosen in the palette of the note background entry", async () => {
            const user = userEvent.setup()
            await renderLoaded()
            fireEvent.contextMenu(emptyArea())
            await user.click(screen.getByRole("menuitem", { name: /Sfondo della nota/ }))
            fireEvent.click(await screen.findByRole("radio", { name: "Colore Rosso" }))
            await waitFor(() => expect(updateDBNoteBackground).toHaveBeenCalledWith(1, expect.stringMatching(/^#/)))
        })

        it("asks for the new group form once the menu has closed", async () => {
            const commands: string[] = []
            const onCommand = (event: Event) => commands.push((event as CustomEvent<string>).detail)
            window.addEventListener(APP_COMMAND_EVENT, onCommand)
            await renderLoaded()
            fireEvent.contextMenu(emptyArea())
            await userEvent.setup().click(screen.getByRole("menuitem", { name: /Nuovo gruppo/ }))
            await waitFor(() => expect(commands).toEqual(["new-group"]))
            window.removeEventListener(APP_COMMAND_EVENT, onCommand)
        })

        it("toggles the completed tasks and flips its label", async () => {
            await renderLoaded()
            fireEvent.contextMenu(emptyArea())
            await userEvent.setup().click(screen.getByRole("menuitem", { name: /Nascondi task completati/ }))
            expect(setHideCompletedTasks).toHaveBeenCalledWith(true)
        })

        it("offers to show the completed tasks when they are hidden", async () => {
            prefs.hideCompletedTasks = true
            await renderLoaded()
            fireEvent.contextMenu(emptyArea())
            await userEvent.setup().click(screen.getByRole("menuitem", { name: /Mostra task completati/ }))
            expect(setHideCompletedTasks).toHaveBeenCalledWith(false)
        })

        it("leaves the right click on a group to the menu of the group", async () => {
            await renderLoaded()
            fireEvent.contextMenu(screen.getAllByTestId("group")[0])
            expect(screen.getByRole("menuitem", { name: "Menu del gruppo" })).toBeInTheDocument()
            expect(screen.queryByRole("menuitem", { name: /Nuovo gruppo/ })).toBeNull()
        })

        it("scrolls the groups sideways with the global scrollbar (no scrollbar styles of its own)", async () => {
            await renderLoaded()
            // Whole classes: two of them glued together by a missing space are no class at all
            const classes = emptyArea().className.split(/\s+/)
            expect(classes).toContain("overflow-x-auto")
            expect(classes.some(name => name.includes("scrollbar"))).toBe(false)
        })
    })
})
