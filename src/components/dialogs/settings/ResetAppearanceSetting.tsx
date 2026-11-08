import { useState } from "react"
import { useTranslation } from "react-i18next"
import { RotateCcw } from "lucide-react"
import { ConfirmDialog } from "../dialog-confirm"
import { useTheme } from "@/components/use-theme"
import { usePreferences } from "@/contexts/use-preferences"
import { DEFAULT_LANGUAGE_PREFERENCE } from "@/i18n"
import { DEFAULT_COLOR_INTENSITY } from "@/lib/color-intensity"
import { DEFAULT_ANIMATION_SPEED, DEFAULT_FONT_FAMILY, DEFAULT_TEXT_ZOOM } from "@/lib/store/preferences"
import { defaultThemeIdForSystem } from "@/lib/themes/builtin"
import { systemPrefersDark, systemPrefersMoreContrast } from "@/lib/theme-startup"
import { SectionResetButton } from "./SectionResetButton"

/**
 * "Ripristina tutto" of the Appearance page (the `action` of its panel): puts every control of the Appearance page back to its default (theme, accent color, language,
 * app size, size of folders and notes, color intensity, speed of the animations). It asks for confirmation, and it is disabled while everything is already default.
 */
export const ResetAppearanceSetting = () => {
    const { t } = useTranslation()
    const { theme, setTheme } = useTheme()
    const {
        accentOverride, setAccentOverride,
        language, setLanguage,
        fontFamily, setFontFamily,
        textZoom, setTextZoom,
        sidebarItemSize, setSidebarItemSize,
        colorIntensity, setColorIntensity,
        animationSpeed, setAnimationSpeed,
    } = usePreferences()
    const [open, setOpen] = useState(false)

    // The default theme is the one of the operating system; the custom themes are not touched
    const isDefault = theme === defaultThemeIdForSystem(systemPrefersDark(), systemPrefersMoreContrast())
        && accentOverride === null
        && language === DEFAULT_LANGUAGE_PREFERENCE
        && fontFamily === DEFAULT_FONT_FAMILY
        && textZoom === DEFAULT_TEXT_ZOOM
        && sidebarItemSize === "normal"
        && colorIntensity === DEFAULT_COLOR_INTENSITY
        && animationSpeed === DEFAULT_ANIMATION_SPEED

    const handleReset = () => {
        setTheme(defaultThemeIdForSystem(systemPrefersDark(), systemPrefersMoreContrast()))
        setAccentOverride(null)
        setLanguage(DEFAULT_LANGUAGE_PREFERENCE)
        setFontFamily(DEFAULT_FONT_FAMILY)
        setTextZoom(DEFAULT_TEXT_ZOOM)
        setSidebarItemSize("normal")
        setColorIntensity(DEFAULT_COLOR_INTENSITY)
        setAnimationSpeed(DEFAULT_ANIMATION_SPEED)
    }

    return (
        <>
            <SectionResetButton disabled={isDefault} title={t("settings.appearance.reset.description")} onClick={() => setOpen(true)} />
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={t("settings.appearance.reset.confirmTitle")}
                description={t("settings.appearance.reset.confirmDescription")}
                confirm={{ label: t("settings.appearance.reset.confirm"), icon: RotateCcw, onClick: handleReset }}
            />
        </>
    )
}
