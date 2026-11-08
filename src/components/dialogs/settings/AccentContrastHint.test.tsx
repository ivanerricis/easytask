import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AccentContrastHint } from "./AccentContrastHint"
import { accentContrast } from "@/lib/accent-color"
import { getBuiltinTheme } from "@/lib/themes/builtin"

const setAccentOverride = vi.fn()
const state = { themeId: "light", accentOverride: null as string | null }
vi.mock("@/components/use-theme", () => ({ useTheme: () => ({ activeTheme: getBuiltinTheme(state.themeId)! }) }))
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => ({ accentOverride: state.accentOverride, setAccentOverride }) }))

beforeEach(() => {
    vi.clearAllMocks()
    state.themeId = "light"
    state.accentOverride = null
    document.documentElement.style.removeProperty("--primary")
})

describe("AccentContrastHint", () => {
    it("shows nothing for the accent of the theme, in every built-in theme", () => {
        for (const id of ["light", "dark", "nord", "solarized-light", "solarized-dark", "dracula", "sepia"]) {
            state.themeId = id
            const { container, unmount } = render(<AccentContrastHint />)
            expect(container, id).toBeEmptyDOMElement()
            unmount()
        }
    })

    it("names the active theme in the warning", () => {
        state.themeId = "dark"
        state.accentOverride = "#1e3a8a"
        render(<AccentContrastHint />)
        expect(screen.getByRole("status")).toHaveTextContent("«Scuro»")
    })

    it("offers a darker color on a light theme and stores it as the override", async () => {
        const user = userEvent.setup()
        state.accentOverride = "#ffe119"
        render(<AccentContrastHint />)
        expect(screen.getByRole("status")).toHaveTextContent("«Chiaro»")
        const button = screen.getByRole("button", { name: /^Usa #/ })
        const suggestion = /#[0-9A-F]{6}/.exec(button.textContent ?? "")![0].toLowerCase()
        expect(accentContrast(suggestion, getBuiltinTheme("light")!.colors.background)!).toBeGreaterThanOrEqual(3)

        await user.click(button)
        expect(setAccentOverride).toHaveBeenCalledWith(suggestion)
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe(suggestion)
    })

    it("measures against the background of the active theme: a color fine on the dark theme is reported on a cream one", () => {
        state.accentOverride = "#ffe119"
        state.themeId = "dark"
        const dark = render(<AccentContrastHint />)
        expect(dark.container).toBeEmptyDOMElement()
        dark.unmount()
        state.themeId = "solarized-light"
        render(<AccentContrastHint />)
        expect(screen.getByRole("status")).toHaveTextContent("Solarized chiaro")
    })

    it("suggests a lighter color on a dark theme", async () => {
        state.themeId = "nord"
        state.accentOverride = "#1e3a8a"
        render(<AccentContrastHint />)
        const button = screen.getByRole("button", { name: /^Usa #/ })
        const suggestion = /#[0-9A-F]{6}/.exec(button.textContent ?? "")![0].toLowerCase()
        expect(parseInt(suggestion.slice(5, 7), 16)).toBeGreaterThan(parseInt("8a", 16))
    })
})
