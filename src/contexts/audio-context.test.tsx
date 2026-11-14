import { useState } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import type { AudioFile } from "@/types/types"
import { AudioProvider } from "./audio-context"
import { useAudio } from "./use-audio"
import { GroupAudioFiles } from "@/pages/workspacePage/components/groups/GroupAudioFiles"
import { DraggableAudioPlayer } from "@/components/draggable-audio-player"
import { createDBAudioFile, getDBAudioFile, getDBGroupAudioFiles, updateDBAudioFilePath } from "@/db/queries/audio"

// The Radix slider of the player measures its thumb with a ResizeObserver, which jsdom does not have
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

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
    createDBAudioFile: vi.fn(),
    updateDBAudioFilePath: vi.fn(),
}))

const workspaceActions = {
    deleteItem: vi.fn(),
    renameItem: vi.fn(),
}
const workspaceState = { audioVersion: 0 }
vi.mock("./workspace-data", () => ({
    useWorkspaceVersion: (kind: string) => kind === "audio" ? workspaceState.audioVersion : 0,
    useWorkspaceActions: () => workspaceActions,
    useWorkspaceData: () => ({ ...workspaceState, ...workspaceActions }),
}))

const prefsState = {
    audioVolume: 1, audioPlayerVisible: true, audioPlayerScale: 1, audioPlayerOpacity: 1,
    setAudioVolume: vi.fn(),
    reportAudioPlayerSize: vi.fn(),
}
vi.mock("./use-preferences", () => ({ usePreferences: () => prefsState }))
vi.mock("@/hooks/use-shortcut", () => ({ useShortcut: vi.fn() }))

const file = (over: Partial<AudioFile> = {}): AudioFile => ({
    id: 1, section_groupID: 7, name: "song.mp3", path: "C:\\Music\\song.mp3", position: 0,
    creation_date: "2026-01-01", creation_time: "10:00", ...over,
})

let stored: AudioFile[]
let play: ReturnType<typeof vi.fn>

function AddButton() {
    const { addFiles } = useAudio()
    return <button onClick={() => void addFiles(7)}>add-files</button>
}

const renderAll = () => render(
    <AudioProvider>
        <DndContext>
            <GroupAudioFiles groupId={7} />
            <AddButton />
            <DraggableAudioPlayer position={{ x: 0, y: 0, scaleX: 1, scaleY: 1 }} />
        </DndContext>
    </AudioProvider>
)

// The lists also ask `files_exist` (missing markers): the tests of the playback look only at the commands about playing
const playbackCalls = () => vi.mocked(invoke).mock.calls.filter(([command]) => command !== "files_exist")

const audioElement = () => document.querySelector("audio") as HTMLAudioElement | null

beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(toast.error).mockReset()
    workspaceState.audioVersion = 0
    Object.assign(prefsState, { audioVolume: 1, audioPlayerVisible: true, audioPlayerScale: 1, audioPlayerOpacity: 1 })
    stored = [file(), file({ id: 2, name: "other.wav", path: "C:\\Music\\other.wav", position: 1 })]
    vi.mocked(getDBGroupAudioFiles).mockImplementation(async () => stored)
    vi.mocked(getDBAudioFile).mockImplementation(async (id) => stored.find(f => f.id === id) ?? null)
    vi.mocked(invoke).mockResolvedValue(undefined)
    workspaceActions.deleteItem.mockResolvedValue(undefined)

    play = vi.fn().mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("play"))
        return Promise.resolve()
    })
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as never)
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("pause"))
    } as never)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("audio files of a group", () => {
    it("lists the files and does not autoplay: no player, no allow request", async () => {
        renderAll()
        expect(await screen.findByText("song.mp3")).toBeInTheDocument()
        expect(screen.getByText("other.wav")).toBeInTheDocument()
        expect(audioElement()).toBeNull()
        expect(playbackCalls()).toEqual([])
        expect(play).not.toHaveBeenCalled()
    })

    it("clicking a file allows it, opens the player with its asset url and plays", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))

        await waitFor(() => expect(audioElement()).not.toBeNull())
        expect(invoke).toHaveBeenCalledWith("allow_audio_file", { path: "C:\\Music\\song.mp3" })
        expect(audioElement()!.getAttribute("src")).toBe("asset://localhost/" + encodeURIComponent("C:\\Music\\song.mp3"))
        expect(play).toHaveBeenCalledTimes(1)
        // The name is in the list and in the player
        expect(screen.getAllByText("song.mp3")).toHaveLength(2)
    })

    it("starts at the volume preference and applies size and transparency to the player", async () => {
        Object.assign(prefsState, { audioVolume: 0.4, audioPlayerScale: 1.2, audioPlayerOpacity: 0.6 })
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await waitFor(() => expect(audioElement()).not.toBeNull())

        expect(audioElement()!.volume).toBe(0.4)
        const frame = screen.getByTestId("audio-player-frame")
        expect(frame.style.opacity).toBe("0.6")
        expect(frame.style.zoom).toBe("1.2")

        fireEvent.keyDown(screen.getByLabelText("Volume"), { key: "ArrowRight" })
        expect(prefsState.setAudioVolume).toHaveBeenCalledWith(0.41)
    })

    it("with the floating player turned off nothing starts and the user is told", async () => {
        prefsState.audioPlayerVisible = false
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))

        await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("Impostazioni")))
        expect(audioElement()).toBeNull()
        expect(play).not.toHaveBeenCalled()
        expect(playbackCalls()).toEqual([])
    })

    it("clicking another file switches the track and starts it from the beginning", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await waitFor(() => expect(play).toHaveBeenCalledTimes(1))

        await user.click(screen.getByText("other.wav"))
        await waitFor(() => expect(audioElement()!.getAttribute("src")).toContain(encodeURIComponent("C:\\Music\\other.wav")))
        expect(play).toHaveBeenCalledTimes(2)
    })

    it("clicking the file that is loaded pauses it, and clicking it again resumes it (it does not restart)", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
        // The name is also shown by the player: the list row is the first match
        const row = () => screen.getAllByText("song.mp3")[0].closest("button") as HTMLElement
        expect(within(row()).getByText("In riproduzione")).toBeInTheDocument()
        expect(row()).toHaveAttribute("aria-current", "true")
        audioElement()!.currentTime = 12

        await user.click(row())
        await waitFor(() => expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1))
        expect(within(row()).getByText("In pausa")).toBeInTheDocument()
        expect(audioElement()!.currentTime).toBe(12)

        await user.click(row())
        await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
        expect(audioElement()!.currentTime).toBe(12)
        expect(within(row()).getByText("In riproduzione")).toBeInTheDocument()
        // The invoke that grants the file ran once: the loaded track was not requested again
        expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "allow_audio_file")).toHaveLength(1)
    })

    it("a group that is collapsed and opened again shows its files in the first render (no empty flash)", async () => {
        const user = userEvent.setup()
        function Toggle() {
            const [shown, setShown] = useState(true)
            return (
                <>
                    <button onClick={() => setShown(value => !value)}>toggle-group</button>
                    {shown && <GroupAudioFiles groupId={7} />}
                </>
            )
        }
        render(
            <AudioProvider>
                <DndContext><Toggle /></DndContext>
            </AudioProvider>
        )
        expect(await screen.findByText("song.mp3")).toBeInTheDocument()

        // Collapse: the list is unmounted. The next load never answers, so only the remembered list can be on screen
        await user.click(screen.getByText("toggle-group"))
        expect(screen.queryByText("song.mp3")).not.toBeInTheDocument()
        vi.mocked(getDBGroupAudioFiles).mockImplementation(() => new Promise(() => undefined))

        await user.click(screen.getByText("toggle-group"))
        expect(screen.getByText("song.mp3")).toBeInTheDocument()
        expect(screen.getByText("other.wav")).toBeInTheDocument()
        // ...and the list is still asked again, so it stays up to date
        expect(vi.mocked(getDBGroupAudioFiles).mock.calls.length).toBeGreaterThan(1)
    })

    it("a group never shown before starts empty (nothing remembered)", async () => {
        render(
            <AudioProvider>
                <DndContext><GroupAudioFiles groupId={7} /></DndContext>
            </AudioProvider>
        )
        expect(screen.queryByText("song.mp3")).not.toBeInTheDocument()
        expect(await screen.findByText("song.mp3")).toBeInTheDocument()
    })

    it("the icon of the row follows the state: note, bars while playing, pause, stop at the end, note after the X", async () => {
        const user = userEvent.setup()
        renderAll()
        const row = () => screen.getAllByText("song.mp3")[0].closest("button") as HTMLElement
        const icon = () => row().querySelector("svg")!
        await screen.findByText("song.mp3")
        expect(icon()).toHaveClass("lucide-music")

        await user.click(row())
        await waitFor(() => expect(icon()).toHaveClass("lucide-audio-lines"))
        expect(within(row()).getByText("In riproduzione")).toBeInTheDocument()

        await user.click(row())
        await waitFor(() => expect(icon()).toHaveClass("lucide-pause"))
        expect(within(row()).getByText("In pausa")).toBeInTheDocument()

        await user.click(row())
        await waitFor(() => expect(icon()).toHaveClass("lucide-audio-lines"))
        fireEvent.ended(audioElement()!)
        await waitFor(() => expect(icon()).toHaveClass("lucide-square"))
        expect(within(row()).getByText("Terminato")).toBeInTheDocument()

        await user.click(screen.getByLabelText("Chiudi il player"))
        await waitFor(() => expect(icon()).toHaveClass("lucide-music"))
        expect(within(row()).queryByText(/In riproduzione|In pausa|Terminato/)).toBeNull()
    })

    it("a row that is not loaded has no state text", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
        const other = screen.getByText("other.wav").closest("button") as HTMLElement
        expect(other).not.toHaveAttribute("aria-current")
        expect(within(other).queryByText(/In riproduzione|In pausa/)).toBeNull()
    })

    it("the file clicked again after the player was closed starts over", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
        await user.click(screen.getByLabelText("Chiudi il player"))
        expect(audioElement()).toBeNull()

        await user.click(screen.getByText("song.mp3"))
        await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
        expect(audioElement()).not.toBeNull()
    })

    it("the X of the player closes it and pauses", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await waitFor(() => expect(audioElement()).not.toBeNull())

        await user.click(screen.getByLabelText("Chiudi il player"))
        expect(audioElement()).toBeNull()
        expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    })

    it("stops when the played file is deleted (list reload after a trash change)", async () => {
        const user = userEvent.setup()
        const { rerender } = renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await waitFor(() => expect(audioElement()).not.toBeNull())

        stored = stored.filter(f => f.id !== 1)
        workspaceState.audioVersion = 1
        rerender(
            <AudioProvider>
                <DndContext>
                    <GroupAudioFiles groupId={7} />
                    <AddButton />
                    <DraggableAudioPlayer position={{ x: 0, y: 0, scaleX: 1, scaleY: 1 }} />
                </DndContext>
            </AudioProvider>
        )
        await waitFor(() => expect(audioElement()).toBeNull())
        expect(screen.queryByText("song.mp3")).not.toBeInTheDocument()
    })
})

describe("missing file", () => {
    beforeEach(() => {
        vi.mocked(invoke).mockImplementation(async (command) => {
            if (command === "allow_audio_file") throw "audio file not found"
        })
    })

    it("shows the File non trovato dialog with the stored path and does not open the player", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))

        expect(await screen.findByText("File non trovato")).toBeInTheDocument()
        expect(screen.getByText("C:\\Music\\song.mp3")).toBeInTheDocument()
        expect(audioElement()).toBeNull()
        expect(screen.getByRole("button", { name: "Aggiorna percorso" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Elimina riferimento" })).toBeInTheDocument()
    })

    it("Annulla closes the dialog and changes nothing", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await user.click(await screen.findByRole("button", { name: "Annulla" }))

        await waitFor(() => expect(screen.queryByText("File non trovato")).not.toBeInTheDocument())
        expect(updateDBAudioFilePath).not.toHaveBeenCalled()
        expect(workspaceActions.deleteItem).not.toHaveBeenCalled()
    })

    it("Aggiorna percorso asks for the new file, stores it and plays it", async () => {
        const user = userEvent.setup()
        vi.mocked(open).mockResolvedValue("D:\\New\\song.mp3")
        vi.mocked(updateDBAudioFilePath).mockImplementation(async (id, path) => {
            stored = stored.map(f => f.id === id ? { ...f, path } : f)
        })
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        vi.mocked(invoke).mockResolvedValue(undefined) // the file exists at the new path
        await user.click(await screen.findByRole("button", { name: "Aggiorna percorso" }))

        await waitFor(() => expect(updateDBAudioFilePath).toHaveBeenCalledWith(1, "D:\\New\\song.mp3"))
        expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, filters: [expect.objectContaining({ extensions: expect.arrayContaining(["mp3", "flac"]) })] }))
        await waitFor(() => expect(audioElement()).not.toBeNull())
        expect(playbackCalls().at(-1)).toEqual(["allow_audio_file", { path: "D:\\New\\song.mp3" }])
        expect(audioElement()!.getAttribute("src")).toContain(encodeURIComponent("D:\\New\\song.mp3"))
        expect(play).toHaveBeenCalled()
    })

    it("Aggiorna percorso does nothing when the file picker is cancelled", async () => {
        const user = userEvent.setup()
        vi.mocked(open).mockResolvedValue(null)
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await user.click(await screen.findByRole("button", { name: "Aggiorna percorso" }))

        await waitFor(() => expect(open).toHaveBeenCalled())
        expect(updateDBAudioFilePath).not.toHaveBeenCalled()
        expect(audioElement()).toBeNull()
    })

    it("Elimina riferimento moves the audio file to the trash", async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await user.click(await screen.findByRole("button", { name: "Elimina riferimento" }))

        await waitFor(() => expect(workspaceActions.deleteItem).toHaveBeenCalledWith("audio_file", 1))
        expect(audioElement()).toBeNull()
    })
})

describe("playback errors", () => {
    const startPlaying = async () => {
        const user = userEvent.setup()
        renderAll()
        await user.click(await screen.findByText("song.mp3"))
        await waitFor(() => expect(audioElement()).not.toBeNull())
    }

    it("shows a toast when the media element fails and the file still exists", async () => {
        await startPlaying()
        vi.mocked(invoke).mockResolvedValue(true)
        fireEvent.error(audioElement()!)

        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(invoke).toHaveBeenLastCalledWith("audio_file_exists", { path: "C:\\Music\\song.mp3" })
        expect(screen.queryByText("File non trovato")).not.toBeInTheDocument()
    })

    it("opens the File non trovato dialog when the file disappeared after the check", async () => {
        await startPlaying()
        vi.mocked(invoke).mockResolvedValue(false)
        fireEvent.error(audioElement()!)

        expect(await screen.findByText("File non trovato")).toBeInTheDocument()
        expect(audioElement()).toBeNull()
    })
})

describe("adding files", () => {
    it("inserts every picked file in the group and reloads the list", async () => {
        const user = userEvent.setup()
        vi.mocked(open).mockResolvedValue(["C:\\m\\a.mp3", "C:\\m\\b.ogg"])
        vi.mocked(createDBAudioFile).mockImplementation(async (groupId, path) => {
            const created = file({ id: stored.length + 1, section_groupID: groupId, name: path.split("\\").pop()!, path })
            stored = [...stored, created]
            return created
        })
        renderAll()
        await screen.findByText("song.mp3")
        await user.click(screen.getByText("add-files"))

        await waitFor(() => expect(createDBAudioFile).toHaveBeenCalledTimes(2))
        expect(createDBAudioFile).toHaveBeenCalledWith(7, "C:\\m\\a.mp3")
        expect(createDBAudioFile).toHaveBeenCalledWith(7, "C:\\m\\b.ogg")
        expect(await screen.findByText("b.ogg")).toBeInTheDocument()
        expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }))
        expect(audioElement()).toBeNull()
    })

    it("does nothing when the picker is cancelled", async () => {
        const user = userEvent.setup()
        vi.mocked(open).mockResolvedValue(null)
        renderAll()
        await screen.findByText("song.mp3")
        await act(async () => { await user.click(screen.getByText("add-files")) })
        expect(createDBAudioFile).not.toHaveBeenCalled()
    })
})
