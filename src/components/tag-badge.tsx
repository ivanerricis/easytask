import { memo } from "react"
import type { Tag } from "@/types/types"
import { Badge } from "@/components/ui/badge"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { shapeOf, type TagShape } from "@/lib/tag-shapes"
import { cn, hexToRgba } from "@/lib/utils"

type TagBadgeProps = {
    tag: Pick<Tag, "name" | "color" | "shape">
    className?: string
}

/** The outline of the label shape: a point on the left (the hole of the label sits in it). */
const LABEL_CLIP = "[clip-path:polygon(0.5rem_0,100%_0,100%_100%,0.5rem_100%,0_50%)]"

/**
 * A tag as a small badge: its name on a light tint of its color with a border of the same color. The text keeps the
 * foreground color of the theme (never the tag color), so it stays readable in the light, dark and high contrast themes;
 * the tint follows the "color intensity" preference like the other colored elements. A tag without color is a neutral badge.
 * The shape of the tag says how it is drawn: a pill (the default), a rounded rectangle, a label with a point on the left, or
 * no box at all (a colored dot and the name). A long name is cut with an ellipsis (the full name is the title of the badge).
 * @category Components
 */
export const TagBadge = memo(({ tag, className }: TagBadgeProps) => {
    const colorAlpha = useColorAlpha()
    const color = tag.color || undefined
    const shape = shapeOf(tag.shape)

    if (shape === "dot") return (
        <span
            data-testid="tag-badge"
            data-shape="dot"
            title={tag.name}
            className={cn("inline-flex max-w-32 min-w-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap text-foreground", className)}
        >
            <span
                aria-hidden="true"
                className={cn("size-2.5 shrink-0 rounded-full", !color && "bg-muted-foreground/50")}
                style={color ? { backgroundColor: color } : undefined}
            />
            <span className="truncate">{tag.name}</span>
        </span>
    )

    const label = shape === "tag"
    return (
        <Badge
            variant={color && !label ? "outline" : "secondary"}
            data-testid="tag-badge"
            data-shape={shape}
            title={tag.name}
            className={cn(
                "relative max-w-32 min-w-0 justify-start px-1.5 py-0 text-foreground",
                color && !label && "border-2",
                shape === "rounded" && "rounded-sm",
                label && cn("rounded-none pl-4", LABEL_CLIP),
                className,
            )}
            style={color ? { backgroundColor: hexToRgba(colorAlpha.item(), color), ...(label ? {} : { borderColor: hexToRgba(0.85, color) }) } : undefined}
        >
            {label && (
                <span
                    aria-hidden="true"
                    className={cn("absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full", !color && "bg-muted-foreground/60")}
                    style={color ? { backgroundColor: hexToRgba(0.85, color) } : undefined}
                />
            )}
            <span className="truncate">{tag.name}</span>
        </Badge>
    )
})

/**
 * A small drawing of a tag shape in a color (no text): what the shape picker shows for each shape. It uses the same outline
 * as {@link TagBadge}, so the sample is what the tag will look like.
 * @category Components
 */
export const TagShapeSample = memo(({ shape, color, className }: { shape: TagShape, color?: string | null, className?: string }) => {
    const colorAlpha = useColorAlpha()
    if (shape === "dot") return (
        <span
            aria-hidden="true"
            className={cn("inline-block size-3 rounded-full", !color && "bg-muted-foreground/60", className)}
            style={color ? { backgroundColor: color } : undefined}
        />
    )
    return (
        <span
            aria-hidden="true"
            className={cn(
                "inline-block h-3.5 w-7 border-2 border-muted-foreground/60 bg-muted-foreground/20",
                shape === "pill" && "rounded-full",
                shape === "rounded" && "rounded-sm",
                shape === "tag" && cn("rounded-none border-0", LABEL_CLIP),
                className,
            )}
            style={color ? { backgroundColor: hexToRgba(colorAlpha.item(), color), borderColor: hexToRgba(0.85, color) } : undefined}
        />
    )
})
