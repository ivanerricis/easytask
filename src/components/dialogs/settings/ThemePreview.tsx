import { useMemo, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { Check, TriangleAlert } from "lucide-react"
import { themeDisplayName } from "@/lib/theme-transfer"
import { themeCssVars } from "@/lib/themes/css"
import type { ThemeDefinition } from "@/lib/themes/types"
import { cn } from "@/lib/utils"

type ThemePreviewProps = {
    theme: ThemeDefinition
    /** The accent chosen apart from the theme, if any (the preview then shows it instead of the accent of the theme). */
    accent?: string | null
    /** `md`: the whole mini app (editor); `sm`: a small thumbnail for the gallery and the list. */
    size?: "md" | "sm"
    className?: string
}

/**
 * A small made-up app drawn with the colors of a theme (not the ones of the app): the CSS variables of the theme are set on its
 * own container, which also carries the `light`/`dark` class of the base. Only token classes are used, so the colors are the
 * theme's. It is an image for assistive technology.
 */
export const ThemePreview = ({ theme, accent, size = "md", className }: ThemePreviewProps) => {
    const { t } = useTranslation()
    // The editor never hands over an invalid color, but a preview must never break the page
    const vars = useMemo(() => {
        try { return themeCssVars(theme, accent) } catch { return null }
    }, [theme, accent])
    if (!vars) return null
    const label = t("settings.themes.gallery.preview", { name: themeDisplayName(theme) })
    const style = vars as CSSProperties
    const base = "overflow-hidden rounded-xs border bg-background text-foreground"

    if (size === "sm") {
        return (
            <div role="img" aria-label={label} style={style} className={cn(base, theme.base, "flex h-12 w-20 shrink-0", className)}>
                <div aria-hidden className="w-4 shrink-0 border-r bg-card" />
                <div aria-hidden className="flex min-w-0 flex-1 flex-col gap-1 p-1.5">
                    <div className="h-1.5 w-3/4 rounded-xs bg-foreground" />
                    <div className="h-1.5 w-1/2 rounded-xs bg-muted-foreground" />
                    <div className="mt-auto flex gap-1">
                        <div className="h-2 w-5 rounded-xs bg-primary" />
                        <div className="h-2 w-2 rounded-xs bg-destructive" />
                        <div className="h-2 w-2 rounded-xs bg-warning" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div role="img" aria-label={label} style={style} className={cn(base, theme.base, "flex h-56 w-full text-xs", className)}>
            <div aria-hidden className="flex w-24 shrink-0 flex-col gap-1 border-r bg-card p-2">
                <div className="truncate rounded-xs bg-accent px-1.5 py-1 text-accent-foreground">Notes</div>
                <div className="truncate rounded-xs px-1.5 py-1">Archive</div>
                <div className="truncate rounded-xs px-1.5 py-1 text-muted-foreground">Trash</div>
            </div>
            <div aria-hidden className="flex min-w-0 flex-1 flex-col gap-2 p-2">
                <div className="flex flex-col gap-1.5 rounded-xs border bg-card p-2">
                    <div className="flex items-center gap-1.5">
                        <span className="flex size-3.5 items-center justify-center rounded-xs bg-primary text-primary-foreground"><Check className="size-2.5" /></span>
                        <span className="truncate">Buy milk</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="size-3.5 rounded-xs border border-input" />
                        <span className="truncate text-muted-foreground">Call Anna (muted)</span>
                    </div>
                    <div className="rounded-xs border border-primary/40 bg-primary/15 px-1.5 py-1">Colored note</div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-6 min-w-0 flex-1 truncate rounded-xs border border-input bg-background px-1.5 py-1 text-muted-foreground">Search…</div>
                    <div className="rounded-xs bg-primary px-2 py-1 text-primary-foreground">Add</div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-destructive">Error</span>
                    <span className="flex items-center gap-1 text-warning"><TriangleAlert className="size-3" />Warning</span>
                    <span className="rounded-xs border border-tooltip-border bg-tooltip px-1.5 py-0.5 text-tooltip-foreground">Tooltip</span>
                </div>
            </div>
        </div>
    )
}
