import { cn } from "@/lib/utils"
import type { TaskDensityClasses } from "./task-density"

type Sizes = TaskDensityClasses

/**
 * The mark of a subtask: a short dash at the middle of its checkbox, a little before it (8px of space), in the muted text
 * color. It is the only connector of a subtask: no vertical lines join it to its parent.
 */
export function TaskConnectorTick({ sizes }: { depth: number, sizes: Sizes }) {
    return <span aria-hidden data-testid="subtask-tick" className={cn("pointer-events-none absolute left-[2px] h-px w-2.5 bg-muted-foreground", sizes.tickTop)} />
}
