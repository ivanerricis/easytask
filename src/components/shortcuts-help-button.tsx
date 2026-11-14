import { useTranslation } from "react-i18next"
import { CircleHelp } from "lucide-react"
import { ButtonNavbar } from "@/components/button-navbar"
import { useShortcutsContext } from "@/contexts/use-shortcuts"

/**
 * "?" button of the title bar, beside the window controls: opens the keyboard shortcuts dialog,
 * through the same shortcut as the Help menu entry.
 * @category Layout
 */
export const ShortcutsHelpButton = () => {
    const { t } = useTranslation()
    const { trigger } = useShortcutsContext()
    return (
        <ButtonNavbar
            onClick={() => { trigger("show-shortcuts") }}
            className="text-foreground"
            window
            label={t("window.shortcuts")}
            textTooltip={t("window.shortcuts")}
        >
            <CircleHelp className="w-5 h-5" />
        </ButtonNavbar>
    )
}
