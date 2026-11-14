import { useEffect } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SelectionProvider } from "./selection-context"
import { useSelectionStore, useIsInMultiSelection, useIsSelected } from "./selection-context-object"

let workspaceId = 1
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: { id: workspaceId } }) }))

const probe: { store: ReturnType<typeof useSelectionStore> } = { store: null }

const Probe = () => {
    const current = useSelectionStore()
    useEffect(() => { probe.store = current }, [current])
    const selected = useIsSelected("note", 1)
    const multi = useIsInMultiSelection("note", 1)
    return <div><span data-testid="state">{`${selected}/${multi}`}</span><input aria-label="campo" /></div>
}

const setup = () => {
    const view = render(<SelectionProvider><Probe /></SelectionProvider>)
    act(() => probe.store!.sync(["note-1", "note-2"]))
    return view
}

beforeEach(() => { workspaceId = 1 })

describe("SelectionProvider", () => {
    it("tells whether an item is selected, alone or together with another", () => {
        setup()
        act(() => probe.store!.toggle("note-1"))
        expect(screen.getByTestId("state")).toHaveTextContent("true/false")
        act(() => probe.store!.toggle("note-2"))
        expect(screen.getByTestId("state")).toHaveTextContent("true/true")
        act(() => probe.store!.toggle("note-1"))
        expect(screen.getByTestId("state")).toHaveTextContent("false/false")
    })

    it("Esc clears the selection", () => {
        setup()
        act(() => { probe.store!.toggle("note-1"); probe.store!.toggle("note-2") })
        fireEvent.keyDown(document.body, { key: "Escape" })
        expect(probe.store!.getSelected().size).toBe(0)
    })

    it("Esc leaves the selection alone in a field, in a dialog, or when another handler already used the key", () => {
        setup()
        act(() => probe.store!.toggle("note-1"))
        fireEvent.keyDown(screen.getByLabelText("campo"), { key: "Escape" })
        expect(probe.store!.getSelected().size).toBe(1)

        const dialog = document.body.appendChild(document.createElement("div"))
        dialog.setAttribute("role", "dialog")
        fireEvent.keyDown(dialog, { key: "Escape" })
        expect(probe.store!.getSelected().size).toBe(1)
        dialog.remove()

        const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true })
        event.preventDefault()
        document.body.dispatchEvent(event)
        expect(probe.store!.getSelected().size).toBe(1)

        fireEvent.keyDown(document.body, { key: "a" })
        expect(probe.store!.getSelected().size).toBe(1)
    })

    it("is cleared when the workspace changes", () => {
        const view = setup()
        act(() => probe.store!.toggle("note-1"))
        workspaceId = 2
        view.rerender(<SelectionProvider><Probe /></SelectionProvider>)
        expect(probe.store!.getSelected().size).toBe(0)
        expect(probe.store!.getAnchor()).toBeNull()
    })
})
