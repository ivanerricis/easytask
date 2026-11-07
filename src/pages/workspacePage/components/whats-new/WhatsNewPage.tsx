import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { getVersion } from "@tauri-apps/api/app"
import { ReleaseNotes } from "@/components/release-notes"
import { getBundledReleaseNotes } from "@/lib/release-notes"
import { reportError } from "@/lib/report-error"

/**
 * The content of the "What's new" tab: the notes of the running version (from the changelog that comes with the app), in the
 * language of the app. Nothing is read from or written to the database.
 * @category Updater
 */
export const WhatsNewPage = () => {
    const { t, i18n } = useTranslation()
    const language = i18n.language === "it" ? "it" : "en"
    const [content, setContent] = useState<{ version: string, notes: string } | null>(null)

    useEffect(() => {
        let cancelled = false
        void (async () => {
            const version = await getVersion()
            const notes = await getBundledReleaseNotes(version, language)
            if (!cancelled) setContent({ version, notes })
        })().catch(error => reportError(error))
        return () => { cancelled = true }
    }, [language])

    return (
        <div role="tabpanel" aria-label={t("settings.about.update.notes")} className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-background p-6">
            <div className="flex w-full max-w-2xl flex-col gap-3">
                <h2 className="text-lg font-semibold">
                    {t("settings.about.update.notes")}{content && ` - ${content.version}`}
                </h2>
                {content && <ReleaseNotes body={content.notes} />}
            </div>
        </div>
    )
}
