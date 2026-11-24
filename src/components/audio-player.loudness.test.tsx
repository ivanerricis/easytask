import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import type { LoudnessReport } from "@/lib/audio-loudness"
import { AudioPlayer } from "./audio-player"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

// The Radix slider measures its thumb with a ResizeObserver, which jsdom does not have
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

const attributes = {
    role: "button",
    tabIndex: 0,
    "aria-disabled": false,
    "aria-pressed": undefined,
    "aria-roledescription": "draggable",
    "aria-describedby": "x",
} as const

const report: LoudnessReport = {
    integratedLufs: -14, truePeakDbtp: -1, lra: 5, curveHz: 10,
    shortTerm: [-70, -20.5, -18.5], momentary: [-30, -25.5, -22.5], truePeak: [-12, -6.5, -3.5],
    peaks: [-0.2, 0.3, -0.5, 0.6, -0.1, 0.1], durationMs: 300,
}

let counter = 0

const setup = (props: { loudnessMeter?: boolean, path?: string } = {}) => {
    // A different file each time: a measure that is still running is shared by path
    const path = `/music/${++counter}.mp3`
    const utils = render(<AudioPlayer src="a.mp3" fileName="song.mp3" listenersHandle={undefined} attributesHandle={attributes} path={path} {...props} />)
    const audio = utils.container.querySelector("audio") as HTMLAudioElement
    return { ...utils, audio }
}

describe("AudioPlayer loudness and waveform", () => {
    beforeEach(() => {
        vi.mocked(invoke).mockReset()
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("keeps the normal seek bar and shows a loading state until the measure is ready", async () => {
        vi.mocked(invoke).mockReturnValue(new Promise(() => undefined))
        setup({ loudnessMeter: true })
        expect(screen.getByText("Misura della loudness in corso")).toBeInTheDocument()
        expect(screen.getByTestId("loading-dots")).toBeInTheDocument()
        expect(screen.queryByTestId("audio-waveform")).toBeNull()
        expect(screen.getByRole("slider", { name: "Posizione di riproduzione" })).toBeInTheDocument()
    })

    it("replaces the seek bar with the waveform and shows the values at the playing position", async () => {
        vi.mocked(invoke).mockResolvedValue(report)
        const { audio } = setup({ loudnessMeter: true })
        const meter = await screen.findByTestId("loudness-meter")
        expect(screen.getByTestId("audio-waveform")).toBeInTheDocument()
        expect(invoke).toHaveBeenCalledWith("audio_loudness", { path: expect.stringMatching(/^\/music\/\d+\.mp3$/) })
        // At the start there is not enough audio for the short-term value
        expect(within(meter).getByText("-∞ LUFS")).toBeInTheDocument()
        act(() => {
            audio.currentTime = 0.25
            audio.dispatchEvent(new Event("timeupdate"))
        })
        await waitFor(() => expect(within(meter).getByText("-18,5 LUFS")).toBeInTheDocument())
        expect(within(meter).getByText("-22,5 LUFS")).toBeInTheDocument()
        expect(within(meter).getByText("-3,5 dBTP")).toBeInTheDocument()
    })

    it("hides only the meter when it is turned off", async () => {
        vi.mocked(invoke).mockResolvedValue(report)
        setup({ loudnessMeter: false })
        expect(await screen.findByTestId("audio-waveform")).toBeInTheDocument()
        expect(screen.queryByTestId("loudness-meter")).toBeNull()
        expect(screen.queryByText("Misura della loudness in corso")).toBeNull()
    })

    it("says the loudness is not available when the file cannot be measured, with the normal seek bar", async () => {
        vi.mocked(invoke).mockRejectedValue("unsupported")
        setup({ loudnessMeter: true })
        expect(await screen.findByText("Loudness non disponibile")).toBeInTheDocument()
        expect(screen.queryByTestId("audio-waveform")).toBeNull()
        expect(screen.getByRole("slider", { name: "Posizione di riproduzione" })).toBeInTheDocument()
    })

    it("measures nothing without a path", () => {
        setup({ path: undefined, loudnessMeter: true })
        expect(invoke).not.toHaveBeenCalled()
        expect(screen.queryByTestId("loudness-meter")).toBeNull()
    })

    it("seeks when the waveform is clicked or dragged", async () => {
        vi.mocked(invoke).mockResolvedValue(report)
        const { audio } = setup()
        const waveform = await screen.findByTestId("audio-waveform")
        Object.defineProperty(audio, "duration", { value: 100, configurable: true })
        fireEvent(audio, new Event("loadedmetadata"))
        waveform.getBoundingClientRect = () => ({ left: 10, width: 200, top: 0, right: 210, bottom: 32, height: 32, x: 10, y: 0, toJSON: () => ({}) })
        fireEvent.pointerDown(waveform, { clientX: 110, pointerId: 1 })
        expect(audio.currentTime).toBeCloseTo(50)
        fireEvent.pointerMove(waveform, { clientX: 160, pointerId: 1 })
        expect(audio.currentTime).toBeCloseTo(75)
        fireEvent.pointerUp(waveform, { clientX: 160, pointerId: 1 })
        fireEvent.pointerMove(waveform, { clientX: 10, pointerId: 1 })
        expect(audio.currentTime).toBeCloseTo(75)
    })
})
