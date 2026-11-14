import { afterEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import i18n from "@/i18n"
import { formatBitDepth, formatBitrate, formatChannels, formatDuration, formatFileSize, formatPosition, formatSampleRate, getAudioMetadata } from "./audio-metadata"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

afterEach(async () => { await i18n.changeLanguage("it") })

describe("audio metadata formatters", () => {
    it("formats the duration like the player", () => {
        expect(formatDuration(0)).toBe("0:00")
        expect(formatDuration(185_900)).toBe("3:05")
        expect(formatDuration(3_909_000)).toBe("1:05:09")
        expect(formatDuration(Number.NaN)).toBe("0:00")
    })

    it("formats sizes with the separators of the language", async () => {
        expect(formatFileSize(512)).toBe("512 B")
        expect(formatFileSize(12_800)).toBe("12,5 KB")
        expect(formatFileSize(3.5 * 1024 ** 2)).toBe("3,5 MB")
        await i18n.changeLanguage("en")
        expect(formatFileSize(12_800)).toBe("12.5 KB")
        expect(formatFileSize(2 * 1024 ** 3)).toBe("2 GB")
    })

    it("formats bitrate, sample rate and bit depth", async () => {
        expect(formatBitrate(320)).toBe("320 kbps")
        expect(formatSampleRate(44100)).toBe("44,1 kHz")
        expect(formatSampleRate(48000)).toBe("48 kHz")
        expect(formatBitDepth(16)).toBe("16 bit")
        await i18n.changeLanguage("en")
        expect(formatSampleRate(44100)).toBe("44.1 kHz")
    })

    it("names the channels", () => {
        const labels = { mono: "Mono", stereo: "Stereo", many: (count: number) => `${count} canali` }
        expect(formatChannels(1, labels)).toBe("Mono")
        expect(formatChannels(2, labels)).toBe("Stereo")
        expect(formatChannels(6, labels)).toBe("6 canali")
    })

    it("formats track numbers", () => {
        expect(formatPosition(3)).toBe("3")
        expect(formatPosition(3, 12)).toBe("3/12")
    })
})

describe("getAudioMetadata", () => {
    it("asks the backend for the file", async () => {
        vi.mocked(invoke).mockResolvedValueOnce({ sizeBytes: 1 })
        await expect(getAudioMetadata("/music/a.mp3")).resolves.toEqual({ sizeBytes: 1 })
        expect(invoke).toHaveBeenCalledWith("audio_metadata", { path: "/music/a.mp3" })
    })
})
