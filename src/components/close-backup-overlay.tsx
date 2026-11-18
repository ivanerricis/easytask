import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { closeBackupEvent } from "@/lib/close-backup"

/**
 * Covers the window while the backup of the closing is written (see backupBeforeQuit): the app is about to quit, so
 * nothing can be done meanwhile. Renders nothing the rest of the time.
 * @category Lifecycle
 */
export const CloseBackupOverlay = () => {
    const { t } = useTranslation()
    const [writing, setWriting] = useState(false)
    closeBackupEvent.useListen(setWriting)
    if (!writing) return null
    return (
        <div role="alertdialog" aria-modal="true" aria-label={t("settings.data.backup.closing")} className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-xs">
            <Loader2 className="animate-spin" aria-hidden="true" />
            <p className="text-lg font-semibold">{t("settings.data.backup.closing")}</p>
        </div>
    )
}
