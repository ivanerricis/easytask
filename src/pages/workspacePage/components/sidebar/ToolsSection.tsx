import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { usePreferences } from "@/contexts/use-preferences"
import { ButtonDue } from "./ButtonDue"
import { ButtonStats } from "./ButtonStats"
import { ButtonTemplates } from "./ButtonTemplates"
import { ButtonArchive } from "./ButtonArchive"
import { ButtonTrash } from "./ButtonTrash"
import { useArchiveCount, useDueCount, useTemplateCount, useTrashCount } from "./use-tool-counts"

const HeaderBadge = ({ count, label, destructive }: { count: number, label: string, destructive?: boolean }) => {
    if (count <= 0) return null
    return (
        <>
            <Badge variant={destructive ? "destructive" : "outline"} aria-hidden="true" className="h-5 min-w-5 px-1 py-0 text-xs leading-none tabular-nums">{count > 99 ? "99+" : count}</Badge>
            <span className="sr-only">{label}</span>
        </>
    )
}

/** The counts shown in the header while the section is closed (mounted only then, so each count is queried once). */
const ClosedBadges = () => {
    const { t } = useTranslation()
    const due = useDueCount()
    const templates = useTemplateCount()
    const archive = useArchiveCount()
    const trash = useTrashCount()
    return (
        <span className="flex items-center gap-1">
            <HeaderBadge destructive count={due} label={t("tasks.dueView.badge", { count: due })} />
            <HeaderBadge count={templates} label={t("templates.badge", { count: templates })} />
            <HeaderBadge count={archive} label={t("sidebar.archiveBadge", { count: archive })} />
            <HeaderBadge count={trash} label={t("sidebar.trashBadge", { count: trash })} />
        </span>
    )
}

/**
 * Collapsible "Tools" section of the sidebar footer (due, statistics, templates, archive, trash). The open state is a saved
 * preference; while closed the header keeps the counts, so nothing is lost.
 * @category Sidebar
 */
export const ToolsSection = () => {
    const { t } = useTranslation()
    const { sidebarToolsOpen, setSidebarToolsOpen } = usePreferences()

    return (
        <Collapsible open={sidebarToolsOpen} onOpenChange={setSidebarToolsOpen} className="flex flex-col w-full">
            <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" data-tools-toggle="" className="h-auto w-full justify-start gap-2 overflow-x-hidden px-2 py-1 font-normal">
                    <ChevronDown className={sidebarToolsOpen ? "size-4 shrink-0 transition-transform" : "size-4 shrink-0 -rotate-90 transition-transform"} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-left">{t("sidebar.tools")}</span>
                    {!sidebarToolsOpen && <ClosedBadges />}
                </Button>
            </CollapsibleTrigger>
            {/* pr-1 and pb-0.5 (with the negative margins): room for the focus ring of the entries, which the clipping of the animation would cut */}
            <CollapsibleContent className="-mr-1 pr-1 -mb-0.5 pb-0.5 overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className="flex flex-col gap-1 pt-1">
                    <ButtonDue />
                    <ButtonStats />
                    <ButtonTemplates />
                    <ButtonArchive />
                    <ButtonTrash />
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}
