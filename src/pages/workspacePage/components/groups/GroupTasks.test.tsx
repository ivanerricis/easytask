import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GroupTasks } from "./GroupTasks"
import { makeDefaultSection, makeGroup, makeTask } from "@/test/ui-fixtures"
import type { Task } from "@/types/types"
import { PreferencesContext } from "@/contexts/preferences-context-object"

const drop = { zone: null as string | null, dragging: null as string | null }
const useNoteDrop = vi.fn((kind: string, id: number) => { void kind; void id; return { setNodeRef: vi.fn(), zone: drop.zone, active: drop.dragging ? { kind: drop.dragging } : null } })
const dnd = { targetSectionId: null as number | null, activeKind: null as string | null }
vi.mock("../note-dnd-state", () => ({
    useNoteDrop: (kind: string, id: number) => useNoteDrop(kind, id),
    useNoteDndSelector: (select: (state: unknown) => unknown) => select({ active: dnd.activeKind ? { kind: dnd.activeKind } : null, hover: { targetSectionId: dnd.targetSectionId } }),
}))
vi.mock("../tasks/AddTask", () => ({
    AddTask: ({ sectionId, inGroup }: { sectionId: number, inGroup?: boolean }) => <button>nuovo task {sectionId} {String(inGroup)}</button>,
}))
vi.mock("../tasks/TaskList", () => ({
    TaskList: ({ tasks, listKey, sectionId }: { tasks: Task[], listKey: string, sectionId: number }) => <>{tasks.map(task => <div key={task.id} data-list={listKey} data-section={sectionId}>{task.text}</div>)}</>,
}))

const refreshActiveNote = vi.fn()
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => ({ refreshActiveNote }) }))
const ensureDBDefaultSection = vi.fn()
vi.mock("@/db/queries/task", () => ({ ensureDBDefaultSection: (id: number) => ensureDBDefaultSection(id) }))
const reportError = vi.fn()
vi.mock("@/lib/report-error", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/report-error")>(), reportError: (...args: unknown[]) => reportError(...args) }))

beforeEach(() => {
    vi.clearAllMocks()
    drop.zone = null
    drop.dragging = null
    dnd.targetSectionId = null
    dnd.activeKind = null
    ensureDBDefaultSection.mockResolvedValue(9)
    refreshActiveNote.mockResolvedValue(undefined)
})

const withTasks = (...texts: string[]) => makeGroup({
    id: 4,
    defaultSection: makeDefaultSection({ id: 12, groupID: 4, tasks: texts.map((text, index) => makeTask({ id: index + 1, text })) }),
})

describe("GroupTasks", () => {
    it("lists the direct tasks with the group's new task button under them, for the default section", () => {
        const { container } = render(<GroupTasks group={withTasks("Uno", "Due")} />)

        expect(screen.getByText("Uno")).toBeInTheDocument()
        expect(screen.getByText("Due")).toBeInTheDocument()
        const button = screen.getByRole("button", { name: "nuovo task 12 true" })
        expect(button.compareDocumentPosition(screen.getByText("Due")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
        expect(container.querySelector("[data-direct-tasks]")).toBeInTheDocument()
    })

    it("gives the list of direct tasks the key and the section of the default section for the + lines", () => {
        render(<GroupTasks group={withTasks("Uno")} />)
        expect(screen.getByText("Uno")).toHaveAttribute("data-list", "s-12")
        expect(screen.getByText("Uno")).toHaveAttribute("data-section", "12")
    })

    it("registers the area as the droppable of the default section", () => {
        render(<GroupTasks group={withTasks("Uno")} />)
        expect(useNoteDrop).toHaveBeenCalledWith("section", 12)
    })

    it("shows only the button in a group without direct tasks", () => {
        const { container } = render(<GroupTasks group={withTasks()} />)
        expect(screen.getByRole("button", { name: "nuovo task 12 true" })).toBeInTheDocument()
        expect(container.querySelector(".border")).not.toBeInTheDocument()
    })

    it("outlines the area for a valid drop on it and for a task headed to it", () => {
        drop.zone = "after"
        const { container, rerender } = render(<GroupTasks group={withTasks("Uno")} />)
        expect(container.querySelector("[data-direct-tasks]")).toHaveClass("ring-2")

        drop.zone = null
        dnd.activeKind = "task"
        dnd.targetSectionId = 12
        rerender(<GroupTasks group={{ ...withTasks("Uno") }} />)
        expect(container.querySelector("[data-direct-tasks]")).toHaveClass("ring-2")

        dnd.targetSectionId = 13
        rerender(<GroupTasks group={{ ...withTasks("Uno") }} />)
        expect(container.querySelector("[data-direct-tasks]")).not.toHaveClass("ring-2")
    })

    it("draws an insertion line above or below the list for a dragged section, instead of outlining it, when the live drag is off", () => {
        drop.dragging = "section"
        drop.zone = "before"
        const tree = () => (
            <PreferencesContext.Provider value={{ liveDrag: false } as never}>
                <GroupTasks group={withTasks("Uno")} />
            </PreferencesContext.Provider>
        )
        const { container, rerender } = render(tree())
        const area = container.querySelector("[data-direct-tasks]") as HTMLElement
        expect(area).not.toHaveClass("ring-2")
        const line = area.querySelector(".bg-primary") as HTMLElement
        // Drawn inside the box, never outside: the list can be the first or last item of the scrolling area
        expect(line.className.split(/\s+/)).toContain("top-0")
        expect(line.className.split(/\s+/)).not.toContain("-top-[3px]")

        drop.zone = "after"
        rerender(tree())
        const after = (area.querySelector(".bg-primary") as HTMLElement).className.split(/\s+/)
        expect(after).toContain("bottom-0")
        expect(after).not.toContain("-bottom-[3px]")
    })

    it("draws no insertion line for a dragged section while the live drag is on: the sections step aside instead", () => {
        drop.dragging = "section"
        drop.zone = "before"
        const { container } = render(<GroupTasks group={withTasks("Uno")} />)
        expect(container.querySelector("[data-direct-tasks] .bg-primary")).toBeNull()
    })

    it("carries the attributes the live drag reads the layout from", () => {
        const { container } = render(<GroupTasks group={withTasks("Uno")} />)
        const area = container.querySelector("[data-direct-tasks]") as HTMLElement
        expect(area).toHaveAttribute("data-section-wrap", "12")
        expect(area).toHaveAttribute("data-section-group", "4")
    })

    it("positions the area so the insertion line is drawn inside it, with the classes kept apart", () => {
        const { container } = render(<GroupTasks group={withTasks("Uno")} />)
        const classes = (container.querySelector("[data-direct-tasks]") as HTMLElement).className.split(/\s+/)
        expect(classes).toEqual(expect.arrayContaining(["relative", "flex", "flex-col", "gap-1", "w-full", "rounded-xs"]))
    })

    it("creates the default section once when the group has none, then reloads the note", async () => {
        const group = makeGroup({ id: 4 })
        const { container, rerender } = render(<GroupTasks group={group} />)
        expect(container).toBeEmptyDOMElement()

        await waitFor(() => expect(refreshActiveNote).toHaveBeenCalledTimes(1))
        expect(ensureDBDefaultSection).toHaveBeenCalledWith(4)

        rerender(<GroupTasks group={{ ...group }} />)
        expect(ensureDBDefaultSection).toHaveBeenCalledTimes(1)
    })

    it("does not touch the database when the group has its default section", () => {
        render(<GroupTasks group={withTasks("Uno")} />)
        expect(ensureDBDefaultSection).not.toHaveBeenCalled()
    })

    it("reports the failure of the repair", async () => {
        ensureDBDefaultSection.mockRejectedValue(new Error("boom"))
        render(<GroupTasks group={makeGroup({ id: 4 })} />)
        await waitFor(() => expect(reportError).toHaveBeenCalled())
        expect(refreshActiveNote).not.toHaveBeenCalled()
    })
})
