import { invoke } from "@tauri-apps/api/core"
import { currentLanguage } from "@/i18n"

/** What the `audio_loudness` command measured (EBU R128). Silent files have null integrated loudness and true peak. */
export type LoudnessReport = {
    /** Integrated loudness, LUFS. */
    integratedLufs: number | null
    /** Highest true peak, dBTP. */
    truePeakDbtp: number | null
    /** Loudness range, LU. */
    lra: number
    /** Points per second of the three curves. */
    curveHz: number
    /** Short-term (3 s) loudness, LUFS; -70 for silence, lower than the real value while the window is not full yet. */
    shortTerm: number[]
    /** Momentary (400 ms) loudness, LUFS. */
    momentary: number[]
    /** Highest true peak up to each point, dBTP. */
    truePeak: number[]
    /** Waveform: min and max of each slice, interleaved (min0, max0, min1, max1, ...), -1..1. */
    peaks: number[]
    durationMs: number
}

/** Floor of the values of the curves: below it there is silence (or not enough audio yet). */
export const LOUDNESS_FLOOR = -70

const pending = new Map<string, Promise<LoudnessReport>>()

/**
 * Measures the loudness of an audio file (read-only; the backend caches the result). The calls for the same file made
 * while one is running (details panel and player) share it. Rejects when the file is missing or cannot be decoded.
 * @param path Absolute path of the file.
 */
export const getAudioLoudness = (path: string): Promise<LoudnessReport> => {
    const running = pending.get(path)
    if (running) return running
    const request = invoke<LoudnessReport>("audio_loudness", { path }).finally(() => { pending.delete(path) })
    pending.set(path, request)
    return request
}

/** The values of the curves at a time of the track (the last point when past the end). */
export type LoudnessReading = { shortTerm: number, momentary: number, truePeak: number }

export const loudnessAt = (report: LoudnessReport, seconds: number): LoudnessReading | null => {
    const count = report.momentary.length
    if (count === 0) return null
    const at = Math.min(Math.max(Math.floor((Number.isFinite(seconds) ? seconds : 0) * report.curveHz), 0), count - 1)
    return { shortTerm: report.shortTerm[at] ?? LOUDNESS_FLOOR, momentary: report.momentary[at] ?? LOUDNESS_FLOOR, truePeak: report.truePeak[at] ?? LOUDNESS_FLOOR }
}

const number = (value: number) => new Intl.NumberFormat(currentLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)

/** "-14,2" (no unit): the curves show the floor as "-∞". */
export const formatLevel = (value: number): string => value <= LOUDNESS_FLOOR ? "-∞" : number(value)

/** "-14,2 LUFS". */
export const formatLufs = (value: number): string => `${number(value)} LUFS`

/** "-1,0 dBTP". */
export const formatDbtp = (value: number): string => `${number(value)} dBTP`

/** "6,3 LU". */
export const formatLu = (value: number): string => `${number(value)} LU`
