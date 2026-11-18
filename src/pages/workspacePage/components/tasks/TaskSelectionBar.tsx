import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useSelectedTaskKeys } from "./use-task-selection"

/**
 * Shows how many tasks are selected once there are 2 or more (a lone selected task is not a multi-selection). The status
 * region stays mounted so that the change of the count is announced politely.
 */
export function TaskSelectionBar() {
    const { t } = useTranslation()
    const count = useSelectedTaskKeys().size

    return (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
            {count >= 2 &&
                <Badge data-testid="selection-count" data-task-selection-bar="" variant="default" className="pointer-events-auto px-3 py-1 text-sm tabular-nums shadow-md">
                    {t("tasks.selection.count", { count })}
                </Badge>}
        </div>
    )
}


/**
 * The scrollable area of the groups. With 2 or more tasks selected it keeps free room at the bottom (the pill of
 * TaskSelectionBar: bottom-4 plus its height) so that the pill does not cover the "+" of the last section. Without a
 * multi-selection the layout is not touched.
 */
export function SelectionBarInset({ className, ...props }: ComponentProps<"div">) {
    const multi = useSelectedTaskKeys().size >= 2
    return <div {...props} data-selection-inset={multi ? "true" : undefined} className={cn(className, multi && "pb-14")} />
}
