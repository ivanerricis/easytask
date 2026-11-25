import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { Archive, CalendarClock, LayoutTemplate, Trash2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type IconType = 'trash' | 'archive' | 'template' | 'due'

type ItemFooterProps = {
    text: string
    type: IconType
    className?: string
    onClick?: () => void
    disabled?: boolean
    badge?: number
    /** Accessible label of the badge (default: the number of items in the trash). */
    badgeLabel?: string
    /** Look of the badge (default: the accent colour). */
    badgeVariant?: ComponentProps<typeof Badge>["variant"]
}

const iconMap: Record<IconType, LucideIcon> = {
    trash: Trash2,
    archive: Archive,
    template: LayoutTemplate,
    due: CalendarClock,
}

export const ItemFooter = ({ text, type, className, onClick, disabled, badge, badgeLabel, badgeVariant }: ItemFooterProps) => {
    const { t } = useTranslation()

    const Icon = iconMap[type]

    return (
        <Button
            type="button"
            variant="ghost"
            onClick={onClick}
            disabled={disabled}
            className={cn("h-auto w-full justify-start gap-2 overflow-x-hidden px-2 py-1 font-normal", className)}
        >
            {/* Icon + text + count */}
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">
                {text}
            </span>
            {badge !== undefined && badge > 0 && (
                <>
                    <Badge variant={badgeVariant} aria-hidden="true" className="h-5 min-w-5 px-1 py-0 text-[11px] leading-none tabular-nums">{badge > 99 ? "99+" : badge}</Badge>
                    <span className="sr-only">{badgeLabel ?? t("sidebar.trashBadge", { count: badge })}</span>
                </>
            )}
        </Button>
    )
}
