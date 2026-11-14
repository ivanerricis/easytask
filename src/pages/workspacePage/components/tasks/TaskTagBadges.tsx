import { memo } from "react"
import { useTranslation } from "react-i18next"
import { TagBadge } from "@/components/tag-badge"
import { useTagsOf } from "@/contexts/workspace-data"

/**
 * The tags of a task on its row. It reads the tag list from its own store, so a tag that is renamed or recolored re-renders only
 * the rows that show it (and a task that is patched keeps its `tagIDs` array, so the other rows do not render at all).
 * Many tags wrap on more lines, a long name is cut (see TagBadge); the group is named for screen readers.
 */
export const TaskTagBadges = memo(({ tagIDs }: { tagIDs: readonly number[] }) => {
    const { t } = useTranslation()
    const tags = useTagsOf(tagIDs)
    if (tags.length === 0) return null
    return (
        <div
            role="group"
            aria-label={t("tags.badges", { names: tags.map(tag => tag.name).join(", ") })}
            data-testid="task-tags"
            className="flex min-w-0 max-w-[45%] shrink flex-wrap items-center justify-end gap-1 mt-0.5 ml-1"
        >
            {tags.map(tag => <TagBadge key={tag.id} tag={tag} />)}
        </div>
    )
})
