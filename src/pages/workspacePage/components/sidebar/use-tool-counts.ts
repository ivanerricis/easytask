import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useNow } from "@/hooks/use-now"
import { countDueNow, useDueTasks } from "@/components/due/use-due-tasks"
import { useVersionedCount } from "./use-versioned-count"

/** Number of tasks overdue or due today in the current workspace. */
export const useDueCount = (): number => {
    const { currentWorkspace } = useWorkspace()
    const tasks = useDueTasks(currentWorkspace?.id)
    const now = useNow()
    return tasks ? countDueNow(tasks, now) : 0
}

/** Number of templates of the current workspace (queried again when the templates change). */
export const useTemplateCount = (): number => {
    const { countTemplates } = useWorkspaceActions()
    return useVersionedCount("templates", countTemplates)
}

/** Number of archived items of the current workspace (every write that touches the archive bumps its version). */
export const useArchiveCount = (): number => {
    const { getArchiveCount } = useWorkspaceActions()
    return useVersionedCount("archive", getArchiveCount)
}

/** Number of items in the trash of the current workspace (every write that touches the trash bumps its version). */
export const useTrashCount = (): number => {
    const { getTrashCount } = useWorkspaceActions()
    return useVersionedCount("trash", getTrashCount)
}
