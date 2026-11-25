import { useTranslation } from "react-i18next"
import { requestAppCommand } from "@/lib/app-commands"
import { ItemFooter } from "../items/ItemFooter"

/** "Statistics" button of the sidebar footer: opens (or brings to the front) the statistics tab. */
export const ButtonStats = () => {
    const { t } = useTranslation()
    return <ItemFooter type="stats" text={t("tasks.stats.title")} onClick={() => requestAppCommand("open-stats")} />
}
