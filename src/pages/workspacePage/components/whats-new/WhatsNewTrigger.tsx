import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useTabs, useTabsActions } from "@/contexts/use-tabs"
import { reportError } from "@/lib/report-error"
import { WHATS_NEW_TAB_ID } from "@/lib/tabs/virtual-tabs"
import { pendingWhatsNew } from "@/lib/whats-new"

/**
 * Opens the "What's new" tab once after the app was updated (see {@link pendingWhatsNew}). It waits for the saved tabs of the
 * workspace to be restored, or the restore would not apply, and it asks only once per run. Renders nothing.
 * @category Updater
 */
export const WhatsNewTrigger = () => {
    const { restored } = useTabs()
    const { openNote } = useTabsActions()
    const { i18n } = useTranslation()
    const asked = useRef(false)

    useEffect(() => {
        if (!restored || asked.current) return
        asked.current = true
        pendingWhatsNew(i18n.language === "it" ? "it" : "en")
            .then(async pending => {
                if (!pending) return
                openNote(WHATS_NEW_TAB_ID)
                await pending.markSeen()
            })
            .catch(error => reportError(error))
    }, [restored, openNote, i18n.language])

    return null
}
