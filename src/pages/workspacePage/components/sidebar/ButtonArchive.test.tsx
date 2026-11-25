import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import userEvent from "@testing-library/user-event"
import { ButtonArchive } from "./ButtonArchive"
import { SidebarDialogs } from "./SidebarDialogs"
import { makeWorkspace } from "@/test/ui-fixtures"

const data = {
    getArchiveCount: vi.fn(),
    version: 0,
}
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => data, useWorkspaceVersion: () => data.version }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: makeWorkspace({ id: 4 }) }) }))
vi.mock("@/components/dialogs/dialog-archive", () => ({
    DialogArchive: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Dialogo archivio</div> : null,
}))

// Simulates an archive elsewhere in the app: the archive grows and archiveVersion is bumped
const Harness = () => {
    const [, setTick] = useState(0)
    return (
        <>
            <button onClick={() => { data.version += 1; setTick(t => t + 1) }}>simulate-archive</button>
            <ButtonArchive />
        </>
    )
}

// SidebarDialogs also listens to the "new page" shortcut: these tests have no ShortcutsProvider
vi.mock("@/hooks/use-shortcut", () => ({ useShortcut: () => {} }))

describe("ButtonArchive", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        data.version = 0
    })

    it("shows the number of archived items", async () => {
        data.getArchiveCount.mockResolvedValue(3)
        render(<ButtonArchive />)
        expect(await screen.findByText("3 elementi nell'archivio")).toBeInTheDocument()
        expect(data.getArchiveCount).toHaveBeenCalledWith(4)
    })

    it("has no badge when the archive is empty", async () => {
        data.getArchiveCount.mockResolvedValue(0)
        render(<ButtonArchive />)
        await waitFor(() => expect(data.getArchiveCount).toHaveBeenCalled())
        expect(screen.queryByText(/nell'archivio/)).not.toBeInTheDocument()
    })

    it("refreshes the badge when archiveVersion changes", async () => {
        const user = userEvent.setup()
        data.getArchiveCount.mockResolvedValueOnce(0).mockResolvedValue(1)
        render(<Harness />)
        await waitFor(() => expect(data.getArchiveCount).toHaveBeenCalledTimes(1))

        await user.click(screen.getByText("simulate-archive"))
        expect(await screen.findByText("1 elemento nell'archivio")).toBeInTheDocument()
        expect(data.getArchiveCount).toHaveBeenCalledTimes(2)
    })

    it("opens the archive dialog on click", async () => {
        const user = userEvent.setup()
        data.getArchiveCount.mockResolvedValue(0)
        render(<><ButtonArchive /><SidebarDialogs /></>)
        expect(screen.queryByText("Dialogo archivio")).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: /Archivio/ }))
        expect(await screen.findByText("Dialogo archivio")).toBeInTheDocument()
    })
})
