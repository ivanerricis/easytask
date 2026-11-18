import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Update } from "@tauri-apps/plugin-updater"
import { Download, ExternalLink, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UpdateInstallProgress } from "@/components/update-parts"
import { useOpenReleasesPage } from "@/components/use-open-releases-page"
import { isPortable } from "@/db/appPaths"
import { useUpdateInstall } from "@/hooks/use-update-install"
import { reportError } from "@/lib/report-error"
import { getCheckUpdatesOnStartup, saveCheckUpdatesOnStartup } from "@/lib/store/preferences"
import { isNetworkError } from "@/lib/update-errors"
import { checkForUpdate } from "@/lib/updater"
import { getErrorMessage } from "@/lib/utils"
import { SettingsCard, SettingsRow, SettingsSwitchRow } from "./SettingsRow"
import { useStoredSwitch } from "./use-stored-switch"

type Status =
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "upToDate" }
    | { kind: "available", update: Update }
    | { kind: "error", message: string, detail?: string }

/** Update controls of the About page: manual check, install (installed app) or link to the Releases (portable). */
export const UpdateSection = () => {
    const { t } = useTranslation()
    const [status, setStatus] = useState<Status>({ kind: "idle" })
    const [portable, setPortable] = useState(false)
    const { checked: onStartup, change: handleStartupChange } = useStoredSwitch(getCheckUpdatesOnStartup, saveCheckUpdatesOnStartup, {
        initial: true,
        onError: error => reportError(error, getErrorMessage(error)),
    })
    const handleOpenReleases = useOpenReleasesPage()
    const { progress, percent, label: installLabel, error: installError, errorDetail: installErrorDetail, install } = useUpdateInstall()

    useEffect(() => {
        let cancelled = false
        void isPortable().then(value => { if (!cancelled) setPortable(value) }).catch(() => undefined)
        return () => { cancelled = true }
    }, [])

    const handleCheck = async () => {
        setStatus({ kind: "checking" })
        try {
            const update = await checkForUpdate()
            setStatus(update ? { kind: "available", update } : { kind: "upToDate" })
        } catch (error) {
            // The plugin reports a missing or unreachable latest.json (no published release, or offline) in English
            const message = getErrorMessage(error)
            if (/valid release json/i.test(message)) setStatus({ kind: "error", message: t("settings.about.update.error", { message: t("settings.about.update.noRelease") }) })
            // Offline: a plain sentence, the technical error stays below in small print
            else if (isNetworkError(message)) setStatus({ kind: "error", message: t("settings.about.update.offline"), detail: message })
            else setStatus({ kind: "error", message: t("settings.about.update.error", { message }) })
        }
    }

    const handleInstall = async (update: Update) => {
        // On success the app restarts; on failure the hook shows the error and the update stays offered
        await install(update)
    }

    const installing = progress !== null
    const busy = status.kind === "checking" || installing

    return (
        <SettingsCard>
            {/* The result of the check belongs to the check: same row (the live region stays mounted, empty while idle) */}
            <div className="flex flex-col">
                <SettingsRow label={t("settings.about.update.label")}>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleCheck()}>
                        <RefreshCw />
                        {t("settings.about.update.checkButton")}
                    </Button>
                </SettingsRow>

                <div role="status" aria-live="polite" className="flex flex-col gap-2 text-sm not-empty:mt-3">
                    {status.kind === "checking" && (
                        <p className="text-muted-foreground">{t("settings.about.update.checking")}</p>
                    )}
                    {status.kind === "upToDate" && (
                        <p className="text-muted-foreground">{t("settings.about.update.upToDate")}</p>
                    )}
                    {status.kind === "error" && (
                        <>
                            <p className="text-destructive break-words">{status.message}</p>
                            {status.detail && <p className="text-xs text-muted-foreground break-words">{status.detail}</p>}
                        </>
                    )}
                    {installError && !installing && (
                        <>
                            <p className="text-destructive break-words">{installError}</p>
                            {installErrorDetail && <p className="text-xs text-muted-foreground break-words">{installErrorDetail}</p>}
                        </>
                    )}
                    {status.kind === "available" && !installing && (
                        <>
                            <p>{t("settings.about.update.available", { version: status.update.version, current: status.update.currentVersion })}</p>
                            {portable ? (
                                <>
                                    <p className="text-sm text-muted-foreground">{t("settings.about.update.portableHint")}</p>
                                    <div>
                                        <Button size="sm" onClick={() => void handleOpenReleases()}>
                                            <ExternalLink />
                                            {t("settings.about.update.openReleases")}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div>
                                    <Button size="sm" onClick={() => void handleInstall(status.update)}>
                                        <Download />
                                        {t("settings.about.update.install")}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                    {installing && <UpdateInstallProgress percent={percent} label={installLabel} />}
                </div>
            </div>

            <SettingsSwitchRow
                label={t("settings.about.update.startup.label")}
                description={t("settings.about.update.startup.description")}
                checked={onStartup}
                onCheckedChange={value => void handleStartupChange(value)}
            />
        </SettingsCard>
    )
}
