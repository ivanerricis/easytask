import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { getVersion } from "@tauri-apps/api/app"
import { Sparkles } from "lucide-react"
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
        <div role="tabpanel" aria-label={t("settings.about.update.notes")} className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-background px-6 py-10">
            <div className="flex h-fit w-full max-w-2xl flex-col gap-6">
                <header className="flex items-center gap-4">
                    <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xs bg-primary/15 text-primary">
                        <Sparkles className="size-6" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                        <h2 className="text-2xl font-semibold leading-tight">{t("settings.about.update.notes")}</h2>
                        {content && (
                            <span
                                data-testid="whats-new-version"
                                className="w-fit rounded-xs bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
                            >
                                {content.version}
                            </span>
                        )}
                    </div>
                </header>
                {content && (
                    <div className="rounded-xs border bg-background p-6">
                        <ReleaseNotes body={content.notes} variant="page" />
                    </div>
                )}
            </div>
        </div>
    )
}
