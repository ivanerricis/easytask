import { useEffect } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IsSplitProvider, SplitHarness } from "@/test/split-harness"
import type { SplitState } from "@/test/split-fixtures"
import { CenterContainer } from "./CenterContainer"
import { getSplitRatio, saveSplitRatio } from "@/lib/store/split"

vi.mock("./note/NoteList", () => ({ NoteList: () => <div data-testid="note-list" /> }))
const probe = { renders: 0, mounts: 0, unmounts: 0 }
vi.mock("./groups/GroupContainer", () => ({
    GroupContainer: () => {
        probe.renders++
        useEffect(() => { probe.mounts++; return () => { probe.unmounts++ } }, [])
        return <div data-testid="groups" />
    },
}))
vi.mock("./PathBar", () => ({ PathBar: () => <div data-testid="path-bar" /> }))
vi.mock("./BlankNote", () => ({ BlankNote: () => <div data-testid="blank" /> }))
vi.mock("./note/TabsDndProvider", () => ({ TabsDndProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs-dnd">{children}</div> }))
vi.mock("./note-search-context", () => ({ NoteSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("./OpenTaskEffect", () => ({ OpenTaskEffect: () => null }))
vi.mock("@/lib/store/split", () => ({ getSplitRatio: vi.fn(), saveSplitRatio: vi.fn() }))

const state: SplitState = { open0: [1], active0: 1, open1: [], active1: null, focused: 0 }

describe("CenterContainer", () => {
    beforeEach(() => {
        vi.mocked(getSplitRatio).mockReset().mockResolvedValue(0.5)
        vi.mocked(saveSplitRatio).mockReset().mockResolvedValue(undefined)
        probe.renders = 0
        probe.mounts = 0
        probe.unmounts = 0
    })

    it("renders the blank note without tabs and outside any layout", () => {
        render(<CenterContainer />)
        expect(screen.queryByTestId("note-list")).not.toBeInTheDocument()
        expect(screen.getByTestId("blank")).toBeInTheDocument()
        expect(screen.queryByRole("region")).not.toBeInTheDocument()
    })

    it("renders the note list, the path bar and the groups with no divider when not split", () => {
        render(
            <IsSplitProvider isSplit={false}>
                <SplitHarness state={state}><CenterContainer /></SplitHarness>
            </IsSplitProvider>,
        )
        expect(screen.getByTestId("note-list")).toBeInTheDocument()
        expect(screen.getByTestId("path-bar")).toBeInTheDocument()
        expect(screen.getByTestId("groups")).toBeInTheDocument()
        expect(screen.queryByRole("separator")).not.toBeInTheDocument()
        expect(screen.getByTestId("tabs-dnd")).toBeInTheDocument()
        expect(getSplitRatio).not.toHaveBeenCalled()
    })

    it("renders two panes and a divider inside the tabs drag and drop context when split", async () => {
        render(
            <IsSplitProvider isSplit={true}>
                <SplitHarness state={state}><CenterContainer /></SplitHarness>
            </IsSplitProvider>,
        )
        const tabsDnd = screen.getByTestId("tabs-dnd")
        expect(tabsDnd).toContainElement(screen.getByRole("separator"))
        expect(screen.getByRole("region", { name: "Area sinistra" })).toContainElement(screen.getByTestId("groups"))
        expect(screen.getByRole("region", { name: "Area destra" })).toContainElement(screen.getByText("Area vuota"))
        await waitFor(() => expect(getSplitRatio).toHaveBeenCalled())
    })

    it("applies the saved ratio and saves a new one when the divider moves", async () => {
        vi.mocked(getSplitRatio).mockResolvedValue(0.4)
        render(
            <IsSplitProvider isSplit={true}>
                <SplitHarness state={state}><CenterContainer /></SplitHarness>
            </IsSplitProvider>,
        )
        const separator = screen.getByRole("separator")
        await waitFor(() => expect(separator).toHaveAttribute("aria-valuenow", "40"))
        expect(screen.getByTestId("tabs-dnd").firstElementChild).toHaveStyle({ "--split-ratio": "0.4" })
        separator.focus()
        fireEvent.keyDown(separator, { key: "ArrowRight" })
        expect(separator).toHaveAttribute("aria-valuenow", "42")
        expect(saveSplitRatio).toHaveBeenCalledWith(0.42)
    })

    describe("stable panes", () => {
        const renderSplit = (isSplit: boolean) => (
            <IsSplitProvider isSplit={isSplit}>
                <SplitHarness state={state}><CenterContainer /></SplitHarness>
            </IsSplitProvider>
        )

        it("keeps the left pane mounted when the workspace is split and unsplit", async () => {
            const { rerender } = render(renderSplit(false))
            expect(probe.mounts).toBe(1)
            rerender(renderSplit(true))
            await waitFor(() => expect(screen.getByRole("separator")).toBeInTheDocument())
            expect(screen.getByRole("region", { name: "Area sinistra" })).toContainElement(screen.getByTestId("groups"))
            rerender(renderSplit(false))
            expect(screen.queryByRole("separator")).not.toBeInTheDocument()
            expect(screen.queryByRole("region")).not.toBeInTheDocument()
            expect(screen.getByTestId("groups")).toBeInTheDocument()
            expect(probe.mounts).toBe(1)
            expect(probe.unmounts).toBe(0)
        })

        describe("divider drag", () => {
            beforeEach(() => {
                Element.prototype.setPointerCapture = vi.fn()
                vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
                vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id))
            })
            afterEach(() => vi.unstubAllGlobals())

            it("moves the panes through a CSS variable without re-rendering their content, and saves the final ratio on release", async () => {
                const { container } = render(renderSplit(true))
                const separator = screen.getByRole("separator")
                const panes = container.querySelector<HTMLElement>("[data-testid=tabs-dnd] > div")!
                panes.getBoundingClientRect = () => ({ left: 0, width: 1000, right: 1000, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) })
                await waitFor(() => expect(getSplitRatio).toHaveBeenCalled())
                await act(async () => { await Promise.resolve() })
                const before = probe.renders

                fireEvent.pointerDown(separator, { button: 0, clientX: 500, pointerId: 1 })
                for (const x of [480, 450, 420, 400, 380]) fireEvent.pointerMove(separator, { clientX: x, pointerId: 1 })
                await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })

                expect(panes.style.getPropertyValue("--split-ratio")).toBe("0.38")
                expect(separator).toHaveAttribute("aria-valuenow", "38")
                expect(probe.renders).toBe(before)
                expect(saveSplitRatio).not.toHaveBeenCalled()

                fireEvent.pointerUp(separator, { pointerId: 1 })
                expect(saveSplitRatio).toHaveBeenCalledTimes(1)
                expect(saveSplitRatio).toHaveBeenCalledWith(0.38)
                expect(panes.style.getPropertyValue("--split-ratio")).toBe("0.38")
                expect(separator).toHaveAttribute("aria-valuenow", "38")
                // Even the commit does not re-render the content of the panes
                expect(probe.renders).toBe(before)
            })
        })
    })
})
