import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Tags, X } from "lucide-react"
import { TooltipCustom } from "@/components/tooltip-custom"
import { TagBadge } from "@/components/tag-badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useChosenTags, useSetTagFilter, useTagFilter } from "@/contexts/use-tag-filter"
import { useWorkspaceTags } from "@/contexts/workspace-data"
import { ghostIconButtonClass } from "@/lib/a11y"
import { cn } from "@/lib/utils"

/**
 * "Filter by tag" of the note bar: a list of the tags of the workspace to check (a task shows when it has any of the checked
 * tags). While a filter is active the button shows how many tags are checked and is highlighted, and a second button next to
 * it removes the filter with one click. Only a view of the open note (see useTagFilter): nothing is written to the data.
 */
export const TagFilterButton = () => {
    const { t } = useTranslation()
    const tags = useWorkspaceTags()
    const chosen = useChosenTags()
    const active = useTagFilter()
    const setFilter = useSetTagFilter()
    const count = active?.length ?? 0

    // A tag that was deleted (or undone away) leaves the filter, so the note never stays filtered by a tag nobody can see
    useEffect(() => {
        const live = chosen.filter(id => tags.some(tag => tag.id === id))
        if (live.length !== chosen.length) setFilter(live)
    }, [chosen, tags, setFilter])

    const toggle = (id: number, checked: boolean) =>
        setFilter(checked ? [...chosen, id] : chosen.filter(other => other !== id))

    return (
        <div className="flex items-center" data-testid="tag-filter" data-active={count > 0 ? "" : undefined}>
            <Popover>
                <TooltipCustom text={count > 0 ? t("notes.tagFilter.active", { count }) : t("notes.tagFilter.label")}>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            className={cn(ghostIconButtonClass, "[&_svg]:!size-4", count > 0 && "w-auto gap-1 bg-accent px-1.5 text-accent-foreground")}
                            aria-label={t("notes.tagFilter.label")}
                        >
                            <Tags />
                            {count > 0 && <span className="text-xs tabular-nums" data-testid="tag-filter-count">{count}</span>}
                        </Button>
                    </PopoverTrigger>
                </TooltipCustom>
                <PopoverContent align="end" className="w-64" aria-label={t("notes.tagFilter.label")}>
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-muted-foreground">{t("notes.tagFilter.description")}</p>
                        {tags.length === 0
                            ? <p className="text-sm text-muted-foreground">{t("notes.tagFilter.noTags")}</p>
                            : <ul aria-label={t("tags.list")} className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                                {tags.map(tag => (
                                    <li key={tag.id} className="flex h-8 min-w-0 items-center gap-2" data-testid="tag-filter-row">
                                        <Checkbox
                                            checked={active?.includes(tag.id) ?? false}
                                            aria-label={tag.name}
                                            onCheckedChange={checked => toggle(tag.id, checked === true)}
                                        />
                                        <TagBadge tag={tag} className="max-w-full" />
                                    </li>
                                ))}
                            </ul>}
                        {count > 0 && <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => setFilter([])}>
                            <X />
                            {t("notes.tagFilter.clear")}
                        </Button>}
                    </div>
                </PopoverContent>
            </Popover>
            {count > 0 && (
                <TooltipCustom text={t("notes.tagFilter.clear")}>
                    <Button
                        type="button"
                        variant="ghost"
                        className={cn(ghostIconButtonClass, "w-5 [&_svg]:!size-3.5")}
                        aria-label={t("notes.tagFilter.clear")}
                        data-testid="tag-filter-clear"
                        onClick={() => setFilter([])}
                    >
                        <X />
                    </Button>
                </TooltipCustom>
            )}
        </div>
    )
}
