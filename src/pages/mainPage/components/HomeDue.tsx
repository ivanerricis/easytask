import { useTranslation } from "react-i18next"
import { CalendarClock } from "lucide-react"
import { DueTasksList } from "@/components/due/DueTasksList"

/** Option 3: the tasks of all the workspaces that are overdue or due within a week, on the home page. */
export const HomeDue = () => {
    const { t } = useTranslation()
    return (
        <div className="flex max-h-72 w-full flex-col gap-2 overflow-y-auto rounded-xs border p-2" data-testid="home-due">
            <h2 className="ml-2 flex items-center gap-2 text-lg"><CalendarClock className="size-5" aria-hidden />{t("tasks.dueView.title")}</h2>
            <DueTasksList showWorkspace />
        </div>
    )
}
