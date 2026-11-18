import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { DialogAddColor } from "./dialog-add-color"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
const setup = (over: Partial<Parameters<typeof DialogAddColor>[0]> = {}) => {
    const addColorItem = vi.fn().mockResolvedValue(undefined)
    const getItemData = vi.fn().mockResolvedValue(undefined)
    const setDropDownOpen = vi.fn()
    const utils = render(
        <DialogAddColor
            item={{ id: 4, color: "#111111" }}
            itemType="section"
            getItemId={2}
            addColorItem={addColorItem}
            getItemData={getItemData}
            setDropDownOpen={setDropDownOpen}
            {...over}
        />
    )
    return { addColorItem, getItemData, setDropDownOpen, ...utils }
}

describe("DialogAddColor", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("saves the clicked swatch, closes the dropdown and refreshes", async () => {
        const user = userEvent.setup()
        const { addColorItem, getItemData, setDropDownOpen } = setup()
        await user.click(screen.getAllByRole("radio")[0])

        await waitFor(() => expect(getItemData).toHaveBeenCalledWith(2))
        expect(addColorItem).toHaveBeenCalledWith("section", 4, "#e6194b")
        expect(setDropDownOpen).toHaveBeenCalledWith(false)
    })

    it("does not save when the clicked color equals the current one", async () => {
        const user = userEvent.setup()
        const { addColorItem } = setup({ item: { id: 4, color: "#e6194b" } })
        await user.click(screen.getAllByRole("radio")[0])

        expect(addColorItem).not.toHaveBeenCalled()
    })

    it("does not save without getItemId", async () => {
        const user = userEvent.setup()
        const { addColorItem } = setup({ getItemId: undefined })
        await user.click(screen.getAllByRole("radio")[0])
        expect(addColorItem).not.toHaveBeenCalled()
    })

    it("saves without a reload hook (the caller updates the cached data)", async () => {
        const user = userEvent.setup()
        const { addColorItem } = setup({ getItemData: undefined, getItemId: undefined })
        await user.click(screen.getAllByRole("radio")[0])
        await waitFor(() => expect(addColorItem).toHaveBeenCalledWith("section", 4, "#e6194b"))

        await user.click(screen.getByRole("button", { name: /Nessun colore/ }))
        await waitFor(() => expect(addColorItem).toHaveBeenCalledWith("section", 4))
    })

    it("saves the color chosen with the custom picker", async () => {
        const { addColorItem, container } = setup()
        const picker = container.querySelector("input[type=color]") as HTMLInputElement
        fireEvent.change(picker, { target: { value: "#00ff00" } })

        await waitFor(() => expect(addColorItem).toHaveBeenCalledWith("section", 4, "#00ff00"))
    })

    it("removes the color when Nessun colore is clicked", async () => {
        const user = userEvent.setup()
        const { addColorItem, getItemData } = setup()
        await user.click(screen.getByRole("button", { name: /Nessun colore/ }))

        await waitFor(() => expect(getItemData).toHaveBeenCalledWith(2))
        expect(addColorItem).toHaveBeenCalledWith("section", 4)
    })

    it("does nothing on Nessun colore if the item has no color", async () => {
        const user = userEvent.setup()
        const { addColorItem } = setup({ item: { id: 4, color: null } })
        await user.click(screen.getByRole("button", { name: /Nessun colore/ }))
        expect(addColorItem).not.toHaveBeenCalled()
    })

    it("reports failures with a toast", async () => {
        const user = userEvent.setup()
        const { addColorItem } = setup()
        addColorItem.mockRejectedValue(new Error("write failed"))
        await user.click(screen.getAllByRole("radio")[1])

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("write failed"))
    })
})

describe("DialogAddColor with the automatic color of a group", () => {
    it("marks no swatch, not even the custom one, and still picks a color", async () => {
        const user = userEvent.setup()
        const { addColorItem, container } = setup({ item: { id: 4, color: "progress" } })
        expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument()
        expect(container.querySelector(".lucide-check")).toBeNull()
        await user.click(screen.getAllByRole("radio")[0])
        await waitFor(() => expect(addColorItem).toHaveBeenCalledWith("section", 4, "#e6194b"))
    })
})
