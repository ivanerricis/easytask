import { useContext, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { AudioFile } from "@/types/types"
import { AudioContext, type AudioTrack } from "@/contexts/audio-context-object"
import { formatBitDepth, formatBitrate, formatChannels, formatDuration, formatFileSize, formatPosition, formatSampleRate, getAudioMetadata, type AudioMetadata } from "@/lib/audio-metadata"
import { formatDateTime } from "@/lib/utils"
import { RightPanelContext } from "../right-panel-context-object"
import { Field, sectionTitle } from "./fields"

type AudioInfoState = { path: string, metadata: AudioMetadata | null, failed: boolean }

/** The path of the loaded track: from the lists already loaded, otherwise decoded from its asset URL. */
const trackPath = (track: AudioTrack, filesCache: Map<number, AudioFile[]>): string | null => {
    for (const files of filesCache.values()) {
        const file = files.find(candidate => candidate.id === track.audioId)
        if (file) return file.path
    }
    try {
        // convertFileSrc: <scheme>://<host>/<encoded path>
        const encoded = new URL(track.src).pathname.slice(1)
        return encoded ? decodeURIComponent(encoded) : null
    } catch {
        return null
    }
}

const AudioFields = ({ name, path, metadata }: { name: string, path: string, metadata: AudioMetadata }) => {
    const { t } = useTranslation()
    const channelLabels = {
        mono: t("details.audio.mono"),
        stereo: t("details.audio.stereo"),
        many: (count: number) => t("details.audio.channelsCount", { count }),
    }
    const present = (value: number | null | undefined): value is number => value !== null && value !== undefined && value > 0
    const rows: [string, string | null][] = [
        [t("details.audio.format"), metadata.format ?? null],
        [t("details.audio.codec"), metadata.codec ?? null],
        [t("details.audio.duration"), present(metadata.durationMs) ? formatDuration(metadata.durationMs) : null],
        [t("details.audio.size"), formatFileSize(metadata.sizeBytes)],
        [t("details.audio.modified"), present(metadata.modifiedMs) ? formatDateTime(metadata.modifiedMs) : null],
        [t("details.audio.audioBitrate"), present(metadata.audioBitrate) ? formatBitrate(metadata.audioBitrate) : null],
        [t("details.audio.overallBitrate"), present(metadata.overallBitrate) ? formatBitrate(metadata.overallBitrate) : null],
        [t("details.audio.sampleRate"), present(metadata.sampleRate) ? formatSampleRate(metadata.sampleRate) : null],
        [t("details.audio.bitDepth"), present(metadata.bitDepth) ? formatBitDepth(metadata.bitDepth) : null],
        [t("details.audio.channels"), present(metadata.channels) ? formatChannels(metadata.channels, channelLabels) : null],
        [t("details.audio.albumArtist"), metadata.albumArtist ?? null],
        [t("details.audio.date"), metadata.date ?? null],
        [t("details.audio.track"), present(metadata.track) ? formatPosition(metadata.track, metadata.trackTotal) : null],
        [t("details.audio.disc"), present(metadata.disc) ? formatPosition(metadata.disc) : null],
        [t("details.audio.genre"), metadata.genre ?? null],
        [t("details.audio.composer"), metadata.composer ?? null],
        [t("details.audio.comment"), metadata.comment ?? null],
    ]
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                {metadata.cover && (
                    <img src={metadata.cover} alt={t("details.audio.cover")} className="mb-2 aspect-square w-full max-w-48 self-center rounded-xs border object-cover" />
                )}
                <h2 className="text-base font-semibold break-words"><span className="sr-only">{t("details.audio.fileTitle")} </span>{metadata.title ?? name}</h2>
                {metadata.artist && <p className="text-sm break-words">{metadata.artist}</p>}
                {metadata.album && <p className="text-sm text-muted-foreground break-words">{metadata.album}</p>}
            </div>
            <Field label={t("details.audio.file")}><span className="break-all">{path}</span></Field>
            {rows.map(([label, value]) => value && <Field key={label} label={label}>{value}</Field>)}
        </div>
    )
}

/**
 * The information of an audio file (bottom half of the panel): the file chosen with "Information" in its menu,
 * otherwise the one loaded in the player. The data is read when the file changes.
 * @category RightPanel
 */
export const AudioDetails = () => {
    const { t } = useTranslation()
    const chosen = useContext(RightPanelContext)?.audioInfoFile ?? null
    const audio = useContext(AudioContext)
    const track = audio?.track ?? null
    const filesCache = audio?.filesCache
    const file = chosen
        ? { name: chosen.name, path: chosen.path }
        : track && filesCache ? { name: track.name, path: trackPath(track, filesCache) } : null
    const path = file?.path ?? null
    const [state, setState] = useState<AudioInfoState | null>(null)

    useEffect(() => {
        if (!path) return
        let cancelled = false
        getAudioMetadata(path)
            .then(metadata => { if (!cancelled) setState({ path, metadata, failed: false }) })
            .catch(() => { if (!cancelled) setState({ path, metadata: null, failed: true }) })
        return () => { cancelled = true }
    }, [path])

    let content: React.ReactNode
    if (!file || !path) content = <p role="status" className="text-sm text-muted-foreground">{t("details.audio.empty")}</p>
    else if (state?.path !== path) content = <p role="status" className="text-sm text-muted-foreground">{t("details.audio.loading")}</p>
    else if (state.failed || !state.metadata) content = <p role="alert" className="text-sm text-destructive">{t("details.audio.error")}</p>
    else content = <AudioFields name={file.name} path={path} metadata={state.metadata} />

    // Without a file the block is a single compact line
    if (!file || !path) {
        return (
            <section aria-label={t("details.audio.title")} className="flex shrink-0 items-baseline gap-2 border-t px-3 py-2">
                <h2 className={`${sectionTitle} shrink-0`}>{t("details.audio.title")}</h2>
                {content}
            </section>
        )
    }

    return (
        <section aria-label={t("details.audio.title")} className="flex max-h-[40%] shrink-0 flex-col border-t">
            <h2 className={`${sectionTitle} shrink-0 px-3 pt-3`}>{t("details.audio.title")}</h2>
            <div className="min-h-0 overflow-y-auto p-3">{content}</div>
        </section>
    )
}
