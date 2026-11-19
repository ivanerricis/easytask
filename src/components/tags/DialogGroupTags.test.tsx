import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DialogGroupTags } from "./DialogGroupTags"

vi.mock("./TagPicker", () => ({ TagPicker: ({ groupIds }: { groupIds: number[] }) => <output data-testid="picker">{groupIds.join(",")}</output> }))

describe("DialogGroupTags", () => {
    it("is titled for the group and passes it to the list as a group", () => {
        render(<DialogGroupTags open onOpenChange={vi.fn()} groupId={4} />)
        expect(screen.getByRole("dialog", { name: "Tag del gruppo" })).toBeInTheDocument()
        expect(screen.getByText("Spunta i tag da dare al gruppo. I tag sono di questo workspace.")).toBeInTheDocument()
        expect(screen.getByTestId("picker")).toHaveTextContent("4")
    })

    it("closes with the Done button", async () => {
        const onOpenChange = vi.fn()
        render(<DialogGroupTags open onOpenChange={onOpenChange} groupId={4} />)
        await userEvent.click(screen.getByRole("button", { name: "Fatto" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("keeps clicks and keys out of the group it was opened from", () => {
        const onClick = vi.fn()
        const onKeyDown = vi.fn()
        render(<div onClick={onClick} onKeyDown={onKeyDown}><DialogGroupTags open onOpenChange={vi.fn()} groupId={4} /></div>)
        const dialog = screen.getByRole("dialog")
        fireEvent.click(dialog)
        fireEvent.keyDown(dialog, { key: " " })
        expect(onClick).not.toHaveBeenCalled()
        expect(onKeyDown).not.toHaveBeenCalled()
    })
})
