import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { NoteTemplate } from "@/types/template"
import { ButtonNoteFromTemplate } from "./ButtonNoteFromTemplate"
import { SidebarDialogs } from "./SidebarDialogs"

vi.mock("@/components/dialogs/dialog-pick-template", () => ({
    DialogPickTemplate: ({ isOpen, onPick }: { isOpen: boolean, onPick: (t: NoteTemplate) => void }) =>
        isOpen ? <button onClick={() => onPick({ id: 7, name: "Sprint" } as NoteTemplate)}>scegli</button> : null,
}))
vi.mock("@/components/dialogs/dialog-note-from-template", () => ({
    DialogNoteFromTemplate: ({ template }: { template: NoteTemplate }) => <div>Nota da {template.name}</div>,
}))

// SidebarDialogs also listens to the "new page" shortcut: these tests have no ShortcutsProvider
vi.mock("@/hooks/use-shortcut", () => ({ useShortcut: () => {} }))

describe("ButtonNoteFromTemplate", () => {
    it("chooses a template, then opens the new note dialog for it", async () => {
        const user = userEvent.setup()
        render(<><ButtonNoteFromTemplate /><SidebarDialogs /></>)
        expect(screen.queryByText("scegli")).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Nuova nota da template" }))
        await user.click(await screen.findByText("scegli"))
        expect(await screen.findByText("Nota da Sprint")).toBeInTheDocument()
    })
})
