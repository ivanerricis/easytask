import { afterEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import i18n from "@/i18n"
import { formatDbtp, formatLevel, formatLu, formatLufs, getAudioLoudness, loudnessAt, type LoudnessReport } from "./audio-loudness"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

afterEach(async () => {
    vi.mocked(invoke).mockReset()
    await i18n.changeLanguage("it")
})

const report: LoudnessReport = {
    integratedLufs: -14, truePeakDbtp: -1, lra: 5, curveHz: 10,
    shortTerm: [-70, -20, -18], momentary: [-30, -25, -22], truePeak: [-12, -6, -3],
    peaks: [-0.1, 0.1], durationMs: 300,
}

describe("getAudioLoudness", () => {
    it("asks the backend for the file", async () => {
        vi.mocked(invoke).mockResolvedValueOnce(report)
        await expect(getAudioLoudness("/music/a.mp3")).resolves.toEqual(report)
        expect(invoke).toHaveBeenCalledWith("audio_loudness", { path: "/music/a.mp3" })
    })

    it("shares the measure of the same file while it runs, then measures again", async () => {
        let finish: (value: LoudnessReport) => void = () => undefined
        vi.mocked(invoke).mockReturnValueOnce(new Promise<LoudnessReport>(resolve => { finish = resolve }))
        const first = getAudioLoudness("/music/b.mp3")
        const second = getAudioLoudness("/music/b.mp3")
        expect(invoke).toHaveBeenCalledTimes(1)
        finish(report)
        await Promise.all([first, second])
        vi.mocked(invoke).mockResolvedValueOnce(report)
        await getAudioLoudness("/music/b.mp3")
        expect(invoke).toHaveBeenCalledTimes(2)
    })

    it("rejects when the backend does", async () => {
        vi.mocked(invoke).mockRejectedValueOnce("audio file not found")
        await expect(getAudioLoudness("/music/c.mp3")).rejects.toBe("audio file not found")
    })
})

describe("loudnessAt", () => {
    it("reads the curves at the time of the track", () => {
        expect(loudnessAt(report, 0)).toEqual({ shortTerm: -70, momentary: -30, truePeak: -12 })
        expect(loudnessAt(report, 0.1)).toEqual({ shortTerm: -20, momentary: -25, truePeak: -6 })
        expect(loudnessAt(report, 0.19)).toEqual({ shortTerm: -20, momentary: -25, truePeak: -6 })
    })

    it("clamps before the start and past the end, and ignores a bad time", () => {
        expect(loudnessAt(report, -3)?.momentary).toBe(-30)
        expect(loudnessAt(report, 99)?.momentary).toBe(-22)
        expect(loudnessAt(report, Number.NaN)?.momentary).toBe(-30)
    })

    it("has nothing when there is no curve", () => {
        expect(loudnessAt({ ...report, momentary: [], shortTerm: [], truePeak: [] }, 1)).toBeNull()
    })
})

describe("loudness formatters", () => {
    it("formats with the separators of the language", async () => {
        expect(formatLufs(-14.23)).toBe("-14,2 LUFS")
        expect(formatDbtp(-1)).toBe("-1,0 dBTP")
        expect(formatLu(6.34)).toBe("6,3 LU")
        await i18n.changeLanguage("en")
        expect(formatLufs(-14.23)).toBe("-14.2 LUFS")
    })

    it("writes the floor as minus infinity", () => {
        expect(formatLevel(-70)).toBe("-∞")
        expect(formatLevel(-23)).toBe("-23,0")
    })
})
