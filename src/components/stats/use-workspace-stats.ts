import { useEffect, useState } from "react"
import { getDBWorkspaceStats } from "@/db/queries/stats"
import { useNow } from "@/hooks/use-now"
import { toDueDate } from "@/lib/due-date"
import { reportError } from "@/lib/report-error"
import type { WorkspaceStats } from "@/lib/workspace-stats"

/** The statistics are reloaded every few minutes (and when the day or the workspace changes), not on every edit. */
const REFRESH_MINUTES = 5

/** Loads the statistics of a workspace; null until the first load. */
export function useWorkspaceStats(workspaceId?: number): WorkspaceStats | null {
    const now = useNow()
    const today = toDueDate(now)
    const bucket = Math.floor(now.getTime() / (REFRESH_MINUTES * 60_000))
    const [stats, setStats] = useState<WorkspaceStats | null>(null)
    useEffect(() => {
        if (workspaceId === undefined) return
        let cancelled = false
        getDBWorkspaceStats(workspaceId, today)
            .then(value => { if (!cancelled) setStats(value) })
            .catch(error => reportError(error))
        return () => { cancelled = true }
    }, [workspaceId, today, bucket])
    return workspaceId === undefined ? null : stats
}
