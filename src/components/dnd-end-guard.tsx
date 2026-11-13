import { useDndContext } from "@dnd-kit/core"
import { useEffect, useLayoutEffect, useRef } from "react"

/** How long a drag the provider started may go on without dnd-kit having one before it is closed (ms). */
export const LOST_DRAG_DELAY = 150

/**
 * dnd-kit does not call `onDragEnd` / `onDragCancel` when the drag ends before its first render after the start (the pointer pressed,
 * moved past the activation distance and released in the same moment, like a quick click on a close button that slips a little):
 * `onDragStart` ran, so the provider still thinks an item is dragged and its cover over the window (the closed hand cursor) stays,
 * swallowing every click. Placed inside a `DndContext`, this calls `onLost` when the provider is `dragging` but dnd-kit has no drag.
 *
 * Checked after a short wait, not in the same render: the state of the provider and the one of dnd-kit can reach React in two
 * different renders at the start of a real drag.
 */
export function DragEndGuard({ dragging, onLost }: { dragging: boolean, onLost: () => void }) {
    const { active } = useDndContext()
    const latest = useRef({ dragging, idle: active === null, onLost })
    useLayoutEffect(() => {
        latest.current = { dragging, idle: active === null, onLost }
    })

    useEffect(() => {
        if (!dragging || active !== null) return
        const timer = setTimeout(() => {
            const { dragging: still, idle, onLost: lost } = latest.current
            if (still && idle) lost()
        }, LOST_DRAG_DELAY)
        return () => clearTimeout(timer)
    }, [dragging, active])

    return null
}
