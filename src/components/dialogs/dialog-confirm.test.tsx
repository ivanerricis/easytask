import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Trash2, FolderSearch } from "lucide-react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConfirmDialog } from "./dialog-confirm"
import i18n from "@/i18n"
import { PreferencesContext, type PreferencesContextType } from "@/contexts/preferences-context-object"
import { DialogFooterActions } from "@/components/ui/dialog"

const sources = import.meta.glob("../../**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>

const onOpenChange = vi.fn()
const onConfirm = vi.fn()
const onSecondary = vi.fn()

const setup = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) =>
    render(
        <ConfirmDialog
            open
            onOpenChange={onOpenChange}
            title="Spostare nel cestino?"
            description="Potrai ripristinarlo in seguito."
            confirm={{ label: "Sposta nel cestino", icon: Trash2, onClick: onConfirm }}
            {...props}
        />,
    )

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ConfirmDialog skipKey", () => {
    const setSkippedConfirms = vi.fn()
    const withPrefs = (skippedConfirms: string[], props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) =>
        render(
            <PreferencesContext.Provider value={{ skippedConfirms, setSkippedConfirms } as unknown as PreferencesContextType}>
                <ConfirmDialog
                    open
                    onOpenChange={onOpenChange}
                    title="Spostare nel cestino?"
                    confirm={{ label: "Sposta nel cestino", icon: Trash2, onClick: onConfirm }}
                    skipKey="task-trash"
                    {...props}
                />
            </PreferencesContext.Provider>,
        )

    it("shows no checkbox without a skipKey, or without a preferences provider", () => {
        setup()
        expect(screen.queryByRole("checkbox")).toBeNull()
        setup({ skipKey: "task-trash" })
        expect(screen.queryByRole("checkbox")).toBeNull()
    })

    it("shows the unchecked checkbox 'Non chiedermelo più' with a skipKey", () => {
        withPrefs([])
        expect(screen.getByRole("checkbox", { name: "Non chiedermelo più" })).not.toBeChecked()
    })

    it("stores the key, then runs the action, when confirmed with the box checked", async () => {
        const user = userEvent.setup()
        withPrefs(["tag-delete"])
        await user.click(screen.getByRole("checkbox", { name: "Non chiedermelo più" }))
        await user.click(screen.getByRole("button", { name: "Sposta nel cestino" }))
        expect(setSkippedConfirms).toHaveBeenCalledWith(["tag-delete", "task-trash"])
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it("stores nothing when confirmed with the box unchecked, or when cancelled with it checked", async () => {
        const user = userEvent.setup()
        const { unmount } = withPrefs([])
        await user.click(screen.getByRole("button", { name: "Sposta nel cestino" }))
        expect(setSkippedConfirms).not.toHaveBeenCalled()
        unmount()
        withPrefs([])
        await user.click(screen.getByRole("checkbox", { name: "Non chiedermelo più" }))
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(setSkippedConfirms).not.toHaveBeenCalled()
    })

    it("starts unchecked at every opening", async () => {
        const user = userEvent.setup()
        const { rerender } = withPrefs([])
        await user.click(screen.getByRole("checkbox", { name: "Non chiedermelo più" }))
        const element = (open: boolean) => (
            <PreferencesContext.Provider value={{ skippedConfirms: [], setSkippedConfirms } as unknown as PreferencesContextType}>
                <ConfirmDialog open={open} onOpenChange={onOpenChange} title="T" confirm={{ label: "Sposta nel cestino", onClick: onConfirm }} skipKey="task-trash" />
            </PreferencesContext.Provider>
        )
        rerender(element(false))
        rerender(element(true))
        expect(screen.getByRole("checkbox", { name: "Non chiedermelo più" })).not.toBeChecked()
    })
})

describe("DialogFooterActions", () => {
    it("puts every button of a confirmation in one group of equal columns (stacked on a phone)", () => {
        setup()
        const group = document.querySelector("[data-slot='dialog-footer-actions']")
        expect(group).not.toBeNull()
        expect(group).toHaveClass("flex-col-reverse", "sm:grid", "sm:grid-flow-col", "sm:auto-cols-fr")
        expect(group?.querySelectorAll("button")).toHaveLength(2)
    })

    it("renders its children in the group", () => {
        render(<DialogFooterActions><button>A</button><button>B</button></DialogFooterActions>)
        expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["A", "B"])
    })
})

describe("ConfirmDialog", () => {
    it("shows the title, the description, the extra content and a close button", () => {
        setup({ children: <p>C:\Musica\brano.mp3</p> })
        const dialog = screen.getByRole("dialog")
        expect(dialog).toHaveTextContent("Spostare nel cestino?")
        expect(dialog).toHaveTextContent("Potrai ripristinarlo in seguito.")
        expect(screen.getByText("C:\\Musica\\brano.mp3")).toBeInTheDocument()
        // The same X as every other dialog of the app (an AlertDialog has none)
        expect(screen.getByRole("button", { name: "Chiudi" })).toBeInTheDocument()
    })

    it("puts Annulla on the left and the main action, with its icon, on the right", () => {
        setup()
        const buttons = screen.getAllByRole("button").filter(b => b.textContent !== "Chiudi")
        expect(buttons.map(b => b.textContent)).toEqual(["Annulla", "Sposta nel cestino"])
        expect(buttons[1].querySelector("svg.lucide-trash-2")).not.toBeNull()
        expect(buttons[0].querySelector("svg")).toBeNull()
    })

    it("is neutral by default and red when the action loses data", () => {
        const { rerender } = setup()
        expect(screen.getByRole("heading", { name: "Spostare nel cestino?" })).not.toHaveClass("text-destructive")
        expect(screen.getByRole("button", { name: "Sposta nel cestino" })).not.toHaveClass("text-destructive")

        rerender(
            <ConfirmDialog open onOpenChange={onOpenChange} title="Spostare nel cestino?" destructive
                confirm={{ label: "Sposta nel cestino", icon: Trash2, onClick: onConfirm }} />,
        )
        expect(screen.getByRole("heading", { name: "Spostare nel cestino?" })).toHaveClass("text-destructive")
        expect(screen.getByRole("button", { name: "Sposta nel cestino" })).toHaveClass("text-destructive")
    })

    it("closes and runs the action when the main button is clicked", async () => {
        const user = userEvent.setup()
        setup()
        await user.click(screen.getByRole("button", { name: "Sposta nel cestino" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it("runs a slow action once on two quick clicks and disables the button with a spinner meanwhile", async () => {
        let finish: () => void = () => undefined
        onConfirm.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
        setup({ autoClose: false })
        const button = screen.getByRole("button", { name: "Sposta nel cestino" })
        fireEvent.click(button)
        fireEvent.click(button)
        expect(onConfirm).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(button).toBeDisabled())
        expect(button.querySelector("svg.animate-spin")).not.toBeNull()
        finish()
        await waitFor(() => expect(button).not.toBeDisabled())
        expect(button.querySelector("svg.animate-spin")).toBeNull()
    })

    it("leaves the closing to the action when autoClose is off", async () => {
        const user = userEvent.setup()
        setup({ autoClose: false })
        await user.click(screen.getByRole("button", { name: "Sposta nel cestino" }))
        expect(onConfirm).toHaveBeenCalledTimes(1)
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("Annulla closes without running anything", async () => {
        const user = userEvent.setup()
        setup()
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it("offers a second action between Annulla and the main one", async () => {
        const user = userEvent.setup()
        setup({
            secondary: { label: "Elimina riferimento", icon: Trash2, onClick: onSecondary },
            secondaryDestructive: true,
            confirm: { label: "Aggiorna percorso", icon: FolderSearch, onClick: onConfirm },
        })
        const buttons = screen.getAllByRole("button").filter(b => b.textContent !== "Chiudi")
        expect(buttons.map(b => b.textContent)).toEqual(["Annulla", "Elimina riferimento", "Aggiorna percorso"])
        expect(buttons[1]).toHaveClass("text-destructive")

        await user.click(buttons[1])
        expect(onSecondary).toHaveBeenCalledTimes(1)
        expect(onConfirm).not.toHaveBeenCalled()
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    describe("keyboard", () => {
        it("starts with the focus on the main action, so that Enter does what it says", async () => {
            setup()
            await waitFor(() => expect(screen.getByRole("button", { name: "Sposta nel cestino" })).toHaveFocus())
        })

        it("can start on Annulla for what cannot be undone", async () => {
            setup({ initialFocus: "cancel" })
            await waitFor(() => expect(screen.getByRole("button", { name: "Annulla" })).toHaveFocus())
        })

        it("Enter confirms when the focus is not on a button", () => {
            setup()
            fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" })
            expect(onConfirm).toHaveBeenCalledTimes(1)
            expect(onOpenChange).toHaveBeenCalledWith(false)
        })

        it("Enter does not confirm when the focus started on Annulla", () => {
            setup({ initialFocus: "cancel" })
            fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" })
            expect(onConfirm).not.toHaveBeenCalled()
        })

        it("Enter on Annulla does not confirm (it presses Annulla)", () => {
            setup()
            fireEvent.keyDown(screen.getByRole("button", { name: "Annulla" }), { key: "Enter" })
            expect(onConfirm).not.toHaveBeenCalled()
        })
    })

    it("does not let the clicks reach the elements around it (a row, a menu)", async () => {
        const user = userEvent.setup()
        const onParentClick = vi.fn()
        render(
            <div onClick={onParentClick}>
                <ConfirmDialog open onOpenChange={onOpenChange} title="Elimina" confirm={{ label: "Elimina", onClick: onConfirm }} />
            </div>,
        )
        await user.click(screen.getByRole("button", { name: "Elimina" }))
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(onParentClick).not.toHaveBeenCalled()
    })

    it("ogni uso di ConfirmDialog ha un titolo specifico e il titolo generico non esiste più", () => {
        expect(i18n.exists("dialogs.confirm.title")).toBe(false)
        const usages = Object.entries(sources).filter(([path, code]) => !path.endsWith(".test.tsx") && /<ConfirmDialog/.test(code))
        expect(usages.length).toBeGreaterThan(5)
        for (const [path, code] of usages) {
            expect(code, path).toMatch(/<ConfirmDialog[\s\S]{0,700}?title=/)
            expect(code, path).not.toContain("dialogs.confirm")
        }
    })
})
