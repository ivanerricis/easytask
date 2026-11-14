import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import type { AudioFile, MediaFile } from "@/types/types"
import { AudioProvider } from "./audio-context"
import { useAudioActions } from "./use-audio"
import { useGroupMediaFiles, useMediaSources, useMissingPaths, useNoteMediaCounts } from "./use-media"
import { GroupAudioFiles } from "@/pages/workspacePage/components/groups/GroupAudioFiles"
import { GroupMediaFiles } from "@/pages/workspacePage/components/groups/GroupMediaFiles"
import { getDBGroupAudioFiles } from "@/db/queries/audio"
import { createDBMediaFile, getDBGroupMediaFiles, getDBNoteMediaCounts, updateDBMediaFilePath } from "@/db/queries/media"

vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
    convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
}))
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/queries/audio", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/db/queries/audio")>()),
    getDBGroupAudioFiles: vi.fn(),
    getDBAudioFile: vi.fn(),
}))
vi.mock("@/db/queries/media", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/db/queries/media")>()),
    getDBGroupMediaFiles: vi.fn(),
    getDBNoteMediaCounts: vi.fn(),
    createDBMediaFile: vi.fn(),
    updateDBMediaFilePath: vi.fn(),
}))
vi.mock("@/components/dialogs/dialog-rename", () => ({ DialogRenameItem: () => null }))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
vi.mock("@/pages/workspacePage/components/rightbar/use-right-panel", () => ({ useShowAudioInfo: () => null }))

const workspaceActions = { deleteItem: vi.fn(), renameItem: vi.fn() }
const workspaceState = { audioVersion: 0 }
vi.mock("./workspace-data", () => ({
    useWorkspaceVersion: (kind: string) => kind === "audio" ? workspaceState.audioVersion : 0,
    useWorkspaceActions: () => workspaceActions,
    useWorkspaceData: () => ({ ...workspaceState, ...workspaceActions }),
}))
vi.mock("./use-preferences", () => ({ usePreferences: () => ({ audioPlayerVisible: true }) }))

const media = (id: number, name: string): MediaFile => ({
    id, section_groupID: 7, name, path: `C:\\Pics\\${name}`, position: id,
    creation_date: "2026-01-01", creation_time: "10:00",
})

let stored: MediaFile[]
let existing: (path: string) => boolean

function AddButton() {
    const { addMediaFiles } = useAudioActions()
    return <button onClick={() => void addMediaFiles(7)}>add-media</button>
}

const renderGroup = () => render(
    <AudioProvider>
        <DndContext>
            <GroupAudioFiles groupId={7} />
            <GroupMediaFiles groupId={7} />
            <AddButton />
        </DndContext>
    </AudioProvider>
)

beforeEach(() => {
    vi.resetAllMocks()
    workspaceState.audioVersion = 0
    existing = () => true
    stored = [media(1, "a.jpg"), media(2, "b.png"), media(3, "clip.mp4")]
    vi.mocked(getDBGroupMediaFiles).mockImplementation(async () => stored)
    vi.mocked(getDBGroupAudioFiles).mockResolvedValue([])
    vi.mocked(getDBNoteMediaCounts).mockResolvedValue({ 7: 3 })
    vi.mocked(invoke).mockImplementation(async (command, args) => {
        if (command === "files_exist") return (args as { paths: string[] }).paths.map(path => existing(path))
        if (command === "allow_media_file" && !existing((args as { path: string }).path)) throw "media file not found"
        return undefined
    })
    workspaceActions.deleteItem.mockResolvedValue(undefined)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("images and videos of a group", () => {
    it("are listed one under the other with a thumbnail from the asset protocol", async () => {
        renderGroup()
        const list = await screen.findByRole("list", { name: "Immagini e video" })
        expect(within(list).getAllByRole("listitem").map(row => row.textContent)).toEqual(["a.jpg", "b.png", "clip.mp4"])
        await waitFor(() => expect(list.querySelectorAll("img")).toHaveLength(2))
        expect(list.querySelector("img")!.getAttribute("src")).toBe(`asset://localhost/${encodeURIComponent("C:\\Pics\\a.jpg")}`)
        expect(invoke).toHaveBeenCalledWith("allow_media_file", { path: "C:\\Pics\\a.jpg" })
        // The video row has a small muted video as thumbnail, which only loads the metadata
        const video = list.querySelector("video")!
        expect(video).toHaveAttribute("preload", "metadata")
        expect(video.muted).toBe(true)
        // One call checks every file
        expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "files_exist")).toHaveLength(1)
    })

    it("show nothing without files", () => {
        stored = []
        const { container } = renderGroup()
        expect(container.querySelector("[role=list]")).toBeNull()
    })

    it("a file that is gone has the warning marker, a grey thumbnail and no image request; the others do not", async () => {
        existing = path => !path.endsWith("b.png")
        renderGroup()
        const rows = await screen.findAllByRole("listitem")
        await waitFor(() => expect(rows[1]).toHaveAttribute("data-missing", "true"))
        expect(within(rows[1]).getByRole("img", { name: "File non trovato" })).toBeInTheDocument()
        expect(within(rows[1]).queryByRole("img", { name: "" })).toBeNull()
        expect(within(rows[0]).queryByRole("img", { name: "File non trovato" })).toBeNull()
        expect(rows[0]).not.toHaveAttribute("data-missing")
        expect(rows[1].querySelector("[data-testid=media-thumbnail]")).toHaveClass("grayscale")
        expect(rows[1].querySelector("img")).toBeNull()
    })

    it("the menu of a missing file highlights Aggiorna percorso", async () => {
        existing = path => !path.endsWith("b.png")
        const user = userEvent.setup()
        renderGroup()
        await waitFor(() => expect(screen.getAllByRole("listitem")[1]).toHaveAttribute("data-missing", "true"))
        await user.click(screen.getByRole("button", { name: "Menu: b.png" }))
        expect(await screen.findByRole("menuitem", { name: "Aggiorna percorso" })).toHaveAttribute("data-highlight", "true")
        await user.keyboard("{Escape}")
        await user.click(screen.getByRole("button", { name: "Menu: a.jpg" }))
        expect(await screen.findByRole("menuitem", { name: "Aggiorna percorso" })).not.toHaveAttribute("data-highlight")
    })

    it("a click on a file that is gone opens the file not found dialog: relink stores the new path", async () => {
        existing = path => !path.endsWith("b.png")
        const user = userEvent.setup()
        vi.mocked(open).mockResolvedValue("D:\\New\\b.png")
        renderGroup()
        await waitFor(() => expect(screen.getAllByRole("listitem")[1]).toHaveAttribute("data-missing", "true"))
        await user.click(screen.getByRole("button", { name: "Apri b.png (File non trovato)" }))
        const dialog = (await screen.findByText("File non trovato")).closest("[role=alertdialog],[role=dialog]") as HTMLElement
        expect(within(dialog).getByText("File non trovato")).toBeInTheDocument()
        expect(within(dialog).getByText("C:\\Pics\\b.png")).toBeInTheDocument()
        expect(screen.queryByRole("dialog", { name: "Visualizzatore" })).toBeNull()

        await user.click(within(dialog).getByRole("button", { name: "Aggiorna percorso" }))
        await waitFor(() => expect(updateDBMediaFilePath).toHaveBeenCalledWith(2, "D:\\New\\b.png"))
        expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, filters: [expect.objectContaining({ extensions: expect.arrayContaining(["jpg", "mp4"]) })] }))
        expect(toast.success).toHaveBeenCalled()
    })

    it("Elimina riferimento moves the missing media file to the trash", async () => {
        existing = path => !path.endsWith("b.png")
        const user = userEvent.setup()
        renderGroup()
        await waitFor(() => expect(screen.getAllByRole("listitem")[1]).toHaveAttribute("data-missing", "true"))
        await user.click(screen.getByRole("button", { name: "Apri b.png (File non trovato)" }))
        await user.click(await screen.findByRole("button", { name: "Elimina riferimento" }))
        await waitFor(() => expect(workspaceActions.deleteItem).toHaveBeenCalledWith("media_file", 2))
    })

    it("the audio files of the group get the same marker from the same batch check", async () => {
        const song: AudioFile = { id: 11, section_groupID: 7, name: "song.mp3", path: "C:\\Music\\song.mp3", position: 0, creation_date: "", creation_time: "" }
        const other: AudioFile = { ...song, id: 12, name: "other.wav", path: "C:\\Music\\other.wav" }
        vi.mocked(getDBGroupAudioFiles).mockResolvedValue([song, other])
        existing = path => !path.endsWith("song.mp3")
        const user = userEvent.setup()
        renderGroup()
        const list = await screen.findByRole("list", { name: "File audio" })
        const rows = within(list).getAllByRole("listitem")
        await waitFor(() => expect(rows[0]).toHaveAttribute("data-missing", "true"))
        expect(within(rows[0]).getByRole("img", { name: "File non trovato" })).toBeInTheDocument()
        expect(rows[1]).not.toHaveAttribute("data-missing")
        await user.click(within(rows[0]).getByRole("button", { name: "Menu: song.mp3" }))
        expect(await screen.findByRole("menuitem", { name: "Aggiorna percorso" })).toHaveAttribute("data-highlight", "true")
    })

    it("Aggiungi immagine o video: the dialog is filtered on images and videos, every file is linked and the list is reloaded", async () => {
        const user = userEvent.setup()
        vi.mocked(open).mockResolvedValue(["D:\\x\\one.jpg", "D:\\x\\two.mp4"])
        vi.mocked(createDBMediaFile).mockImplementation(async (groupId, path) => {
            const created = media(stored.length + 1, path.split("\\").pop()!)
            stored = [...stored, created]
            return { ...created, section_groupID: groupId }
        })
        renderGroup()
        await screen.findByRole("list", { name: "Immagini e video" })
        await user.click(screen.getByRole("button", { name: "add-media" }))

        await waitFor(() => expect(createDBMediaFile).toHaveBeenCalledTimes(2))
        expect(open).toHaveBeenCalledWith(expect.objectContaining({
            multiple: true,
            filters: [{ name: "Immagini e video", extensions: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "mp4", "webm", "mov", "m4v"] }],
        }))
        expect(createDBMediaFile).toHaveBeenNthCalledWith(1, 7, "D:\\x\\one.jpg")
        expect(createDBMediaFile).toHaveBeenNthCalledWith(2, 7, "D:\\x\\two.mp4")
        await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(5))
        expect(toast.success).toHaveBeenCalledWith("2 file multimediali aggiunti")
    })

    it("adding reports a failing file and keeps going; a cancelled dialog does nothing", async () => {
        const user = userEvent.setup()
        vi.mocked(open).mockResolvedValueOnce(null)
        renderGroup()
        await screen.findByRole("list", { name: "Immagini e video" })
        await user.click(screen.getByRole("button", { name: "add-media" }))
        await waitFor(() => expect(open).toHaveBeenCalled())
        expect(createDBMediaFile).not.toHaveBeenCalled()

        vi.mocked(open).mockResolvedValueOnce("D:\\x\\dup.jpg")
        vi.mocked(createDBMediaFile).mockRejectedValue(new Error("nome duplicato"))
        await user.click(screen.getByRole("button", { name: "add-media" }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nome duplicato"))
        expect(toast.success).not.toHaveBeenCalled()

        vi.mocked(open).mockRejectedValueOnce(new Error("no dialog"))
        await user.click(screen.getByRole("button", { name: "add-media" }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("no dialog")))
    })

    it("the viewer: click opens it on that file, the arrows and the buttons move through the files, Esc closes", async () => {
        const user = userEvent.setup()
        renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri b.png" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        expect(within(dialog).getByRole("img", { name: "b.png" })).toBeInTheDocument()
        expect(within(dialog).getByText("2 / 3")).toBeInTheDocument()

        await user.keyboard("{ArrowRight}")
        expect(dialog.querySelector("video")).not.toBeNull()
        expect(within(dialog).getByText("3 / 3")).toBeInTheDocument()
        expect(within(dialog).getByRole("button", { name: "Successivo" })).toBeDisabled()
        await user.keyboard("{ArrowRight}")
        expect(within(dialog).getByText("3 / 3")).toBeInTheDocument()

        await user.keyboard("{ArrowLeft}")
        expect(within(dialog).getByRole("img", { name: "b.png" })).toBeInTheDocument()
        await user.click(within(dialog).getByRole("button", { name: "Precedente" }))
        expect(within(dialog).getByText("1 / 3")).toBeInTheDocument()
        expect(within(dialog).getByRole("button", { name: "Precedente" })).toBeDisabled()
        await user.click(within(dialog).getByRole("button", { name: "Successivo" }))
        expect(within(dialog).getByText("2 / 3")).toBeInTheDocument()

        await user.keyboard("{Escape}")
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Visualizzatore" })).toBeNull())
    })

    it("what happens in the viewer does not reach the note behind it (its background menu, its keys)", async () => {
        const user = userEvent.setup()
        const reached = vi.fn()
        render(
            <div onContextMenu={reached} onKeyDown={reached} onPointerDown={reached}>
                <AudioProvider><DndContext><GroupMediaFiles groupId={7} /></DndContext></AudioProvider>
            </div>
        )
        await user.click(await screen.findByRole("button", { name: "Apri a.jpg" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        reached.mockClear()
        fireEvent.contextMenu(dialog)
        fireEvent.pointerDown(within(dialog).getByTestId("media-viewer-stage"), { pointerId: 1 })
        fireEvent.keyDown(dialog, { key: "a" })
        fireEvent.keyDown(dialog, { key: "ArrowRight" })
        expect(reached).not.toHaveBeenCalled()
    })

    it("the arrows move through the files also when the video has the focus", async () => {
        const user = userEvent.setup()
        renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri clip.mp4" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        const video = dialog.querySelector("video")!
        expect(video).toHaveAttribute("controls")
        video.focus()
        fireEvent.keyDown(video, { key: "ArrowLeft" })
        expect(within(dialog).getByRole("img", { name: "b.png" })).toBeInTheDocument()
    })

    it("the image zooms with the mouse wheel up to a limit and a double click resets it", async () => {
        const user = userEvent.setup()
        renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri a.jpg" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        const image = within(dialog).getByRole("img", { name: "a.jpg" })
        const stage = within(dialog).getByTestId("media-viewer-stage")
        expect(image).toHaveAttribute("data-zoom", "1")

        fireEvent.wheel(stage, { deltaY: 100 })
        expect(image).toHaveAttribute("data-zoom", "1")
        fireEvent.wheel(stage, { deltaY: -100 })
        fireEvent.wheel(stage, { deltaY: -100 })
        expect(Number(image.getAttribute("data-zoom"))).toBeCloseTo(1.15 * 1.15)
        for (let i = 0; i < 40; i++) fireEvent.wheel(stage, { deltaY: -100 })
        expect(image).toHaveAttribute("data-zoom", "10")

        fireEvent.doubleClick(stage)
        expect(image).toHaveAttribute("data-zoom", "1")
        // Moving to another file starts from 100% again
        fireEvent.wheel(stage, { deltaY: -100 })
        await user.keyboard("{ArrowRight}")
        expect(within(dialog).getByRole("img", { name: "b.png" })).toHaveAttribute("data-zoom", "1")
    })

    it("a zoomed image can be dragged", async () => {
        const user = userEvent.setup()
        renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri a.jpg" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        const image = within(dialog).getByRole("img", { name: "a.jpg" })
        const stage = within(dialog).getByTestId("media-viewer-stage")
        fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 })
        fireEvent.pointerMove(stage, { pointerId: 1, clientX: 50, clientY: 50 })
        expect(image.style.transform).toContain("translate(0px, 0px)")
        fireEvent.wheel(stage, { deltaY: -100 })
        fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 })
        fireEvent.pointerMove(stage, { pointerId: 1, clientX: 50, clientY: 30 })
        expect(image.style.transform).toContain("translate(40px, 20px)")
        fireEvent.pointerUp(stage, { pointerId: 1 })
        fireEvent.pointerMove(stage, { pointerId: 1, clientX: 90, clientY: 90 })
        expect(image.style.transform).toContain("translate(40px, 20px)")
    })

    it("an image or video the webview cannot decode says the format is not supported and offers the default app", async () => {
        const user = userEvent.setup()
        renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri a.jpg" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        fireEvent.error(within(dialog).getByRole("img", { name: "a.jpg" }))
        expect(await within(dialog).findByRole("status")).toHaveTextContent("Formato non riproducibile")
        await user.click(within(dialog).getByRole("button", { name: "Apri con l'app predefinita" }))
        expect(invoke).toHaveBeenCalledWith("open_media_file", { path: "C:\\Pics\\a.jpg" })
        await user.keyboard("{ArrowRight}{ArrowRight}")
        fireEvent.error(dialog.querySelector("video")!)
        expect(await within(dialog).findByRole("status")).toHaveTextContent("Formato non riproducibile")
        await user.click(within(dialog).getByRole("button", { name: "Apri con l'app predefinita" }))
        expect(invoke).toHaveBeenCalledWith("open_media_file", { path: "C:\\Pics\\clip.mp4" })
    })

    it("a file that fails to load because it is gone says not found, not unsupported", async () => {
        const user = userEvent.setup()
        renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri a.jpg" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        existing = () => false
        fireEvent.error(within(dialog).getByRole("img", { name: "a.jpg" }))
        expect(await within(dialog).findByRole("status")).toHaveTextContent("File non trovato")
        expect(within(dialog).queryByRole("button", { name: "Apri con l'app predefinita" })).toBeNull()
    })

    it("the thumbnail of a file that cannot be decoded shows the state and the row gets the button to open it with the default app", async () => {
        const user = userEvent.setup()
        renderGroup()
        const list = await screen.findByRole("list", { name: "Immagini e video" })
        await waitFor(() => expect(list.querySelectorAll("img")).toHaveLength(2))
        expect(list.querySelector("img")).toHaveAttribute("decoding", "async")
        expect(list.querySelector("img")).toHaveAttribute("loading", "lazy")
        expect(screen.queryByRole("button", { name: "Apri con l'app predefinita" })).toBeNull()

        fireEvent.error(list.querySelector("video")!)
        const row = (await screen.findAllByRole("listitem"))[2]
        expect(await within(row).findByRole("img", { name: "Formato non riproducibile" })).toBeInTheDocument()
        await user.click(within(row).getByRole("button", { name: "Apri con l'app predefinita" }))
        expect(invoke).toHaveBeenCalledWith("open_media_file", { path: "C:\\Pics\\clip.mp4" })
        // The other rows are untouched
        expect(within((await screen.findAllByRole("listitem"))[0]).queryByRole("button", { name: "Apri con l'app predefinita" })).toBeNull()
    })

    it("an image that fails to load because it is gone gets no unsupported state in its thumbnail", async () => {
        renderGroup()
        const list = await screen.findByRole("list", { name: "Immagini e video" })
        await waitFor(() => expect(list.querySelectorAll("img")).toHaveLength(2))
        existing = () => false
        fireEvent.error(list.querySelector("img")!)
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("files_exist", { paths: ["C:\\Pics\\a.jpg"] }))
        expect(screen.queryByRole("img", { name: "Formato non riproducibile" })).toBeNull()
    })

    it("a failing default app is reported with a toast", async () => {
        const user = userEvent.setup()
        renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri a.jpg" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        fireEvent.error(within(dialog).getByRole("img", { name: "a.jpg" }))
        const invokeMock = vi.mocked(invoke)
        const previous = invokeMock.getMockImplementation()!
        invokeMock.mockImplementation(async (command, args) => {
            if (command === "open_media_file") throw "no app"
            return previous(command, args)
        })
        await user.click(await within(dialog).findByRole("button", { name: "Apri con l'app predefinita" }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("no app")))
    })

    it("the viewer says so when it moves to a file that is gone (it has no URL)", async () => {
        existing = path => !path.endsWith("b.png")
        const user = userEvent.setup()
        renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri a.jpg" }))
        const dialog = await screen.findByRole("dialog", { name: "Visualizzatore" })
        await user.keyboard("{ArrowRight}")
        expect(await within(dialog).findByRole("status")).toHaveTextContent("File non trovato")
        await user.keyboard("{ArrowRight}")
        expect(dialog.querySelector("video")).not.toBeNull()
    })

    it("closes by itself when the shown file leaves the list", async () => {
        const user = userEvent.setup()
        const { rerender } = renderGroup()
        await user.click(await screen.findByRole("button", { name: "Apri clip.mp4" }))
        await screen.findByRole("dialog", { name: "Visualizzatore" })
        stored = stored.slice(0, 2)
        workspaceState.audioVersion = 1
        rerender(
            <AudioProvider>
                <DndContext>
                    <GroupAudioFiles groupId={7} />
                    <GroupMediaFiles groupId={7} />
                    <AddButton />
                </DndContext>
            </AudioProvider>
        )
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Visualizzatore" })).toBeNull())
    })
})

describe("media hooks", () => {
    it("useNoteMediaCounts loads the counts only when enabled and for a note", async () => {
        const Probe = ({ noteId, enabled }: { noteId: number | null, enabled: boolean }) => {
            const counts = useNoteMediaCounts(noteId, enabled)
            return <p data-testid="counts">{JSON.stringify(counts)}</p>
        }
        const { rerender } = render(<Probe noteId={1} enabled={false} />)
        expect(screen.getByTestId("counts")).toHaveTextContent("{}")
        expect(getDBNoteMediaCounts).not.toHaveBeenCalled()
        rerender(<Probe noteId={null} enabled />)
        expect(getDBNoteMediaCounts).not.toHaveBeenCalled()
        rerender(<Probe noteId={1} enabled />)
        await waitFor(() => expect(screen.getByTestId("counts")).toHaveTextContent('{"7":3}'))
        expect(getDBNoteMediaCounts).toHaveBeenCalledWith(1)
        // Another note does not show the counts of the previous one while it loads
        vi.mocked(getDBNoteMediaCounts).mockResolvedValue({ 8: 1 })
        rerender(<Probe noteId={2} enabled />)
        await waitFor(() => expect(screen.getByTestId("counts")).toHaveTextContent('{"8":1}'))
    })

    it("a failing counts query is reported, not thrown", async () => {
        vi.mocked(getDBNoteMediaCounts).mockRejectedValue(new Error("boom"))
        const Probe = () => <p data-testid="counts">{JSON.stringify(useNoteMediaCounts(1))}</p>
        render(<Probe />)
        await waitFor(() => expect(getDBNoteMediaCounts).toHaveBeenCalled())
        expect(screen.getByTestId("counts")).toHaveTextContent("{}")
    })

    it("useMissingPaths asks once for an equal list, nothing for an empty one, and a failed check marks nothing", async () => {
        const Probe = ({ paths }: { paths: string[] }) => {
            const missing = useMissingPaths(paths.map(path => ({ path })))
            return <p data-testid="missing">{[...missing].join("|")}</p>
        }
        existing = path => path !== "gone.jpg"
        const { rerender } = render(<Probe paths={[]} />)
        expect(invoke).not.toHaveBeenCalled()
        rerender(<Probe paths={["a.jpg", "gone.jpg"]} />)
        await waitFor(() => expect(screen.getByTestId("missing")).toHaveTextContent("gone.jpg"))
        rerender(<Probe paths={["a.jpg", "gone.jpg"]} />)
        expect(invoke).toHaveBeenCalledTimes(1)
        vi.mocked(invoke).mockRejectedValue(new Error("no tauri"))
        rerender(<Probe paths={["x.jpg"]} />)
        await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
        rerender(<Probe paths={[]} />)
        expect(screen.getByTestId("missing")).toHaveTextContent("")
    })

    it("useMediaSources gives a URL only to the files that can be allowed", async () => {
        const Probe = () => <p data-testid="sources">{JSON.stringify(useMediaSources([{ path: "ok.jpg" }, { path: "gone.jpg" }]))}</p>
        existing = path => path !== "gone.jpg"
        render(<Probe />)
        await waitFor(() => expect(screen.getByTestId("sources")).toHaveTextContent("asset://localhost/ok.jpg"))
        expect(screen.getByTestId("sources")).not.toHaveTextContent("gone.jpg")
    })

    it("useGroupMediaFiles needs the provider and reports a failing load", async () => {
        const Probe = () => <p>{useGroupMediaFiles(7).length}</p>
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        expect(() => render(<Probe />)).toThrow(/AudioProvider/)
        vi.mocked(getDBGroupMediaFiles).mockRejectedValue(new Error("boom"))
        render(<AudioProvider><Probe /></AudioProvider>)
        await waitFor(() => expect(getDBGroupMediaFiles).toHaveBeenCalled())
    })
})
