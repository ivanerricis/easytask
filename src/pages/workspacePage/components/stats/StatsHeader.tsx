import { memo } from "react"
import { useTranslation } from "react-i18next"
import { ChartColumn, X } from "lucide-react"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Button } from "@/components/ui/button"
import { useActiveNoteSelector, useTabsActions } from "@/contexts/use-tabs"
import { useShortcutLabel } from "@/contexts/use-shortcuts"
import { focusRing, ghostIconButtonClass, tabElementId, tabPanelId } from "@/lib/a11y"
import { usePane } from "@/contexts/use-layout"
import { STATS_TAB_ID } from "@/lib/tabs/virtual-tabs"
import { cn } from "@/lib/utils"

/** The tab of the statistics in the bar of the open tabs: same look as the tab of a note, without a context menu. */
export const StatsHeader = memo(function StatsHeader() {
    const { t } = useTranslation()
    const { closeNote, activateNote } = useTabsActions()
    const isActive = useActiveNoteSelector(activeId => activeId === STATS_TAB_ID)
    const closeLabel = useShortcutLabel("close-note")
    const pane = usePane()?.pane ?? 0
    const title = t("tasks.stats.title")

    return (
        <div
            className={cn(
                "group/tab relative flex items-stretch min-h-[42px] border-x border-b",
                isActive ? "bg-background border-x-primary border-b-transparent" : "bg-secondary border-x-transparent border-b-primary hover:bg-background/40",
            )}
        >
            <button
                type="button"
                role="tab"
                aria-selected={isActive}
                id={tabElementId(pane, STATS_TAB_ID)}
                aria-controls={isActive ? tabPanelId(pane) : undefined}
                tabIndex={isActive ? 0 : -1}
                data-note-id={STATS_TAB_ID}
                title={title}
                onClick={() => activateNote(STATS_TAB_ID)}
                className={cn(focusRing, "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 pl-2 pr-1 text-left text-sm")}
            >
                <ChartColumn aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className={cn("block max-w-44 truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{title}</span>
            </button>
            <div className="flex shrink-0 items-center gap-1 py-1 pr-1">
                <TooltipCustom text={isActive ? t("notes.closeCurrent") : t("notes.close")} shortcut={isActive ? closeLabel : undefined}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={isActive ? t("notes.closeCurrent") : t("notes.close")}
                        onClick={e => { e.stopPropagation(); closeNote(STATS_TAB_ID) }}
                        className={cn(ghostIconButtonClass, isActive ? "text-foreground" : "text-muted-foreground opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100")}
                    >
                        <X />
                    </Button>
                </TooltipCustom>
            </div>
        </div>
    )
})
