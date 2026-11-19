import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import i18n from "@/i18n"
import { UndoContext, type UndoContextType } from "@/contexts/undo/context"
import { HistoryPanel } from "./HistoryPanel"

const makeContext = (over: Partial<UndoContextType> = {}): UndoContextType => ({
    canUndo: false, canRedo: false, undoLabel: null, redoLabel: null,
    entries: { undo: [], redo: [] },
    undo: vi.fn().mockResolvedValue(undefined),
    redo: vi.fn().mockResolvedValue(undefined),
    undoTo: vi.fn().mockResolvedValue(undefined),
    redoTo: vi.fn().mockResolvedValue(undefined),
    isLatest: vi.fn(),
    clear: vi.fn(),
    recorder: {} as never,
    ...over,
})

const renderPanel = (value: UndoContextType) =>
    render(<UndoContext.Provider value={value}><HistoryPanel /></UndoContext.Provider>)

afterEach(async () => { await i18n.changeLanguage("it") })

describe("HistoryPanel", () => {
    it("shows the empty state and disabled buttons without history", () => {
        renderPanel(makeContext())
        expect(screen.getByText("Nessuna azione da annullare")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Annulla" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Ripeti" })).toBeDisabled()
        expect(screen.queryByRole("list", { name: "Azioni ripetibili" })).not.toBeInTheDocument()
    })

    it("lists the undoable actions with the last one as the current state, and the redoable ones below", () => {
        renderPanel(makeContext({
            canUndo: true, canRedo: true,
            entries: { undo: ["C", "B", "A"], redo: ["D"] },
        }))
        const undoList = screen.getByRole("list", { name: "Azioni annullabili" })
        const buttons = Array.from(undoList.querySelectorAll("button"))
        expect(buttons.map(b => b.getAttribute("aria-label"))).toEqual(["Torna a: C", "Torna a: B", "Torna a: A"])
        expect(buttons[0]).toHaveAttribute("aria-current", "true")
        expect(buttons[1]).not.toHaveAttribute("aria-current")
        expect(screen.getByText("Stato attuale")).toBeInTheDocument()
        expect(screen.getByRole("list", { name: "Azioni ripetibili" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Avanza a: D" })).toBeInTheDocument()
    })

    it("jumps to the clicked entry", async () => {
        const user = userEvent.setup()
        const value = makeContext({ canUndo: true, canRedo: true, entries: { undo: ["C", "B", "A"], redo: ["D", "E"] } })
        renderPanel(value)
        await user.click(screen.getByRole("button", { name: "Torna a: A" }))
        expect(value.undoTo).toHaveBeenCalledWith(2)
        await user.click(screen.getByRole("button", { name: "Avanza a: E" }))
        expect(value.redoTo).toHaveBeenCalledWith(1)
    })

    it("works with the keyboard (Tab, Enter and Space)", async () => {
        const user = userEvent.setup()
        const value = makeContext({ canUndo: true, entries: { undo: ["B", "A"], redo: [] } })
        renderPanel(value)
        // The header buttons are disabled or open a tooltip on focus, so focus starts on the list
        act(() => { screen.getByRole("button", { name: "Torna a: B" }).focus() })
        await user.keyboard("{Enter}")
        expect(value.undoTo).toHaveBeenLastCalledWith(0)
        await user.tab()
        await user.keyboard(" ")
        expect(value.undoTo).toHaveBeenLastCalledWith(1)
    })

    it("the header buttons undo and redo one action", async () => {
        const user = userEvent.setup()
        const value = makeContext({ canUndo: true, canRedo: true, entries: { undo: ["A"], redo: ["B"] } })
        renderPanel(value)
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        await user.click(screen.getByRole("button", { name: "Ripeti" }))
        expect(value.undo).toHaveBeenCalledTimes(1)
        expect(value.redo).toHaveBeenCalledTimes(1)
    })

    it("undoes every action with 'Annulla tutto', like choosing the oldest entry", async () => {
        const user = userEvent.setup()
        const value = makeContext({ canUndo: true, canRedo: true, entries: { undo: ["C", "B", "A"], redo: ["D"] } })
        renderPanel(value)
        await user.click(screen.getByRole("button", { name: "Annulla tutto" }))
        expect(value.undoTo).toHaveBeenCalledWith(2)
        expect(value.clear).not.toHaveBeenCalled()
    })

    it("disables 'Annulla tutto' when there is nothing to undo", () => {
        renderPanel(makeContext({ canRedo: true, entries: { undo: [], redo: ["A"] } }))
        expect(screen.getByRole("button", { name: "Annulla tutto" })).toBeDisabled()
    })

    it("follows the language", async () => {
        await i18n.changeLanguage("en")
        renderPanel(makeContext({ canUndo: true, entries: { undo: ["A"], redo: ["B"] } }))
        expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Go back to: A" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Go forward to: B" })).toBeInTheDocument()
        expect(screen.getByText("Current state")).toBeInTheDocument()
    })
})
