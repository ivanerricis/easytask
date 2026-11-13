import { useMemo } from "react"
import { usePreference } from "./use-preference"
import { COLOR_ALPHA_BASE, clampColorIntensity, scaleAlpha } from "@/lib/color-intensity"

/**
 * Gives the alphas of the colored elements already scaled by the "color intensity" preference.
 * Without a PreferencesProvider the default intensity (100%) is used. The result keeps its identity while the intensity
 * and the task background do not change, and it does not follow any other preference (nor the audio player).
 */
export const useColorAlpha = () => {
    const intensity = clampColorIntensity(usePreference(p => p.colorIntensity))
    // The light background of the colored tasks can be turned off in the settings (on by default)
    const taskBackground = usePreference(p => p.taskBackground) !== false
    return useMemo(() => ({
        intensity,
        taskBackground,
        item: (hovered = false) => scaleAlpha(hovered ? COLOR_ALPHA_BASE.itemHover : COLOR_ALPHA_BASE.item, intensity),
        header: () => scaleAlpha(COLOR_ALPHA_BASE.header, intensity),
        panel: () => scaleAlpha(COLOR_ALPHA_BASE.panel, intensity),
        task: () => scaleAlpha(COLOR_ALPHA_BASE.task, intensity),
        noteBackground: () => scaleAlpha(COLOR_ALPHA_BASE.noteBackground, intensity),
    }), [intensity, taskBackground])
}
