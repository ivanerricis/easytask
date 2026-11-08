import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import { MAX_CUSTOM_THEMES, type ThemeDefinition } from "@/lib/themes/types"
import { CustomThemesSection } from "./CustomThemesSection"

const nord = BUILTIN_THEMES.find(theme => theme.id === "nord")!
const make = (n: number, name: string): ThemeDefinition => ({ ...nord, nameKey: undefined, id: `custom-${String(n).repeat(32)}`, name, builtin: false })
const mine = make(1, "Mio")

const state: { themes: ThemeDefinition[], activeTheme: ThemeDefinition } = { themes: [], activeTheme: nord }
const saveCustomTheme = vi.fn(async (theme: ThemeDefinition) => theme)
const renameCustomTheme = vi.fn(async (_id: string, name: string) => name)
const deleteCustomTheme = vi.fn(async () => {})
vi.mock("@/components/use-theme", () => ({ useTheme: () => ({ ...state, saveCustomTheme, renameCustomTheme, deleteCustomTheme }) }))

const importThemes = vi.fn()
const exportTheme = vi.fn()
vi.mock("@/lib/theme-transfer", async importOriginal => ({
    ...await importOriginal<typeof import("@/lib/theme-transfer")>(),
    importThemes: (...a: unknown[]) => importThemes(...a),
    exportTheme: (...a: unknown[]) => exportTheme(...a),
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

beforeEach(() => {
    vi.clearAllMocks()
    state.themes = [...BUILTIN_THEMES, mine]
    state.activeTheme = nord
    importThemes.mockResolvedValue(null)
    exportTheme.mockResolvedValue(true)
})

describe("CustomThemesSection", () => {
    it("lists the custom themes only, with the count, and marks the one in use", () => {
        state.activeTheme = mine
        render(<CustomThemesSection />)
        expect(screen.getByText("1 temi su 50")).toBeInTheDocument()
        expect(screen.getByText("Mio")).toBeInTheDocument()
        expect(screen.queryByText("Nord")).not.toBeInTheDocument()
        expect(screen.getByText("In uso")).toBeInTheDocument()
    })

    it("shows the empty state", () => {
        state.themes = [...BUILTIN_THEMES]
        render(<CustomThemesSection />)
        expect(screen.getByText("Non hai ancora temi personalizzati.")).toBeInTheDocument()
    })

    it("names every action with the theme it acts on", () => {
        render(<CustomThemesSection />)
        for (const action of ["Modifica", "Rinomina", "Duplica", "Esporta", "Elimina"])
            expect(screen.getByRole("button", { name: `${action}: Mio` })).toBeInTheDocument()
    })

    it("opens the editor to create and to edit", async () => {
        const user = userEvent.setup()
        render(<CustomThemesSection />)
        await user.click(screen.getByRole("button", { name: "Nuovo tema" }))
        expect(await screen.findByRole("heading", { name: "Nuovo tema" })).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        await user.click(screen.getByRole("button", { name: "Modifica: Mio" }))
        expect(await screen.findByRole("heading", { name: "Modifica tema" })).toBeInTheDocument()
    })

    it("renames inline with Enter, and cancels with Escape", async () => {
        const user = userEvent.setup()
        render(<CustomThemesSection />)
        await user.click(screen.getByRole("button", { name: "Rinomina: Mio" }))
        await user.keyboard("{Escape}")
        expect(renameCustomTheme).not.toHaveBeenCalled()
        await user.click(screen.getByRole("button", { name: "Rinomina: Mio" }))
        await user.keyboard("Nuovo{Enter}")
        await waitFor(() => expect(renameCustomTheme).toHaveBeenCalledWith(mine.id, "Nuovo"))
    })

    it("duplicates with a free name and a new id", async () => {
        const user = userEvent.setup()
        render(<CustomThemesSection />)
        await user.click(screen.getByRole("button", { name: "Duplica: Mio" }))
        await waitFor(() => expect(saveCustomTheme).toHaveBeenCalled())
        const copy = saveCustomTheme.mock.calls[0][0]
        expect(copy.name).toBe("Mio (copia)")
        expect(copy.id).not.toBe(mine.id)
        expect(copy.id).toMatch(/^custom-[0-9a-f]{32}$/)
    })

    it("exports and tells it", async () => {
        const user = userEvent.setup()
        render(<CustomThemesSection />)
        await user.click(screen.getByRole("button", { name: "Esporta: Mio" }))
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tema esportato"))
        expect(exportTheme).toHaveBeenCalledWith(mine)
    })

    it("shows the error of a failing export", async () => {
        const user = userEvent.setup()
        exportTheme.mockRejectedValue({ code: "X", message: "negato" })
        render(<CustomThemesSection />)
        await user.click(screen.getByRole("button", { name: "Esporta: Mio" }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("negato"))
    })

    it("asks before deleting", async () => {
        const user = userEvent.setup()
        render(<CustomThemesSection />)
        await user.click(screen.getByRole("button", { name: "Elimina: Mio" }))
        const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
        expect(within(dialog).getByText("Eliminare il tema «Mio»?")).toBeInTheDocument()
        expect(deleteCustomTheme).not.toHaveBeenCalled()
        await user.click(within(dialog).getByRole("button", { name: "Elimina" }))
        await waitFor(() => expect(deleteCustomTheme).toHaveBeenCalledWith(mine.id))
    })

    it("imports and reports the result", async () => {
        const user = userEvent.setup()
        importThemes.mockResolvedValue({ imported: 2, discarded: 0, errors: [] })
        render(<CustomThemesSection />)
        await user.click(screen.getByRole("button", { name: "Importa…" }))
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Importati 2 temi"))
        expect(importThemes).toHaveBeenCalledWith(state.themes, saveCustomTheme)
    })

    it("reports a failed import as an error", async () => {
        const user = userEvent.setup()
        importThemes.mockResolvedValue({ imported: 0, discarded: 1, errors: ["File non valido."] })
        render(<CustomThemesSection />)
        await user.click(screen.getByRole("button", { name: "Importa…" }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("File non valido.")))
    })

    it("disables creating, importing and duplicating at the limit", () => {
        state.themes = [...BUILTIN_THEMES, ...Array.from({ length: MAX_CUSTOM_THEMES }, (_, i) => ({ ...mine, id: `custom-${i}`, name: `T${i}` }))]
        render(<CustomThemesSection />)
        expect(screen.getByRole("button", { name: "Nuovo tema" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Importa…" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Duplica: T0" })).toBeDisabled()
    })
})
