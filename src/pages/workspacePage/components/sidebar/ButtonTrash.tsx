import { useTranslation } from "react-i18next"
import { requestAppCommand } from "@/lib/app-commands"
import { ItemFooter } from "../items/ItemFooter"
import { useTrashCount } from "./use-tool-counts"

export const ButtonTrash = () => {
    const { t } = useTranslation()
    const count = useTrashCount()

    return (
        <ItemFooter type="trash" text={t("trash.title")} badge={count} badgeVariant="outline" badgeLabel={t("sidebar.trashBadge", { count })} onClick={() => requestAppCommand("open-trash")} />
    )
}
