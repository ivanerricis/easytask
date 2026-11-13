import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Group } from "./Group"
import { makeDefaultSection, makeGroup, makeSection } from "@/test/ui-fixtures"
import { PreferencesContext, type PreferencesContextType } from "@/contexts/preferences-context-object"

const groupOpen = { value: true }
const toggleOpen = vi.fn()
vi.mock("@/contexts/use-tabs", () => ({ useActiveNoteId: () => null, useGroupOpen: () => [groupOpen.value, toggleOpen] }))
vi.mock("../note-dnd-state", () => ({
    useNoteDrop: () => ({ setNodeRef: vi.fn(), zone: null, active: null }),
    useNoteDrag: () => ({ setNodeRef: vi.fn(), setActivatorNodeRef: vi.fn(), attributes: {}, listeners: {}, isDragging: false }),
}))
// The header is a sibling of the button that stands for the "Nuova sezione" entry of its menu
vi.mock("./GroupHeader", () => ({
    GroupHeader: ({ compact, onAddSection }: { compact?: boolean, onAddSection?: () => void }) =>
        <><div data-compact={String(!!compact)}>header</div><button onClick={onAddSection}>menu nuova sezione</button></>,
}))
const setGroupWidth = vi.fn()
const patchGroup = vi.fn()
const rollback = vi.fn()
const reportError = vi.fn()
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ setGroupWidth }) }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => ({ patchGroup }) }))
vi.mock("@/lib/report-error", async importOriginal => ({ ...await importOriginal<object>(), reportError: (...args: unknown[]) => reportError(...args) }))
vi.mock("./GroupAudioFiles", () => ({ GroupAudioFiles: () => <div data-testid="audio-files" /> }))
vi.mock("../section/Section", () => ({ Section: ({ section }: { section: { id: number } }) => <div data-mock={`s${section.id}`}>section</div> }))
vi.mock("./GroupTasks", () => ({ GroupTasks: () => <div data-mock="list">direct tasks</div> }))
vi.mock("../section/AddSection", () => ({
    AddSection: ({ open, onClose }: { open?: boolean, onClose?: () => void }) => open ? <button onClick={onClose}>form sezione</button> : null,
}))

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []
    disconnected = false
    callback: () => void
    constructor(callback: () => void) {
        this.callback = callback
        FakeResizeObserver.instances.push(this)
    }
    observe() { /* the width is read by the callback */ }
    disconnect() { this.disconnected = true }
    fire() { this.callback() }
}

let width = 0

beforeEach(() => {
    groupOpen.value = true
    toggleOpen.mockClear()
    setGroupWidth.mockReset().mockResolvedValue(undefined)
    patchGroup.mockReset().mockReturnValue(rollback)
    rollback.mockReset()
    reportError.mockReset()
    FakeResizeObserver.instances = []
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width }) as DOMRect)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** The root element of the group (the one that gets the minimum width). */
const root = () => screen.getByText("header").parentElement as HTMLElement

describe("Group panel", () => {
    it("is a light tint of the color of the group, with the color as the band at the top", () => {
        render(<Group group={makeGroup({ id: 101, color: "#ff0000" })} />)
        expect(root().style.backgroundColor).toBe("rgba(255, 0, 0, 0.16)")
        expect(root().style.borderTopColor).toBe("rgb(255, 0, 0)")
        expect(root()).not.toHaveClass("bg-secondary")
    })

    it("scales the tint by the color intensity preference", () => {
        render(
            <PreferencesContext.Provider value={{ colorIntensity: 1.5 } as PreferencesContextType}>
                <Group group={makeGroup({ id: 102, color: "#ff0000" })} />
            </PreferencesContext.Provider>,
        )
        expect(root().style.backgroundColor).toBe("rgba(255, 0, 0, 0.24)")
    })

    it("is gray without a color", () => {
        render(<Group group={makeGroup({ id: 103, color: null })} />)
        expect(root().style.backgroundColor).toBe("")
        expect(root()).toHaveClass("bg-secondary")
    })
})

describe("Group when collapsed", () => {
    it("is a narrow strip without its content and without the resize handle", () => {
        groupOpen.value = false
        render(<Group group={makeGroup({ id: 104, sections: [makeSection({ id: 1 })] })} />)
        expect(root()).toHaveClass("w-11")
        expect(screen.queryByText("section")).not.toBeInTheDocument()
        expect(screen.queryByRole("separator")).not.toBeInTheDocument()
    })

    it("drops the explicit width while closed and gets it back on opening", () => {
        groupOpen.value = false
        const group = makeGroup({ id: 105, width: 400 })
        const { rerender } = render(<Group group={group} />)
        expect(root().style.width).toBe("")
        groupOpen.value = true
        rerender(<Group group={{ ...group }} />)
        expect(root().style.width).toBe("400px")
    })
})

describe("Group when collapsed with the horizontal layout", () => {
    const horizontal = (children: React.ReactNode) => (
        <PreferencesContext.Provider value={{ collapsedGroupLayout: "horizontal" } as PreferencesContextType}>{children}</PreferencesContext.Provider>
    )

    it("stays a bar: no strip, no content, the resize handle stays", () => {
        groupOpen.value = false
        render(horizontal(<Group group={makeGroup({ id: 111, sections: [makeSection({ id: 1 })] })} />))
        expect(root()).not.toHaveClass("w-11")
        expect(root()).toHaveClass("min-w-[250px]")
        expect(root()).toHaveAttribute("data-collapsed-layout", "horizontal")
        expect(screen.queryByText("section")).not.toBeInTheDocument()
        expect(screen.getByRole("separator")).toBeInTheDocument()
    })

    it("keeps the explicit width while closed", () => {
        groupOpen.value = false
        render(horizontal(<Group group={makeGroup({ id: 112, width: 400 })} />))
        expect(root().style.width).toBe("400px")
    })

    it("keeps the width it had while open (the content-driven one) when closed", () => {
        width = 333
        const group = makeGroup({ id: 113, width: null })
        const { rerender } = render(horizontal(<Group group={group} />))
        groupOpen.value = false
        rerender(horizontal(<Group group={{ ...group }} />))
        expect(root().style.minWidth).toBe("333px")
        width = 0
    })

    it("does not record a width while closed", () => {
        width = 280
        const group = makeGroup({ id: 114, width: null })
        const { rerender } = render(horizontal(<Group group={group} />))
        groupOpen.value = false
        width = 90
        rerender(horizontal(<Group group={{ ...group }} />))
        FakeResizeObserver.instances.forEach(observer => observer.fire())
        expect(root().style.minWidth).toBe("280px")
        width = 0
    })
})

describe("Group scrolling area", () => {
    it("is wider on the left and ends at the edge of the group, so its scrollbar is entirely under the header", () => {
        render(<Group group={makeGroup({ id: 301, sections: [makeSection({ id: 1 })] })} />)
        const area = screen.getByText("section").parentElement as HTMLElement
        const classes = area.className.split(/\s+/)
        // No offset on the right (the resize handle is outside the group): only a little padding for the drop rings
        for (const token of ["overflow-y-auto", "-ml-1.5", "pl-1.5", "pr-0.5", "-my-1", "py-1"]) expect(classes).toContain(token)
    })

    it("leaves the audio files out of it, so they stay put while the sections scroll", () => {
        render(<Group group={makeGroup({ id: 302, sections: [makeSection({ id: 1 })] })} />)
        const area = screen.getByText("section").parentElement as HTMLElement
        expect(area.contains(screen.getByTestId("audio-files"))).toBe(false)
    })
})

describe("Group explicit width", () => {
    const handle = () => screen.getByRole("separator")
    const drag = (by: number) => {
        fireEvent.mouseDown(handle(), { clientX: 100 })
        fireEvent.mouseMove(window, { clientX: 100 + by })
    }

    it("applies the saved width and drops the cap of the content-driven one", () => {
        render(<Group group={makeGroup({ id: 201, width: 480 })} />)
        expect(root().style.width).toBe("480px")
        expect(root()).not.toHaveClass("max-w-[32rem]")
    })

    it("keeps the old behaviour when the width is null", () => {
        render(<Group group={makeGroup({ id: 202, width: null })} />)
        expect(root().style.width).toBe("")
        expect(root()).toHaveClass("max-w-[32rem]")
    })


    it("follows the drag live and saves the width once, on mouse up", async () => {
        render(<Group group={makeGroup({ id: 204 })} />)
        drag(60)
        expect(root().style.width).toBe("310px")
        expect(patchGroup).not.toHaveBeenCalled()

        fireEvent.mouseUp(window)
        await waitFor(() => expect(setGroupWidth).toHaveBeenCalledTimes(1))
        expect(patchGroup).toHaveBeenCalledWith(204, { width: 310 })
        expect(setGroupWidth).toHaveBeenCalledWith(204, 310)
    })

    it("restores the previous width and reports the error when saving fails", async () => {
        setGroupWidth.mockRejectedValue(new Error("boom"))
        render(<Group group={makeGroup({ id: 205, width: 400 })} />)
        drag(50)
        fireEvent.mouseUp(window)

        await waitFor(() => expect(reportError).toHaveBeenCalled())
        expect(rollback).toHaveBeenCalled()
        expect(String(reportError.mock.calls[0][1])).toContain("boom")
        expect(root().style.width).toBe("400px")
    })

    it("goes back to the automatic width on double click", async () => {
        render(<Group group={makeGroup({ id: 206, width: 400 })} />)
        fireEvent.doubleClick(handle())
        await waitFor(() => expect(setGroupWidth).toHaveBeenCalledWith(206, null))
        expect(patchGroup).toHaveBeenCalledWith(206, { width: null })
    })

    it("does not start the drag of the group from the handle", () => {
        const onPointerDown = vi.fn()
        render(<div onPointerDown={onPointerDown}><Group group={makeGroup({ id: 207 })} /></div>)
        fireEvent.pointerDown(handle())
        expect(onPointerDown).not.toHaveBeenCalled()
    })
})

describe("Group compact header", () => {
    const compact = () => screen.getByText("header").getAttribute("data-compact")

    it("is compact below the progress threshold and not above, for an explicit width", () => {
        const { rerender } = render(<Group group={makeGroup({ id: 211, width: 300 })} />)
        expect(compact()).toBe("true")
        rerender(<Group group={makeGroup({ id: 211, width: 400 })} />)
        expect(compact()).toBe("false")
    })

    it("is never compact when the width is automatic, however narrow the group is measured", () => {
        width = 280
        render(<Group group={makeGroup({ id: 212 })} />)
        expect(compact()).toBe("false")
        width = 200
        act(() => FakeResizeObserver.instances.at(-1)?.fire())
        expect(compact()).toBe("false")
    })
})

describe("Group content", () => {
    it("shows the direct tasks first, then the sections, and no section button", () => {
        const group = makeGroup({ id: 110, defaultSection: makeDefaultSection({ id: 5 }), sections: [makeSection({ id: 6 })] })
        render(<Group group={group} />)

        const order = [screen.getByText("direct tasks"), screen.getByText("section")]
        expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(screen.queryByRole("button", { name: /Nuova sezione/ })).not.toBeInTheDocument()
        expect(screen.queryByText("form sezione")).not.toBeInTheDocument()
    })

    it("still shows the direct tasks area in a group without sections", () => {
        render(<Group group={makeGroup({ id: 111, defaultSection: makeDefaultSection({ id: 5 }) })} />)
        expect(screen.getByText("direct tasks")).toBeInTheDocument()
        expect(screen.queryByText("section")).not.toBeInTheDocument()
    })

    describe("order of the list of the direct tasks among the sections", () => {
        const order = (defaultIndex?: number) => {
            const { container, unmount } = render(<Group group={makeGroup({
                id: 120, defaultIndex, defaultSection: makeDefaultSection({ id: 5 }),
                sections: [1, 2, 3].map(id => makeSection({ id })),
            })} />)
            const result = Array.from(container.querySelectorAll("[data-mock]")).map(node => node.getAttribute("data-mock"))
            unmount()
            return result
        }

        it("puts the list on top by default, in the middle or at the end where defaultIndex says", () => {
            expect(order()).toEqual(["list", "s1", "s2", "s3"])
            expect(order(0)).toEqual(["list", "s1", "s2", "s3"])
            expect(order(1)).toEqual(["s1", "list", "s2", "s3"])
            expect(order(2)).toEqual(["s1", "s2", "list", "s3"])
            expect(order(3)).toEqual(["s1", "s2", "s3", "list"])
        })

        it("clamps an index past the last section to the end", () => {
            expect(order(99)).toEqual(["s1", "s2", "s3", "list"])
        })
    })

    it("opens the form of a new section from the menu of the group and closes it again", () => {
        render(<Group group={makeGroup({ id: 112 })} />)
        fireEvent.click(screen.getByText("menu nuova sezione"))
        expect(toggleOpen).not.toHaveBeenCalled()

        fireEvent.click(screen.getByText("form sezione"))
        expect(screen.queryByText("form sezione")).not.toBeInTheDocument()
    })

    it("expands a collapsed group when a section is asked from its menu", () => {
        groupOpen.value = false
        render(<Group group={makeGroup({ id: 113 })} />)
        fireEvent.click(screen.getByText("menu nuova sezione"))
        expect(toggleOpen).toHaveBeenCalledTimes(1)
    })

    it("shows only the header while collapsed", () => {
        groupOpen.value = false
        render(<Group group={makeGroup({ id: 114, defaultSection: makeDefaultSection({ id: 5 }), sections: [makeSection({ id: 6 })] })} />)
        expect(screen.getByText("header")).toBeInTheDocument()
        expect(screen.queryByText("direct tasks")).not.toBeInTheDocument()
        expect(screen.queryByText("section")).not.toBeInTheDocument()
    })
})
