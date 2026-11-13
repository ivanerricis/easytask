import { Skeleton } from "@/components/ui/skeleton"
import { useDelayedFlag } from "@/hooks/use-delayed-flag"
import { CHROME_HEIGHT_CLASS, SIDEBAR_DEFAULT_WIDTH } from "@/lib/sidebar-layout"
import { cn } from "@/lib/utils"
import { NoteSkeleton } from "./groups/NoteSkeleton"

/** Depth of the rows of the skeleton tree: a folder with its notes, then loose notes. */
const TREE = [0, 1, 1, 0, 1, 0, 0] as const

/**
 * Shown while the data of a workspace loads: the shape of the workspace (the sidebar with its rows, the tab bar, the note) instead of
 * a spinner on an empty page. Like the skeleton of a note it is drawn only when the load lasts long enough to be noticed; the text
 * is there from the start for the screen readers.
 * @category Workspace
 */
export const WorkspaceSkeleton = ({ label }: { label: string }) => {
    const shown = useDelayedFlag(true)
    return (
        <div role="status" aria-live="polite" className="flex h-full w-full min-h-0">
            <span className="sr-only">{label}</span>
            {shown && <>
                <aside aria-hidden className="flex shrink-0 flex-col border-r bg-secondary" style={{ width: SIDEBAR_DEFAULT_WIDTH }}>
                    <div className={cn(CHROME_HEIGHT_CLASS, "flex items-center gap-3 border-b px-3")}>
                        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="size-5" />)}
                    </div>
                    <div className="flex flex-col gap-1 p-2">
                        {TREE.map((depth, i) => (
                            <div key={i} className="flex h-7 items-center gap-2 px-1.5" style={{ paddingLeft: 6 + depth * 20 }}>
                                <Skeleton className="size-4 shrink-0" />
                                <Skeleton className="h-3.5" style={{ width: `${45 + (i % 3) * 15}%` }} />
                            </div>
                        ))}
                    </div>
                </aside>
                <div aria-hidden className="flex min-w-0 flex-1 flex-col">
                    <div className={cn(CHROME_HEIGHT_CLASS, "flex shrink-0 border-b bg-secondary")}>
                        {[0, 1].map(i => (
                            <div key={i} className="flex w-44 items-center border-r px-3">
                                <Skeleton className="h-3.5" style={{ width: `${70 - i * 20}%` }} />
                            </div>
                        ))}
                    </div>
                    <div className="flex h-10 shrink-0 items-center gap-3 px-4">
                        <Skeleton className="h-3.5 w-32" />
                        <div className="ml-auto flex gap-3">
                            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="size-5" />)}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1">
                        <NoteSkeleton />
                    </div>
                </div>
            </>}
        </div>
    )
}
