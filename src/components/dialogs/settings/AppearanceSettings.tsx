import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/use-theme"
import { Input } from "@/components/ui/input"
import { usePreferences } from "@/contexts/use-preferences"
import { applyAccentColor } from "@/lib/accent-color"
import { effectiveAccent } from "@/lib/themes/builtin"
import { SettingsCard, SettingsPanel, SettingsRow } from "./SettingsRow"
import { AccentContrastHint } from "./AccentContrastHint"
import { ThemeGallerySetting } from "./ThemeGallerySetting"
import { CustomThemesSection } from "./CustomThemesSection"
import { LanguageSetting } from "./LanguageSetting"
import { TextZoomSetting } from "./TextZoomSetting"
import { FontFamilySetting } from "./FontFamilySetting"
import { SidebarItemSizeSetting } from "./SidebarItemSizeSetting"
import { ColorIntensitySetting } from "./ColorIntensitySetting"
import { AnimationSpeedSetting } from "./AnimationSpeedSetting"
import { RowResetButton } from "./RowResetButton"
import { ResetAppearanceSetting } from "./ResetAppearanceSetting"

/** Quiet time after the last change of the color picker before the color is stored. */
const ACCENT_COMMIT_DELAY_MS = 250

/**
 * The accent color picker. While the color is dragged the native picker fires dozens of changes per second: each one
 * only previews the color on the page (a CSS variable), while the preference (which re-renders everything that reads
 * the preferences, and is saved) is set once, when the picker rests. Closing the dialog commits a pending color.
 */
const AccentColorPicker = ({ label, description, useThemeLabel }: { label: string, description: string, useThemeLabel: string }) => {
    const { activeTheme } = useTheme()
    const { accentOverride, setAccentOverride } = usePreferences()
    // The accent in use: the choice of the user, or else the one of the theme
    const accent = effectiveAccent(activeTheme, accentOverride)
    // The color being previewed; null when the picker just shows the stored preference (which a reset can change)
    const [draft, setDraft] = useState<string | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pending = useRef<string | null>(null)
    const commit = useRef(setAccentOverride)
    useEffect(() => { commit.current = setAccentOverride })

    const flush = useCallback(() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
        const hex = pending.current
        pending.current = null
        if (hex === null) return
        commit.current(hex)
        setDraft(null)
    }, [])
    useEffect(() => flush, [flush])

    const handleChange = (hex: string) => {
        setDraft(hex)
        applyAccentColor(hex)
        pending.current = hex
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, ACCENT_COMMIT_DELAY_MS)
    }

    // Back to the accent of the theme at once: a pending change is dropped
    const handleUseTheme = () => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
        pending.current = null
        setDraft(null)
        applyAccentColor(activeTheme.accent)
        commit.current(null)
    }

    const shown = draft ?? accent

    return (
        <SettingsRow
            label={label}
            description={description}
            reset={accentOverride === null && draft === null ? undefined : <RowResetButton label={useThemeLabel} onClick={handleUseTheme} />}
        >
            <div
                className="relative size-8 overflow-hidden rounded-xs border focus-within:ring-[3px] focus-within:ring-ring"
                style={{ backgroundColor: shown }}
            >
                <Input
                    type="color"
                    aria-label={label}
                    className="size-full cursor-pointer border-0 p-0 opacity-0"
                    value={shown}
                    onChange={(e) => handleChange(e.target.value)}
                />
            </div>
        </SettingsRow>
    )
}

export const AppearanceSettings = () => {
    const { t } = useTranslation()
    return (
        <SettingsPanel title={t("settings.appearance.title")} action={<ResetAppearanceSetting />}>
            <SettingsCard>
                <ThemeGallerySetting />
                <CustomThemesSection />
                {/* The contrast warning belongs to the accent color: same row */}
                <div className="flex flex-col gap-3">
                    <AccentColorPicker
                        label={t("settings.appearance.accent.label")}
                        description={t("settings.appearance.accent.description")}
                        useThemeLabel={t("settings.appearance.accent.useTheme")}
                    />
                    <AccentContrastHint />
                </div>
                <LanguageSetting />
                <FontFamilySetting />
                <TextZoomSetting />
                <SidebarItemSizeSetting />
                <ColorIntensitySetting />
                <AnimationSpeedSetting />
            </SettingsCard>
        </SettingsPanel>
    )
}
