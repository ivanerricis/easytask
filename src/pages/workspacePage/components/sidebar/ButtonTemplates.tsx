import { useTranslation } from "react-i18next"
import { requestAppCommand } from "@/lib/app-commands"
import { ItemFooter } from "../items/ItemFooter"
import { useTemplateCount } from "./use-tool-counts"

/**
 * Footer entry that opens the templates of the current workspace, with the number of templates as a badge.
 * @category Sidebar
 */
export const ButtonTemplates = () => {
    const { t } = useTranslation()
    const count = useTemplateCount()

    return (
        <ItemFooter type="template" text={t("dialogs.templates.title")} badge={count} badgeVariant="outline" badgeLabel={t("templates.badge", { count })} onClick={() => requestAppCommand("open-templates")} />
    )
}
