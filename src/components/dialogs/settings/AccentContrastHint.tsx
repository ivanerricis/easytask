import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { themeLabel } from "@/components/theme-options"
import { useTheme } from "@/components/use-theme"
import { usePreferences } from "@/contexts/use-preferences"
import { ACCENT_MIN_CONTRAST, accentContrast, applyAccentColor, suggestAccentColor } from "@/lib/accent-color"
import { effectiveAccent } from "@/lib/themes/builtin"

const format = (ratio: number) => ratio.toFixed(1)

/**
 * Warns when the accent color in use has too little contrast with the background of the active theme (borders, selections and
 * focus rings would be hard to see) and offers the closest color that has enough. Nothing is shown for a good color.
 */
export const AccentContrastHint = () => {
    const { t } = useTranslation()
    const { activeTheme } = useTheme()
    const { accentOverride, setAccentOverride } = usePreferences()
    const accent = effectiveAccent(activeTheme, accentOverride)
    const background = activeTheme.colors.background
    const ratio = accentContrast(accent, background)
    const suggestion = suggestAccentColor(accent, background, activeTheme.base)
    if (ratio === null || suggestion === null) return null

    const handleUse = () => {
        applyAccentColor(suggestion)
        setAccentOverride(suggestion)
    }

    return (
        <Alert role="status" className="border-amber-500/50">
            <TriangleAlert />
            <AlertDescription className="flex flex-col gap-2">
                <p>
                    {t("settings.appearance.accent.contrast.warningTheme", { theme: themeLabel(t, activeTheme), ratio: format(ratio), min: ACCENT_MIN_CONTRAST })}
                </p>
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={handleUse}>
                    <span aria-hidden className="size-4 rounded-xs border" style={{ backgroundColor: suggestion }} />
                    {t("settings.appearance.accent.contrast.use", { color: suggestion.toUpperCase(), ratio: format(accentContrast(suggestion, background) ?? 0) })}
                </Button>
            </AlertDescription>
        </Alert>
    )
}
