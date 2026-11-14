import { memo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePreference } from "@/contexts/use-preference"
import { useHasTaskSelection } from "./use-task-selection"
import { useTaskInsertStore } from "./task-insert-state"

type TaskInsertLineProps = {
    listKey: string
    /** The task above the line (null = the line at the top of the list). */
    afterTaskId: number | null
    /** The first line of a container: the zone does not stick out above it (the "+" is centered on the border and sticks out, so the container must not clip it). */
    first?: boolean
}

/**
 * A thin line with a "+" between two tasks (mouse only: out of the tab order and hidden from assistive tech). It takes no
 * space: the sensitive zone straddles the border of the tasks and the line is drawn over it. A click opens the field of a
 * new task at that point. Not shown while dragging, with a multi-selection of tasks or when the preference is off.
 */
export const TaskInsertLine = memo(function TaskInsertLine({ listKey, afterTaskId, first }: TaskInsertLineProps) {
    const { t } = useTranslation()
    const showTaskInsertLine = usePreference(p => p.showTaskInsertLine)
    const hasSelection = useHasTaskSelection()
    const store = useTaskInsertStore()
    const open = useCallback(() => store.claim({ listKey, afterTaskId }), [store, listKey, afterTaskId])

    if (!showTaskInsertLine || hasSelection) return null

    // Hidden while dragging by CSS (the provider marks the body): a store selector here would re-render every line when a drag starts and ends
    return (
        <div className="relative z-20 h-0 [body[data-note-dragging]_&]:hidden" aria-hidden>
            <div
                data-testid="task-insert-zone"
                className={first ? "group/insert absolute inset-x-0 top-0 h-1" : "group/insert absolute inset-x-0 -top-[3px] h-1.5"}
            >
                <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary opacity-0 pointer-events-none group-hover/insert:opacity-100" />
                <Button
                    type="button"
                    variant="default"
                    size="icon"
                    tabIndex={-1}
                    aria-hidden
                    title={t("tasks.insertLine.insertHere")}
                    onPointerDown={event => event.stopPropagation()}
                    onMouseDown={event => event.preventDefault()}
                    onClick={open}
                    className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 group-hover/insert:opacity-100 [&_svg]:!h-3 [&_svg]:!w-3"
                >
                    <Plus strokeWidth={3} />
                </Button>
            </div>
        </div>
    )
})
