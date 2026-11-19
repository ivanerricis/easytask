import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import MainPage from "./MainPage"
import { makeWorkspace } from "@/test/ui-fixtures"

const ctx = {
    workspaces: [] as ReturnType<typeof makeWorkspace>[],
    getWorkspaces: vi.fn(),
    setCurrentWorkspace: vi.fn(),
    isLoading: false,
    error: null as string | null,
}
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ctx }))

const startup = { pending: false }
vi.mock("./startup-restore", () => ({ useStartupRestore: () => startup }))
const prefs = {
    workspaceView: "grid" as "grid" | "list",
    setWorkspaceView: vi.fn(),
    workspaceSort: { by: "edited", dir: "desc" } as { by: string; dir: string },
    setWorkspaceSort: vi.fn(),
    reopenLastWorkspace: false,
}
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))
vi.mock("./MainPageLayout", () => ({ MainPageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("./components/DialogCreateWorkspace", () => ({ DialogCreateWorkspace: () => <div>create-dialog</div> }))
vi.mock("./components/ButtonTrashWorkspaces", () => ({ ButtonTrashWorkspaces: () => <button type="button">trash-button</button> }))
vi.mock("./components/WorkspacesContainer", () => ({
    WorkspacesContainer: ({ workspaces, view, loading }: { workspaces: { name: string }[]; view: string; loading?: boolean }) => (
        <ul data-view={view} data-loading={loading ? "true" : undefined}>{workspaces.map(w => <li key={w.name}>{w.name}</li>)}</ul>
    ),
}))
vi.mock("@/components/pages/error-page", () => ({ ErrorPage: ({ error }: { error: string }) => <div>error:{error}</div> }))

// Until the first load of the workspaces is over the page shows skeletons in place of the list
const renderLoaded = async () => {
    const result = render(<MainPage />)
    await screen.findByText("Bentornato!")
    return result
}

describe("MainPage", () => {
    beforeEach(() => {
        // Radix (dropdown menu) measures its content: jsdom has no ResizeObserver
        vi.stubGlobal("ResizeObserver", class { observe() { /* none */ } unobserve() { /* none */ } disconnect() { /* none */ } })
        vi.resetAllMocks()
        ctx.workspaces = []
        ctx.isLoading = false
        ctx.error = null
        startup.pending = false
        prefs.workspaceView = "grid"
        prefs.workspaceSort = { by: "edited", dir: "desc" }
        prefs.reopenLastWorkspace = false
        ctx.getWorkspaces.mockResolvedValue(undefined)
    })


    it("shows the loading page while the last workspace may be reopened", () => {
        startup.pending = true
        prefs.reopenLastWorkspace = true
        ctx.workspaces = [makeWorkspace({ name: "Alpha" })]
        render(<MainPage />)
        expect(screen.getByText("Caricamento dei workspace")).toBeInTheDocument()
        expect(screen.queryByText("Bentornato!")).not.toBeInTheDocument()
        expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })

    it("offers the import button next to the create dialog", async () => {
        await renderLoaded()
        expect(screen.getByRole("button", { name: "Importa un workspace" })).toBeEnabled()
    })

    it("requests the workspaces on mount", () => {
        render(<MainPage />)
        expect(ctx.getWorkspaces).toHaveBeenCalledTimes(1)
    })

    it("shows the page at once during the initial load, with the list announced as loading", () => {
        startup.pending = true
        ctx.getWorkspaces.mockReturnValue(new Promise(() => { /* never loads */ }))
        render(<MainPage />)
        expect(screen.getByText("Bentornato!")).toBeInTheDocument()
        expect(screen.getByRole("list")).toHaveAttribute("data-loading", "true")
    })

    it("keeps showing the list while a later operation is running", async () => {
        ctx.isLoading = true
        ctx.workspaces = [makeWorkspace({ name: "Alpha" })]
        await renderLoaded()
        expect(screen.getByText("Alpha")).toBeInTheDocument()
        expect(screen.queryByText("Caricamento dei workspace")).not.toBeInTheDocument()
    })

    it("does not replace the page with the loading page when an operation runs on an empty list", async () => {
        const { rerender } = await renderLoaded()
        ctx.isLoading = true
        ctx.workspaces = []
        // e.g. restoring a workspace from the trash: the page (and the open trash dialog) must stay mounted
        rerender(<MainPage />)
        expect(screen.getByText("trash-button")).toBeInTheDocument()
        expect(screen.queryByText("Caricamento dei workspace")).not.toBeInTheDocument()
    })

    it("offers the trash button next to the view toggle", async () => {
        await renderLoaded()
        const toggle = screen.getByRole("button", { name: "Visualizza come lista" })
        const trash = screen.getByText("trash-button")
        expect(toggle.parentElement).toBe(trash.parentElement)
    })

    it("shows the error page when loading failed and nothing is cached", async () => {
        ctx.error = "db unavailable"
        render(<MainPage />)
        expect(await screen.findByText("error:db unavailable")).toBeInTheDocument()
    })

    it("shows the workspaces instead of the error when some are available", async () => {
        ctx.error = "stale"
        ctx.workspaces = [makeWorkspace({ name: "Beta" })]
        render(<MainPage />)
        expect(await screen.findByText("Beta")).toBeInTheDocument()
        expect(screen.queryByText(/error:/)).not.toBeInTheDocument()
    })

    it("passes the persisted view to the container", async () => {
        prefs.workspaceView = "list"
        ctx.workspaces = [makeWorkspace({ name: "Alpha" })]
        const { container } = await renderLoaded()
        expect(container.querySelector("ul")).toHaveAttribute("data-view", "list")
    })

    it("switches from grid to list through the toggle", async () => {
        const user = userEvent.setup()
        await renderLoaded()
        await user.click(screen.getByRole("button", { name: "Visualizza come lista" }))
        expect(prefs.setWorkspaceView).toHaveBeenCalledWith("list")
    })

    it("switches from list back to grid through the toggle", async () => {
        const user = userEvent.setup()
        prefs.workspaceView = "list"
        await renderLoaded()
        await user.click(screen.getByRole("button", { name: "Visualizza come griglia" }))
        expect(prefs.setWorkspaceView).toHaveBeenCalledWith("grid")
    })

    it("offers the sort button next to the view toggle", async () => {
        await renderLoaded()
        const sort = screen.getByRole("button", { name: "Ordina" })
        expect(sort.parentElement).toBe(screen.getByText("trash-button").parentElement)
    })

    it("changes the sort criterion keeping the direction", async () => {
        const user = userEvent.setup()
        await renderLoaded()
        await user.click(screen.getByRole("button", { name: "Ordina" }))
        await user.click(await screen.findByRole("menuitemradio", { name: "Nome" }))
        expect(prefs.setWorkspaceSort).toHaveBeenCalledWith({ by: "name", dir: "desc" })
    })

    it("changes the sort direction keeping the criterion", async () => {
        const user = userEvent.setup()
        await renderLoaded()
        await user.click(screen.getByRole("button", { name: "Ordina" }))
        await user.click(await screen.findByRole("menuitemradio", { name: "Prima i meno recenti" }))
        expect(prefs.setWorkspaceSort).toHaveBeenCalledWith({ by: "edited", dir: "asc" })
    })

    it("uses A-Z labels for the direction when sorting by name", async () => {
        const user = userEvent.setup()
        prefs.workspaceSort = { by: "name", dir: "asc" }
        await renderLoaded()
        await user.click(screen.getByRole("button", { name: "Ordina" }))
        expect(await screen.findByRole("menuitemradio", { name: "Dalla A alla Z" })).toBeChecked()
    })
})
