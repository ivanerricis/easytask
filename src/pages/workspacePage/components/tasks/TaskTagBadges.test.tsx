import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { Tag } from "@/types/types"
import { createTagsStore, WorkspaceTagsContext } from "@/contexts/workspace-data/tags"
import { TaskTagBadges } from "./TaskTagBadges"

const tag = (id: number, name: string, color: string | null = null): Tag => ({ id, workspaceID: 1, name, color, position: id })

const setup = (tags: Tag[], tagIDs: number[]) => {
    const store = createTagsStore()
    store.set({ workspaceId: 1, tags })
    render(<WorkspaceTagsContext.Provider value={store}><TaskTagBadges tagIDs={tagIDs} /></WorkspaceTagsContext.Provider>)
    return store
}

describe("TaskTagBadges", () => {
    it("shows the name of every tag of the task, in the order of the tag list", () => {
        setup([tag(1, "Bug"), tag(2, "Urgent"), tag(3, "Later")], [3, 1])
        expect(screen.getAllByTestId("tag-badge").map(badge => badge.textContent)).toEqual(["Bug", "Later"])
        expect(screen.getByRole("group", { name: "Tag: Bug, Later" })).toBeInTheDocument()
    })

    it("shows nothing when no tag of the task exists (a deleted tag, a task without tags)", () => {
        setup([tag(1, "Bug")], [7])
        expect(screen.queryByTestId("task-tags")).not.toBeInTheDocument()
    })

    it("tints the pill with the color of the tag and keeps the theme text color; a tag without color is neutral", () => {
        setup([tag(1, "Red", "#ff0000"), tag(2, "Plain")], [1, 2])
        const [red, plain] = screen.getAllByTestId("tag-badge")
        expect(red.style.backgroundColor).toMatch(/^rgba\(255, 0, 0, /)
        expect(red.style.borderColor).toMatch(/^rgba\(255, 0, 0, /)
        expect(red).toHaveClass("text-foreground")
        expect(plain.style.backgroundColor).toBe("")
    })

    it("wraps on more lines and cuts a long name, whose full text is the title", () => {
        const long = "x".repeat(200)
        setup([tag(1, long), tag(2, "B"), tag(3, "C"), tag(4, "D")], [1, 2, 3, 4])
        expect(screen.getByTestId("task-tags")).toHaveClass("flex-wrap", "min-w-0")
        const [first] = screen.getAllByTestId("tag-badge")
        expect(first).toHaveAttribute("title", long)
        expect(first).toHaveClass("max-w-32")
        expect(first.querySelector(".truncate")).not.toBeNull()
    })

    it("follows a rename and a deletion of the tag in the store", () => {
        const store = setup([tag(1, "Bug"), tag(2, "Urgent")], [1, 2])
        act(() => store.set({ workspaceId: 1, tags: [tag(1, "Defect"), tag(2, "Urgent")] }))
        expect(screen.getAllByTestId("tag-badge").map(badge => badge.textContent)).toEqual(["Defect", "Urgent"])
        act(() => store.set({ workspaceId: 1, tags: [tag(2, "Urgent")] }))
        expect(screen.getAllByTestId("tag-badge").map(badge => badge.textContent)).toEqual(["Urgent"])
    })
})
