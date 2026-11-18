import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ItemMenu, ItemMenuButton } from "./item-menu"
import { MenuItem } from "./menu-kind"
import { useItemMenuState } from "@/hooks/use-item-menu-state"

const Row = () => {
    const state = useItemMenuState()
    return (
        <ItemMenu state={state} items={<MenuItem>Voce</MenuItem>}>
            <div data-testid="row"><textarea aria-label="testo" readOnly defaultValue="x" /></div>
        </ItemMenu>
    )
}

describe("ItemMenu", () => {
    it("marks its row as the owner of the right click, so the text menu stays out of its read-only text", () => {
        render(<Row />)
        expect(screen.getByTestId("row")).toHaveAttribute("data-contextmenu")
    })

    it("opens its entries with a right click", async () => {
        render(<Row />)
        fireEvent.contextMenu(screen.getByTestId("row"))
        expect(await screen.findByRole("menuitem", { name: "Voce" })).toBeInTheDocument()
    })

    it("has a hit area wider than the 24px button, and can leave the tab order", () => {
        const Menu = ({ tabIndex }: { tabIndex?: number }) => {
            const state = useItemMenuState()
            return <ItemMenu state={state} items={<MenuItem>Voce</MenuItem>}><div><ItemMenuButton name="Nota" tabIndex={tabIndex} /></div></ItemMenu>
        }
        const { rerender } = render(<Menu />)
        const button = screen.getByRole("button", { name: /Nota/ })
        expect(button).toHaveClass("relative", "size-6", "after:absolute", "after:-inset-1")
        expect(button).not.toHaveAttribute("tabindex")
        rerender(<Menu tabIndex={-1} />)
        expect(screen.getByRole("button", { name: /Nota/ })).toHaveAttribute("tabindex", "-1")
    })

    it("takes the box size of the size prop (icon-xs: 20px)", () => {
        const Menu = () => {
            const state = useItemMenuState()
            return <ItemMenu state={state} items={<MenuItem>Voce</MenuItem>}><div><ItemMenuButton name="Nota" size="icon-xs" /></div></ItemMenu>
        }
        render(<Menu />)
        expect(screen.getByRole("button", { name: /Nota/ })).toHaveClass("size-5")
    })
})
