import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/contexts/use-workspace"
import { useNow } from "@/hooks/use-now"
import { countDueNow, useDueTasks } from "@/components/due/use-due-tasks"
import { requestAppCommand } from "@/lib/app-commands"
import { ItemFooter } from "../items/ItemFooter"

/** "Due" button of the sidebar footer (option 2: a dialog like the trash and the archive), with the number of tasks overdue or due today. */
export const ButtonDue = () => {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    const tasks = useDueTasks(currentWorkspace?.id)
    const now = useNow()
    const count = tasks ? countDueNow(tasks, now) : 0
    return (
        <ItemFooter type="due" text={t("tasks.dueView.title")} badge={count} badgeLabel={t("tasks.dueView.badge", { count })} badgeVariant={count > 0 ? "destructive" : undefined} onClick={() => requestAppCommand("open-due")} />
    )
}
