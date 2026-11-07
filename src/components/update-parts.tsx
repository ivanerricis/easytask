import { useTranslation } from "react-i18next"
import { Progress } from "@/components/ui/progress"

/**
 * Content of the live region shown while an update is installed: the step, the progress bar (animated when the size
 * is unknown, so it does not look stuck) and the hint not to close the app.
 */
export const UpdateInstallProgress = ({ percent, label }: { percent: number | null, label: string | null }) => {
    const { t } = useTranslation()
    return (
        <>
            <p className="text-muted-foreground">{label}</p>
            <Progress
                value={percent}
                aria-label={t("settings.about.update.progressLabel")}
                aria-valuetext={label ?? undefined}
                className={percent === null ? "animate-pulse bg-primary/30" : undefined}
            />
            <p className="text-xs text-muted-foreground">{t("settings.about.update.keepOpenHint")}</p>
        </>
    )
}
