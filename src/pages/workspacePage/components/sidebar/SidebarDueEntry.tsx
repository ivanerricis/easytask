import { useTranslation } from "react-i18next"
import { ArrowLeft, CalendarClock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/contexts/use-workspace"
import { useNow } from "@/hooks/use-now"
import { DueTasksList } from "@/components/due/DueTasksList"
import { countDueNow, useDueTasks } from "@/components/due/use-due-tasks"

type SidebarDueEntryProps = {
    /** The due view is open in place of the tree. */
    active: boolean
    onToggle: () => void
}

/** Option 1: an entry at the top of the sidebar (with the number of tasks overdue or due today) that shows the due tasks in place of the tree. */
export const SidebarDueEntry = ({ active, onToggle }: SidebarDueEntryProps) => {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    const tasks = useDueTasks(currentWorkspace?.id)
    const now = useNow()
    const count = tasks ? countDueNow(tasks, now) : 0
    return (
        <Button
            type="button"
            variant={active ? "secondary" : "ghost"}
            onClick={onToggle}
            aria-pressed={active}
            data-testid="sidebar-due-entry"
            className="h-auto w-full justify-start gap-2 rounded-none border-b px-3 py-1.5 font-normal">
            {active ? <ArrowLeft className="size-4 shrink-0" /> : <CalendarClock className="size-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-left">{active ? t("tasks.dueView.back") : t("tasks.dueView.title")}</span>
            {!active && count > 0 && <>
                <Badge variant="destructive" aria-hidden className="h-5 min-w-5 px-1 py-0 text-[11px] leading-none tabular-nums">{count > 99 ? "99+" : count}</Badge>
                <span className="sr-only">{t("tasks.dueView.badge", { count })}</span>
            </>}
        </Button>
    )
}

/** The body of the sidebar when the due view is open. */
export const SidebarDueView = () => {
    const { currentWorkspace } = useWorkspace()
    return <div className="h-full overflow-y-auto p-1"><DueTasksList workspaceId={currentWorkspace?.id} /></div>
}
