import { useTranslation } from "react-i18next"
import { ChartColumn } from "lucide-react"
import { StatsView } from "@/components/stats/StatsView"

/** The content of the "Statistics" tab: the statistics of the workspace as a page. Nothing is written to the database. */
export const StatsPage = ({ panelId, tabId }: { panelId?: string, tabId?: string }) => {
    const { t } = useTranslation()
    return (
        <div role="tabpanel" id={panelId} aria-labelledby={tabId} aria-label={t("tasks.stats.title")} className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-background px-6 py-10">
            <div className="flex h-fit w-full max-w-4xl flex-col gap-6">
                <header className="flex items-center gap-4">
                    <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xs bg-primary/15 text-primary">
                        <ChartColumn className="size-6" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                        <h2 className="text-2xl font-semibold leading-tight">{t("tasks.stats.title")}</h2>
                        <p className="text-sm text-muted-foreground">{t("tasks.stats.description")}</p>
                    </div>
                </header>
                <div className="rounded-xs border bg-background p-6">
                    <StatsView />
                </div>
            </div>
        </div>
    )
}
