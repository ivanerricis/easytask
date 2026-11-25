import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TreeBackgroundMenu } from "./TreeBackgroundMenu"
import { APP_COMMAND_EVENT } from "@/lib/app-commands"
import { ItemMenu } from "@/components/item-menu"
import { MenuItem } from "@/components/menu-kind"
import { useItemMenuState } from "@/hooks/use-item-menu-state"

const importItems = vi.fn()
vi.mock("@/hooks/use-workspace-transfer", () => ({ useItemTransfer: () => ({ importItems, exportItem: vi.fn(), isBusy: false }) }))
// The creation dialogs need the workspace data: here only whether they are open matters
vi.mock("../AddNoteDialog", () => ({ AddNoteDialog: ({ open, kind }: { open: boolean, kind?: string }) => open ? <div>dialog-{kind ?? "note"}</div> : null }))
vi.mock("../AddFolderDialog", () => ({ AddFolderDialog: ({ open }: { open: boolean }) => open ? <div>dialog-folder</div> : null }))

const renderMenu = (props: { allCollapsed?: boolean, hasFolders?: boolean, onToggleAll?: () => void } = {}) =>
    render(
        <TreeBackgroundMenu allCollapsed={props.allCollapsed ?? false} hasFolders={props.hasFolders ?? true} onToggleAll={props.onToggleAll}>
            <div data-testid="area" />
        </TreeBackgroundMenu>,
    )

beforeEach(() => { importItems.mockClear() })

describe("TreeBackgroundMenu", () => {
    it("opens on a right click on the empty space with the creation entries", () => {
        renderMenu()
        expect(screen.queryByRole("menuitem")).toBeNull()
        fireEvent.contextMenu(screen.getByTestId("area"))
        expect(screen.getByRole("menuitem", { name: "Nuova nota" })).toBeInTheDocument()
        expect(screen.getByRole("menuitem", { name: "Nuova cartella" })).toBeInTheDocument()
        expect(screen.getByRole("menuitem", { name: "Nuova nota da template" })).toBeInTheDocument()
    })

    it("creates a note or a folder in the root", async () => {
        renderMenu()
        fireEvent.contextMenu(screen.getByTestId("area"))
        await userEvent.setup().click(screen.getByRole("menuitem", { name: "Nuova nota" }))
        expect(await screen.findByText("dialog-note")).toBeInTheDocument()

        fireEvent.contextMenu(screen.getByTestId("area"))
        await userEvent.setup().click(screen.getByRole("menuitem", { name: "Nuova cartella" }))
        expect(await screen.findByText("dialog-folder")).toBeInTheDocument()
    })

    it("creates a page in the root", async () => {
        renderMenu()
        fireEvent.contextMenu(screen.getByTestId("area"))
        await userEvent.setup().click(screen.getByRole("menuitem", { name: "Nuova pagina" }))
        expect(await screen.findByText("dialog-page")).toBeInTheDocument()
    })

    it("asks for a note from a template and imports into the root", async () => {
        const commands: string[] = []
        const onCommand = (event: Event) => commands.push((event as CustomEvent<string>).detail)
        window.addEventListener(APP_COMMAND_EVENT, onCommand)
        renderMenu()
        const user = userEvent.setup()
        fireEvent.contextMenu(screen.getByTestId("area"))
        await user.click(screen.getByRole("menuitem", { name: "Nuova nota da template" }))
        expect(commands).toEqual(["note-from-template"])
        window.removeEventListener(APP_COMMAND_EVENT, onCommand)

        fireEvent.contextMenu(screen.getByTestId("area"))
        await user.click(screen.getByRole("menuitem", { name: "Importa una nota o una cartella" }))
        expect(importItems).toHaveBeenCalledWith(null)
    })

    it("collapses or expands every folder, and is disabled without folders", async () => {
        const onToggleAll = vi.fn()
        const { unmount } = renderMenu({ onToggleAll })
        fireEvent.contextMenu(screen.getByTestId("area"))
        await userEvent.setup().click(screen.getByRole("menuitem", { name: "Comprimi tutte le cartelle" }))
        expect(onToggleAll).toHaveBeenCalledTimes(1)
        unmount()

        renderMenu({ onToggleAll, allCollapsed: true, hasFolders: false })
        fireEvent.contextMenu(screen.getByTestId("area"))
        expect(screen.getByRole("menuitem", { name: "Espandi tutte le cartelle" })).toHaveAttribute("aria-disabled", "true")
    })

    it("leaves the right click on a row to the menu of the row", () => {
        const Row = () => {
            const state = useItemMenuState()
            return <ItemMenu state={state} items={<MenuItem>Menu della riga</MenuItem>}><div data-testid="row" /></ItemMenu>
        }
        render(
            <TreeBackgroundMenu allCollapsed={false} hasFolders>
                <div data-testid="area"><Row /></div>
            </TreeBackgroundMenu>,
        )
        fireEvent.contextMenu(screen.getByTestId("row"))
        expect(screen.getByRole("menuitem", { name: "Menu della riga" })).toBeInTheDocument()
        expect(screen.queryByRole("menuitem", { name: "Nuova cartella" })).toBeNull()
    })
})
