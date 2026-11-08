import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getBuiltinTheme } from "@/lib/themes/builtin"
import { AppearanceSettings } from "./AppearanceSettings"

const prefs = { accentOverride: "#336699" as string | null, setAccentOverride: vi.fn() }
vi.mock("@/components/tooltip-custom", () => ({ TooltipCustom: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))
vi.mock("@/components/use-theme", () => ({ useTheme: () => ({ activeTheme: getBuiltinTheme("light")! }) }))
vi.mock("./ThemeGallerySetting", () => ({ ThemeGallerySetting: () => null }))
vi.mock("./CustomThemesSection", () => ({ CustomThemesSection: () => null }))
vi.mock("./LanguageSetting", () => ({ LanguageSetting: () => null }))
vi.mock("./SidebarItemSizeSetting", () => ({ SidebarItemSizeSetting: () => null }))
vi.mock("./ColorIntensitySetting", () => ({ ColorIntensitySetting: () => null }))
vi.mock("./ResetAppearanceSetting", () => ({ ResetAppearanceSetting: () => null }))

const picker = () => screen.getByLabelText("Colore d'accento") as HTMLInputElement

beforeEach(() => {
    vi.useFakeTimers()
    prefs.accentOverride = "#336699"
    prefs.setAccentOverride.mockReset()
    document.documentElement.style.removeProperty("--primary")
})
afterEach(() => { vi.useRealTimers() })

describe("accent color picker", () => {
    it("previews every change on the page at once, but stores the color only once the picker rests", () => {
        render(<AppearanceSettings />)
        for (const hex of ["#101010", "#202020", "#303030", "#336699"]) fireEvent.change(picker(), { target: { value: hex } })

        // Live preview: the page already has the last color, and so has the picker
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#336699")
        expect(picker().value).toBe("#336699")
        // Nothing stored (no re-render of the app, no save) while the color is being dragged
        expect(prefs.setAccentOverride).not.toHaveBeenCalled()

        act(() => { vi.advanceTimersByTime(300) })
        expect(prefs.setAccentOverride).toHaveBeenCalledTimes(1)
        expect(prefs.setAccentOverride).toHaveBeenCalledWith("#336699")
    })

    it("restarts the wait at every change", () => {
        render(<AppearanceSettings />)
        fireEvent.change(picker(), { target: { value: "#111111" } })
        act(() => { vi.advanceTimersByTime(200) })
        fireEvent.change(picker(), { target: { value: "#222222" } })
        act(() => { vi.advanceTimersByTime(200) })
        expect(prefs.setAccentOverride).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(100) })
        expect(prefs.setAccentOverride).toHaveBeenCalledOnce()
        expect(prefs.setAccentOverride).toHaveBeenCalledWith("#222222")
    })

    it("stores a pending color when the settings are closed", () => {
        const { unmount } = render(<AppearanceSettings />)
        fireEvent.change(picker(), { target: { value: "#abcdef" } })
        unmount()
        expect(prefs.setAccentOverride).toHaveBeenCalledOnce()
        expect(prefs.setAccentOverride).toHaveBeenCalledWith("#abcdef")
    })

    it("stores nothing when nothing was changed", () => {
        const { unmount } = render(<AppearanceSettings />)
        act(() => { vi.advanceTimersByTime(1000) })
        unmount()
        expect(prefs.setAccentOverride).not.toHaveBeenCalled()
    })

    it("goes back to the accent of the theme at once, dropping a pending change", () => {
        render(<AppearanceSettings />)
        fireEvent.change(picker(), { target: { value: "#123456" } })
        fireEvent.click(screen.getByRole("button", { name: "Usa l'accento del tema" }))

        expect(prefs.setAccentOverride).toHaveBeenCalledOnce()
        expect(prefs.setAccentOverride).toHaveBeenCalledWith(null)
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#c2410c")
        act(() => { vi.advanceTimersByTime(1000) })
        // the dropped change is not stored afterwards
        expect(prefs.setAccentOverride).toHaveBeenCalledOnce()
    })

    it("shows the accent of the theme, with no button, while there is no override", () => {
        prefs.accentOverride = null
        render(<AppearanceSettings />)
        expect(picker().value).toBe("#c2410c")
        expect(screen.queryByRole("button", { name: "Usa l'accento del tema" })).toBeNull()
    })

    it("follows the stored color when it changes elsewhere (reset)", () => {
        const { rerender } = render(<AppearanceSettings />)
        expect(picker().value).toBe("#336699")
        prefs.accentOverride = "#00ff00"
        rerender(<AppearanceSettings />)
        expect(picker().value).toBe("#00ff00")
    })
})
