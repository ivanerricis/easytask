import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DialogSectionTags } from "./DialogSectionTags"

vi.mock("./TagPicker", () => ({ TagPicker: ({ sectionIds }: { sectionIds: number[] }) => <output data-testid="picker">{sectionIds.join(",")}</output> }))

describe("DialogSectionTags", () => {
    it("is titled for the section and passes it to the list as a section", () => {
        render(<DialogSectionTags open onOpenChange={vi.fn()} sectionId={4} />)
        expect(screen.getByRole("dialog", { name: "Tag della sezione" })).toBeInTheDocument()
        expect(screen.getByText("Spunta i tag da dare alla sezione. I tag sono di questo workspace.")).toBeInTheDocument()
        expect(screen.getByTestId("picker")).toHaveTextContent("4")
    })

    it("closes with the Done button", async () => {
        const onOpenChange = vi.fn()
        render(<DialogSectionTags open onOpenChange={onOpenChange} sectionId={4} />)
        await userEvent.click(screen.getByRole("button", { name: "Fatto" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("keeps clicks and keys out of the section it was opened from", () => {
        const onClick = vi.fn()
        const onKeyDown = vi.fn()
        render(<div onClick={onClick} onKeyDown={onKeyDown}><DialogSectionTags open onOpenChange={vi.fn()} sectionId={4} /></div>)
        const dialog = screen.getByRole("dialog")
        fireEvent.click(dialog)
        fireEvent.keyDown(dialog, { key: " " })
        expect(onClick).not.toHaveBeenCalled()
        expect(onKeyDown).not.toHaveBeenCalled()
    })
})
