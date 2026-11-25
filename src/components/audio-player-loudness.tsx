import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { LoadingDots } from "@/components/loading-dots"
import { shiftDurationMs } from "@/lib/animation-speed"
import { formatLevel, loudnessAt, type LoudnessReading } from "@/lib/audio-loudness"
import type { AudioLoudness } from "@/hooks/use-audio-loudness"

/** Bars of the waveform (the backend sends up to 1000 min/max pairs; they are merged to this many). */
const WAVEFORM_BARS = 100
/** Height of the waveform drawing, in its own units (the box is stretched to the row). */
const WAVEFORM_HEIGHT = 32

type Bar = { top: number, height: number }

/** Merges the interleaved min/max pairs into bars centered on the middle line, at least 1 unit tall. */
const buildBars = (peaks: number[]): Bar[] => {
    const pairs = Math.floor(peaks.length / 2)
    if (pairs === 0) return []
    const count = Math.min(WAVEFORM_BARS, pairs)
    const half = WAVEFORM_HEIGHT / 2
    return Array.from({ length: count }, (_, bar) => {
        const from = Math.floor(bar * pairs / count)
        const to = Math.max(Math.floor((bar + 1) * pairs / count), from + 1)
        let min = 0
        let max = 0
        for (let index = from; index < to; index++) {
            min = Math.min(min, peaks[index * 2])
            max = Math.max(max, peaks[index * 2 + 1])
        }
        const up = Math.max(max * half, 0.5)
        const down = Math.max(-min * half, 0.5)
        return { top: half - up, height: up + down }
    })
}

type WaveformProps = {
    peaks: number[]
    currentTime: number
    duration: number
    onSeek: (time: number) => void
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
    ariaValueText: string
}

/** The seek bar drawn as the waveform of the track: click or drag to seek, only the played part has the accent color. */
export const Waveform = ({ peaks, currentTime, duration, onSeek, onKeyDown, ariaValueText }: WaveformProps) => {
    const { t } = useTranslation()
    const clipId = useId()
    const bars = useMemo(() => buildBars(peaks), [peaks])
    const dragging = useRef(false)
    const progress = duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0

    const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!(duration > 0)) return
        const box = event.currentTarget.getBoundingClientRect()
        if (box.width <= 0) return
        onSeek(Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1) * duration)
    }

    const width = bars.length
    return (
        <div
            role="slider"
            tabIndex={0}
            aria-label={t("audio.player.seek")}
            aria-roledescription={t("audio.player.waveform")}
            aria-valuemin={0}
            aria-valuemax={duration > 0 ? duration : 0}
            aria-valuenow={Math.min(currentTime, duration > 0 ? duration : 0)}
            aria-valuetext={ariaValueText}
            data-testid="audio-waveform"
            onKeyDown={onKeyDown}
            onPointerDown={event => {
                dragging.current = true
                event.currentTarget.setPointerCapture?.(event.pointerId)
                seekFromPointer(event)
            }}
            onPointerMove={event => { if (dragging.current) seekFromPointer(event) }}
            onPointerUp={event => {
                dragging.current = false
                event.currentTarget.releasePointerCapture?.(event.pointerId)
            }}
            onPointerCancel={() => { dragging.current = false }}
            className="relative h-8 min-w-0 flex-1 cursor-pointer touch-none rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
            <svg
                aria-hidden
                viewBox={`0 0 ${width} ${WAVEFORM_HEIGHT}`}
                preserveAspectRatio="none"
                className="block size-full"
            >
                <defs>
                    <clipPath id={clipId}><rect x={0} y={0} width={width * progress} height={WAVEFORM_HEIGHT} /></clipPath>
                </defs>
                <g className="fill-foreground/35">
                    {bars.map((bar, index) => <rect key={index} x={index + 0.15} y={bar.top} width={0.7} height={bar.height} />)}
                </g>
                {/* The played part: same bars, drawn over the others with the accent color */}
                <g className="fill-primary-text" clipPath={`url(#${clipId})`}>
                    {bars.map((bar, index) => <rect key={index} x={index + 0.15} y={bar.top} width={0.7} height={bar.height} />)}
                </g>
            </svg>
        </div>
    )
}

/**
 * The loudness at the position of the track, read from the curve measured by the backend (the sound itself is not
 * analysed: it comes from another origin). Updated every animation frame while playing, once per `timeupdate` when
 * paused or when the animations are off.
 */
const useLoudnessReading = (audioRef: React.RefObject<HTMLAudioElement | null>, loudness: AudioLoudness, playing: boolean): LoudnessReading | null => {
    const [reading, setReading] = useState<LoudnessReading | null>(null)
    const report = loudness.status === "ready" ? loudness.report : null

    useEffect(() => {
        const audio = audioRef.current
        if (!audio || !report) return
        const update = () => {
            const next = loudnessAt(report, audio.currentTime)
            setReading(previous => previous && next && previous.shortTerm === next.shortTerm && previous.momentary === next.momentary && previous.truePeak === next.truePeak ? previous : next)
        }
        update()
        const events = ["timeupdate", "seeked", "loadedmetadata", "emptied"] as const
        for (const name of events) audio.addEventListener(name, update)
        let frame = 0
        // The animations are off (preference or system): no frame loop, the values follow `timeupdate`
        if (playing && shiftDurationMs(100) > 0) {
            const tick = () => {
                update()
                frame = requestAnimationFrame(tick)
            }
            frame = requestAnimationFrame(tick)
        }
        return () => {
            for (const name of events) audio.removeEventListener(name, update)
            if (frame) cancelAnimationFrame(frame)
        }
    }, [audioRef, report, playing])

    return report ? reading : null
}

const Reading = ({ label, value, unit }: { label: string, value: number | undefined, unit: string }) => (
    <div className="flex min-w-0 flex-col items-start leading-tight">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-foreground">{value === undefined ? "–" : `${formatLevel(value)} ${unit}`}</span>
    </div>
)

type MeterProps = {
    audioRef: React.RefObject<HTMLAudioElement | null>
    loudness: AudioLoudness
    playing: boolean
}

/** Short-term and momentary loudness and the highest true peak so far at the current position. */
export const LoudnessMeter = ({ audioRef, loudness, playing }: MeterProps) => {
    const { t } = useTranslation()
    const reading = useLoudnessReading(audioRef, loudness, playing)

    if (loudness.status === "idle") return null
    // Same height in every state, so the player does not jump when the measure is ready
    const box = "flex min-h-8 w-full items-center justify-between gap-2"
    if (loudness.status === "loading") {
        return <div role="status" className={`${box} text-xs text-muted-foreground`}>{t("audio.player.loudness.measuring")}<LoadingDots /></div>
    }
    if (loudness.status === "error") {
        return <div role="status" className={`${box} text-xs text-muted-foreground`}>{t("audio.player.loudness.unavailable")}</div>
    }
    return (
        <div role="group" aria-label={t("audio.player.loudness.group")} data-testid="loudness-meter" className={box}>
            <Reading label={t("audio.player.loudness.shortTerm")} value={reading?.shortTerm} unit="LUFS" />
            <Reading label={t("audio.player.loudness.momentary")} value={reading?.momentary} unit="LUFS" />
            <Reading label={t("audio.player.loudness.truePeak")} value={reading?.truePeak} unit="dBTP" />
        </div>
    )
}
