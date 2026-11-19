import { memo } from "react"
import { useTranslation } from "react-i18next"
import { TagBadge } from "@/components/tag-badge"
import { TagBadgeMenu } from "@/components/tags/TagBadgeMenu"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useTagsOf } from "@/contexts/workspace-data/tags"
import { cn } from "@/lib/utils"

type GroupTagBadgesProps = {
    /** The tags of the group (see Group.tagIDs). */
    tagIDs: readonly number[] | undefined
    /**
     * "badges": the tags as badges on the header row, "dots": a row of small dots in the color of each tag (a narrow group),
     * "strip": the dots stacked (the closed group as a vertical strip).
     */
    layout: "badges" | "dots" | "strip"
    /** The group or section the tags belong to: with it the badges have their own context menu (edit the tag, remove it from this item). */
    owner?: { kind: "groups" | "sections", id: number }
    className?: string
}

/** How many tags are drawn before the "+N". */
const MAX_SHOWN = 3

/**
 * The tags of a group or section in its header. It reads the tag list from its own store (like TaskTagBadges), so a tag that is renamed or
 * recolored re-renders only the headers that show it. The compact layouts have no room for the names: they show a dot per tag with
 * the names as tooltip and as accessible name of the group of dots.
 */
export const GroupTagBadges = memo(({ tagIDs, layout, owner, className }: GroupTagBadgesProps) => {
    const { t } = useTranslation()
    const tags = useTagsOf(tagIDs)
    if (tags.length === 0) return null
    const shown = tags.slice(0, MAX_SHOWN)
    const more = tags.length - shown.length
    const names = tags.map(tag => tag.name).join(", ")
    const label = t("tags.badges", { names })

    if (layout === "badges") return (
        <div role="group" aria-label={label} data-testid="group-tags" className={cn("flex min-w-0 shrink items-center gap-1 overflow-hidden", className)}>
            {shown.map(tag => owner
                ? <TagBadgeMenu key={tag.id} tag={tag} target={owner}><TagBadge tag={tag} className="max-w-24" /></TagBadgeMenu>
                : <TagBadge key={tag.id} tag={tag} className="max-w-24" />)}
            {more > 0 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">+{more}</span>}
        </div>
    )

    return (
        <TooltipCustom text={names}>
            <div
                role="group"
                aria-label={label}
                data-testid="group-tags"
                className={cn("flex shrink-0 items-center gap-1", layout === "strip" ? "flex-col" : "flex-row", className)}
            >
                {shown.map(tag => (
                    <span
                        key={tag.id}
                        data-testid="group-tag-dot"
                        title={tag.name}
                        className={cn("size-2.5 rounded-full", !tag.color && "bg-muted-foreground/50")}
                        style={tag.color ? { backgroundColor: tag.color } : undefined}
                    />
                ))}
                {more > 0 && <span className="text-xs tabular-nums text-muted-foreground">+{more}</span>}
            </div>
        </TooltipCustom>
    )
})
