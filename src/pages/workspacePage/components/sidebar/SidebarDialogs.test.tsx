import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SidebarDialogs } from "./SidebarDialogs"
import { requestAppCommand } from "@/lib/app-commands"

vi.mock("@/components/dialogs/dialog-trash", () => ({ DialogTrash: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Dialogo cestino</div> : null }))
vi.mock("@/components/dialogs/dialog-archive", () => ({ DialogArchive: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Dialogo archivio</div> : null }))
vi.mock("@/components/dialogs/dialog-templates", () => ({ DialogTemplates: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Dialogo template</div> : null }))
vi.mock("@/components/dialogs/dialog-pick-template", () => ({ DialogPickTemplate: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Scegli template</div> : null }))
vi.mock("@/components/dialogs/dialog-note-from-template", () => ({ DialogNoteFromTemplate: () => null }))

// SidebarDialogs also listens to the "new page" shortcut: these tests have no ShortcutsProvider
vi.mock("@/hooks/use-shortcut", () => ({ useShortcut: () => {} }))

describe("SidebarDialogs", () => {
    it.each([
        ["open-trash", "Dialogo cestino"],
        ["open-archive", "Dialogo archivio"],
        ["open-templates", "Dialogo template"],
        ["note-from-template", "Scegli template"],
    ] as const)("opens the dialog of %s with no sidebar button mounted", async (command, text) => {
        render(<SidebarDialogs />)
        expect(screen.queryByText(text)).not.toBeInTheDocument()
        act(() => requestAppCommand(command))
        expect(await screen.findByText(text)).toBeInTheDocument()
    })
})
