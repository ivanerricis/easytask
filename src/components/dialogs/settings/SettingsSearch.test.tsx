import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"
const setSidebarItemSize = vi.fn()
const setColorIntensity = vi.fn()
const setHideCompletedTasks = vi.fn()
const setShowUnnamedLabels = vi.fn()
const setRenameOnClick = vi.fn()
const colorPrefs = { colorIntensity: 1 }
const audioPrefs = {
    setAudioVolume: vi.fn(),
    setAudioPlayerVisible: vi.fn(),
    setAudioPlayerScale: vi.fn(),
    setAudioPlayerOpacity: vi.fn(),
    resetAudioSettings: vi.fn(),
}
import { MemoryRouter } from "react-router-dom"
import { DialogSettings } from "../dialog-settings"
import { ShortcutsProvider } from "@/contexts/shortcuts-context"

vi.mock("@tauri-apps/api/app", () => ({
    getName: vi.fn().mockResolvedValue("EasyTask"),
    getVersion: vi.fn().mockResolvedValue("9.8.7"),
    getTauriVersion: vi.fn().mockResolvedValue("2.1.0"),
}))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/appPaths", () => ({
    ensureAppFolder: vi.fn().mockResolvedValue("C:\\Docs\\EasyTask"),
    isPortable: vi.fn().mockResolvedValue(false),
}))
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/store/shortcuts", () => ({ getShortcutOverrides: vi.fn().mockResolvedValue({}), saveShortcutOverrides: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(false) }))
vi.mock("@/hooks/use-workspace-transfer", () => ({ useWorkspaceTransfer: () => ({ exportWorkspace: vi.fn(), importWorkspace: vi.fn(), isBusy: false }) }))
vi.mock("@/contexts/use-workspace", () => ({ useWorkspace: () => ({ currentWorkspace: null, workspaces: [] }) }))
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }))
vi.mock("@/components/mode-toggle", () => ({ ModeToggle: () => <div>mode-toggle</div> }))
vi.mock("@/contexts/use-preferences", () => ({
    usePreferences: () => ({
        primaryColor: "#000000", setPrimaryColor: vi.fn(),
        showProgressBar: true, setShowProgressBar: vi.fn(),
        showGroupProgressBar: true, setShowGroupProgressBar: vi.fn(),
        showSectionCount: true, setShowSectionCount: vi.fn(),
        showTaskCount: true, setShowTaskCount: vi.fn(),
        showAudioFileCount: true, setShowAudioFileCount: vi.fn(),
        showGroupSeparators: false, setShowGroupSeparators: vi.fn(),
        showUnnamedLabels: false, setShowUnnamedLabels: (value: boolean) => setShowUnnamedLabels(value),
        taskBackground: true, setTaskBackground: vi.fn(),
        renameOnClick: true, setRenameOnClick: (value: boolean) => setRenameOnClick(value),
        keepAddingTasks: true, setKeepAddingTasks: vi.fn(),
        showTaskInsertLine: true, setShowTaskInsertLine: vi.fn(),
        liveDrag: true, setLiveDrag: vi.fn(),
        undoLimit: 50, setUndoLimit: vi.fn(),
        hideCompletedTasks: false, setHideCompletedTasks: (value: boolean) => setHideCompletedTasks(value),
        completedTasksLast: false, setCompletedTasksLast: vi.fn(),
        reopenNotes: true, setReopenNotes: vi.fn(),
        reopenLastWorkspace: false, setReopenLastWorkspace: vi.fn(),
        startupWorkspaceId: null, setStartupWorkspaceId: vi.fn(),
        resetPlayerPosition: vi.fn(),
        audioVolume: 0.5, setAudioVolume: (value: number) => audioPrefs.setAudioVolume(value),
        audioPlayerVisible: true, setAudioPlayerVisible: (value: boolean) => audioPrefs.setAudioPlayerVisible(value),
        audioPlayerScale: 1, setAudioPlayerScale: (value: number) => audioPrefs.setAudioPlayerScale(value),
        audioPlayerOpacity: 0.8, setAudioPlayerOpacity: (value: number) => audioPrefs.setAudioPlayerOpacity(value),
        resetAudioSettings: () => audioPrefs.resetAudioSettings(),
        colorIntensity: colorPrefs.colorIntensity, setColorIntensity: (value: number) => setColorIntensity(value),
        sidebarItemSize: "normal", setSidebarItemSize: (value: string) => setSidebarItemSize(value),
        newTaskPosition: "bottom", setNewTaskPosition: vi.fn(),
        collapsedGroupLayout: "vertical", setCollapsedGroupLayout: vi.fn(),
        taskDensity: "normal", setTaskDensity: vi.fn(),
        spellcheck: true, setSpellcheck: vi.fn(),
        trashAutoEmptyDays: 0, setTrashAutoEmptyDays: vi.fn(),
        confirmDeleteWithContent: true, setConfirmDeleteWithContent: vi.fn(),
    }),
}))

const open = async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ShortcutsProvider><DialogSettings /></ShortcutsProvider></MemoryRouter>)
    await user.click(screen.getByRole("button"))
    // The dialog content is a lazy chunk
    await screen.findByRole("dialog", {}, { timeout: 5000 })
    return user
}

const searchBox = () => screen.getByRole("textbox", { name: "Cerca nelle impostazioni" })

// One change for the whole query: typing letter by letter re-renders every panel at each key
const search = async (user: ReturnType<typeof userEvent.setup>, query: string) => {
    await user.click(searchBox())
    await user.paste(query)
}

describe("settings search", () => {
    beforeAll(async () => { await import("../dialog-settings-content") })

    it("shows only the rows that match, across all the categories", async () => {
        const user = await open()
        await search(user, "task completati")
        expect(screen.getByText("Nascondi task completati")).toBeInTheDocument()
        expect(screen.queryByText("Mostra numero di task")).not.toBeInTheDocument()
        expect(screen.queryByText("Rinomina cliccando sul nome")).not.toBeInTheDocument()
    })

    it("finds the completed tasks last row by its description", async () => {
        const user = await open()
        await search(user, "dopo quelli da fare")
        expect(screen.getByText("Task completati in fondo")).toBeInTheDocument()
        expect(screen.queryByText("Rinomina cliccando sul nome")).not.toBeInTheDocument()
    })

    it("finds the delete confirmation by its description", async () => {
        const user = await open()
        await search(user, "vanno subito nel cestino")
        expect(screen.getByText("Conferma l'eliminazione solo se c'è contenuto")).toBeInTheDocument()
        expect(screen.queryByText("Nascondi task completati")).not.toBeInTheDocument()
    })

    it("ignores case and accents", async () => {
        const user = await open()
        await search(user, "ASPETTO")
        expect(screen.getAllByText(/./, { selector: "[data-settings-row] label" }).length).toBeGreaterThan(0)
        await user.clear(searchBox())
        await search(user, "rinomina CLICCANDO")
        expect(screen.getByText("Rinomina cliccando sul nome")).toBeInTheDocument()
    })

    it("shows no category as current while searching", async () => {
        const user = await open()
        expect(screen.getAllByRole("tab").some(tab => tab.getAttribute("aria-selected") === "true")).toBe(true)
        await search(user, "task")
        expect(screen.getAllByRole("tab").every(tab => tab.getAttribute("aria-selected") === "false")).toBe(true)
    })

    it("shows all the rows of a panel when its title matches", async () => {
        const user = await open()
        await search(user, "Note e sezioni")
        expect(screen.getByText("Nascondi task completati")).toBeInTheDocument()
        expect(screen.getByText("Rinomina cliccando sul nome")).toBeInTheDocument()
    })

    it("tells when nothing matches", async () => {
        const user = await open()
        await search(user, "zzzqqq")
        expect(await screen.findByText("Nessuna impostazione corrisponde a \"zzzqqq\".")).toBeInTheDocument()
        expect(document.querySelector("[data-settings-row]")).toBeNull()
    })

    it("clears the query with Escape without closing the dialog, then closes it", async () => {
        const user = await open()
        await search(user, "task")
        await user.keyboard("{Escape}")
        expect(searchBox()).toHaveValue("")
        expect(screen.getByRole("dialog")).toBeInTheDocument()
        await user.keyboard("{Escape}")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("clears with the button, and picking a category clears the search too", async () => {
        const user = await open()
        await search(user, "task")
        await user.click(screen.getByRole("button", { name: "Cancella la ricerca" }))
        expect(searchBox()).toHaveValue("")
        await search(user, "task")
        await user.click(screen.getByRole("tab", { name: "Note e sezioni" }))
        expect(searchBox()).toHaveValue("")
        expect(screen.getByRole("heading", { name: "Note e sezioni" })).toBeInTheDocument()
        expect(screen.getByRole("tab", { name: "Note e sezioni" })).toHaveAttribute("aria-selected", "true")
    })
})
