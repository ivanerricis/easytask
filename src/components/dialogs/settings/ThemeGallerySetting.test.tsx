import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import type { ThemeDefinition } from "@/lib/themes/types"
import { ThemeGallerySetting } from "./ThemeGallerySetting"

const setTheme = vi.fn()
const custom: ThemeDefinition = { ...BUILTIN_THEMES[0], id: "custom-abc", name: "Il mio tema", nameKey: undefined, builtin: false }
const state = { theme: "dark", themes: BUILTIN_THEMES as readonly ThemeDefinition[] }
vi.mock("@/components/use-theme", () => ({ useTheme: () => ({ theme: state.theme, themes: state.themes, setTheme }) }))

beforeEach(() => {
    vi.clearAllMocks()
    state.theme = "dark"
    state.themes = BUILTIN_THEMES
})

describe("ThemeGallerySetting", () => {
    it("is a radio group with a card per theme and no System entry", () => {
        render(<ThemeGallerySetting />)
        expect(screen.getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument()
        expect(screen.getAllByRole("radio")).toHaveLength(BUILTIN_THEMES.length)
        for (const name of ["Chiaro", "Scuro", "Nord", "Solarized chiaro", "Solarized scuro", "Dracula", "Seppia"]) {
            expect(screen.getByRole("radio", { name })).toBeInTheDocument()
        }
        expect(screen.queryByRole("radio", { name: "Sistema" })).toBeNull()
    })

    it("marks the active theme and makes it the only tab stop", () => {
        render(<ThemeGallerySetting />)
        expect(screen.getByRole("radio", { name: "Scuro" })).toHaveAttribute("aria-checked", "true")
        expect(screen.getByRole("radio", { name: "Chiaro" })).toHaveAttribute("aria-checked", "false")
        expect(screen.getAllByRole("radio").filter(radio => radio.tabIndex === 0)).toHaveLength(1)
        expect(screen.getByRole("radio", { name: "Scuro" }).tabIndex).toBe(0)
    })

    it("chooses a theme by click and with the arrow keys", async () => {
        const user = userEvent.setup()
        render(<ThemeGallerySetting />)
        await user.click(screen.getByRole("radio", { name: "Nord" }))
        expect(setTheme).toHaveBeenLastCalledWith("nord")

        screen.getByRole("radio", { name: "Scuro" }).focus()
        await user.keyboard("{ArrowRight}")
        expect(setTheme).toHaveBeenLastCalledWith("nord")
        await user.keyboard("{ArrowLeft}")
        expect(setTheme).toHaveBeenLastCalledWith("dark")
    })

    it("shows the custom themes after the built-in ones", () => {
        state.themes = [...BUILTIN_THEMES, custom]
        render(<ThemeGallerySetting />)
        const radios = screen.getAllByRole("radio")
        expect(radios[radios.length - 1]).toHaveAccessibleName("Il mio tema")
    })
})
