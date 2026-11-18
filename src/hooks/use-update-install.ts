import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { relaunch } from "@tauri-apps/plugin-process"
import type { Update } from "@tauri-apps/plugin-updater"
import { reportError } from "@/lib/report-error"
import { isNetworkError } from "@/lib/update-errors"
import { getErrorMessage } from "@/lib/utils"

/** Download progress of an update being installed: bytes received and total size (null when unknown). */
type InstallProgress = { downloaded: number, total: number | null }

/**
 * Downloads and installs an update, then restarts the app (shared by the update dialog and Settings > About).
 * On failure an error toast is shown and `install` resolves to false, so the caller can offer the update again.
 * @returns `progress` (null when nothing is being installed), the derived `percent`/`label`, the last install `error`
 * message (null when none, so a dialog can show it inline too) and `install`.
 */
export const useUpdateInstall = () => {
    const { t } = useTranslation()
    const [progress, setProgress] = useState<InstallProgress | null>(null)
    const [error, setError] = useState<string | null>(null)
    // Technical message, kept apart when `error` is the plain "no internet" sentence
    const [errorDetail, setErrorDetail] = useState<string | null>(null)

    const install = useCallback(async (update: Update): Promise<boolean> => {
        let downloaded = 0
        let total: number | null = null
        setProgress({ downloaded, total })
        setError(null)
        setErrorDetail(null)
        try {
            await update.downloadAndInstall(event => {
                if (event.event === "Started") total = event.data.contentLength ?? null
                else if (event.event === "Progress") downloaded += event.data.chunkLength
                setProgress({ downloaded, total })
            })
            await relaunch()
            return true
        } catch (error) {
            setProgress(null)
            const technical = getErrorMessage(error)
            const offline = isNetworkError(technical)
            const message = offline ? t("settings.about.update.offline") : t("settings.about.update.installError", { message: technical })
            setError(message)
            setErrorDetail(offline ? technical : null)
            reportError(error, message)
            return false
        }
    }, [t])

    const percent = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null
    const label = progress === null
        ? null
        : percent === null
            ? t("settings.about.update.downloadingUnknown")
            : percent >= 100
                ? t("settings.about.update.installing")
                : t("settings.about.update.downloading", { percent })

    return { progress, percent, label, error, errorDetail, install }
}
