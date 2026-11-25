import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceData } from "@/contexts/workspace-data"
import { useStoreSelector } from "@/lib/external-store"
import { markOpenTaskReady, openTaskStore } from "@/lib/open-task-request"
import { openPendingNotificationTask, runDueNotificationPass } from "@/lib/due-notify"
import { reportError } from "@/lib/report-error"

/** The notifications are checked this often (the app may only live in the tray: this is plain page code, it keeps running there). */
const PASS_EVERY_MS = 30_000
/** The first pass waits a little, so the start of the app is not slowed down. */
const FIRST_PASS_DELAY_MS = 2_000

/**
 * Mounted once, inside the router: runs the due date notifications and takes the app to the workspace of a task that has to be
 * shown (a request from a notification may come from any page, while another workspace is open).
 */
export function DueBackground() {
    const { workspaces, currentWorkspace, setCurrentWorkspace, getWorkspaces } = useWorkspace()
    const { loadedWorkspaceId } = useWorkspaceData()
    const navigate = useNavigate()
    const onWorkspacePage = useLocation().pathname.startsWith("/workspace/")
    const request = useStoreSelector(openTaskStore, state => state)

    useEffect(() => {
        const first = window.setTimeout(() => { void runDueNotificationPass() }, FIRST_PASS_DELAY_MS)
        const every = window.setInterval(() => { void runDueNotificationPass() }, PASS_EVERY_MS)
        let unlisten: (() => void) | undefined
        let disposed = false
        getCurrentWindow().onFocusChanged(({ payload: focused }) => {
            if (!focused) return
            openPendingNotificationTask()
            void runDueNotificationPass()
        }).then(stop => { if (disposed) stop(); else unlisten = stop }).catch(error => reportError(error))
        return () => {
            disposed = true
            window.clearTimeout(first)
            window.clearInterval(every)
            unlisten?.()
        }
    }, [])

    // The workspace of the task is open with its data: its note can be opened
    useEffect(() => {
        if (request && !request.ready && currentWorkspace?.id === request.workspaceId && loadedWorkspaceId === request.workspaceId && onWorkspacePage) markOpenTaskReady()
    }, [request, currentWorkspace, loadedWorkspaceId, onWorkspacePage])

    // A task of another workspace (or asked from the home page): open its workspace first, the note then follows
    useEffect(() => {
        if (!request || currentWorkspace?.id === request.workspaceId && onWorkspacePage) return
        const workspace = workspaces.find(item => item.id === request.workspaceId)
        if (workspace) {
            setCurrentWorkspace(workspace)
            navigate(`/workspace/${workspace.id}`)
        } else {
            void getWorkspaces().catch(error => reportError(error))
        }
    }, [request, workspaces, currentWorkspace, onWorkspacePage, setCurrentWorkspace, navigate, getWorkspaces])

    return null
}
