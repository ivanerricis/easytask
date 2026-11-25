import { useTranslation } from "react-i18next"
import { requestAppCommand } from "@/lib/app-commands"
import { ItemFooter } from "../items/ItemFooter"
import { useDueCount } from "./use-tool-counts"

/** "Due" button of the sidebar footer (option 2: a dialog like the trash and the archive), with the number of tasks overdue or due today. */
export const ButtonDue = () => {
    const { t } = useTranslation()
    const count = useDueCount()
    return (
        <ItemFooter type="due" text={t("tasks.dueView.title")} badge={count} badgeLabel={t("tasks.dueView.badge", { count })} badgeVariant={count > 0 ? "destructive" : undefined} onClick={() => requestAppCommand("open-due")} />
    )
}
