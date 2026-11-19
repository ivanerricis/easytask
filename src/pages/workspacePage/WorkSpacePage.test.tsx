import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WorkSpacePage from "./WorkSpacePage"
import { deferred } from "@/test/ui-render"
import { saveLastWorkspaceId } from "@/lib/store/preferences"
import { makeWorkspace } from "@/test/ui-fixtures"

const workspaceCtx = {
    currentWorkspace: null as ReturnType<typeof makeWorkspace> | null,
    workspaces: [] as ReturnType<typeof makeWorkspace>[],
    getWorkspaces: vi.fn(),
    setCurrentWorkspace: vi.fn(),
}
const dataCtx = { error: null as string | null, getWorkspaceData: vi.fn(), loadedWorkspaceId: null as number | null }

vi.mock("@/lib/store/preferences", () => ({ saveLastWorkspaceId: vi.fn() }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => workspaceCtx }))
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceData: () => dataCtx }))
vi.mock("@/contexts/audio-context", () => ({ AudioProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("./WorkSpacePageLayout", () => ({ WorkSpaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("./components/MainContainer", () => ({ MainContainer: () => <div>main-container</div> }))
vi.mock("@/components/pages/error-page", () => ({ ErrorPage: ({ error }: { error: string }) => <div>error:{error}</div> }))

/** The page at /workspace/:id, with a home route to see redirects. */
const pageAt = (id: number) => (
    <MemoryRouter initialEntries={[`/workspace/${id}`]}>
        <Routes>
            <Route path="/" element={<div>home</div>} />
            <Route path="/workspace/:id" element={<WorkSpacePage />} />
        </Routes>
    </MemoryRouter>
)
const renderAt = (id: number) => render(pageAt(id))

describe("WorkSpacePage", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        workspaceCtx.currentWorkspace = makeWorkspace({ id: 4 })
        workspaceCtx.workspaces = []
        workspaceCtx.getWorkspaces.mockResolvedValue(undefined)
        dataCtx.error = null
        dataCtx.loadedWorkspaceId = null
        dataCtx.getWorkspaceData.mockResolvedValue(undefined)
        vi.mocked(saveLastWorkspaceId).mockResolvedValue(undefined)
    })

    it("remembers the open workspace id", async () => {
        renderAt(4)
        await waitFor(() => expect(saveLastWorkspaceId).toHaveBeenCalledWith(4))
    })

    it("shows the loading page until the data is loaded, then the main container", async () => {
        const d = deferred()
        dataCtx.getWorkspaceData.mockReturnValue(d.promise)
        const { rerender } = renderAt(4)

        expect(screen.getByText("Caricamento dati del workspace")).toBeInTheDocument()
        expect(dataCtx.getWorkspaceData).toHaveBeenCalledWith(4)
        expect(screen.queryByText("main-container")).not.toBeInTheDocument()

        d.resolve()
        dataCtx.loadedWorkspaceId = 4
        rerender(pageAt(4))
        expect(await screen.findByText("main-container")).toBeInTheDocument()
        expect(screen.queryByText("Caricamento dati del workspace")).not.toBeInTheDocument()
    })

    it("shows the loading page again when another workspace is opened", async () => {
        dataCtx.loadedWorkspaceId = 4
        const { rerender } = renderAt(4)
        expect(await screen.findByText("main-container")).toBeInTheDocument()

        workspaceCtx.currentWorkspace = makeWorkspace({ id: 5 })
        rerender(pageAt(4))

        expect(screen.getByText("Caricamento dati del workspace")).toBeInTheDocument()
        expect(screen.queryByText("main-container")).not.toBeInTheDocument()
        await waitFor(() => expect(dataCtx.getWorkspaceData).toHaveBeenCalledWith(5))
    })

    it("shows the error page when the context reports an error", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        dataCtx.getWorkspaceData.mockRejectedValue(new Error("load failed"))
        dataCtx.error = "Errore caricamento dati del Workspace"
        renderAt(4)

        expect(await screen.findByText("error:Errore caricamento dati del Workspace")).toBeInTheDocument()
        expect(screen.queryByText("main-container")).not.toBeInTheDocument()
        expect(spy).toHaveBeenCalled()
    })

    describe("after a reload of /workspace/:id (no current workspace in memory)", () => {
        beforeEach(() => { workspaceCtx.currentWorkspace = null })

        it("restores the workspace of the URL, loading the list first", async () => {
            const { rerender } = renderAt(4)
            expect(screen.getByText("Caricamento dati del workspace")).toBeInTheDocument()
            await waitFor(() => expect(workspaceCtx.getWorkspaces).toHaveBeenCalledTimes(1))

            workspaceCtx.workspaces = [makeWorkspace({ id: 3 }), makeWorkspace({ id: 4 })]
            rerender(pageAt(4))
            await waitFor(() => expect(workspaceCtx.setCurrentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ id: 4 })))
            expect(workspaceCtx.getWorkspaces).toHaveBeenCalledTimes(1)
        })

        it("goes back to the home page when the workspace no longer exists", async () => {
            workspaceCtx.workspaces = [makeWorkspace({ id: 3 })]
            renderAt(9)
            await waitFor(() => expect(workspaceCtx.getWorkspaces).toHaveBeenCalledTimes(1))
            expect(await screen.findByText("home")).toBeInTheDocument()
            expect(workspaceCtx.setCurrentWorkspace).not.toHaveBeenCalled()
        })
    })
})
