import { useRef, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { themeLabel } from "@/components/theme-options"
import { useTheme } from "@/components/use-theme"
import { cn } from "@/lib/utils"
import type { ThemeDefinition } from "@/lib/themes/types"
import { ThemePreview } from "./ThemePreview"
import { matchesSearch, useSettingsSearch } from "./settings-search-context"

/**
 * The theme chooser of Appearance: a radio group of cards, each with a miniature of the theme and its name. The built-in
 * themes come first, then the custom ones; every theme is an equivalent choice. Arrow keys move between the cards and choose.
 */
export const ThemeGallerySetting = () => {
    const { t } = useTranslation()
    const { theme, themes, setTheme } = useTheme()
    const { query, scopeMatches } = useSettingsSearch()
    const rootRef = useRef<HTMLDivElement>(null)

    const label = t("settings.themes.gallery.label")
    const description = t("settings.themes.gallery.description")
    if (query && !scopeMatches && !matchesSearch(query, label, description)) return null

    const builtin = themes.filter(item => item.builtin)
    const custom = themes.filter(item => !item.builtin)
    // The tab stop is the chosen card (the first one when the id is unknown)
    const tabStop = themes.some(item => item.id === theme) ? theme : themes[0]?.id

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
        if (delta === 0) return
        e.preventDefault()
        const cards = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[role='radio']") ?? [])
        const current = cards.findIndex(card => card === document.activeElement)
        const next = cards[(Math.max(current, 0) + delta + cards.length) % cards.length]
        next?.focus()
        next?.click()
    }

    const renderGroup = (title: string, group: ThemeDefinition[]) => group.length > 0 && (
        <div role="group" aria-label={title} className="flex flex-col gap-2">
            <p aria-hidden className="text-xs font-medium text-muted-foreground">{title}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                {group.map(item => {
                    const name = themeLabel(t, item)
                    const selected = item.id === theme
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={name}
                            tabIndex={item.id === tabStop ? 0 : -1}
                            onClick={() => setTheme(item.id)}
                            className={cn(
                                "flex flex-col gap-2 rounded-xs border p-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
                                selected && "border-primary ring-1 ring-primary",
                            )}
                        >
                            <ThemePreview theme={item} size="sm" className="h-20 w-full" />
                            <span className="flex items-center justify-between gap-2 text-sm">
                                <span className="truncate">{name}</span>
                                {selected && <Check className="size-4 shrink-0 text-primary" aria-label={t("settings.themes.gallery.selected")} />}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )

    return (
        <div data-settings-row className="flex flex-col gap-3">
            <div>
                <p className="text-sm font-normal leading-none">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
            <div ref={rootRef} role="radiogroup" aria-label={label} onKeyDown={handleKeyDown} className="flex flex-col gap-4">
                {renderGroup(t("settings.themes.gallery.builtin"), builtin)}
                {renderGroup(t("settings.themes.gallery.custom"), custom)}
            </div>
        </div>
    )
}
