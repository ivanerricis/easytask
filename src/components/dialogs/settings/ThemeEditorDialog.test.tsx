import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import { MAX_CUSTOM_THEMES, type ThemeDefinition } from "@/lib/themes/types"
import { ThemeEditorDialog } from "./ThemeEditorDialog"

const nord = BUILTIN_THEMES.find(theme => theme.id === "nord")!
const mine: ThemeDefinition = { ...nord, nameKey: undefined, id: "custom-" + "1".repeat(32), name: "Mio", builtin: false }

const state: { themes: ThemeDefinition[], activeTheme: ThemeDefinition } = { themes: [], activeTheme: nord }
const saveCustomTheme = vi.fn(async (theme: ThemeDefinition) => theme)
vi.mock("@/components/use-theme", () => ({ useTheme: () => ({ ...state, saveCustomTheme }) }))

const onOpenChange = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
    state.themes = [...BUILTIN_THEMES, mine]
    state.activeTheme = nord
    saveCustomTheme.mockImplementation(async theme => theme)
})

const renderEditor = (theme: ThemeDefinition | null) => render(<ThemeEditorDialog open onOpenChange={onOpenChange} theme={theme} />)

describe("ThemeEditorDialog", () => {
    it("starts a new theme from a copy of the active one and saves it with a new custom id", async () => {
        const user = userEvent.setup()
        renderEditor(null)
        expect(screen.getByRole("heading", { name: "Nuovo tema" })).toBeInTheDocument()
        expect(screen.getByLabelText("Nome")).toHaveValue("Tema personalizzato")
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(saveCustomTheme).toHaveBeenCalledTimes(1))
        const saved = saveCustomTheme.mock.calls[0][0]
        expect(saved).toMatchObject({ name: "Tema personalizzato", base: "dark", accent: nord.accent, colors: nord.colors, builtin: false })
        expect(saved.id).toMatch(/^custom-[0-9a-f]{32}$/)
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("edits a theme keeping its id and makes the name unique", async () => {
        const user = userEvent.setup()
        renderEditor(mine)
        expect(screen.getByRole("heading", { name: "Modifica tema" })).toBeInTheDocument()
        const name = screen.getByLabelText("Nome")
        await user.clear(name)
        await user.type(name, "Nord")
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(saveCustomTheme).toHaveBeenCalled())
        expect(saveCustomTheme.mock.calls[0][0]).toMatchObject({ id: mine.id, name: "Nord (2)" })
    })

    it("changes a color by typing its hex code, with or without the hash, and ignores an incomplete one", async () => {
        const user = userEvent.setup()
        renderEditor(mine)
        const field = screen.getByLabelText("Sfondo")
        await user.clear(field)
        await user.type(field, "#12")
        expect(field).toHaveAttribute("aria-invalid", "true")
        await user.clear(field)
        await user.type(field, "112233")
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(saveCustomTheme).toHaveBeenCalled())
        expect(saveCustomTheme.mock.calls[0][0].colors.background).toBe("#112233")
    })

    it("changes a color with the picker and the base with the toggle", async () => {
        const user = userEvent.setup()
        renderEditor(mine)
        fireEvent.change(screen.getByLabelText("Scegli il colore: Accento"), { target: { value: "#00ff00" } })
        await user.click(screen.getByRole("radio", { name: "Chiara" }))
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(saveCustomTheme).toHaveBeenCalled())
        expect(saveCustomTheme.mock.calls[0][0]).toMatchObject({ accent: "#00ff00", base: "light" })
    })

    it("warns about low contrast but still lets the theme be saved", async () => {
        const user = userEvent.setup()
        renderEditor(mine)
        expect(screen.getByText("Tutte le coppie di colori sono leggibili.")).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText("Scegli il colore: Testo"), { target: { value: "#2e3441" } })
        expect(screen.getByText(/Testo su Sfondo: contrasto \d\.\d:1, ne serve almeno 4\.5:1\./)).toBeInTheDocument()
        expect(screen.getByText(/Puoi salvare comunque/)).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(saveCustomTheme).toHaveBeenCalled())
    })

    it("does not save an empty name", async () => {
        const user = userEvent.setup()
        renderEditor(mine)
        await user.clear(screen.getByLabelText("Nome"))
        expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled()
    })

    it("refuses a new theme over the limit", async () => {
        const user = userEvent.setup()
        state.themes = [...BUILTIN_THEMES, ...Array.from({ length: MAX_CUSTOM_THEMES }, (_, i) => ({ ...mine, id: `custom-${i}`, name: `T${i}` }))]
        renderEditor(null)
        await user.click(screen.getByRole("button", { name: "Salva" }))
        expect(await screen.findByRole("alert")).toHaveTextContent(String(MAX_CUSTOM_THEMES))
        expect(saveCustomTheme).not.toHaveBeenCalled()
    })

    it("shows the error of a failing save and stays open", async () => {
        const user = userEvent.setup()
        saveCustomTheme.mockRejectedValue(new Error("disco pieno"))
        renderEditor(mine)
        await user.click(screen.getByRole("button", { name: "Salva" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("disco pieno")
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("closes with Annulla without saving", async () => {
        const user = userEvent.setup()
        renderEditor(mine)
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
        expect(saveCustomTheme).not.toHaveBeenCalled()
    })
})
