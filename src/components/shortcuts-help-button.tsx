import { useTranslation } from "react-i18next"
import { CircleHelp } from "lucide-react"
import { ButtonNavbar } from "@/components/button-navbar"
import { useShortcutsContext } from "@/contexts/use-shortcuts"

/**
 * "?" button of the title bar, beside the window controls: opens the keyboard shortcuts dialog,
 * through the same shortcut as the Help menu entry.
 * `inline`: the small button in the center of the title bar (workspace, after the search), as big as the back button.
 * @category Layout
 */
export const ShortcutsHelpButton = ({ inline = false }: { inline?: boolean }) => {
    const { t } = useTranslation()
    const { trigger } = useShortcutsContext()
    return (
        <ButtonNavbar
            onClick={() => { trigger("show-shortcuts") }}
            className={inline ? "size-7 shrink-0 text-foreground rounded-xs" : "text-foreground"}
            window={!inline}
            label={t("window.shortcuts")}
            textTooltip={t("window.shortcuts")}
        >
            <CircleHelp className="w-5 h-5" />
        </ButtonNavbar>
    )
}
