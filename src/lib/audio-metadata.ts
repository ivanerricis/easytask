import { invoke } from "@tauri-apps/api/core"
import { currentLanguage } from "@/i18n"

/**
 * What the `audio_metadata` command knows about an audio file. Every field that may be missing from the file is null
 * (or absent).
 */
export type AudioMetadata = {
    sizeBytes: number
    /** Last modification, milliseconds since the Unix epoch. */
    modifiedMs?: number | null
    format?: string | null
    codec?: string | null
    durationMs?: number | null
    /** Bitrate of the audio stream, kbps. */
    audioBitrate?: number | null
    /** Bitrate of the whole file, kbps. */
    overallBitrate?: number | null
    sampleRate?: number | null
    bitDepth?: number | null
    channels?: number | null
    title?: string | null
    artist?: string | null
    album?: string | null
    albumArtist?: string | null
    date?: string | null
    track?: number | null
    trackTotal?: number | null
    disc?: number | null
    genre?: string | null
    composer?: string | null
    comment?: string | null
    /** `data:<mime>;base64,...` of the cover art (only when it is small enough). */
    cover?: string | null
}

/**
 * Reads the properties and tags of an audio file (read-only). Rejects when the file is missing or is not an audio file.
 * @param path Absolute path of the file.
 */
export const getAudioMetadata = (path: string) => invoke<AudioMetadata>("audio_metadata", { path })

const number = (value: number, maximumFractionDigits = 1) =>
    new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits }).format(value)

/** "3:05", or "1:05:09" from one hour on (same style as the player). */
export const formatDuration = (ms: number): string => {
    const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const ss = s < 10 ? `0${s}` : `${s}`
    return h > 0 ? `${h}:${m < 10 ? "0" : ""}${m}:${ss}` : `${m}:${ss}`
}

/** "512 B", "12.5 KB", "3.4 MB" or "1.2 GB" (1024-based), with the separators of the current language. */
export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${number(bytes, 0)} B`
    if (bytes < 1024 ** 2) return `${number(bytes / 1024)} KB`
    if (bytes < 1024 ** 3) return `${number(bytes / 1024 ** 2)} MB`
    return `${number(bytes / 1024 ** 3)} GB`
}

/** "320 kbps". */
export const formatBitrate = (kbps: number): string => `${number(kbps, 0)} kbps`

/** "44.1 kHz" from a frequency in Hz. */
export const formatSampleRate = (hz: number): string => `${number(hz / 1000, 3)} kHz`

/** "16 bit". */
export const formatBitDepth = (bits: number): string => `${number(bits, 0)} bit`

/** "Mono", "Stereo" or "6 channels"; `labels` carries the translated words. */
export const formatChannels = (channels: number, labels: { mono: string, stereo: string, many: (count: number) => string }): string =>
    channels === 1 ? labels.mono : channels === 2 ? labels.stereo : labels.many(channels)

/** "3" or "3/12" (track or disc number with the optional total). */
export const formatPosition = (index: number, total?: number | null): string => total ? `${index}/${total}` : `${index}`

