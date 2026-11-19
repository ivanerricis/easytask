import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SKELETON_DELAY_MS } from "@/hooks/use-delayed-flag"
import { WorkspacesContainer } from "./WorkspacesContainer"
import { makeWorkspace } from "@/test/ui-fixtures"

vi.mock("./WorkSpace", () => ({
    WorkSpaceItem: ({ workspace }: { workspace: { name: string } }) => <li>{workspace.name}</li>,
}))

const list = [
    makeWorkspace({ id: 1, name: "Banana", edit_date: "2026-03-01" }),
    makeWorkspace({ id: 2, name: "Apple", edit_date: "2026-03-03" }),
    makeWorkspace({ id: 3, name: "Cherry", edit_date: "2026-03-02" }),
]
const names = () => screen.getAllByRole("listitem").map(li => li.textContent)

describe("WorkspacesContainer", () => {
    it("lists the last edited workspace first by default", () => {
        render(<WorkspacesContainer workspaces={list} />)
        expect(names()).toEqual(["Apple", "Cherry", "Banana"])
    })

    it("applies the given sort", () => {
        render(<WorkspacesContainer workspaces={list} sort={{ by: "name", dir: "desc" }} />)
        expect(names()).toEqual(["Cherry", "Banana", "Apple"])
    })

    it("re-sorts when the sort changes", () => {
        const { rerender } = render(<WorkspacesContainer workspaces={list} sort={{ by: "name", dir: "asc" }} />)
        expect(names()).toEqual(["Apple", "Banana", "Cherry"])
        rerender(<WorkspacesContainer workspaces={list} sort={{ by: "edited", dir: "asc" }} />)
        expect(names()).toEqual(["Banana", "Cherry", "Apple"])
    })

    it("while loading announces it and draws skeleton cards only after a short delay, with no workspaces nor empty message", () => {
        vi.useFakeTimers()
        try {
            const { container } = render(<WorkspacesContainer workspaces={[]} loading />)
            expect(screen.getByRole("status")).toHaveTextContent("Caricamento dei workspace")
            expect(screen.queryByText("Nessun workspace trovato.")).not.toBeInTheDocument()
            expect(container.querySelectorAll("[data-slot=skeleton]")).toHaveLength(0)
            act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS) })
            expect(container.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(0)
        } finally {
            vi.useRealTimers()
        }
    })
})
