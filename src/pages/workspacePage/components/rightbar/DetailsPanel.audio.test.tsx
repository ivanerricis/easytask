import { render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import i18n from "@/i18n"
import type { AudioFile } from "@/types/types"
import { TabsProvider } from "@/contexts/tabs-context"
import { UndoContext, type UndoContextType } from "@/contexts/undo/context"
import { AudioContext, type AudioContextType } from "@/contexts/audio-context-object"
import { makeNote } from "@/test/ui-fixtures"
import type { AudioMetadata } from "@/lib/audio-metadata"
import type { LoudnessReport } from "@/lib/audio-loudness"
import { DetailsPanel } from "./DetailsPanel"
import { RightPanelContext, type RightPanelContextType } from "./right-panel-context-object"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({}) }))
vi.mock("@/contexts/use-active-note", () => ({
    useActiveNote: () => ({ noteDataTree: null }),
    useActiveNoteActions: () => ({}),
}))

const file = (id: number, name: string, path: string): AudioFile =>
    ({ id, section_groupID: 1, name, path, position: 0, creation_date: "2026-01-01", creation_time: "00:00:00" })

const metadata: AudioMetadata = {
    sizeBytes: 5 * 1024 * 1024, modifiedMs: new Date(2026, 2, 4, 9, 30, 15).getTime(), format: "MPEG", codec: "MPEG audio",
    durationMs: 185_000, audioBitrate: 320, overallBitrate: 322, sampleRate: 44100, bitDepth: 16, channels: 2,
    title: "Canzone", artist: "Il Gruppo", album: "Il Disco", albumArtist: "Vari", date: "2020", track: 3, trackTotal: 12,
    genre: "Rock", cover: "data:image/png;base64,AAAA",
}

const loudness: LoudnessReport = {
    integratedLufs: -14.2, truePeakDbtp: -1.1, lra: 6.3, curveHz: 10,
    shortTerm: [-70], momentary: [-70], truePeak: [-70], peaks: [-0.5, 0.5], durationMs: 100,
}

/** Answers audio_metadata with `meta` and audio_loudness with the report (or a rejection / a measure that never ends). */
const mockBackend = (meta: unknown, measure: LoudnessReport | "fail" | "pending" = loudness) => {
    vi.mocked(invoke).mockImplementation(async command => {
        if (command !== "audio_loudness") return meta
        if (measure === "fail") throw "unsupported"
        if (measure === "pending") return new Promise(() => undefined)
        return measure
    })
}

const metadataCalls = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === "audio_metadata")

const renderPanel = (opts: { chosen?: AudioFile | null, track?: AudioContextType["track"], cache?: AudioFile[] } = {}) => {
    const audio = { track: opts.track ?? null, filesCache: new Map([[1, opts.cache ?? []]]) } as unknown as AudioContextType
    const panel = { audioInfoFile: opts.chosen ?? null } as unknown as RightPanelContextType
    return render(
        <TabsProvider notes={[makeNote({ id: 1 })]} workspaceId={null}>
            <UndoContext.Provider value={{ recorder: {} } as unknown as UndoContextType}>
                <AudioContext.Provider value={audio}>
                    <RightPanelContext.Provider value={panel}><DetailsPanel /></RightPanelContext.Provider>
                </AudioContext.Provider>
            </UndoContext.Provider>
        </TabsProvider>,
    )
}

beforeEach(() => { vi.mocked(invoke).mockReset() })
afterEach(async () => { await i18n.changeLanguage("it") })

describe("DetailsPanel audio half", () => {
    it("shows the empty state without a file", () => {
        renderPanel()
        expect(screen.getByText("Nessun file audio: riproduci un file o scegli Mostra dettagli dal suo menu.")).toBeInTheDocument()
        expect(invoke).not.toHaveBeenCalled()
    })

    it("shows the information of the file chosen from the menu", async () => {
        mockBackend(metadata)
        renderPanel({ chosen: file(7, "canzone.mp3", "/musica/canzone.mp3") })
        expect(screen.getByText("Lettura del file audio")).toBeInTheDocument()
        const heading = await screen.findByRole("heading", { name: /^Titolo del file audio/ })
        expect(heading).toHaveTextContent("Canzone")
        expect(invoke).toHaveBeenCalledWith("audio_metadata", { path: "/musica/canzone.mp3" })
        expect(metadataCalls()).toHaveLength(1)
        const section = screen.getByRole("region", { name: "Audio" })
        expect(within(section).getByText("Il Gruppo")).toBeInTheDocument()
        expect(within(section).getByText("Il Disco")).toBeInTheDocument()
        expect(within(section).getByText("3:05")).toBeInTheDocument()
        expect(within(section).getByText("5 MB")).toBeInTheDocument()
        expect(within(section).getByText("320 kbps")).toBeInTheDocument()
        expect(within(section).getByText("44,1 kHz")).toBeInTheDocument()
        expect(within(section).getByText("16 bit")).toBeInTheDocument()
        expect(within(section).getByText("Stereo")).toBeInTheDocument()
        expect(within(section).getByText("3/12")).toBeInTheDocument()
        expect(within(section).getByAltText("Copertina")).toHaveAttribute("src", metadata.cover)
        // Fields the file does not have are left out
        expect(within(section).queryByText("Compositore")).toBeNull()
    })

    it("falls back to the loaded track, finding its path in the file lists", async () => {
        mockBackend({ sizeBytes: 10 })
        renderPanel({
            track: { audioId: 4, name: "brano.wav", src: "http://asset.localhost/x", playId: 1 },
            cache: [file(4, "brano.wav", "/audio/brano.wav")],
        })
        const heading = await screen.findByRole("heading", { name: /^Titolo del file audio/ })
        // Without a title tag the name of the file is shown
        expect(heading).toHaveTextContent("brano.wav")
        expect(invoke).toHaveBeenCalledWith("audio_metadata", { path: "/audio/brano.wav" })
    })

    it("decodes the path from the asset URL when the file is not in the lists", async () => {
        mockBackend({ sizeBytes: 10 })
        renderPanel({ track: { audioId: 4, name: "b.wav", src: `http://asset.localhost/${encodeURIComponent("/a b/b.wav")}`, playId: 1 } })
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("audio_metadata", { path: "/a b/b.wav" }))
    })

    it("prefers the chosen file over the loaded track", async () => {
        mockBackend({ sizeBytes: 10 })
        renderPanel({
            chosen: file(7, "scelto.mp3", "/scelto.mp3"),
            track: { audioId: 4, name: "brano.wav", src: "http://asset.localhost/x", playId: 1 },
        })
        await screen.findByRole("heading", { name: /^Titolo del file audio/ })
        expect(invoke).toHaveBeenCalledWith("audio_metadata", { path: "/scelto.mp3" })
    })

    it("shows an error when the file cannot be read", async () => {
        vi.mocked(invoke).mockRejectedValue("audio file not found")
        renderPanel({ chosen: file(7, "x.mp3", "/x.mp3") })
        expect(await screen.findByRole("alert")).toHaveTextContent("File non trovato o non leggibile.")
    })

    it("shows loudness, true peak and LRA of the file", async () => {
        mockBackend(metadata)
        renderPanel({ chosen: file(7, "canzone.mp3", "/musica/canzone.mp3") })
        const section = await screen.findByRole("region", { name: "Audio" })
        expect(await within(section).findByText("-14,2 LUFS")).toBeInTheDocument()
        expect(within(section).getByText("Loudness (LUFS integrati)")).toBeInTheDocument()
        expect(within(section).getByText("-1,1 dBTP")).toBeInTheDocument()
        expect(within(section).getByText("6,3 LU")).toBeInTheDocument()
        expect(invoke).toHaveBeenCalledWith("audio_loudness", { path: "/musica/canzone.mp3" })
    })

    it("shows loading dots in the loudness rows while the file is measured", async () => {
        mockBackend(metadata, "pending")
        // Its own path: a measure that never ends is shared by path with the tests that follow
        renderPanel({ chosen: file(7, "canzone.mp3", "/musica/in-corso.mp3") })
        const section = await screen.findByRole("region", { name: "Audio" })
        await within(section).findByText("Picco reale")
        expect(within(section).getAllByTestId("loading-dots")).toHaveLength(3)
        expect(within(section).getAllByText("Misura in corso")).toHaveLength(3)
    })

    it("says the loudness cannot be measured and keeps the other fields", async () => {
        mockBackend(metadata, "fail")
        renderPanel({ chosen: file(7, "canzone.mp3", "/musica/canzone.mp3") })
        const section = await screen.findByRole("region", { name: "Audio" })
        expect(await within(section).findByText("Non misurabile")).toBeInTheDocument()
        expect(within(section).getByText("320 kbps")).toBeInTheDocument()
    })

    it("follows the language", async () => {
        await i18n.changeLanguage("en")
        renderPanel()
        expect(screen.getByText("No audio file: play a file or choose Show details from its menu.")).toBeInTheDocument()
    })
})
