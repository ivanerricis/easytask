import { useTranslation } from "react-i18next"
import { requestAppCommand } from "@/lib/app-commands"
import { ItemFooter } from "../items/ItemFooter"
import { useArchiveCount } from "./use-tool-counts"

export const ButtonArchive = () => {
    const { t } = useTranslation()
    const count = useArchiveCount()

    return (
        <ItemFooter type="archive" text={t("archive.title")} badge={count} badgeVariant="outline" badgeLabel={t("sidebar.archiveBadge", { count })} onClick={() => requestAppCommand("open-archive")} />
    )
}
