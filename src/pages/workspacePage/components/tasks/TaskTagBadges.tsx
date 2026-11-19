import { memo } from "react"
import { useTranslation } from "react-i18next"
import { TagBadge } from "@/components/tag-badge"
import { TagBadgeMenu } from "@/components/tags/TagBadgeMenu"
import { useTagsOf } from "@/contexts/workspace-data"
import { cn } from "@/lib/utils"

type TaskTagBadgesProps = {
    tagIDs: readonly number[]
    /** The task the badges belong to: the right click of a badge edits the tag or removes it from this task only. */
    taskId: number
    className?: string
}

/**
 * The tags of a task, on a line under its text. It reads the tag list from its own store, so a tag that is renamed or recolored
 * re-renders only the rows that show it (and a task that is patched keeps its `tagIDs` array, so the other rows do not render at
 * all). The badges grow along the row and wrap on more lines only when it is full, a long name is cut (see TagBadge); the group
 * is named for screen readers. Each badge has its own context menu (see TagBadgeMenu).
 */
export const TaskTagBadges = memo(({ tagIDs, taskId, className }: TaskTagBadgesProps) => {
    const { t } = useTranslation()
    const tags = useTagsOf(tagIDs)
    if (tags.length === 0) return null
    return (
        <div
            role="group"
            aria-label={t("tags.badges", { names: tags.map(tag => tag.name).join(", ") })}
            data-testid="task-tags"
            className={cn("flex min-w-0 flex-wrap items-center justify-start gap-1 mt-0.5", className)}
        >
            {tags.map(tag => <TagBadgeMenu key={tag.id} tag={tag} target={{ kind: "tasks", id: taskId }}><TagBadge tag={tag} /></TagBadgeMenu>)}
        </div>
    )
})
