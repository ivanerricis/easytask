import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Tag } from "@/types/types"
import { createTagsStore, WorkspaceTagsContext } from "@/contexts/workspace-data/tags"
import { GroupTagBadges } from "./GroupTagBadges"

// Radix tooltips measure their arrow with a ResizeObserver, which jsdom lacks
vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } })

const tag = (id: number, name: string, color: string | null = null): Tag => ({ id, workspaceID: 1, name, color, shape: null, position: id })
const TAGS = [tag(1, "Bug", "#ff0000"), tag(2, "Urgent"), tag(3, "Later", "#00ff00"), tag(4, "Idea"), tag(5, "Docs")]

const setup = (tagIDs: number[] | undefined, layout: "badges" | "dots" | "strip", tags: Tag[] = TAGS) => {
    const store = createTagsStore()
    store.set({ workspaceId: 1, tags })
    render(<WorkspaceTagsContext.Provider value={store}><GroupTagBadges tagIDs={tagIDs} layout={layout} /></WorkspaceTagsContext.Provider>)
    return store
}

describe("GroupTagBadges", () => {
    it("shows nothing for a group without tags or whose tags no longer exist", () => {
        setup(undefined, "badges")
        setup([99], "strip")
        expect(screen.queryByTestId("group-tags")).not.toBeInTheDocument()
    })

    it("shows the tags as badges in the order of the tag list, named as a group for the screen readers", () => {
        setup([3, 1], "badges")
        expect(screen.getAllByTestId("tag-badge").map(badge => badge.textContent)).toEqual(["Bug", "Later"])
        expect(screen.getByRole("group", { name: "Tag: Bug, Later" })).toBeInTheDocument()
    })

    it("shows a few badges and counts the others", () => {
        setup([1, 2, 3, 4, 5], "badges")
        expect(screen.getAllByTestId("tag-badge")).toHaveLength(3)
        expect(screen.getByText("+2")).toBeInTheDocument()
        // The name of the group lists all of them
        expect(screen.getByRole("group", { name: "Tag: Bug, Urgent, Later, Idea, Docs" })).toBeInTheDocument()
    })

    it("shows only dots in the colors of the tags in the narrow layouts, with the names as titles", () => {
        setup([1, 2, 3, 4], "strip")
        expect(screen.queryByTestId("tag-badge")).not.toBeInTheDocument()
        const dots = screen.getAllByTestId("group-tag-dot")
        expect(dots).toHaveLength(3)
        expect(dots[0].style.backgroundColor).toBe("rgb(255, 0, 0)")
        expect(dots[1]).toHaveClass("bg-muted-foreground/50")
        expect(dots.map(dot => dot.getAttribute("title"))).toEqual(["Bug", "Urgent", "Later"])
        expect(screen.getByText("+1")).toBeInTheDocument()
        expect(screen.getByRole("group", { name: /Bug, Urgent, Later, Idea/ })).toHaveClass("flex-col")
    })

    it("lays the dots of the narrow header in a row", () => {
        setup([1], "dots")
        expect(screen.getByRole("group", { name: "Tag: Bug" })).toHaveClass("flex-row")
    })

    it("follows a rename and a deletion of the tag in the store", () => {
        const store = setup([1, 2], "badges")
        act(() => store.set({ workspaceId: 1, tags: [tag(1, "Defect"), tag(2, "Urgent")] }))
        expect(screen.getAllByTestId("tag-badge").map(badge => badge.textContent)).toEqual(["Defect", "Urgent"])
        act(() => store.set({ workspaceId: 1, tags: [tag(2, "Urgent")] }))
        expect(screen.getAllByTestId("tag-badge").map(badge => badge.textContent)).toEqual(["Urgent"])
    })

    it("gives each badge its own menu when the owner is known, and plain badges otherwise", () => {
        const store = createTagsStore()
        store.set({ workspaceId: 1, tags: TAGS })
        const { unmount } = render(<WorkspaceTagsContext.Provider value={store}><GroupTagBadges tagIDs={[1, 2]} layout="badges" owner={{ kind: "sections", id: 4 }} /></WorkspaceTagsContext.Provider>)
        expect(screen.getAllByTestId("tag-badge-trigger")).toHaveLength(2)
        unmount()
        setup([1, 2], "badges")
        expect(screen.queryByTestId("tag-badge-trigger")).not.toBeInTheDocument()
    })
})
