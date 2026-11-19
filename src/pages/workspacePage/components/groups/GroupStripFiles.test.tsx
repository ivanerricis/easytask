import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GroupStripFiles } from "./GroupStripFiles"
import type { AudioFile, MediaFile } from "@/types/types"

const audio = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Traccia ${i + 1}`, path: `C:/audio/${i + 1}.mp3` }) as AudioFile)
const media = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Foto ${i + 1}.png`, path: `C:/img/${i + 1}.png` }) as MediaFile)

let audioFiles: AudioFile[] = []
let mediaFiles: MediaFile[] = []
const playFile = vi.fn()
vi.mock("@/contexts/use-audio", () => ({
    useGroupAudioFiles: () => audioFiles,
    useAudio: () => ({ track: null, playbackState: null, playFile, relinkFile: vi.fn(), refresh: vi.fn() }),
    useAudioActions: () => ({ relinkMediaFile: vi.fn(), refresh: vi.fn(), reportMissingMedia: vi.fn() }),
}))
vi.mock("@/contexts/use-media", () => ({
    useGroupMediaFiles: () => mediaFiles,
    useMissingPaths: () => new Set<string>(),
    useMediaSources: () => ({}),
    fileStillExists: vi.fn(async () => true),
    openWithDefaultApp: vi.fn(),
}))
vi.mock("@/components/dialogs/dialog-rename", () => ({ DialogRenameItem: () => null }))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
vi.mock("@/components/dialogs/use-delete-item", () => ({ useSkippableDelete: () => ({ request: vi.fn() }) }))
vi.mock("../rightbar/use-right-panel", () => ({ useShowAudioInfo: () => null }))
vi.mock("./MediaViewer", () => ({ MediaViewer: ({ index }: { index: number | null }) => index === null ? null : <div>viewer {index}</div> }))

const onOpen = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
    audioFiles = []
    mediaFiles = []
})

describe("GroupStripFiles", () => {
    it("draws nothing for a group without files", () => {
        const { container } = render(<GroupStripFiles groupId={1} onOpen={onOpen} />)
        expect(container).toBeEmptyDOMElement()
    })

    it("shows one small button per file, the audio ones first", () => {
        audioFiles = audio(2)
        mediaFiles = media(1)
        render(<GroupStripFiles groupId={1} onOpen={onOpen} />)
        const buttons = screen.getAllByRole("button")
        expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["Traccia 1", "Traccia 2", "Apri Foto 1.png"])
        for (const button of buttons) expect(button.className).toContain("size-7")
        expect(screen.queryByRole("button", { name: /altri|altro/i })).not.toBeInTheDocument()
    })

    it("plays an audio file and opens the viewer on a media one", async () => {
        audioFiles = audio(1)
        mediaFiles = media(2)
        render(<GroupStripFiles groupId={1} onOpen={onOpen} />)
        await userEvent.click(screen.getByRole("button", { name: "Traccia 1" }))
        expect(playFile).toHaveBeenCalledWith(audioFiles[0])
        await userEvent.click(screen.getByRole("button", { name: "Apri Foto 2.png" }))
        expect(screen.getByText("viewer 1")).toBeInTheDocument()
    })

    it("shows at most 5 buttons and a +N one that opens the group", async () => {
        audioFiles = audio(3)
        mediaFiles = media(4)
        render(<GroupStripFiles groupId={1} onOpen={onOpen} />)
        // 3 audio + 2 of the 4 media files fit; the other 2 are in "+2"
        expect(screen.getAllByRole("button")).toHaveLength(6)
        expect(screen.queryByRole("button", { name: "Apri Foto 3.png" })).not.toBeInTheDocument()
        const more = screen.getByRole("button", { name: "Altri 2 file: apri il gruppo" })
        expect(more).toHaveTextContent("+2")
        fireEvent.click(more)
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it("counts only audio files toward the limit when there are no media ones", () => {
        audioFiles = audio(7)
        render(<GroupStripFiles groupId={1} onOpen={onOpen} />)
        expect(screen.getByRole("button", { name: "Altri 2 file: apri il gruppo" })).toHaveTextContent("+2")
        expect(screen.queryByRole("button", { name: "Traccia 6" })).not.toBeInTheDocument()
    })
})
