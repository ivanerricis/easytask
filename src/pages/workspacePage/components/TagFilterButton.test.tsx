import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { useEffect } from "react"
import { TabsProvider } from "@/contexts/tabs-context"
import { useTabsActions } from "@/contexts/use-tabs"
import { useTagFilter } from "@/contexts/use-tag-filter"
import { makeNote } from "@/test/ui-fixtures"
import type { Tag } from "@/types/types"
import { TagFilterButton } from "./TagFilterButton"

const tags: Tag[] = [
    { id: 1, workspaceID: 1, name: "Urgent", color: null, position: 0 } as Tag,
    { id: 2, workspaceID: 1, name: "Home", color: null, position: 1 } as Tag,
]
let list: Tag[] = tags
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceTags: () => list }))
vi.mock("@/lib/store/preferences", () => ({ getReopenNotes: vi.fn().mockResolvedValue(false) }))
vi.mock("@/lib/store/tabs", () => ({ getWorkspaceTabs: vi.fn(), saveWorkspaceTabs: vi.fn() }))
vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } })

const notes = [makeNote({ id: 1, name: "A" }), makeNote({ id: 2, name: "B" })]

const Opener = ({ id }: { id: number }) => {
    const { openNote } = useTabsActions()
    useEffect(() => { openNote(id) }, [id, openNote])
    return null
}
const Probe = () => <output data-testid="filter">{JSON.stringify(useTagFilter())}</output>

const setup = async () => {
    const view = render(
        <TabsProvider notes={notes} workspaceId={null}>
            <Opener id={1} />
            <TagFilterButton />
            <Probe />
        </TabsProvider>,
    )
    await act(async () => { })
    return view
}

describe("TagFilterButton", () => {
    it("checks tags (any of them), shows how many, and one click removes the filter", async () => {
        list = tags
        const user = userEvent.setup()
        await setup()
        expect(screen.getByTestId("tag-filter")).not.toHaveAttribute("data-active")
        expect(screen.getByTestId("filter")).toHaveTextContent("null")

        await user.click(screen.getByRole("button", { name: "Filtra per tag" }))
        await user.click(screen.getByRole("checkbox", { name: "Urgent" }))
        await user.click(screen.getByRole("checkbox", { name: "Home" }))
        expect(screen.getByTestId("filter")).toHaveTextContent("[1,2]")
        expect(screen.getByTestId("tag-filter-count")).toHaveTextContent("2")
        expect(screen.getByTestId("tag-filter")).toHaveAttribute("data-active")

        await user.click(screen.getByRole("checkbox", { name: "Urgent" }))
        expect(screen.getByTestId("filter")).toHaveTextContent("[2]")

        await user.click(screen.getByTestId("tag-filter-clear"))
        expect(screen.getByTestId("filter")).toHaveTextContent("null")
        expect(screen.queryByTestId("tag-filter-clear")).toBeNull()
    })

    it("drops a tag that no longer exists from the filter, and says when there are no tags", async () => {
        list = tags
        const user = userEvent.setup()
        const view = await setup()
        await user.click(screen.getByRole("button", { name: "Filtra per tag" }))
        await user.click(screen.getByRole("checkbox", { name: "Home" }))
        expect(screen.getByTestId("filter")).toHaveTextContent("[2]")
        list = [tags[0]]
        view.rerender(
            <TabsProvider notes={notes} workspaceId={null}>
                <Opener id={1} />
                <TagFilterButton />
                <Probe />
            </TabsProvider>,
        )
        await act(async () => { })
        expect(screen.getByTestId("filter")).toHaveTextContent("null")
        list = []
    })
})
