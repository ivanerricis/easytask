import { useTranslation } from "react-i18next"
import { AlignLeft, Flag, ListTree } from "lucide-react"
import { TooltipCustom } from "@/components/tooltip-custom"
import { cn } from "@/lib/utils"
import { TaskTagBadges } from "./TaskTagBadges"

type TaskRowBadgesProps = {
    hasDescription: boolean
    /** Preference "Show completed subtasks". */
    showSubtaskCount: boolean
    subtasksHidden: boolean
    doneSubtasks: number
    totalSubtasks: number
    priority: boolean
    /** The tags of the task (ids of the tags of the workspace). */
    tagIDs?: number[]
    onOpenDescription: () => void
}

/** What the task has besides its text: a description (click to read it), its subtasks (done / total), its tags and its priority flag. */
export function TaskRowBadges({ hasDescription, showSubtaskCount, subtasksHidden, doneSubtasks, totalSubtasks, priority, tagIDs, onOpenDescription }: TaskRowBadgesProps) {
    const { t } = useTranslation()
    const hasSubtasks = totalSubtasks > 0
    return <>
        {(hasDescription || ((showSubtaskCount || subtasksHidden) && hasSubtasks)) &&
            <div className="flex shrink-0 items-center gap-1.5 mt-0.5 ml-1 text-xs">
                {hasDescription &&
                    // The toolbar that shows on hover covers this one and has the same button: this copy is out of the
                    // tab order and of the accessibility tree
                    <TooltipCustom text={t("tasks.showDescription")}>
                        <span
                            aria-hidden
                            data-testid="description-indicator"
                            onClick={e => { e.stopPropagation(); onOpenDescription() }}
                            className="flex size-6 -m-1 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                            <AlignLeft className="size-3.5" />
                        </span>
                    </TooltipCustom>}
                {/* Hidden subtasks always show their count (also with the preference off): it is the sign that there are some */}
                {(showSubtaskCount || subtasksHidden) && hasSubtasks &&
                    <span
                        data-testid="subtask-count"
                        data-subtasks-hidden={subtasksHidden ? "true" : undefined}
                        title={t(subtasksHidden ? "tasks.subtaskProgressHidden" : "tasks.subtaskProgress", { done: doneSubtasks, total: totalSubtasks })}
                        className={cn(
                            "flex items-center gap-0.5 tabular-nums",
                            // All done: full-contrast text (the accent color is chosen by the user and can be unreadable as text)
                            doneSubtasks === totalSubtasks ? "font-medium text-foreground" : "text-muted-foreground",
                        )}>
                        <ListTree className="size-3.5" />
                        {doneSubtasks}/{totalSubtasks}
                    </span>}
            </div>}

        {tagIDs && tagIDs.length > 0 && <TaskTagBadges tagIDs={tagIDs} />}

        {/* Priority: a flag (not just a color) */}
        {priority &&
            <TooltipCustom text={t("details.priority")}>
                <span role="img" aria-label={t("details.priority")} className="flex shrink-0 mx-2 mt-1 text-priority">
                    <Flag className="size-3.5 fill-current" />
                </span>
            </TooltipCustom>}
    </>
}
