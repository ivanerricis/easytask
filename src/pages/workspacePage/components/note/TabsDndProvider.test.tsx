import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { flushAsync } from "@/test/ui-render"
import type { Note } from "@/types/types"
import { SplitHarness } from "@/test/split-harness"
import { noopActions } from "@/test/split-fixtures"
import { LayoutActionsContext, type LayoutActionsType } from "@/contexts/layout-context-object"
import { PaneProvider } from "@/contexts/pane-provider"
import { NoteList } from "./NoteList"
import { TabsDndProvider } from "./TabsDndProvider"

const announce = vi.fn()
vi.mock("../tasks/note-announcer-store", () => ({ announce: (message: string) => announce(message) }))
let liveDrag: boolean | undefined = true
vi.mock("@/contexts/use-preference", () => ({ usePreference: (selector: (p: { liveDrag?: boolean }) => unknown) => selector({ liveDrag }) }))
// The tab itself: only what the bars read
vi.mock("./NoteHeader", () => ({
    NoteHeader: ({ note }: { note: Note }) => <button role="tab" data-note-id={note.id}>{note.name}</button>,
}))

const moveToPane = vi.fn()
const layoutActions: LayoutActionsType = {
    split: vi.fn(), unsplit: vi.fn(), toggleSplit: vi.fn(), focusPane: vi.fn(), openInPane: vi.fn(), moveToPane, getLayout: () => ({ left: { openIds: [], activeId: null }, right: null, focused: 0, isSplit: false }),
}
const reorder0 = vi.fn()
const reorder1 = vi.fn()
const activate0 = vi.fn()
const activate1 = vi.fn()

// jsdom lays nothing out: the left bar is x 0-300, the right one x 400-700, both y 0-42, tabs 100 wide
const rect = (left: number, width: number) =>
    ({ left, right: left + width, top: 0, bottom: 42, width, height: 42, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
const realRect = Element.prototype.getBoundingClientRect
beforeEach(() => {
    liveDrag = true
    Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.getAttribute("role") === "tablist") return rect(this.getAttribute("aria-label")?.includes("sinistra") ? 0 : 400, 300)
        const bar = this.parentElement
        if (bar?.getAttribute("role") === "tablist") {
            const base = bar.getAttribute("aria-label")?.includes("sinistra") ? 0 : 400
            return rect(base + 100 * Array.from(bar.children).indexOf(this), 100)
        }
        return realRect.call(this)
    }
})
afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect
    vi.clearAllMocks()
})

function Panes({ open0, open1 }: { open0: number[], open1: number[] }) {
    return (
        <LayoutActionsContext.Provider value={layoutActions}>
            <SplitHarness
                state={{ open0, active0: open0[0] ?? null, open1, active1: open1[0] ?? null, focused: 0 }}
                actions0={{ ...noopActions, reorderTabs: reorder0, activateNote: activate0 }}
                actions1={{ ...noopActions, reorderTabs: reorder1, activateNote: activate1 }}
            >
                <TabsDndProvider>
                    <PaneProvider pane={0}><NoteList /></PaneProvider>
                    <PaneProvider pane={1}><NoteList /></PaneProvider>
                </TabsDndProvider>
            </SplitHarness>
        </LayoutActionsContext.Provider>
    )
}

const left = () => screen.getByRole("tablist", { name: "Note aperte, Area sinistra" })
const right = () => screen.getByRole("tablist", { name: "Note aperte, Area destra" })
/** The box (draggable / droppable) of the tab of a note; the fixtures name every note "Note 1". */
const box = (id: number) => document.querySelector<HTMLElement>(`[role="tab"][data-note-id="${id}"]`)!.parentElement!

const settle = flushAsync
/** Lets the animation frame that writes the shifts run. */
const frame = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
const transformOf = (id: number) => box(id).style.transform
const pointer = (x: number, y: number) => ({ clientX: x, clientY: y, isPrimary: true, pointerId: 1 })

/** Drags a tab with the pointer: press it, move past the activation distance, then to the target, and (optionally) release. */
async function drag(tab: HTMLElement, from: [number, number], to: [number, number], release = true) {
    fireEvent.pointerDown(tab, { ...pointer(...from), button: 0 })
    fireEvent.pointerMove(document, pointer(from[0] + 10, from[1]))
    await settle()
    // dnd-kit reports the target of the previous render: a few moves, like a real pointer makes
    for (const offset of [0, 1, 0]) {
        fireEvent.pointerMove(document, pointer(to[0] + offset, to[1]))
        await settle()
    }
    if (release) {
        fireEvent.pointerUp(document, pointer(...to))
        await settle()
    }
}

describe("TabsDndProvider with two bars", () => {
    it("labels each bar with its pane", async () => {
        render(<Panes open0={[1, 2]} open1={[10]} />)
        expect(within(left()).getAllByRole("tab")).toHaveLength(2)
        expect(within(right()).getAllByRole("tab")).toHaveLength(1)
    })

    it("keeps an empty bar visible so it can receive a tab", async () => {
        render(<Panes open0={[1]} open1={[]} />)
        expect(right().className).toContain("min-h-[42px]")
        expect(within(right()).queryAllByRole("tab")).toHaveLength(0)
    })

    it("reorders the tabs of a bar dropped inside it", async () => {
        render(<Panes open0={[1, 2, 3]} open1={[10]} />)
        await drag(box(1), [50, 20], [280, 20])
        expect(reorder0).toHaveBeenCalledWith(0, 2)
        expect(moveToPane).not.toHaveBeenCalled()
        expect(reorder1).not.toHaveBeenCalled()
    })

    it("moves the note to the other pane at the drop position and announces it", async () => {
        render(<Panes open0={[1, 2]} open1={[10, 11]} />)
        // Left half of the second tab of the right bar: before it
        await drag(box(1), [50, 20], [510, 20])
        expect(moveToPane).toHaveBeenCalledWith(1, 1, 1)
        expect(announce).toHaveBeenCalledWith("Note 1 spostata in: Area destra.")
    })

    it("drops after the last tab when the pointer is past it", async () => {
        render(<Panes open0={[1, 2]} open1={[10, 11]} />)
        await drag(box(2), [150, 20], [690, 20])
        expect(moveToPane).toHaveBeenCalledWith(2, 1, 2)
    })

    it("moves a note from the right bar to the left one", async () => {
        render(<Panes open0={[1, 2]} open1={[10]} />)
        await drag(box(10), [450, 20], [10, 20])
        expect(moveToPane).toHaveBeenCalledWith(10, 0, 0)
        expect(announce).toHaveBeenCalledWith("Note 1 spostata in: Area sinistra.")
    })

    it("drops on an empty bar", async () => {
        render(<Panes open0={[1]} open1={[]} />)
        await drag(box(1), [50, 20], [550, 20])
        expect(moveToPane).toHaveBeenCalledWith(1, 1, 0)
    })

    it("draws the drop line in the hovered tab and shows the tab in the overlay while dragging (live drag off)", async () => {
        liveDrag = false
        const { container } = render(<Panes open0={[1]} open1={[10, 11]} />)
        await drag(box(1), [50, 20], [510, 20], false)
        expect(screen.getByTestId("tab-drag-overlay")).toHaveTextContent("Note 1")
        const target = box(11)
        expect(target.querySelector(".bg-primary")).not.toBeNull()
        expect(box(10).querySelector(".bg-primary")).toBeNull()
        fireEvent.pointerUp(document, pointer(510, 20))
        await settle()
        expect(container.querySelector("[data-testid='tab-drag-overlay']")).toBeNull()
        expect(target.querySelector(".bg-primary")).toBeNull()
    })

    it("drops nothing outside the bars", async () => {
        render(<Panes open0={[1, 2]} open1={[10]} />)
        await drag(box(1), [50, 20], [350, 20])
        expect(moveToPane).not.toHaveBeenCalled()
        expect(reorder0).not.toHaveBeenCalled()
    })

    it("cancels the drag with Escape", async () => {
        render(<Panes open0={[1, 2]} open1={[10]} />)
        await drag(box(1), [50, 20], [510, 20], false)
        fireEvent.keyDown(document, { key: "Escape", code: "Escape" })
        await settle()
        fireEvent.pointerUp(document, pointer(510, 20))
        await settle()
        expect(moveToPane).not.toHaveBeenCalled()
    })

    it("shows the line in an empty bar the tab hovers", async () => {
        render(<Panes open0={[1]} open1={[]} />)
        await drag(box(1), [50, 20], [550, 20], false)
        expect(right().querySelector(".bg-primary")).not.toBeNull()
        expect(left().querySelector(".bg-primary")).toBeNull()
        fireEvent.pointerUp(document, pointer(550, 20))
        await settle()
        expect(right().querySelector(".bg-primary")).toBeNull()
    })

    it("moves between the tabs of a bar with the arrows, without leaving it", () => {
        render(<Panes open0={[1, 2]} open1={[10, 11]} />)
        fireEvent.keyDown(document.querySelector('[role="tab"][data-note-id="11"]')!, { key: "ArrowRight" })
        expect(activate1).toHaveBeenCalledWith(10)
        expect(activate0).not.toHaveBeenCalled()
    })
})

describe("TabsDndProvider with a single bar", () => {
    const Single = () => (
        <SplitHarness
            state={{ open0: [1, 2, 3], active0: 1, open1: [], active1: null, focused: 0 }}
            actions0={{ ...noopActions, reorderTabs: reorder0 }}
        >
            <TabsDndProvider split={false}><NoteList /></TabsDndProvider>
        </SplitHarness>
    )

    it("reorders the tabs of the only bar, without overlay (live drag off)", async () => {
        liveDrag = false
        render(<Single />)
        expect(screen.getByRole("tablist", { name: "Note aperte" }).className).not.toContain("min-h-")
        await drag(box(1), [450, 20], [680, 20], false)
        expect(screen.queryByTestId("tab-drag-overlay")).toBeNull()
        fireEvent.pointerUp(document, pointer(680, 20))
        await settle()
        expect(reorder0).toHaveBeenCalledWith(0, 2)
        expect(moveToPane).not.toHaveBeenCalled()
    })
})

describe("TabsDndProvider live drag", () => {
    it("opens the room in the hovered bar and closes it in the source bar, hiding the dragged tab", async () => {
        const { container } = render(<Panes open0={[1, 2]} open1={[10, 11]} />)
        // Left half of the first tab of the right bar: before it
        await drag(box(1), [50, 20], [410, 20], false)
        await frame()
        expect(transformOf(10)).toBe("translate3d(100px, 0, 0)")
        expect(transformOf(11)).toBe("translate3d(100px, 0, 0)")
        expect(transformOf(2)).toBe("translate3d(-100px, 0, 0)")
        expect(box(1).style.opacity).toBe("0")
        // The tabs step aside instead of the drop line
        expect(container.querySelector(".bg-primary")).toBeNull()
        expect(screen.getByTestId("tab-drag-overlay")).toHaveTextContent("Note 1")
        fireEvent.pointerUp(document, pointer(410, 20))
        await settle()
        expect(moveToPane).toHaveBeenCalledWith(1, 1, 0)
    })

    it("moves the tabs between the dragged one and the place inside a bar, following the pointer", async () => {
        render(<Panes open0={[1, 2, 3]} open1={[10]} />)
        await drag(box(1), [50, 20], [280, 20], false) // after the third tab
        await frame()
        expect([transformOf(1), transformOf(2), transformOf(3)]).toEqual(["", "translate3d(-100px, 0, 0)", "translate3d(-100px, 0, 0)"])
        fireEvent.pointerMove(document, pointer(210, 20)) // before the third tab
        await settle()
        await frame()
        expect([transformOf(2), transformOf(3)]).toEqual(["translate3d(-100px, 0, 0)", ""])
        fireEvent.pointerUp(document, pointer(210, 20))
        await settle()
        expect(reorder0).toHaveBeenCalledWith(0, 1)
    })

    it("moves nothing over its own place, nor over an empty bar (which keeps its drop line)", async () => {
        render(<Panes open0={[1, 2]} open1={[]} />)
        await drag(box(1), [50, 20], [550, 20], false)
        await frame()
        expect([transformOf(1), transformOf(2)]).toEqual(["", ""])
        expect(right().querySelector(".bg-primary")).not.toBeNull()
        fireEvent.pointerMove(document, pointer(110, 20)) // over the second tab, left half: where the first one already ends up before it
        await settle()
        fireEvent.pointerMove(document, pointer(120, 20))
        await settle()
        await frame()
        expect([transformOf(1), transformOf(2)]).toEqual(["", ""])
    })

    it("a single bar also uses the overlay: the tab stays in place, hidden, and the others step aside", async () => {
        const { container } = render(
            <SplitHarness state={{ open0: [1, 2, 3], active0: 1, open1: [], active1: null, focused: 0 }} actions0={{ ...noopActions, reorderTabs: reorder0 }}>
                <TabsDndProvider split={false}><NoteList /></TabsDndProvider>
            </SplitHarness>,
        )
        await drag(box(1), [450, 20], [680, 20], false)
        await frame()
        expect(screen.getByTestId("tab-drag-overlay")).toHaveTextContent("Note 1")
        expect(box(1).style.opacity).toBe("0")
        expect([transformOf(2), transformOf(3)]).toEqual(["translate3d(-100px, 0, 0)", "translate3d(-100px, 0, 0)"])
        expect(container.querySelector(".bg-primary")).toBeNull()
        fireEvent.pointerUp(document, pointer(680, 20))
        await settle()
        expect(reorder0).toHaveBeenCalledWith(0, 2)
    })

    it("puts the tabs back when the drag is cancelled", async () => {
        render(<Panes open0={[1, 2, 3]} open1={[10]} />)
        await drag(box(1), [50, 20], [280, 20], false)
        await frame()
        expect(transformOf(2)).not.toBe("")
        fireEvent.keyDown(document, { key: "Escape", code: "Escape" })
        await settle()
        await frame()
        expect([transformOf(1), transformOf(2), transformOf(3)]).toEqual(["", "", ""])
        expect(box(1).style.opacity).toBe("")
    })

    it("moves nothing when the live drag is off", async () => {
        liveDrag = false
        render(<Panes open0={[1, 2, 3]} open1={[10]} />)
        await drag(box(1), [50, 20], [280, 20], false)
        await frame()
        expect([transformOf(2), transformOf(3)]).toEqual(["", ""])
    })
})
