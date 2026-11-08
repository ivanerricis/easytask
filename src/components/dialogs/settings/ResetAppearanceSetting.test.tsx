import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_COLOR_INTENSITY } from "@/lib/color-intensity"
import { ResetAppearanceSetting } from "./ResetAppearanceSetting"

const setTheme = vi.fn()
const setAccentOverride = vi.fn()
const setLanguage = vi.fn()
const setTextZoom = vi.fn()
const setFontFamily = vi.fn()
const setSidebarItemSize = vi.fn()
const setColorIntensity = vi.fn()
const setAnimationSpeed = vi.fn()

const state = {
    theme: "light",
    accentOverride: null as string | null,
    language: "system",
    textZoom: 1,
    fontFamily: "system",
    sidebarItemSize: "normal",
    colorIntensity: DEFAULT_COLOR_INTENSITY,
    animationSpeed: "system",
    prefersDark: false,
}

vi.mock("@/components/use-theme", () => ({ useTheme: () => ({ theme: state.theme, setTheme }) }))
// jsdom has no dark color scheme: the default theme of the system is the light one
vi.mock("@/lib/theme-startup", () => ({ systemPrefersDark: () => state.prefersDark, systemPrefersMoreContrast: () => false }))
vi.mock("@/contexts/use-preferences", () => ({
    usePreferences: () => ({ ...state, setAccentOverride, setLanguage, setFontFamily, setTextZoom, setSidebarItemSize, setColorIntensity, setAnimationSpeed }),
}))

beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(state, {
        theme: "light", accentOverride: null, prefersDark: false, language: "system", fontFamily: "system", textZoom: 1, sidebarItemSize: "normal", colorIntensity: DEFAULT_COLOR_INTENSITY, animationSpeed: "system",
    })
})

describe("ResetAppearanceSetting", () => {
    it("is disabled while everything is already at its default", () => {
        render(<ResetAppearanceSetting />)
        expect(screen.getByRole("button", { name: "Reimposta tutto" })).toBeDisabled()
    })

    it.each([
        ["theme", { theme: "dark" }],
        ["custom theme", { theme: "custom-abc" }],
        ["accent color", { accentOverride: "#3366ff" }],
        ["language", { language: "en" }],
        ["font", { fontFamily: "lora" }],
        ["app size", { textZoom: 1.3 }],
        ["size of folders and notes", { sidebarItemSize: "large" }],
        ["color intensity", { colorIntensity: 1.5 }],
        ["speed of the animations", { animationSpeed: "none" }],
    ])("is enabled when the %s was changed", (_name, change) => {
        Object.assign(state, change)
        render(<ResetAppearanceSetting />)
        expect(screen.getByRole("button", { name: "Reimposta tutto" })).toBeEnabled()
    })

    it("the default theme is the one of the operating system", () => {
        Object.assign(state, { theme: "dark", prefersDark: true })
        render(<ResetAppearanceSetting />)
        expect(screen.getByRole("button", { name: "Reimposta tutto" })).toBeDisabled()
    })

    it("asks for confirmation and resets every control to its default", async () => {
        Object.assign(state, { theme: "nord", prefersDark: true, accentOverride: "#3366ff", language: "en", fontFamily: "lora", textZoom: 1.3, sidebarItemSize: "large", colorIntensity: 1.5, animationSpeed: "slow" })
        const user = userEvent.setup()
        render(<ResetAppearanceSetting />)

        await user.click(screen.getByRole("button", { name: "Reimposta tutto" }))
        const dialog = await screen.findByRole("dialog")
        expect(dialog).toHaveTextContent("Reimpostare l'aspetto?")
        expect(setTheme).not.toHaveBeenCalled()

        await user.click(screen.getByRole("button", { name: "Reimposta" }))

        expect(setTheme).toHaveBeenCalledWith("dark")
        expect(setAccentOverride).toHaveBeenCalledWith(null)
        expect(setLanguage).toHaveBeenCalledWith("system")
        expect(setFontFamily).toHaveBeenCalledWith("system")
        expect(setTextZoom).toHaveBeenCalledWith(1)
        expect(setSidebarItemSize).toHaveBeenCalledWith("normal")
        expect(setColorIntensity).toHaveBeenCalledWith(DEFAULT_COLOR_INTENSITY)
        expect(setAnimationSpeed).toHaveBeenCalledWith("system")
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("changes nothing when the confirmation is cancelled", async () => {
        state.theme = "dark"
        const user = userEvent.setup()
        render(<ResetAppearanceSetting />)
        await user.click(screen.getByRole("button", { name: "Reimposta tutto" }))
        await user.click(await screen.findByRole("button", { name: "Annulla" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(setTheme).not.toHaveBeenCalled()
        expect(setAccentOverride).not.toHaveBeenCalled()
    })
})
