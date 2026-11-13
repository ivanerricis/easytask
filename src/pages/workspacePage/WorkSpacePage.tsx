import { useTranslation } from "react-i18next"
import { MainContainer } from "./components/MainContainer"
import { useWorkspace } from "@/contexts/use-workspace"
import { ErrorPage } from "@/components/pages/error-page"
import { WorkspaceSkeleton } from "./components/WorkspaceSkeleton"
import { WorkSpaceLayout } from "./WorkSpacePageLayout"
import { useWorkspaceData } from "@/contexts/workspace-data"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AudioProvider } from "@/contexts/audio-context"
import { saveLastWorkspaceId } from "@/lib/store/preferences"
import { reportError } from "@/lib/report-error"

const WorkSpacePage = () => {
    const { t } = useTranslation()
    const { currentWorkspace, workspaces, getWorkspaces, setCurrentWorkspace } = useWorkspace()
    const { error, getWorkspaceData, loadedWorkspaceId } = useWorkspaceData()
    const { id } = useParams()
    const navigate = useNavigate()

    // The current workspace only lives in memory: after a reload of /workspace/:id (e.g. a full reload in development)
    // it is restored from the URL (loading the list once if needed), or the home page is shown when it no longer exists
    const listRequested = useRef(false)
    const [listLoaded, setListLoaded] = useState(false)
    useEffect(() => {
        if (currentWorkspace) return
        const workspace = workspaces.find(item => item.id === Number(id))
        if (workspace) {
            setCurrentWorkspace(workspace)
            return
        }
        if (listLoaded) {
            navigate("/", { replace: true })
            return
        }
        if (listRequested.current) return
        listRequested.current = true
        getWorkspaces()
            .then(() => setListLoaded(true))
            .catch(err => {
                reportError(err)
                navigate("/", { replace: true })
            })
    }, [currentWorkspace, id, workspaces, listLoaded, getWorkspaces, setCurrentWorkspace, navigate])

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (currentWorkspace)
                    await getWorkspaceData(currentWorkspace.id)
            } catch (err) {
                // The failure is shown by the error page (context `error`), so no toast
                reportError(err)
            }
        }
        fetchData()
    }, [currentWorkspace, getWorkspaceData])

    // Remember the open workspace so it can be restored at the next startup
    useEffect(() => {
        if (currentWorkspace) saveLastWorkspaceId(currentWorkspace.id).catch(error => reportError(error))
    }, [currentWorkspace])

    if (error) {
        return (
            <WorkSpaceLayout>
                <ErrorPage error={error} />
            </WorkSpaceLayout>
        )
    }

    // No current workspace yet (restored from the URL) or its data is not loaded yet (opened from the home page or
    // switched from the combobox): show the shape of the workspace instead of the (empty or previous) content, inside the
    // layout so the title bar keeps working
    if (!currentWorkspace || loadedWorkspaceId !== currentWorkspace.id) {
        return (
            <WorkSpaceLayout>
                <WorkspaceSkeleton label={t("workspace.loading")} />
            </WorkSpaceLayout>
        )
    }

    // The audio provider wraps both the note view and the floating player (rendered by MainContainer)
    return (
        <AudioProvider>
            <WorkSpaceLayout>
                <MainContainer />
            </WorkSpaceLayout>
        </AudioProvider>
    )
}

export default WorkSpacePage