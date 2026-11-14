import { cn } from "@/lib/utils"
import type { TaskDensityClasses } from "./task-density"

type Sizes = TaskDensityClasses

// The line of a subtask runs under the checkbox of its parent: the checkbox of a subtask is 2px narrower than the one
// of a task, so under a subtask (depth 2+) the line sits 1px to the left (and the tick is 1px longer to reach the checkbox).
// Both ends of a line keep 3px from the checkboxes. The checkbox of a subtask starts where the text of its parent starts
// (the subtasks are indented by the checkbox of the parent, 16px, or 14px when the parent is a subtask, plus the gap), so
// the tree connector sits at 3px (4px) from the row.
const lineLeft = (depth: number) => depth > 1 ? "left-[4px]" : "left-[3px]"

/**
 * Tree connectors of a subtask: the line of the parent goes on past every subtask but the last, where it turns into its
 * tick (└). Only the direct child of the last subtask counts (a plain descendant selector would hide the lines of every
 * deeper level).
 */
export function TaskConnectors({ depth, sizes }: { depth: number, sizes: Sizes }) {
    const left = lineLeft(depth)
    return <>
        <span aria-hidden className={cn("pointer-events-none absolute -top-px -bottom-px w-px bg-muted-foreground/45 [.subtask:last-child>&]:hidden", left)} />
        <span aria-hidden className={cn("pointer-events-none absolute -top-px w-px [.subtask:last-child>&]:bg-muted-foreground/45", sizes.tickHeight, left)} />
    </>
}

/**
 * The mark of a subtask: a short dash at the middle of its checkbox, a little before it (8px of space), in the muted text
 * color. It is the only connector of a subtask: no vertical lines join it to its parent.
 */
export function TaskConnectorTick({ sizes }: { depth: number, sizes: Sizes }) {
    return <span aria-hidden data-testid="subtask-tick" className={cn("pointer-events-none absolute left-[2px] h-px w-2.5 bg-muted-foreground", sizes.tickTop)} />
}
