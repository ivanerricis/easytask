import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { getSplitPreview, subscribeSplitPreview } from "./tab-split-preview-store"

/** The highlighted box (like VS Code) over the area where the dropped tab opens the split view. Fixed, without pointer events; it appears with the usual fade (it follows the animation speed). */
export const SplitDropPreview = () => {
    const { t } = useTranslation()
    const rect = useSyncExternalStore(subscribeSplitPreview, getSplitPreview)
    if (!rect) return null
    return (
        <div
            aria-hidden
            data-testid="split-drop-preview"
            className="pointer-events-none fixed z-50 flex items-center justify-center rounded-xs border-2 border-primary bg-primary/15 animate-in fade-in-0"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        >
            <span className="rounded-xs bg-background/80 px-2 py-1 text-xs font-medium text-foreground">{t("menu.openRight")}</span>
        </div>
    )
}
