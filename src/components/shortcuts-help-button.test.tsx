import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ShortcutsHelpButton } from "./shortcuts-help-button"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"
import { useShortcut } from "@/hooks/use-shortcut"

function Probe({ handler }: { handler: () => void }) {
    useShortcut("show-shortcuts", handler)
    return null
}

describe("ShortcutsHelpButton", () => {
    it("has an accessible name", () => {
        render(<ShortcutsProvider><ShortcutsHelpButton /></ShortcutsProvider>)
        expect(screen.getByRole("button", { name: "Scorciatoie da tastiera" })).toBeInTheDocument()
    })

    it("runs the show-shortcuts shortcut, like the Help menu entry", async () => {
        const user = userEvent.setup()
        const handler = vi.fn()
        render(<ShortcutsProvider><Probe handler={handler} /><ShortcutsHelpButton /></ShortcutsProvider>)
        await user.click(screen.getByRole("button", { name: "Scorciatoie da tastiera" }))
        expect(handler).toHaveBeenCalledTimes(1)
    })
})
