import { memo } from "react"
import type { Tag } from "@/types/types"
import { Badge } from "@/components/ui/badge"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { cn, hexToRgba } from "@/lib/utils"

type TagBadgeProps = {
    tag: Pick<Tag, "name" | "color">
    className?: string
}

/**
 * A tag as a small pill: its name on a light tint of its color with a border of the same color. The text keeps the
 * foreground color of the theme (never the tag color), so it stays readable in the light, dark and high contrast themes;
 * the tint follows the "color intensity" preference like the other colored elements. A tag without color is a neutral pill.
 * A long name is cut with an ellipsis (the full name is the title of the pill).
 * @category Components
 */
export const TagBadge = memo(({ tag, className }: TagBadgeProps) => {
    const colorAlpha = useColorAlpha()
    const color = tag.color || undefined
    return (
        <Badge
            variant={color ? "outline" : "secondary"}
            data-testid="tag-badge"
            title={tag.name}
            className={cn("max-w-32 min-w-0 justify-start px-1.5 py-0 text-foreground", color && "border-2", className)}
            style={color ? { backgroundColor: hexToRgba(colorAlpha.item(), color), borderColor: hexToRgba(0.85, color) } : undefined}
        >
            <span className="truncate">{tag.name}</span>
        </Badge>
    )
})
