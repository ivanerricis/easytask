import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PaneContext } from "@/contexts/layout-context-object"
import { getVeilLiftedPane, setVeilLiftedPane, useVeilLifted } from "./note-dnd-veil"

const Probe = ({ label }: { label: string }) => <span data-testid={label}>{String(useVeilLifted())}</span>

const inPane = (pane: 0 | 1, label: string) => (
    <PaneContext.Provider value={{ pane, focused: false, isFocused: () => false, rootRef: { current: null } }}>
        <Probe label={label} />
    </PaneContext.Provider>
)

afterEach(() => setVeilLiftedPane(null))

describe("the lifted veil of a drag over a pane", () => {
    it("tells only the pane that the drag is over", () => {
        render(<>{inPane(0, "left")}{inPane(1, "right")}</>)
        expect(screen.getByTestId("right")).toHaveTextContent("false")
        act(() => setVeilLiftedPane(1))
        expect(screen.getByTestId("right")).toHaveTextContent("true")
        expect(screen.getByTestId("left")).toHaveTextContent("false")
        act(() => setVeilLiftedPane(null))
        expect(screen.getByTestId("right")).toHaveTextContent("false")
    })

    it("does not wake the other pane's component (a per-pane selector)", () => {
        let renders = 0
        const Counting = () => { renders++; return <Probe label="left" /> }
        render(<><PaneContext.Provider value={{ pane: 0, focused: false, isFocused: () => false, rootRef: { current: null } }}><Counting /></PaneContext.Provider>{inPane(1, "right")}</>)
        const before = renders
        act(() => setVeilLiftedPane(1))
        act(() => setVeilLiftedPane(1))
        expect(renders).toBe(before)
        expect(getVeilLiftedPane()).toBe(1)
    })

    it("is never lifted outside the panes", () => {
        render(<Probe label="alone" />)
        act(() => setVeilLiftedPane(0))
        expect(screen.getByTestId("alone")).toHaveTextContent("false")
    })
})
