import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DialogTaskTags } from "./DialogTaskTags"

vi.mock("./TagPicker", () => ({ TagPicker: ({ taskIds }: { taskIds: number[] }) => <output data-testid="picker">{taskIds.join(",")}</output> }))

describe("DialogTaskTags", () => {
    it("is titled for one task and passes it to the list", () => {
        render(<DialogTaskTags open onOpenChange={vi.fn()} taskIds={[7]} />)
        expect(screen.getByRole("dialog", { name: "Tag del task" })).toBeInTheDocument()
        expect(screen.getByTestId("picker")).toHaveTextContent("7")
    })

    it("counts the tasks when it acts on several", () => {
        render(<DialogTaskTags open onOpenChange={vi.fn()} taskIds={[7, 8, 9]} />)
        expect(screen.getByRole("dialog", { name: "Tag di 3 task" })).toBeInTheDocument()
        expect(screen.getByText("Spunta i tag da dare ai task selezionati. I tag sono di questo workspace.")).toBeInTheDocument()
    })

    it("closes with the Done button", async () => {
        const onOpenChange = vi.fn()
        render(<DialogTaskTags open onOpenChange={onOpenChange} taskIds={[7]} />)
        await userEvent.click(screen.getByRole("button", { name: "Fatto" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("keeps clicks and keys out of the row it was opened from", () => {
        const onClick = vi.fn()
        const onKeyDown = vi.fn()
        render(<div onClick={onClick} onKeyDown={onKeyDown}><DialogTaskTags open onOpenChange={vi.fn()} taskIds={[7]} /></div>)
        const dialog = screen.getByRole("dialog")
        fireEvent.click(dialog)
        fireEvent.keyDown(dialog, { key: " " })
        expect(onClick).not.toHaveBeenCalled()
        expect(onKeyDown).not.toHaveBeenCalled()
    })
})
