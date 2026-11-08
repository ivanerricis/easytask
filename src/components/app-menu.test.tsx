import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppMenu } from "./app-menu"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"
import { useShortcut } from "@/hooks/use-shortcut"
import { APP_COMMAND_EVENT, useAppCommand, type AppCommand } from "@/lib/app-commands"
import { OPEN_SETTINGS_EVENT } from "@/lib/updater"
import { BUILTIN_THEMES } from "@/lib/themes/builtin"
import type { ThemeDefinition } from "@/lib/themes/types"

const appWindow = { close: vi.fn() }
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => appWindow }))
const setTheme = vi.fn()
const customTheme = { ...BUILTIN_THEMES[0], id: "custom-abc", name: "Il mio tema", nameKey: undefined, builtin: false }
const themeState = { themes: BUILTIN_THEMES as readonly ThemeDefinition[] }
vi.mock("@/components/use-theme", () => ({ useTheme: () => ({ theme: "dark", themes: themeState.themes, setTheme }) }))

const prefs = { textZoom: 1, setTextZoom: vi.fn() }
vi.mock("@/contexts/use-preferences", () => ({ usePreferences: () => prefs }))

function Probe({ id, handler, enabled }: { id: string, handler: () => void, enabled?: boolean }) {
    useShortcut(id, handler, { enabled })
    return null
}

function CommandProbe({ command, enabled }: { command: AppCommand, enabled?: boolean }) {
    useAppCommand(command, vi.fn(), { enabled })
    return null
}

beforeEach(() => {
    vi.clearAllMocks()
    prefs.textZoom = 1
    appWindow.close.mockResolvedValue(undefined)
})

const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole("menuitem", { name }))
}

describe("AppMenu", () => {
    it.each([
        ["Ctrl+Plus", { key: "+", ctrlKey: true }, 17 / 16],
        ["Ctrl+= (US layout)", { key: "=", ctrlKey: true }, 17 / 16],
        ["Ctrl+Minus", { key: "-", ctrlKey: true }, 15 / 16],
        ["Ctrl+0", { key: "0", ctrlKey: true }, 1],
    ])("changes the app size with %s", (_name, init, expected) => {
        prefs.textZoom = init.key === "0" ? 1.25 : 1
        render(<ShortcutsProvider><AppMenu page="home" /></ShortcutsProvider>)
        fireEvent.keyDown(window, init)
        expect(prefs.setTextZoom).toHaveBeenCalledWith(expected)
    })

    it("shows File, Edit, View and Help in the workspace, without Edit in the home", () => {
        const { unmount } = render(<ShortcutsProvider><AppMenu page="workspace" /></ShortcutsProvider>)
        expect(screen.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["File", "Modifica", "Visualizza", "Aiuto"])
        unmount()
        render(<ShortcutsProvider><AppMenu page="home" /></ShortcutsProvider>)
        expect(screen.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["File", "Visualizza", "Aiuto"])
    })

    it("runs the handler of a shortcut and shows its keys", async () => {
        const user = userEvent.setup()
        const newNote = vi.fn()
        render(<ShortcutsProvider><Probe id="new-note" handler={newNote} /><AppMenu page="workspace" /></ShortcutsProvider>)
        await openMenu(user, "File")
        const item = await screen.findByRole("menuitem", { name: /Nuova nota\s*Ctrl\+N/ })
        await user.click(item)
        await waitFor(() => expect(newNote).toHaveBeenCalledTimes(1))
    })

    it("disables the entries whose shortcut has no active handler", async () => {
        const user = userEvent.setup()
        render(<ShortcutsProvider><Probe id="new-folder" handler={vi.fn()} enabled={false} /><AppMenu page="workspace" /></ShortcutsProvider>)
        await openMenu(user, "File")
        expect(await screen.findByRole("menuitem", { name: /Nuova cartella/ })).toHaveAttribute("data-disabled")
        expect(screen.getByRole("menuitem", { name: /^Nuova nota\s*Ctrl/ })).toHaveAttribute("data-disabled")
    })

    it("asks the owner of the actions without a shortcut to run them", async () => {
        const user = userEvent.setup()
        const commands: string[] = []
        const listener = (event: Event) => commands.push((event as CustomEvent<string>).detail)
        window.addEventListener(APP_COMMAND_EVENT, listener)
        render(<ShortcutsProvider><CommandProbe command="open-trash" /><AppMenu page="workspace" /></ShortcutsProvider>)
        await openMenu(user, "File")
        await user.click(await screen.findByRole("menuitem", { name: "Cestino…" }))
        await waitFor(() => expect(commands).toEqual(["open-trash"]))
        window.removeEventListener(APP_COMMAND_EVENT, listener)
    })

    it("groups templates, archive, trash and export in File, leaving Edit with undo, redo and search", async () => {
        const user = userEvent.setup()
        render(<ShortcutsProvider><AppMenu page="workspace" /></ShortcutsProvider>)
        await openMenu(user, "File")
        expect(await screen.findByRole("menuitem", { name: "Archivio…" })).toBeInTheDocument()
        expect(screen.getByRole("menuitem", { name: "Cestino…" })).toBeInTheDocument()
        await user.keyboard("{Escape}")
        await openMenu(user, "Modifica")
        expect(await screen.findByRole("menuitem", { name: /Annulla/ })).toBeInTheDocument()
        expect(screen.queryByRole("menuitem", { name: "Cestino…" })).not.toBeInTheDocument()
        expect(screen.queryByRole("menuitem", { name: "Archivio…" })).not.toBeInTheDocument()
    })

    it("disables the commands nobody listens to, or whose handler is not enabled", async () => {
        const user = userEvent.setup()
        render(<ShortcutsProvider><CommandProbe command="open-trash" /><CommandProbe command="export-workspace" enabled={false} /><AppMenu page="workspace" /></ShortcutsProvider>)
        await openMenu(user, "File")
        expect(await screen.findByRole("menuitem", { name: "Cestino…" })).not.toHaveAttribute("data-disabled")
        expect(screen.getByRole("menuitem", { name: "Archivio…" })).toHaveAttribute("data-disabled")
        expect(screen.getByRole("menuitem", { name: /Esporta/ })).toHaveAttribute("data-disabled")
    })

    it("opens the settings, the about page and closes the window", async () => {
        const user = userEvent.setup()
        const categories: (string | undefined)[] = []
        const listener = (event: Event) => categories.push((event as CustomEvent<{ category?: string }>).detail?.category)
        window.addEventListener(OPEN_SETTINGS_EVENT, listener)
        render(<ShortcutsProvider><AppMenu page="home" /></ShortcutsProvider>)
        await openMenu(user, "File")
        await user.click(await screen.findByRole("menuitem", { name: "Impostazioni…" }))
        await openMenu(user, "Aiuto")
        await user.click(await screen.findByRole("menuitem", { name: "Informazioni e aggiornamenti…" }))
        await waitFor(() => expect(categories).toEqual([undefined, "about"]))
        await openMenu(user, "File")
        await user.click(await screen.findByRole("menuitem", { name: "Esci" }))
        await waitFor(() => expect(appWindow.close).toHaveBeenCalledTimes(1))
        window.removeEventListener(OPEN_SETTINGS_EVENT, listener)
    })

    it("changes the theme from the View menu", async () => {
        const user = userEvent.setup()
        render(<ShortcutsProvider><AppMenu page="home" /></ShortcutsProvider>)
        await openMenu(user, "Visualizza")
        // The submenu opens from the keyboard: the pointer leaving the trigger would close it in jsdom
        const themeItem = await screen.findByRole("menuitem", { name: "Tema" })
        themeItem.focus()
        await user.keyboard("{ArrowRight}")
        fireEvent.click(await screen.findByRole("menuitemradio", { name: "Chiaro" }))
        expect(setTheme).toHaveBeenCalledWith("light")
    })

    const openThemeMenu = async (user: ReturnType<typeof userEvent.setup>) => {
        await openMenu(user, "Visualizza")
        const themeItem = await screen.findByRole("menuitem", { name: "Tema" })
        themeItem.focus()
        await user.keyboard("{ArrowRight}")
    }

    it("lists every built-in theme as an equivalent entry, with no System entry, and marks the active one", async () => {
        const user = userEvent.setup()
        render(<ShortcutsProvider><AppMenu page="home" /></ShortcutsProvider>)
        await openThemeMenu(user)
        for (const name of ["Chiaro", "Scuro", "Nord", "Solarized chiaro", "Solarized scuro", "Dracula", "Seppia"]) {
            expect(await screen.findByRole("menuitemradio", { name })).toBeInTheDocument()
        }
        expect(screen.queryByRole("menuitemradio", { name: "Sistema" })).toBeNull()
        expect(screen.getByRole("menuitemradio", { name: "Scuro" })).toHaveAttribute("aria-checked", "true")
        fireEvent.click(screen.getByRole("menuitemradio", { name: "Nord" }))
        expect(setTheme).toHaveBeenCalledWith("nord")
    })

    it("lists the custom themes after the built-in ones and chooses them by id", async () => {
        themeState.themes = [...BUILTIN_THEMES, customTheme]
        const user = userEvent.setup()
        render(<ShortcutsProvider><AppMenu page="home" /></ShortcutsProvider>)
        await openThemeMenu(user)
        const items = (await screen.findAllByRole("menuitemradio")).map(item => item.textContent)
        expect(items[items.length - 1]).toBe("Il mio tema")
        fireEvent.click(screen.getByRole("menuitemradio", { name: "Il mio tema" }))
        expect(setTheme).toHaveBeenCalledWith("custom-abc")
        themeState.themes = BUILTIN_THEMES
    })

    it("opens Settings > Appearance from Manage themes", async () => {
        const user = userEvent.setup()
        const categories: unknown[] = []
        const listener = (e: Event) => categories.push((e as CustomEvent).detail?.category)
        window.addEventListener(OPEN_SETTINGS_EVENT, listener)
        render(<ShortcutsProvider><AppMenu page="home" /></ShortcutsProvider>)
        await openThemeMenu(user)
        await user.click(await screen.findByRole("menuitem", { name: "Gestisci temi…" }))
        await waitFor(() => expect(categories).toEqual(["appearance"]))
        window.removeEventListener(OPEN_SETTINGS_EVENT, listener)
    })

    it("splits the workspace and moves the note to the other area from the View menu", async () => {
        const user = userEvent.setup()
        const toggleSplit = vi.fn()
        const moveNote = vi.fn()
        render(
            <ShortcutsProvider>
                <Probe id="toggle-split" handler={toggleSplit} />
                <Probe id="move-note-to-other-pane" handler={moveNote} />
                <AppMenu page="workspace" />
            </ShortcutsProvider>,
        )
        await openMenu(user, "Visualizza")
        await user.click(await screen.findByRole("menuitem", { name: /Dividi in due aree o chiudi la divisione\s*Ctrl\+\\/ }))
        await waitFor(() => expect(toggleSplit).toHaveBeenCalledTimes(1))
        await openMenu(user, "Visualizza")
        await user.click(await screen.findByRole("menuitem", { name: /Sposta la nota nell'altra area/ }))
        await waitFor(() => expect(moveNote).toHaveBeenCalledTimes(1))
    })

    it("focuses the first menu with Alt alone or F10, and gives the focus back", () => {
        render(<ShortcutsProvider><input aria-label="campo" /><AppMenu page="home" /></ShortcutsProvider>)
        const input = screen.getByLabelText("campo")
        input.focus()
        fireEvent.keyDown(window, { key: "Alt" })
        fireEvent.keyUp(window, { key: "Alt" })
        expect(screen.getByRole("menuitem", { name: "File" })).toHaveFocus()
        fireEvent.keyDown(window, { key: "F10" })
        expect(input).toHaveFocus()
    })

    it("does not move the focus when Alt is part of a combination", () => {
        render(<ShortcutsProvider><input aria-label="campo" /><AppMenu page="home" /></ShortcutsProvider>)
        const input = screen.getByLabelText("campo")
        input.focus()
        fireEvent.keyDown(window, { key: "Alt" })
        fireEvent.keyDown(window, { key: "n", altKey: true })
        fireEvent.keyUp(window, { key: "Alt" })
        expect(input).toHaveFocus()
    })
})
